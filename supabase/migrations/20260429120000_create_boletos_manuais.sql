create table if not exists public.boletos_manuais (
  id bigserial primary key,
  banco text not null check (banco in ('itau', 'safra', 'bradesco', 'inter')),
  sacado_id bigint not null references public.sacados(id),
  valor numeric(15, 2) not null check (valor > 0),
  abatimento numeric(15, 2) not null default 0 check (abatimento >= 0),
  vencimento date not null,
  descricao text not null,
  seu_numero text not null,
  linha_digitavel text,
  codigo_barras text,
  nosso_numero text,
  status text not null default 'processando',
  resposta_banco jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_boletos_manuais_sacado_id
  on public.boletos_manuais (sacado_id);

create index if not exists idx_boletos_manuais_created_at
  on public.boletos_manuais (created_at desc);
