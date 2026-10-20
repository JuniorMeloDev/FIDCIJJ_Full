BEGIN;

-- Une os nomes usados para a mesma conta Itau ao nome do cadastro master.
-- Preserva valores, datas e vinculos com investimentos.
WITH conta_master AS (
    SELECT DISTINCT c.banco || ' - ' || c.agencia || '/' || c.conta_corrente AS nome
    FROM public.contas_bancarias c
    WHERE c.cliente_id = (SELECT id FROM public.clientes ORDER BY id LIMIT 1)
      AND regexp_replace(c.agencia, '[^0-9]', '', 'g') = '0550'
      AND regexp_replace(c.conta_corrente, '[^0-9]', '', 'g') = '993596'
      AND lower(translate(c.banco, chr(250) || chr(218), 'uU'))
          ~ '^(itau( unibanco( s\.?)?a?\.?)?|341)$'
), conta_unica AS (
    SELECT min(nome) AS nome FROM conta_master HAVING count(*) = 1
)
UPDATE public.movimentacoes_caixa m
SET conta_bancaria = c.nome
FROM conta_unica c
WHERE m.conta_bancaria <> c.nome
  AND lower(translate(split_part(m.conta_bancaria, ' - ', 1), chr(250) || chr(218), 'uU'))
      ~ '^(itau( unibanco( s\.?)?a?\.?)?|341)$'
  AND regexp_replace(split_part(m.conta_bancaria, ' - ', 2), '[^0-9]', '', 'g') = '0550993596';

COMMIT;
