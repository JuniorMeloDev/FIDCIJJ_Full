BEGIN;

ALTER TABLE public.investimentos_aplicacoes
    ADD COLUMN conta_bancaria_vinculada_id bigint REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT;

ALTER TABLE public.movimentacoes_caixa
    ADD COLUMN investimento_conta_bancaria_id bigint REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
    ADD CONSTRAINT movimento_investimento_com_conta_valido CHECK (
        investimento_conta_bancaria_id IS NULL OR investimento_aplicacao_id IS NOT NULL
    );

CREATE FUNCTION public.validar_vinculo_bancario_aplicacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.conta_bancaria_vinculada_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.contas_bancarias b
        WHERE b.id = NEW.conta_bancaria_vinculada_id
          AND b.cliente_id = (SELECT id FROM public.clientes ORDER BY id LIMIT 1)
    ) THEN
        RAISE EXCEPTION 'Selecione uma conta bancária da empresa.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_vinculo_bancario_aplicacao() FROM PUBLIC;

CREATE TRIGGER validar_vinculo_bancario_aplicacao
BEFORE INSERT OR UPDATE OF conta_bancaria_vinculada_id
ON public.investimentos_aplicacoes
FOR EACH ROW EXECUTE FUNCTION public.validar_vinculo_bancario_aplicacao();

CREATE OR REPLACE FUNCTION public.identificar_conta_investimento_no_caixa()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.investimento_aplicacao_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Entradas e saídas avulsas usam a conta vinculada. Uma transferência
    -- já tem uma contrapartida explícita e mantém seu lado de investimento.
    IF TG_OP = 'INSERT' THEN
        NEW.investimento_conta_bancaria_id := NULL;
        IF NEW.categoria = 'Transferência' THEN
            SELECT a.conta_bancaria_vinculada_id INTO NEW.investimento_conta_bancaria_id
            FROM public.investimentos_aplicacoes a
            WHERE a.id = NEW.investimento_aplicacao_id
            FOR UPDATE;
        END IF;
    END IF;

    IF NEW.investimento_conta_bancaria_id IS NULL THEN
        SELECT format('Investimentos | %s / %s (#%s)', c.nome, a.nome, a.id)
        INTO NEW.conta_bancaria
        FROM public.investimentos_aplicacoes a
        JOIN public.investimentos_contas c ON c.id = a.conta_id
        WHERE a.id = NEW.investimento_aplicacao_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.investimento_conta_bancaria_id IS NOT DISTINCT FROM OLD.investimento_conta_bancaria_id THEN
        -- O lançamento conserva a conta registrada mesmo se a aplicação mudar de vínculo.
        NEW.conta_bancaria := OLD.conta_bancaria;
    ELSE
        SELECT b.banco || ' - ' || b.agencia || '/' || b.conta_corrente
        INTO NEW.conta_bancaria
        FROM public.contas_bancarias b
        WHERE b.id = NEW.investimento_conta_bancaria_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.identificar_conta_investimento_no_caixa() FROM PUBLIC;

DROP TRIGGER IF EXISTS identificar_conta_investimento_no_caixa ON public.movimentacoes_caixa;
CREATE TRIGGER identificar_conta_investimento_no_caixa
BEFORE INSERT OR UPDATE OF conta_bancaria, investimento_aplicacao_id, investimento_conta_bancaria_id
ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION public.identificar_conta_investimento_no_caixa();

-- Aplica a classificação anterior também quando a migração 00001 não foi executada.
UPDATE public.movimentacoes_caixa m
SET conta_bancaria = format('Investimentos | %s / %s (#%s)', c.nome, a.nome, a.id)
FROM public.investimentos_aplicacoes a
JOIN public.investimentos_contas c ON c.id = a.conta_id
WHERE m.investimento_aplicacao_id = a.id
  AND m.investimento_conta_bancaria_id IS NULL
  AND m.conta_bancaria IS DISTINCT FROM format('Investimentos | %s / %s (#%s)', c.nome, a.nome, a.id);

-- Corrige somente a saída "Faculdade Ivinho" do ambiente em que foi conferida.
DO $$
BEGIN
    PERFORM 1 FROM public.movimentacoes_caixa m
    JOIN public.investimentos_movimentacoes i ON i.movimento_caixa_id = m.id
    JOIN public.investimentos_aplicacoes a ON a.id = m.investimento_aplicacao_id
    JOIN public.investimentos_contas c ON c.id = a.conta_id
    JOIN public.contas_bancarias b ON b.id = 132
    WHERE m.id = 2749
      AND m.data_movimento::date = DATE '2026-11-23'
      AND m.descricao = 'Faculdade Ivinho'
      AND m.valor = -3638.07
      AND m.categoria = 'Transferência'
      AND m.conta_bancaria = 'Investimentos | Ivo / 2% (#1)'
      AND m.operacao_id IS NULL AND m.transaction_id IS NULL
      AND a.id = 1 AND a.nome = '2%' AND c.nome = 'Ivo'
      AND i.id = 60 AND i.aplicacao_id = a.id AND i.tipo = 'resgate'
      AND i.valor = m.valor AND i.origem = 'fluxo_caixa'
      AND b.agencia = '0550' AND b.conta_corrente = '99359-6'
      AND b.cliente_id = (SELECT id FROM public.clientes ORDER BY id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM public.conciliacoes_ofx f WHERE f.movimento_id = m.id)
    FOR UPDATE OF m, a;

    IF FOUND THEN
        UPDATE public.investimentos_aplicacoes SET conta_bancaria_vinculada_id = 132
        WHERE id = 1 AND conta_bancaria_vinculada_id IS NULL;
        UPDATE public.movimentacoes_caixa SET investimento_conta_bancaria_id = 132 WHERE id = 2749;
    END IF;
END;
$$;

COMMIT;
