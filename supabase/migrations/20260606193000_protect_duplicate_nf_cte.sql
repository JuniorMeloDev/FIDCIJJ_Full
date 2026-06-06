create index if not exists idx_duplicatas_nf_cte
  on public.duplicatas (nf_cte);

create or replace function public.block_duplicate_nf_cte()
returns trigger
language plpgsql
as $$
begin
  if new.nf_cte is null or btrim(new.nf_cte) = '' then
    raise exception 'nf_cte nao pode ser vazio.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.duplicatas d
    where d.nf_cte = new.nf_cte
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
