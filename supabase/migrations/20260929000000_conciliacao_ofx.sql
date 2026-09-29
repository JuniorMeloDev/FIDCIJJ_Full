CREATE TABLE IF NOT EXISTS conciliacoes_ofx (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conta_bancaria text NOT NULL,
  fitid text NOT NULL,
  movimento_id bigint NOT NULL REFERENCES movimentacoes_caixa(id) ON DELETE RESTRICT,
  data_ofx date NOT NULL,
  valor_ofx numeric(14,2) NOT NULL,
  conciliado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_bancaria, fitid),
  UNIQUE (movimento_id)
);

CREATE OR REPLACE FUNCTION conciliar_ofx_automaticamente(p_conta text, p_transacoes jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  item jsonb;
  movimento bigint;
  quantidade integer;
  resultado jsonb := '[]'::jsonb;
  identificador text;
  dia date;
  valor numeric;
BEGIN
  IF trim(coalesce(p_conta, '')) = '' OR jsonb_typeof(p_transacoes) <> 'array' THEN
    RAISE EXCEPTION 'Conta e transacoes sao obrigatorias';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_transacoes) LOOP
    identificador := nullif(trim(item->>'id'), '');
    IF identificador IS NULL OR (item->>'data') !~ '^\d{4}-\d{2}-\d{2}$'
       OR (item->>'valor') !~ '^-?\d+(\.\d+)?$' THEN
      RAISE EXCEPTION 'Transacao OFX invalida';
    END IF;
    dia := (item->>'data')::date;
    valor := round((item->>'valor')::numeric, 2);
    IF EXISTS (SELECT 1 FROM conciliacoes_ofx WHERE conta_bancaria = p_conta AND fitid = identificador) THEN
      resultado := resultado || jsonb_build_array(jsonb_build_object('id', identificador, 'status', 'JA_CONCILIADO'));
      CONTINUE;
    END IF;
    SELECT count(*), min(m.id) INTO quantidade, movimento
      FROM movimentacoes_caixa m
      WHERE m.conta_bancaria = p_conta AND m.data_movimento::date = dia
        AND round(m.valor::numeric, 2) = valor
        AND NOT EXISTS (SELECT 1 FROM conciliacoes_ofx c WHERE c.movimento_id = m.id);
    IF quantidade = 1 THEN
      INSERT INTO conciliacoes_ofx (conta_bancaria, fitid, movimento_id, data_ofx, valor_ofx)
      VALUES (p_conta, identificador, movimento, dia, valor);
      resultado := resultado || jsonb_build_array(jsonb_build_object('id', identificador, 'status', 'CONCILIADO', 'movimentoId', movimento));
    ELSE
      resultado := resultado || jsonb_build_array(jsonb_build_object('id', identificador, 'status', CASE WHEN quantidade > 1 THEN 'REVISAR' ELSE 'SEM_CORRESPONDENCIA' END));
    END IF;
  END LOOP;
  RETURN resultado;
END;
$$;

REVOKE ALL ON TABLE conciliacoes_ofx FROM anon, authenticated;
REVOKE ALL ON FUNCTION conciliar_ofx_automaticamente(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION conciliar_ofx_automaticamente(text, jsonb) TO service_role;
