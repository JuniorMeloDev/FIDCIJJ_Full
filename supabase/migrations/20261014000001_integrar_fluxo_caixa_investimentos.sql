BEGIN;

ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN investimento_aplicacao_id bigint
    REFERENCES public.investimentos_aplicacoes(id) ON DELETE RESTRICT;

ALTER TABLE public.investimentos_movimentacoes
  ADD COLUMN movimento_caixa_id bigint UNIQUE
    REFERENCES public.movimentacoes_caixa(id) ON DELETE CASCADE;

-- O espelho participa da mesma transacao do fluxo de caixa: ou ambos salvam,
-- ou nenhum salva. O vinculo unico impede duplicacao em edicoes.
CREATE FUNCTION public.sincronizar_investimento_fluxo_caixa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  aplicacao public.investimentos_aplicacoes%ROWTYPE;
BEGIN
  IF NEW.investimento_aplicacao_id IS NULL THEN
    DELETE FROM public.investimentos_movimentacoes WHERE movimento_caixa_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT a.* INTO aplicacao
    FROM public.investimentos_aplicacoes a
    JOIN public.investimentos_contas c ON c.id = a.conta_id
    WHERE a.id = NEW.investimento_aplicacao_id AND a.ativa AND c.ativa
    FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selecione uma aplicacao de investimento ativa';
  END IF;
  IF NEW.valor IS NULL OR NEW.valor = 0 THEN
    RAISE EXCEPTION 'Informe um valor diferente de zero';
  END IF;

  INSERT INTO public.investimentos_movimentacoes
    (conta_id, aplicacao_id, data_movimento, tipo, descricao, valor, origem, movimento_caixa_id)
  VALUES
    (aplicacao.conta_id, aplicacao.id, NEW.data_movimento::date,
     CASE WHEN NEW.valor < 0 THEN 'resgate' ELSE 'aporte' END,
     NEW.descricao, NEW.valor, 'fluxo_caixa', NEW.id)
  ON CONFLICT (movimento_caixa_id) DO UPDATE SET
    conta_id = EXCLUDED.conta_id,
    aplicacao_id = EXCLUDED.aplicacao_id,
    data_movimento = EXCLUDED.data_movimento,
    tipo = EXCLUDED.tipo,
    descricao = EXCLUDED.descricao,
    valor = EXCLUDED.valor;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_investimento_fluxo_caixa() FROM PUBLIC;

CREATE TRIGGER sincronizar_investimento_fluxo_caixa
AFTER INSERT OR UPDATE OF investimento_aplicacao_id, valor, data_movimento, descricao
ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_investimento_fluxo_caixa();

COMMIT;
