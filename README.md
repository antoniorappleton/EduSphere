# 🎓 EduSphere — Ecossistema de Explicações

A **EduSphere** é uma plataforma moderna e premium desenvolvida para centralizar a gestão de explicações. O sistema liga explicadores, alunos e encarregados de educação num espaço único, combinando uma estética visual de vanguarda com funcionalidades robustas de gestão financeira, pedagógica e de comunicação.

---

## 🚀 Visão Geral e Estrutura PWA
A EduSphere é uma **Progressive Web App (PWA)** completa, permitindo a instalação direta no telemóvel (Android e iOS).
- **Service Worker (v8)**: Garante caching inteligente, performance off-line e carregamentos instantâneos.
- **Instalação Facilitada**: Popup inteligente integrado que guia utilizadores de Android e iOS na instalação da app.

---

## ✨ Funcionalidades Principais

### 💼 Painel do Explicador (Dashboard Premium)
Redesenhado com uma estética premium e moderna para máxima produtividade:
- **Resumo Financeiro**: KPIs dinâmicos do mês corrente (Previsto, Realizado e Pendente).
- **Lista de Alunos Premium**: Cartões com avatars, indicadores de escolaridade e estado de pagamento em tempo real.
- **Sino de Lembrete Inteligente**: Ícone de sino persistente para marcar alunos a avisar; o sino "desliga-se" automaticamente quando o pagamento é registado.
- **Gestão de Alunos**: Perfis detalhados e responsivos com gestão completa de dados, sessões e pagamentos (CRUD).
- **Chat Integrado**: Interface de mensagens direta dentro do perfil do aluno para comunicação rápida e centralizada.

### 📅 Gestão Pedagógica & Horários
- **Calendário Dinâmico**: Visualização semanal de explicações com filtros inteligentes (exclusão automática de alunos inativos).
- **Exercícios & Repositório**: Novo módulo de partilha de ficheiros e links. O tutor pode enviar materiais diretamente pelo portal e o aluno recebe notificações instantâneas.
- **Acompanhamento de Conclusão**: Marcação de exercícios como concluídos para controlo pedagógico.

### 💳 Faturação & Pagamentos (Controlo Total)
- **Mensalidades Automáticas**: Geração inteligente de mensalidades baseada no valor/sessão e frequência semanal.
- **Gestão de Pagamentos**: Fluxo completo de criação, edição e eliminação de recordes de pagamento com histórico multi-ano.
- **Dashboards de Análise**: Gráficos estatísticos (Chart.js) para análise de evolução de receitas e distribuição de alunos.

### 👤 Área do Aluno (Mobile-First)
Interface otimizada para utilização rápida no telemóvel:
- **Dashboard de Próximas Aulas**: Visão imediata das próximas sessões agendadas.
- **Cronograma Pessoal**: Calendário de aulas e histórico de presenças.
- **Repositório de Exercícios**: Secção dedicada para visualizar e descarregar materiais enviados pelo tutor.
- **Canal de Comunicação**: Chat direto com o explicador para esclarecimento de dúvidas.
- **Finanças**: Consulta transparente do estado de pagamentos e histórico.

---

## 🛠️ Arquitetura Técnica

### Frontend
- **Vanilla JavaScript & ES6+ Modules**: Código limpo, modular e sem dependências pesadas.
- **CSS3 Moderno**: Utilização intensiva de tokens de design, Glassmorphism e animações fluidas.
- **Mobile-First**: Design totalmente responsivo testado em diversos dispositivos.

### Backend (Supabase)
- **Database (PostgreSQL)**: Esquema relacional otimizado com **Row Level Security (RLS)** para garantir privacidade e exclusividade total dos dados entre diferentes tutores e alunos.
- **Authentication**: Sistema de login robusto por perfis com redirecionamento automático baseado em roles.
- **Edge Functions**: Lógica de servidor para geração de faturas e processamento de dados complexos.
- **Storage**: Armazenamento seguro de ficheiros de exercícios no Supabase Storage.

---

## 📂 Estrutura de Projeto

```text
EduSphere/
├── css/                 # Design System e estilos específicos (explicador.css, aluno.css)
├── pages/
│   └── explicador/      # Views do Painel do Tutor (dashboard, alunos, faturação, etc.)
├── public/
│   ├── js/              # Lógica core (explicador-service.js, alunos-explicador.js)
│   ├── js/pages/        # Lógica de páginas (aluno.js)
│   ├── img/             # Assets e ícones PWA
│   └── admin.html       # Painel de controlo administrativo
├── supabase/            # Configurações SQL, RLS e Edge Functions
├── index.html           # Landing page e Hub de Login central
├── aluno.html           # Portal do Aluno (Single-Page Application interna)
├── manifest.json        # Manifest PWA
└── service-worker.js    # Caching e suporte Offline
```

---

## 🗄️ Modelo de Dados
- `app_users`: Mapeamento de perfis e roles (admin, explicador, aluno).
- `explicadores`: Dados de mestre de cada tutor.
- `alunos`: Dossier completo do aluno e definições de faturação.
- `sessoes_explicacao`: Registo detalhado de aulas, presenças e notas.
- `pagamentos`: Tabela financeira de controlo mensal.
- `exercicios`: Repositório de ficheiros e links pedagógicos.
- `mensagens`: Tabela de comunicação direta tutor-aluno com timestamps.

---
© 2026 EduSphere | Desenvolvido com foco na excelência educativa por **antonioappleton**.
