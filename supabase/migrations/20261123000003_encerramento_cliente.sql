BEGIN;

ALTER TABLE public.renegociacoes_duplicatas
  ADD COLUMN titulos_encerramento jsonb;

CREATE FUNCTION public.registrar_encerramento_cliente(
    p_cliente_id bigint, p_tipo_operacao_id bigint, p_ids bigint[],
    p_data_operacao date, p_primeiro_vencimento date, p_parcelas jsonb,
    p_juros_calculado numeric, p_juros_manual numeric, p_observacao text, p_titulos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    nova_operacao public.operacoes%ROWTYPE;
    novas_duplicatas jsonb;
    cliente_nome text;
    total numeric;
    juros numeric;
    referencia text;
BEGIN
    PERFORM d.id FROM public.duplicatas d WHERE d.id = ANY(p_ids) ORDER BY d.id FOR UPDATE;

    IF coalesce(cardinality(p_ids), 0) = 0 OR (
        SELECT count(*)
        FROM public.duplicatas d
        JOIN public.operacoes o ON o.id = d.operacao_id
        JOIN jsonb_to_recordset(p_titulos) t(id bigint, valor_bruto numeric, valor_juros numeric, data_vencimento date)
          ON t.id = d.id AND t.valor_bruto = d.valor_bruto
          AND t.valor_juros = d.valor_juros AND t.data_vencimento = d.data_vencimento
        WHERE d.id = ANY(p_ids) AND o.cliente_id = p_cliente_id
          AND o.status = 'Aprovada' AND d.status_recebimento = 'Pendente'
    ) <> cardinality(p_ids) THEN
        RAISE EXCEPTION 'Os títulos foram alterados ou já foram baixados. Atualize a seleção.'
          USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.duplicatas d JOIN public.operacoes o ON o.id = d.operacao_id
        WHERE d.id = ANY(p_ids) AND o.tipo_operacao_id = p_tipo_operacao_id
    ) THEN
        RAISE EXCEPTION 'Selecione um tipo de operação dos títulos originais.' USING ERRCODE = 'P0001';
    END IF;

    SELECT nome INTO STRICT cliente_nome FROM public.clientes WHERE id = p_cliente_id;
    SELECT sum(p.valor), sum(p.juros) INTO total, juros
    FROM jsonb_to_recordset(p_parcelas) p(valor numeric, juros numeric);

    INSERT INTO public.operacoes (
        data_operacao, tipo_operacao_id, cliente_id, valor_total_bruto, valor_total_juros,
        valor_total_descontos, valor_liquido, status, juros_pre_fixado
    ) VALUES (p_data_operacao, p_tipo_operacao_id, p_cliente_id, total, juros, 0, total - juros, 'Aprovada', true)
    RETURNING * INTO nova_operacao;

    referencia := 'ENC-' || nova_operacao.id;
    UPDATE public.operacoes SET chave_nfe = referencia WHERE id = nova_operacao.id RETURNING * INTO nova_operacao;

    WITH parcelas AS (
        INSERT INTO public.duplicatas (
            operacao_id, nf_cte, cliente_sacado, valor_bruto, valor_juros, data_operacao,
            data_vencimento, status_recebimento, origem_renegociacao_id, observacao
        )
        SELECT nova_operacao.id, referencia || '.' || p.numero, cliente_nome, p.valor,
               p.juros, p_data_operacao, p.vencimento, 'Pendente', p_ids[1], p_observacao
        FROM jsonb_to_recordset(p_parcelas) p(numero integer, valor numeric, juros numeric, vencimento date)
        ORDER BY p.numero
        RETURNING *
    )
    SELECT jsonb_agg(to_jsonb(parcelas) ORDER BY parcelas.id) INTO novas_duplicatas FROM parcelas;

    UPDATE public.duplicatas
    SET status_recebimento = 'Recebido', data_liquidacao = p_data_operacao,
        observacao_baixa = 'Baixa por encerramento ' || referencia || ', sem movimentação financeira.'
    WHERE id = ANY(p_ids);

    INSERT INTO public.renegociacoes_duplicatas (
        duplicata_ids, novas_duplicata_ids, nova_data_vencimento, total_original,
        juros_calculado, juros_manual, total_renegociado, observacao, titulos_encerramento
    ) VALUES (
        to_jsonb(p_ids), (SELECT jsonb_agg(t->'id') FROM jsonb_array_elements(novas_duplicatas) t),
        p_primeiro_vencimento, total - juros, p_juros_calculado,
        p_juros_manual, total, p_observacao, p_titulos
    );

    RETURN jsonb_build_object('operacaoNova', to_jsonb(nova_operacao), 'novasDuplicatas', novas_duplicatas);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_encerramento_cliente(bigint, bigint, bigint[], date, date, jsonb, numeric, numeric, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_encerramento_cliente(bigint, bigint, bigint[], date, date, jsonb, numeric, numeric, text, jsonb)
  TO service_role;

COMMIT;
