-- ============================================================================
-- DESLIGUE-SE — ESQUEMA DO BANCO DE DADOS (SUPABASE / POSTGRESQL)
--
-- Revisão de 17/08/2026 (auditoria de segurança). O script é idempotente:
-- pode ser executado novamente sobre um banco já existente.
--
-- Mudanças em relação à versão anterior:
--   1. A usuária NÃO pode mais alterar o próprio plano. As colunas de cobrança
--      (plano, subscription_status, stripe_customer_id) passam a ser gravadas
--      exclusivamente pelo webhook do Stripe, com a service role. Antes, um
--      simples upsert no console do navegador liberava o Premium.
--   2. Faltava política de INSERT em profiles, o que fazia o upsert pós-pagamento
--      ser silenciosamente rejeitado pelo RLS.
--   3. WITH CHECK explícito nas políticas de escrita.
--   4. Função delete_my_account() para o direito de exclusão (LGPD, art. 18, VI).
--   5. Registro da prova de consentimento para dado sensível (art. 11).
--   6. Índice para a contagem diária de registros do plano gratuito.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. PERFIS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  nome TEXT,
  plano TEXT DEFAULT 'free' CHECK (plano IN ('free', 'premium_mensal', 'premium_anual')),
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  total_noites_concluidas INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Prova de consentimento (LGPD). Guardar quando e sob qual versão dos termos
-- a usuária autorizou o tratamento do dado sensível.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sensitive_data_consent_at TIMESTAMP WITH TIME ZONE;

-- Fim do periodo pago vigente, vindo do Stripe (current_period_end).
-- E o que permite mostrar a assinante quanto tempo de acesso ainda resta.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx
  ON public.profiles (stripe_customer_id);

-- ----------------------------------------------------------------------------
-- 2. REGISTROS DO DIÁRIO NOTURNO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  raw_text TEXT NOT NULL,
  triaged_data JSONB NOT NULL,
  routine_duration_minutes INT DEFAULT 3,
  sleep_mood TEXT CHECK (sleep_mood IN ('terrible', 'medium', 'great', NULL)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Horários de dormir e acordar informados no check-in matinal.
-- É o que alimenta a tela "Meu Ritmo" (duração média e melhor janela de sono).
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS sleep_times JSONB;

-- Sustenta a contagem "quantos registros esta usuária fez hoje?",
-- que é o limite do plano gratuito aplicado do lado do servidor.
CREATE INDEX IF NOT EXISTS journal_entries_user_created_idx
  ON public.journal_entries (user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Perfis: a usuária lê e edita apenas o próprio registro.
DROP POLICY IF EXISTS "Usuária visualiza seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuária visualiza seu próprio perfil"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuária cria seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuária cria seu próprio perfil"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Usuária atualiza seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuária atualiza seu próprio perfil"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Diário: acesso total apenas às próprias linhas.
DROP POLICY IF EXISTS "Usuária gerencia seus próprios diários" ON public.journal_entries;
CREATE POLICY "Usuária gerencia seus próprios diários"
ON public.journal_entries FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. BLINDAGEM DAS COLUNAS DE COBRANÇA
--    A política de UPDATE acima permite que a usuária edite o próprio perfil
--    (nome, por exemplo). Este gatilho garante que ela não consiga, no mesmo
--    movimento, se promover a Premium: qualquer alteração nas colunas de
--    cobrança feita por alguém que não seja a service role é revertida.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_billing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims JSONB;
  jwt_role TEXT;
BEGIN
  claims := NULLIF(current_setting('request.jwt.claims', true), '')::JSONB;
  jwt_role := COALESCE(claims ->> 'role', '');

  -- claims nulo = conexão direta ao banco (SQL Editor / admin), que é confiável.
  IF claims IS NOT NULL AND jwt_role <> 'service_role' THEN
    NEW.plano := OLD.plano;
    NEW.subscription_status := OLD.subscription_status;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.subscription_ends_at := OLD.subscription_ends_at;
  END IF;

  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_billing_columns_trigger ON public.profiles;
CREATE TRIGGER protect_billing_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_billing_columns();

-- ----------------------------------------------------------------------------
-- 5. CRIAÇÃO AUTOMÁTICA DO PERFIL NO CADASTRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, terms_version, terms_accepted_at, sensitive_data_consent_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'terms_version',
    (NEW.raw_user_meta_data ->> 'terms_accepted_at')::TIMESTAMPTZ,
    (NEW.raw_user_meta_data ->> 'sensitive_data_consent_at')::TIMESTAMPTZ
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. DIREITO DE EXCLUSÃO (LGPD, art. 18, VI)
--    Chamada pelo botão "Excluir minha conta e meus dados" no aplicativo.
--    Apaga o diário, o perfil e a própria conta de autenticação.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'É necessário estar autenticada para excluir a conta.';
  END IF;

  DELETE FROM public.journal_entries WHERE user_id = uid;
  DELETE FROM public.profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
