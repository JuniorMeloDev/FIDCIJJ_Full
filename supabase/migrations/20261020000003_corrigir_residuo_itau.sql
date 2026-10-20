BEGIN;

-- Remove somente o debito residual identificado na conciliacao.
-- O credito 2562 permanece; o resgate da aplicacao 4 e preservado.
DO $$
DECLARE
    movimento public.movimentacoes_caixa%ROWTYPE;
BEGIN
    SELECT * INTO movimento
    FROM public.movimentacoes_caixa
    WHERE id = 2561
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE NOTICE 'Lancamento 2561 ja removido; nenhuma alteracao.';
        RETURN;
    END IF;

    IF movimento.valor IS DISTINCT FROM -15000.56
       OR movimento.data_movimento::date IS DISTINCT FROM DATE '2026-10-13'
       OR movimento.investimento_aplicacao_id IS DISTINCT FROM 4
       OR movimento.categoria IS DISTINCT FROM 'Transferencia Enviada'
       OR regexp_replace(split_part(movimento.conta_bancaria, ' - ', 2), '[^0-9]', '', 'g')
          IS DISTINCT FROM '0550993596' THEN
        RAISE EXCEPTION 'Lancamento 2561 difere do registro conferido; correcao cancelada.';
    END IF;

    -- Desvincula antes de excluir para evitar o ON DELETE CASCADE.
    -- O valor, a data e o tipo do resgate permanecem intactos.
    UPDATE public.investimentos_movimentacoes
    SET movimento_caixa_id = NULL,
        origem = 'manual',
        updated_at = timezone('utc', now())
    WHERE movimento_caixa_id = movimento.id;

    DELETE FROM public.movimentacoes_caixa WHERE id = movimento.id;
END;
$$;

COMMIT;
