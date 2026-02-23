-- =============================================================================
-- 1. ENUMS & TYPES
-- =============================================================================

-- user_role: para distinguir os tipos de utilizador
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'explicador', 'aluno');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- pagamento_estado: estados possíveis de um pagamento
DO $$ BEGIN
    CREATE TYPE pagamento_estado AS ENUM ('PAGO', 'PARCIAL', 'PENDENTE', 'EM_ATRASO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- exercicio_tipo: tipos de exercícios
DO $$ BEGIN
    CREATE TYPE exercicio_tipo AS ENUM ('FICHEIRO', 'LINK', 'OUTRO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. TABELA app_users
-- Relaciona o user do Auth com o papel na aplicação e referência à tabela específica
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'aluno',
  ref_id UUID, -- ID na tabela 'alunos' ou 'explicadores'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_app_user_uid UNIQUE (user_id)
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own app_user" ON public.app_users
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all app_users" ON public.app_users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_users WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- 3. TABELA explicadores
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.explicadores (
  id_explicador UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  apelido TEXT,
  email TEXT,
  contacto TEXT,
  max_alunos INTEGER DEFAULT 10,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_explicador_user UNIQUE (user_id)
);

ALTER TABLE public.explicadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage explicadores" ON public.explicadores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_users WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Explicador manage own data" ON public.explicadores
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Aluno read own explicador" ON public.explicadores
  FOR SELECT USING (
    id_explicador IN (
      SELECT id_explicador FROM public.alunos WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 4. TABELA alunos
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.alunos (
  id_aluno UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  id_explicador UUID NOT NULL REFERENCES public.explicadores(id_explicador) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  apelido TEXT,
  telemovel TEXT,
  ano INTEGER,
  idade INTEGER,
  dia_semana_preferido TEXT,
  valor_explicacao DECIMAL(10,2),
  sessoes_mes INTEGER,
  nome_pai_cache TEXT,
  contacto_pai_cache TEXT,
  email TEXT,
  username TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  faturacao_ativa BOOLEAN DEFAULT FALSE,
  faturacao_inicio DATE,
  dia_pagamento INTEGER,
  mensalidade_avisada BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Explicador manage own alunos" ON public.alunos
  FOR ALL USING (
    id_explicador IN (
      SELECT id_explicador FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Aluno read own data" ON public.alunos
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================================================
-- 5. TABELA sessoes_explicacao
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sessoes_explicacao (
  id_sessao UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  id_aluno UUID NOT NULL REFERENCES public.alunos(id_aluno) ON DELETE CASCADE,
  id_explicador UUID NOT NULL REFERENCES public.explicadores(id_explicador) ON DELETE CASCADE,
  data DATE NOT NULL,
  hora_inicio TIME,
  duracao_min INTEGER DEFAULT 60,
  estado TEXT DEFAULT 'AGENDADA', -- AGENDADA, REALIZADA, CANCELADA
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sessoes_explicacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Explicador manage sessoes" ON public.sessoes_explicacao
  FOR ALL USING (
    id_explicador IN (
      SELECT id_explicador FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Aluno read sessoes" ON public.sessoes_explicacao
  FOR SELECT USING (
    id_aluno IN (
      SELECT id_aluno FROM public.alunos WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 6. TABELA pagamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id_pagamento UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  id_aluno UUID NOT NULL REFERENCES public.alunos(id_aluno) ON DELETE CASCADE,
  id_explicador UUID NOT NULL REFERENCES public.explicadores(id_explicador) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  valor_previsto DECIMAL(10,2) DEFAULT 0,
  valor_pago DECIMAL(10,2) DEFAULT 0,
  data_pagamento DATE,
  estado pagamento_estado DEFAULT 'PENDENTE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Explicador manage pagamentos" ON public.pagamentos
  FOR ALL USING (
    id_explicador IN (
      SELECT id_explicador FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Aluno read pagamentos" ON public.pagamentos
  FOR SELECT USING (
    id_aluno IN (
      SELECT id_aluno FROM public.alunos WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 7. TABELA exercicios
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exercicios (
  id_exercicio UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  id_aluno UUID NOT NULL REFERENCES public.alunos(id_aluno) ON DELETE CASCADE,
  id_explicador UUID NOT NULL REFERENCES public.explicadores(id_explicador) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo exercicio_tipo NOT NULL DEFAULT 'OUTRO',
  url TEXT,
  data_envio TIMESTAMPTZ DEFAULT NOW(),
  data_entrega_prevista DATE,
  data_conclusao DATE,
  is_concluido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exercicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Explicador manage own exercicios" ON public.exercicios
  FOR ALL USING (
    id_explicador IN (
      SELECT id_explicador FROM public.explicadores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Aluno read own exercicios" ON public.exercicios
  FOR SELECT USING (
    id_aluno IN (
      SELECT id_aluno FROM public.alunos WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 8. VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW public.v_pagamentos_detalhe AS
SELECT p.*, a.nome as aluno_nome, a.apelido as aluno_apelido
FROM public.pagamentos p
JOIN public.alunos a ON p.id_aluno = a.id_aluno;

CREATE OR REPLACE VIEW public.v_sessoes_detalhe AS
SELECT s.*, a.nome as aluno_nome, a.apelido as aluno_apelido
FROM public.sessoes_explicacao s
JOIN public.alunos a ON s.id_aluno = a.id_aluno;

-- =============================================================================
-- 9. FUNCTIONS & TRIGGERS
-- =============================================================================

-- Cria automaticamente um app_user quando um user se regista no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.app_users (user_id, role)
  VALUES (new.id, 'aluno');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- 10. POLICY: Aluno pode confirmar presença (UPDATE estado)
-- =============================================================================
CREATE POLICY "Aluno confirm sessoes" ON public.sessoes_explicacao
  FOR UPDATE USING (
    id_aluno IN (
      SELECT id_aluno FROM public.alunos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    id_aluno IN (
      SELECT id_aluno FROM public.alunos WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 11. TABELA mensagens (chat aluno ⇄ explicador)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.mensagens (
  id_mensagem UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  de_user_id UUID NOT NULL,
  para_user_id UUID NOT NULL,
  id_aluno UUID REFERENCES public.alunos(id_aluno) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  lida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own messages" ON public.mensagens
  FOR SELECT USING (
    auth.uid()::text = de_user_id::text
    OR auth.uid()::text = para_user_id::text
  );

CREATE POLICY "Users insert own messages" ON public.mensagens
  FOR INSERT WITH CHECK (
    auth.uid()::text = de_user_id::text
  );
