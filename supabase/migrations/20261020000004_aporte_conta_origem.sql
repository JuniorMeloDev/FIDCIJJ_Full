BEGIN;

ALTER TABLE public.investimentos_movimentacoes
    ADD COLUMN conta_origem_id bigint REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
    ADD COLUMN conta_origem_nome text,
    ADD COLUMN debito_origem_id bigint UNIQUE REFERENCES public.movimentacoes_caixa(id) ON DELETE RESTRICT;

-- Aporte e debito sao gravados na mesma transacao, sem criar um
-- segundo movimento de investimento pelo espelho do fluxo de caixa.
CREATE FUNCTION public.registrar_origem_aporte()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    conta public.contas_bancarias%ROWTYPE;
    nome_aplicacao text;
    nome_cliente text;
BEGIN
    IF NEW.debito_origem_id IS NOT NULL THEN
        RAISE EXCEPTION 'O debito do aporte e gerado automaticamente';
    END IF;
    IF NEW.conta_origem_id IS NULL AND NOT (NEW.tipo = 'aporte' AND NEW.origem = 'manual') THEN
        RETURN NEW;
    END IF;
    IF NEW.tipo <> 'aporte' OR NEW.origem <> 'manual' OR NEW.valor <= 0
       OR NEW.movimento_caixa_id IS NOT NULL THEN
        RAISE EXCEPTION 'Conta de origem permitida somente para novos aportes manuais positivos';
    END IF;
    SELECT a.nome INTO nome_aplicacao
    FROM public.investimentos_aplicacoes a
    JOIN public.investimentos_contas c ON c.id = a.conta_id
    WHERE a.id = NEW.aplicacao_id AND a.conta_id = NEW.conta_id AND a.ativa AND c.ativa;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selecione uma aplicacao ativa da conta de investimento';
    END IF;
    IF NEW.conta_origem_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT c.* INTO conta
    FROM public.contas_bancarias c
    WHERE c.id = NEW.conta_origem_id
      AND c.cliente_id = (SELECT id FROM public.clientes ORDER BY id LIMIT 1);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conta de origem nao pertence ao cadastro da empresa';
    END IF;
    SELECT nome INTO nome_cliente FROM public.clientes WHERE id = conta.cliente_id;
    NEW.conta_origem_nome := conta.banco || ' - ' || conta.agencia || '/' || conta.conta_corrente;
    INSERT INTO public.movimentacoes_caixa
        (data_movimento, descricao, valor, conta_bancaria, empresa_associada, categoria, natureza)
    VALUES
        (NEW.data_movimento, 'Aporte em ' || nome_aplicacao || ' - ' || NEW.descricao,
         -NEW.valor, NEW.conta_origem_nome, nome_cliente, 'Transferencia Enviada',
         'Transferencia Entre Contas')
    RETURNING id INTO NEW.debito_origem_id;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.proteger_debito_aporte()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.debito_origem_id IS NOT NULL OR NEW.debito_origem_id IS NOT NULL
           OR NEW.conta_origem_id IS DISTINCT FROM OLD.conta_origem_id THEN
            RAISE EXCEPTION 'Exclua e recrie o aporte para alterar a conta de origem ou o debito vinculado';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.debito_origem_id IS NOT NULL THEN
        -- Uma conciliacao OFX existente impede a exclusao pelo FK RESTRICT,
        -- revertendo tambem a exclusao do aporte nesta mesma transacao.
        DELETE FROM public.movimentacoes_caixa WHERE id = OLD.debito_origem_id;
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER registrar_origem_aporte
BEFORE INSERT ON public.investimentos_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.registrar_origem_aporte();

CREATE TRIGGER proteger_debito_aporte
BEFORE UPDATE ON public.investimentos_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.proteger_debito_aporte();

CREATE TRIGGER excluir_debito_aporte
AFTER DELETE ON public.investimentos_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.proteger_debito_aporte();

-- Impede alterar o debito isoladamente pelo fluxo de caixa.
CREATE FUNCTION public.proteger_caixa_aporte()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.investimentos_movimentacoes WHERE debito_origem_id = OLD.id) THEN
        RAISE EXCEPTION 'Este debito pertence a um aporte; exclua e recrie o aporte em Investimentos';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_caixa_aporte
BEFORE UPDATE ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION public.proteger_caixa_aporte();

REVOKE ALL ON FUNCTION public.proteger_caixa_aporte() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_origem_aporte() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proteger_debito_aporte() FROM PUBLIC;

-- Evita ambiguidade entre a variavel local e a coluna valor na conciliacao OFX.
CREATE OR REPLACE FUNCTION conciliar_ofx_automaticamente(p_conta text, p_transacoes jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  item jsonb;
  movimento bigint;
  quantidade integer;
  resultado jsonb := '[]'::jsonb;
  identificador text;
  dia date;
  valor_transacao numeric;
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
    valor_transacao := round((item->>'valor')::numeric, 2);
    IF EXISTS (SELECT 1 FROM conciliacoes_ofx WHERE conta_bancaria = p_conta AND fitid = identificador) THEN
      resultado := resultado || jsonb_build_array(jsonb_build_object('id', identificador, 'status', 'JA_CONCILIADO'));
      CONTINUE;
    END IF;
    SELECT count(*), min(m.id) INTO quantidade, movimento
      FROM movimentacoes_caixa m
      WHERE m.conta_bancaria = p_conta AND m.data_movimento::date = dia
        AND round(m.valor::numeric, 2) = valor_transacao
        AND NOT EXISTS (SELECT 1 FROM conciliacoes_ofx c WHERE c.movimento_id = m.id);
    IF quantidade = 1 THEN
      INSERT INTO conciliacoes_ofx (conta_bancaria, fitid, movimento_id, data_ofx, valor_ofx)
      VALUES (p_conta, identificador, movimento, dia, valor_transacao);
      resultado := resultado || jsonb_build_array(jsonb_build_object('id', identificador, 'status', 'CONCILIADO', 'movimentoId', movimento));
    ELSE
      resultado := resultado || jsonb_build_array(jsonb_build_object('id', identificador, 'status', CASE WHEN quantidade > 1 THEN 'REVISAR' ELSE 'SEM_CORRESPONDENCIA' END));
    END IF;
  END LOOP;
  RETURN resultado;
END;
$$;

COMMIT;
