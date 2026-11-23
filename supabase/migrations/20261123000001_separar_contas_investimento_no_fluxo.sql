BEGIN;

CREATE FUNCTION public.identificar_conta_investimento_no_caixa()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.investimento_aplicacao_id IS NOT NULL THEN
        SELECT format('Investimentos | %s / %s (#%s)', c.nome, a.nome, a.id)
        INTO NEW.conta_bancaria
        FROM public.investimentos_aplicacoes a
        JOIN public.investimentos_contas c ON c.id = a.conta_id
        WHERE a.id = NEW.investimento_aplicacao_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.identificar_conta_investimento_no_caixa() FROM PUBLIC;

CREATE TRIGGER identificar_conta_investimento_no_caixa
BEFORE INSERT OR UPDATE OF conta_bancaria, investimento_aplicacao_id
ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION public.identificar_conta_investimento_no_caixa();

-- Corrige o agrupamento bancario sem recriar o lancamento nem o espelho.
UPDATE public.movimentacoes_caixa m
SET conta_bancaria = format('Investimentos | %s / %s (#%s)', c.nome, a.nome, a.id)
FROM public.investimentos_aplicacoes a
JOIN public.investimentos_contas c ON c.id = a.conta_id
WHERE m.investimento_aplicacao_id = a.id
  AND m.conta_bancaria IS DISTINCT FROM format('Investimentos | %s / %s (#%s)', c.nome, a.nome, a.id);

COMMIT;
