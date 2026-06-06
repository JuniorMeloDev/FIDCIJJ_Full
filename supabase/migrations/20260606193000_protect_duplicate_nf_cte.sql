create index if not exists idx_duplicatas_nf_cte
  on public.duplicatas (nf_cte);

create or replace function public.block_duplicate_nf_cte()
returns trigger
language plpgsql
as $$
declare
  v_cliente_id bigint;
begin
  if new.nf_cte is null or btrim(new.nf_cte) = '' then
    raise exception 'nf_cte nao pode ser vazio.'
      using errcode = '23514';
  end if;

  select o.cliente_id
    into v_cliente_id
  from public.operacoes o
  where o.id = new.operacao_id;

  if v_cliente_id is null then
    raise exception 'Nao foi possivel identificar o cliente da operacao para validar duplicidade.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.duplicatas d
    join public.operacoes o on o.id = d.operacao_id
    where d.nf_cte = new.nf_cte
      and o.cliente_id = v_cliente_id
      and d.id <> coalesce(new.id, 0)
  ) then
    raise exception 'NF/CT-e % ja foi operada e nao pode ser inserida novamente.', new.nf_cte
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_duplicate_nf_cte on public.duplicatas;

create trigger trg_block_duplicate_nf_cte
before insert or update of nf_cte on public.duplicatas
for each row
execute function public.block_duplicate_nf_cte();
