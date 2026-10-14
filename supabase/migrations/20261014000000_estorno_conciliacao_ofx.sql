BEGIN;

-- A conciliacao depende do movimento. Ao excluir o movimento em um estorno,
-- desfazemos tambem a conciliacao, liberando o FITID para conciliar novamente.
-- A exclusao ocorre na mesma transacao e nao afeta outras conciliacoes.
ALTER TABLE public.conciliacoes_ofx
  DROP CONSTRAINT conciliacoes_ofx_movimento_id_fkey,
  ADD CONSTRAINT conciliacoes_ofx_movimento_id_fkey
    FOREIGN KEY (movimento_id)
    REFERENCES public.movimentacoes_caixa(id)
    ON DELETE CASCADE;

COMMIT;
