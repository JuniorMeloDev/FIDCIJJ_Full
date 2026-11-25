BEGIN;

ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN recebimento_ofx_agrupado boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.conciliar_ofx_grupo(
  p_conta text, p_fitid text, p_data date, p_valor numeric, p_titulos jsonb
) RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  movimento bigint;
  quantidade integer;
  ids bigint[];
  notas text;
BEGIN
  IF nullif(trim(p_conta), '') IS NULL OR nullif(trim(p_fitid), '') IS NULL
    OR p_data IS NULL OR p_valor IS NULL OR p_valor <= 0
    OR jsonb_typeof(p_titulos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dados da conciliação incompletos.';
  END IF;

  quantidade := jsonb_array_length(p_titulos);
  SELECT array_agg(DISTINCT id ORDER BY id) INTO ids
  FROM jsonb_to_recordset(p_titulos) AS titulo(id bigint, centavos bigint)
  WHERE id > 0 AND centavos > 0;

  IF quantidade < 2 OR coalesce(cardinality(ids), 0) <> quantidade THEN
    RAISE EXCEPTION 'Selecione pelo menos duas NFs distintas.';
  END IF;

  PERFORM d.id FROM public.duplicatas d
  JOIN public.operacoes o ON o.id = d.operacao_id
  WHERE d.id = ANY(ids)
  ORDER BY d.id FOR UPDATE OF d FOR SHARE OF o;

  PERFORM t.id FROM public.tipos_operacao t
  WHERE t.id IN (
    SELECT o.tipo_operacao_id FROM public.duplicatas d
    JOIN public.operacoes o ON o.id = d.operacao_id WHERE d.id = ANY(ids)
  )
  ORDER BY t.id FOR SHARE OF t;

  IF EXISTS (SELECT 1 FROM public.conciliacoes_ofx c WHERE c.conta_bancaria = p_conta AND c.fitid = p_fitid)
    OR EXISTS (SELECT 1 FROM public.movimentacoes_caixa m WHERE m.conta_bancaria = p_conta AND m.transaction_id = p_fitid) THEN
    RAISE EXCEPTION 'Este crédito do extrato já está registrado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimentacoes_caixa m
    WHERE m.conta_bancaria = p_conta AND m.data_movimento::date = p_data
      AND round(m.valor::numeric, 2) = round(p_valor, 2)
      AND NOT EXISTS (SELECT 1 FROM public.conciliacoes_ofx c WHERE c.movimento_id = m.id)
  ) THEN
    RAISE EXCEPTION 'Já existe um lançamento com a mesma data e valor no Fluxo de Caixa. Confira a prévia.';
  END IF;

  SELECT string_agg(coalesce(d.nf_cte, d.id::text), ', ' ORDER BY d.id) INTO notas
  FROM public.duplicatas_em_aberto_ofx d
  JOIN jsonb_to_recordset(p_titulos) AS titulo(id bigint, centavos bigint)
    ON titulo.id = d.id AND titulo.centavos = d.valor * 100
  WHERE d.vencimento BETWEEN p_data - 40 AND p_data + 30
  HAVING count(*) = quantidade AND sum(d.valor) = round(p_valor, 2);

  IF notas IS NULL THEN
    RAISE EXCEPTION 'As NFs ou os valores mudaram. Atualize a prévia e confira a soma novamente.';
  END IF;

  INSERT INTO public.movimentacoes_caixa (
    data_movimento, descricao, valor, conta_bancaria, categoria, natureza, transaction_id, recebimento_ofx_agrupado
  ) VALUES (
    p_data, 'Recebimento agrupado · NFs ' || notas, round(p_valor, 2), p_conta,
    'Recebimento', 'Recebimento de Duplicatas', p_fitid, true
  ) RETURNING id INTO movimento;

  INSERT INTO public.conciliacoes_ofx (conta_bancaria, fitid, movimento_id, data_ofx, valor_ofx)
  VALUES (p_conta, p_fitid, movimento, p_data, round(p_valor, 2));

  UPDATE public.duplicatas
  SET status_recebimento = 'Recebido', data_liquidacao = p_data,
      conta_liquidacao = p_conta, juros_mora = 0, desconto = 0, liquidacao_mov_id = movimento
  WHERE id = ANY(ids);

  RETURN movimento;
END;
$$;

CREATE FUNCTION public.estornar_conciliacao_ofx_grupo(p_movimento_id bigint)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM id FROM public.movimentacoes_caixa
  WHERE id = p_movimento_id AND recebimento_ofx_agrupado
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento agrupado não encontrado.';
  END IF;

  UPDATE public.duplicatas
  SET status_recebimento = 'Pendente', data_liquidacao = NULL,
      conta_liquidacao = NULL, juros_mora = 0, desconto = 0, liquidacao_mov_id = NULL
  WHERE liquidacao_mov_id = p_movimento_id;

  DELETE FROM public.conciliacoes_ofx WHERE movimento_id = p_movimento_id;
  DELETE FROM public.movimentacoes_caixa WHERE id = p_movimento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.conciliar_ofx_grupo(text, text, date, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_ofx_grupo(text, text, date, numeric, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.estornar_conciliacao_ofx_grupo(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_conciliacao_ofx_grupo(bigint) TO service_role;

COMMIT;
