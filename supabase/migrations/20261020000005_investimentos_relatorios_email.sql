BEGIN;

CREATE TABLE public.investimentos_relatorios_email (
    usuario_chave text PRIMARY KEY,
    configuracao jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investimentos_relatorios_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.investimentos_relatorios_email FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.investimentos_relatorios_email TO service_role;

CREATE TABLE public.investimentos_relatorios_envios (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_chave text NOT NULL REFERENCES public.investimentos_relatorios_email(usuario_chave) ON DELETE CASCADE,
    data_referencia date NOT NULL,
    status text NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'enviado', 'parcial', 'erro')),
    resultado jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (usuario_chave, data_referencia)
);

ALTER TABLE public.investimentos_relatorios_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.investimentos_relatorios_envios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.investimentos_relatorios_envios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.investimentos_relatorios_envios_id_seq TO service_role;

COMMIT;
