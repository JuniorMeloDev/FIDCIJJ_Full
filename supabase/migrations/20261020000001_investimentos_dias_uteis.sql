alter table public.investimentos_aplicacoes
    alter column base_dias set default 'uteis';

update public.investimentos_aplicacoes
set base_dias = 'uteis'
where base_dias <> 'uteis';
