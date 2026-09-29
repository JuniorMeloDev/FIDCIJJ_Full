CREATE OR REPLACE FUNCTION conciliar_ofx_duplicata(p_conta text, p_fitid text, p_data date, p_valor numeric, p_duplicata_id bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  titulo duplicatas%ROWTYPE;
  movimento bigint;
  diferenca numeric;
  valor_base numeric;
  juros_pre_fixado boolean;
  valor_total_bruto numeric;
  valor_liquido numeric;
  valor_total_juros numeric;
  valor_total_descontos numeric;
  pos_fixado boolean;
BEGIN
  IF trim(coalesce(p_conta, '')) = '' OR trim(coalesce(p_fitid, '')) = '' OR p_data IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Dados da conciliacao invalidos';
  END IF;
  SELECT * INTO titulo FROM duplicatas WHERE id = p_duplicata_id FOR UPDATE;
  IF NOT FOUND OR titulo.status_recebimento <> 'Pendente' THEN
    RAISE EXCEPTION 'Duplicata nao esta em aberto';
  END IF;
  SELECT coalesce(o.juros_pre_fixado, t.juros_pre_fixado), o.valor_total_bruto,
         o.valor_liquido, o.valor_total_juros, o.valor_total_descontos
    INTO juros_pre_fixado, valor_total_bruto, valor_liquido, valor_total_juros, valor_total_descontos
    FROM operacoes o LEFT JOIN tipos_operacao t ON t.id = o.tipo_operacao_id
    WHERE o.id = titulo.operacao_id;
  pos_fixado := CASE WHEN juros_pre_fixado IS NOT NULL THEN NOT juros_pre_fixado
    ELSE (coalesce(valor_total_bruto, 0) - coalesce(valor_liquido, 0)
      < coalesce(valor_total_juros, 0) + coalesce(valor_total_descontos, 0) - 0.01)
      AND coalesce(titulo.valor_juros, 0) > 0 END;
  valor_base := round(titulo.valor_bruto + CASE WHEN pos_fixado THEN coalesce(titulo.valor_juros, 0) ELSE 0 END, 2);
  IF titulo.valor_bruto IS NULL OR titulo.data_vencimento IS NULL
     OR abs(p_valor - valor_base) > p_valor * 0.15
     OR titulo.data_vencimento::date < p_data - 40
     OR titulo.data_vencimento::date > p_data + 30 THEN
    RAISE EXCEPTION 'Duplicata fora da faixa de sugestao';
  END IF;
  IF EXISTS (SELECT 1 FROM conciliacoes_ofx WHERE conta_bancaria = p_conta AND fitid = p_fitid) THEN
    RAISE EXCEPTION 'Transacao OFX ja conciliada';
  END IF;
  diferenca := round(p_valor - valor_base, 2);
  INSERT INTO movimentacoes_caixa (data_movimento, descricao, valor, conta_bancaria, categoria, natureza, transaction_id, duplicata_id)
  VALUES (p_data, 'Recebimento ' || coalesce(titulo.nf_cte, titulo.id::text), p_valor, p_conta,
          'Recebimento', 'Recebimento de Duplicatas', p_fitid, titulo.id)
  RETURNING id INTO movimento;
  INSERT INTO conciliacoes_ofx (conta_bancaria, fitid, movimento_id, duplicata_id, data_ofx, valor_ofx)
  VALUES (p_conta, p_fitid, movimento, titulo.id, p_data, p_valor);
  UPDATE duplicatas SET status_recebimento = 'Recebido', data_liquidacao = p_data,
    conta_liquidacao = p_conta, juros_mora = greatest(diferenca, 0), desconto = greatest(-diferenca, 0),
    liquidacao_mov_id = movimento
  WHERE id = titulo.id;
  RETURN movimento;
END;
$$;

REVOKE ALL ON FUNCTION conciliar_ofx_duplicata(text, text, date, numeric, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION conciliar_ofx_duplicata(text, text, date, numeric, bigint) TO service_role;
