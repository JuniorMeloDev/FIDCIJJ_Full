alter table public.tipos_operacao
  add column if not exists juros_pre_fixado boolean not null default true;

update public.tipos_operacao
set juros_pre_fixado = coalesce(juros_pre_fixado, true);
