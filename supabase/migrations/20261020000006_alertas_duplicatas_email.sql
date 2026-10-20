BEGIN;
CREATE TABLE public.duplicatas_alertas_email (
  usuario_chave text PRIMARY KEY,
  configuracao jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.duplicatas_alertas_envios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_chave text NOT NULL REFERENCES public.duplicatas_alertas_email(usuario_chave) ON DELETE CASCADE,
  data_referencia date NOT NULL,
  status text NOT NULL DEFAULT 'processando' CHECK (status IN ('processando','enviado','parcial','erro','sem_titulos')),
  resultado jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usuario_chave, data_referencia)
);
ALTER TABLE public.duplicatas_alertas_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicatas_alertas_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.duplicatas_alertas_email, public.duplicatas_alertas_envios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.duplicatas_alertas_email, public.duplicatas_alertas_envios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.duplicatas_alertas_envios_id_seq TO service_role;
COMMIT;
