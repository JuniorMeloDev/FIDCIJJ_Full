BEGIN;

CREATE VIEW public.duplicatas_em_aberto_ofx AS
SELECT d.id, d.nf_cte, d.cliente_sacado, d.data_vencimento::date AS vencimento,
       round(d.valor_bruto + CASE WHEN CASE
         WHEN coalesce(o.juros_pre_fixado, t.juros_pre_fixado) IS NOT NULL
           THEN NOT coalesce(o.juros_pre_fixado, t.juros_pre_fixado)
         ELSE coalesce(o.valor_total_bruto, 0) - coalesce(o.valor_liquido, 0)
           < coalesce(o.valor_total_juros, 0) + coalesce(o.valor_total_descontos, 0) - 0.01
           AND coalesce(d.valor_juros, 0) > 0
       END THEN coalesce(d.valor_juros, 0) ELSE 0 END, 2) AS valor
FROM public.duplicatas d
JOIN public.operacoes o ON o.id = d.operacao_id
LEFT JOIN public.tipos_operacao t ON t.id = o.tipo_operacao_id
WHERE d.status_recebimento = 'Pendente' AND o.status = 'Aprovada';

REVOKE ALL ON public.duplicatas_em_aberto_ofx FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.duplicatas_em_aberto_ofx TO service_role;

CREATE FUNCTION public.processar_conciliacao_ofx_com_titulos(
  p_conta text, p_transacoes jsonb, p_confirmar boolean
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  resultados_base jsonb;
  resultados jsonb := '[]'::jsonb;
  item record;
  resultado jsonb;
  movimento bigint;
BEGIN
  resultados_base := public.processar_conciliacao_ofx(p_conta, p_transacoes, p_confirmar);

  FOR item IN
    WITH extrato AS (
      SELECT e.dados->>'id' AS fitid, (e.dados->>'data')::date AS dia,
             round((e.dados->>'valor')::numeric, 2) AS valor,
             coalesce(e.dados->>'descricao', '') AS descricao,
             (e.dados->>'duplicataId')::bigint AS duplicata_prevista,
             b.resultado, e.ordem
      FROM jsonb_array_elements(p_transacoes) WITH ORDINALITY e(dados, ordem)
      JOIN jsonb_array_elements(resultados_base) b(resultado) ON b.resultado->>'id' = e.dados->>'id'
    ),
    candidatos AS (
      SELECT e.fitid, d.id, count(*) OVER (PARTITION BY d.id) AS transacoes_por_titulo
      FROM extrato e
      JOIN public.duplicatas_em_aberto_ofx d ON d.valor = e.valor
        AND d.vencimento BETWEEN e.dia - 40 AND e.dia + 30
      WHERE e.resultado->>'status' = 'SEM_CORRESPONDENCIA' AND e.valor > 0
        AND e.descricao NOT ILIKE '%RES APLIC AUT MAIS%'
    ),
    resumo AS (
      SELECT fitid, count(*) AS quantidade, min(id) AS duplicata_id,
             max(transacoes_por_titulo) AS transacoes_por_titulo
      FROM candidatos
      GROUP BY fitid
    )
    SELECT e.*, r.quantidade, r.transacoes_por_titulo, d.id AS duplicata_id,
           d.nf_cte, d.cliente_sacado
    FROM extrato e
    LEFT JOIN resumo r ON r.fitid = e.fitid
    LEFT JOIN public.duplicatas_em_aberto_ofx d ON d.id = r.duplicata_id
    ORDER BY e.ordem
  LOOP
    resultado := item.resultado;
    IF item.quantidade IS NOT NULL THEN
      IF item.quantidade <> 1 OR item.transacoes_por_titulo <> 1 THEN
        resultado := resultado || jsonb_build_object('status', 'REVISAR');
      ELSIF NOT p_confirmar THEN
        resultado := resultado || jsonb_build_object(
          'status', 'PRONTO', 'duplicataId', item.duplicata_id,
          'nfCte', item.nf_cte, 'clienteSacado', item.cliente_sacado
        );
      ELSIF item.duplicata_prevista IS DISTINCT FROM item.duplicata_id THEN
        resultado := resultado || jsonb_build_object('status', 'REVISAR');
      ELSE
        BEGIN
          PERFORM d.id FROM public.duplicatas d
          JOIN public.operacoes o ON o.id = d.operacao_id
          WHERE d.id = item.duplicata_id
          FOR UPDATE OF d FOR SHARE OF o;

          IF NOT EXISTS (
            SELECT 1 FROM public.duplicatas_em_aberto_ofx d
            WHERE d.id = item.duplicata_id AND d.valor = item.valor
              AND d.vencimento BETWEEN item.dia - 40 AND item.dia + 30
          ) THEN
            resultado := resultado || jsonb_build_object('status', 'REVISAR');
          ELSE
            movimento := public.conciliar_ofx_duplicata(
              p_conta, item.fitid, item.dia, item.valor, item.duplicata_id
            );
            resultado := resultado || jsonb_build_object(
              'status', 'CONCILIADO', 'movimentoId', movimento, 'duplicataId', item.duplicata_id,
              'nfCte', item.nf_cte, 'clienteSacado', item.cliente_sacado
            );
          END IF;
        EXCEPTION WHEN unique_violation OR raise_exception THEN
          resultado := resultado || jsonb_build_object('status', 'REVISAR');
        END;
      END IF;
    END IF;
    resultados := resultados || jsonb_build_array(resultado);
  END LOOP;

  RETURN resultados;
END;
$$;

REVOKE ALL ON FUNCTION public.processar_conciliacao_ofx_com_titulos(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.processar_conciliacao_ofx_com_titulos(text, jsonb, boolean) TO service_role;

COMMIT;
