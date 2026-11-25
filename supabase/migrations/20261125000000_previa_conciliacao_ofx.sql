CREATE FUNCTION public.processar_conciliacao_ofx(
  p_conta text,
  p_transacoes jsonb,
  p_confirmar boolean
) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
  WITH extrato AS (
    SELECT item->>'id' AS fitid, (item->>'data')::date AS dia,
           round((item->>'valor')::numeric, 2) AS valor,
           (item->>'movimentoId')::bigint AS movimento_previsto, ordem
    FROM jsonb_array_elements(p_transacoes) WITH ORDINALITY AS entrada(item, ordem)
  ),
  correspondencias AS (
    SELECT e.*, c.movimento_id AS movimento_conciliado,
           candidatos.quantidade, candidatos.movimento_id,
           count(*) FILTER (WHERE c.movimento_id IS NULL)
             OVER (PARTITION BY e.dia, e.valor) AS transacoes_pendentes
    FROM extrato e
    LEFT JOIN public.conciliacoes_ofx c ON c.conta_bancaria = p_conta AND c.fitid = e.fitid
    LEFT JOIN LATERAL (
      SELECT count(*) AS quantidade, min(m.id) AS movimento_id
      FROM public.movimentacoes_caixa m
      WHERE c.movimento_id IS NULL AND m.conta_bancaria = p_conta
        AND m.data_movimento::date = e.dia AND round(m.valor::numeric, 2) = e.valor
        AND NOT EXISTS (SELECT 1 FROM public.conciliacoes_ofx f WHERE f.movimento_id = m.id)
    ) candidatos ON true
  ),
  gravados AS (
    INSERT INTO public.conciliacoes_ofx (conta_bancaria, fitid, movimento_id, data_ofx, valor_ofx)
    SELECT p_conta, fitid, movimento_id, dia, valor
    FROM correspondencias
    WHERE p_confirmar AND quantidade = 1 AND transacoes_pendentes = 1 AND movimento_id = movimento_previsto
    ORDER BY movimento_id
    ON CONFLICT DO NOTHING
    RETURNING fitid, movimento_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.fitid,
    'status', CASE
      WHEN g.movimento_id IS NOT NULL THEN 'CONCILIADO'
      WHEN c.movimento_conciliado IS NOT NULL THEN 'JA_CONCILIADO'
      WHEN c.quantidade = 0 THEN 'SEM_CORRESPONDENCIA'
      WHEN c.quantidade > 1 OR c.transacoes_pendentes > 1 OR p_confirmar THEN 'REVISAR'
      ELSE 'PRONTO'
    END,
    'movimentoId', m.id,
    'descricaoMovimento', m.descricao
  ) ORDER BY c.ordem), '[]'::jsonb)
  FROM correspondencias c
  LEFT JOIN gravados g ON g.fitid = c.fitid
  LEFT JOIN public.movimentacoes_caixa m ON m.id = coalesce(
    g.movimento_id, c.movimento_conciliado,
    CASE WHEN NOT p_confirmar AND c.quantidade = 1 AND c.transacoes_pendentes = 1 THEN c.movimento_id END
  );
$$;

REVOKE ALL ON FUNCTION public.processar_conciliacao_ofx(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.processar_conciliacao_ofx(text, jsonb, boolean) TO service_role;
