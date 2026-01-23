-- =============================================================================
-- 1. ENUMS & TYPES
-- =============================================================================

-- user_role: para distinguir os tipos de utilizador na tabela 'profiles'
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'EXPLICADOR', 'ALUNO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- pagamento_estado: estados possíveis de um pagamento
DO $$ BEGIN
    CREATE TYPE pagamento_estado AS ENUM ('PAGO', 'PARCIAL', 'EM_ATRASO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- exercicio_tipo: tipos de recursos enviados
DO $$ BEGIN
    CREATE TYPE exercicio_tipo AS ENUM ('FICHEIRO', 'LINK', 'OUTRO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. TABELA profiles
-- Relaciona o user do Auth com o papel na aplicação
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'ALUNO',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politica: User vê o seu próprio perfil
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Politica: Admins veem tudo (será necessário bootstrap manualmente do primeiro admin)
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  );

-- =============================================================================
-- 3. TABELA explicadores
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.explicadores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  contacto TEXT,
  email TEXT,
  max_alunos INTEGER DEFAULT 10,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_explicador_user UNIQUE (user_id)
);

ALTER TABLE public.explicadores ENABLE ROW LEVEL SECURITY;

-- Politica: Admins veem/editam tudo
CREATE POLICY "Admins manage explicadores" ON public.explicadores
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  );

-- Politica: O próprio explicador vê e edita os seus dados
CREATE POLICY "Explicador manage own data" ON public.explicadores
  FOR ALL USING (auth.uid() = user_id);

-- Politica: Alunos podem ver dados básicos do seu explicador (via relação aluno->explicador)
-- (Simplificação: Alunos podem ler explicadores para saber o nome)
CREATE POLICY "Alunos read explicadores" ON public.explicadores
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ALUNO'
  );


-- =============================================================================
-- 4. TABELA alunos
-- A conta de aluno é criada pelo explicador, que associa um Auth User.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.alunos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Pode ser NULL inicialmente até o aluno fazer signup/claim
  explicador_id UUID NOT NULL REFERENCES public.explicadores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  apelido TEXT,
  telemovel TEXT,
  ano_escolaridade INTEGER,
  username TEXT, -- Nome visível na app
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;

-- Explicador vê/edita OS SEUS alunos
CREATE POLICY "Explicador manage own alunos" ON public.alunos
  FOR ALL USING (
    explicador_id IN (
      SELECT id FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

-- Aluno vê o SEU próprio registo
CREATE POLICY "Aluno read own data" ON public.alunos
  FOR SELECT USING (auth.uid() = user_id);


-- =============================================================================
-- 5. TABELA explicacoes (Sessões)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.explicacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  explicador_id UUID NOT NULL REFERENCES public.explicadores(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  local TEXT,
  detalhes TEXT,
  preco DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'AGENDADA', -- AGENDADA, CONCLUIDA, CANCELADA
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.explicacoes ENABLE ROW LEVEL SECURITY;

-- Explicador gere as suas explicações
CREATE POLICY "Explicador manage own explicacoes" ON public.explicacoes
  FOR ALL USING (
    explicador_id IN (
      SELECT id FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

-- Aluno vê as SUAS explicações
CREATE POLICY "Aluno read own explicacoes" ON public.explicacoes
  FOR SELECT USING (
    aluno_id IN (
      SELECT id FROM public.alunos WHERE user_id = auth.uid()
    )
  );


-- =============================================================================
-- 6. TABELA pagamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  explicador_id UUID NOT NULL REFERENCES public.explicadores(id) ON DELETE CASCADE,
  ano SMALLINT NOT NULL,
  mes SMALLINT NOT NULL,
  valor_previsto DECIMAL(10,2) DEFAULT 0,
  valor_pago DECIMAL(10,2) DEFAULT 0,
  data_pagamento DATE,
  estado pagamento_estado DEFAULT 'EM_ATRASO',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

-- Explicador gere pagamentos
CREATE POLICY "Explicador manage pagamentos" ON public.pagamentos
  FOR ALL USING (
    explicador_id IN (
      SELECT id FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

-- Aluno vê os SEUS pagamentos
CREATE POLICY "Aluno read own pagamentos" ON public.pagamentos
  FOR SELECT USING (
    aluno_id IN (
      SELECT id FROM public.alunos WHERE user_id = auth.uid()
    )
  );


-- =============================================================================
-- 7. TABELA exercicios
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exercicios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  explicador_id UUID NOT NULL REFERENCES public.explicadores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo exercicio_tipo DEFAULT 'FICHEIRO',
  url TEXT,
  data_envio TIMESTAMPTZ DEFAULT NOW(),
  data_entrega_prevista DATE,
  data_conclusao DATE,
  is_concluido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exercicios ENABLE ROW LEVEL SECURITY;

-- Explicador gere exercícios
CREATE POLICY "Explicador manage exercicios" ON public.exercicios
  FOR ALL USING (
    explicador_id IN (
      SELECT id FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

-- Aluno vê e EDITA exercícios (ex: marcar como concluído)
-- Para simplificar, permitimos UPDATE ao aluno apenas se for o dono
CREATE POLICY "Aluno view update exercicios" ON public.exercicios
  FOR ALL USING (
    aluno_id IN (
      SELECT id FROM public.alunos WHERE user_id = auth.uid()
    )
  );


-- =============================================================================
-- 8. TABELA login_audit
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.login_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.login_audit ENABLE ROW LEVEL SECURITY;

-- Apenas Admin vê auditoria (ou insert only system)
CREATE POLICY "Admins view audit" ON public.login_audit
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  );
-- Todos podem INSERIR logs (via function/trigger ou client se autenticado)
CREATE POLICY "Users insert log" ON public.login_audit
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- FUNCTION: handle_new_user
-- Cria automaticamente um profile quando um user se regista no Auth
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (new.id, 'ALUNO'); -- Default role, admin muda depois se necessário
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criação automatica de profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Politica: Permitir que o user crie o seu própio profile se faltar (falha no trigger ou user antigo)
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

