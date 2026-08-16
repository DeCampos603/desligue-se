-- ============================================================================
-- DESLIGUE-SE — ESQUEMA COMPLETO DO BANCO DE DADOS (SUPABASE POSTGRESQL)
-- Segurança: Row Level Security (RLS) habilitado para conformidade total LGPD
-- ============================================================================

-- 1. Extensão para geração de IDs únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Perfis de Usuárias
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

-- 3. Tabela de Registros do Diário Noturno (Mental Dump & Triagem TCC-I)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  raw_text TEXT NOT NULL,
  triaged_data JSONB NOT NULL,
  routine_duration_minutes INT DEFAULT 3,
  sleep_mood TEXT CHECK (sleep_mood IN ('terrible', 'medium', 'great', NULL)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Acesso RLS (Privacidade Absoluta: A usuária só enxerga os seus próprios dados)
DROP POLICY IF EXISTS "Usuária visualiza seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuária visualiza seu próprio perfil" 
ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuária atualiza seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuária atualiza seu próprio perfil" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuária gerencia seus próprios diários" ON public.journal_entries;
CREATE POLICY "Usuária gerencia seus próprios diários" 
ON public.journal_entries FOR ALL USING (auth.uid() = user_id);

-- 6. Trigger automático para criar registro de perfil quando um novo usuário se cadastrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
