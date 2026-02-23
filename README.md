# 🎓 EduSphere — Ecossistema de Explicações

A **EduSphere** é uma plataforma moderna e premium desenvolvida para centralizar a gestão de explicações. O sistema liga explicadores, alunos e encarregados de educação num espaço único, combinando uma estética visual de vanguarda com funcionalidades robustas de gestão financeira e pedagógica.

---

## 🚀 Visão Geral e Estrutura PWA
A EduSphere é uma **Progressive Web App (PWA)** completa, permitindo a instalação direta no telemóvel (Android e iOS).
- **Service Worker (v8)**: Garante caching inteligente, performance off-line e carregamentos instantâneos.
- **Instalação Facilitada**: Popup inteligente integrado que guia utilizadores de Android e iOS na instalação da app.

---

## ✨ Funcionalidades Principais

### 💼 Painel do Explicador (Dashboard Premium)
Redesenhado com uma estética premium e moderna:
- **Resumo Financeiro**: KPIs dinâmicos do mês corrente (Previsto, Realizado e Pendente).
- **Lista de Alunos Premium**: Cartões com avatars, indicadores de escolaridade e estado de pagamento em tempo real.
- **Sino de Lembrete Inteligente**: Ícone de sino persistente para marcar alunos a avisar; o sino "desliga-se" automaticamente quando o pagamento é registado.
- **Gestão de Alunos**: Perfis detalhados e responsivos com histórico de sessões e pagamentos.

### 📅 Gestão Pedagógica & Horários
- **Calendário Dinâmico**: Visualização semanal de explicações com filtros inteligentes (exclusão automática de alunos inativos).
- **Exercícios & Repositório**: Partilha de ficheiros e links entre explicador e aluno com controlo de datas de entrega.

### 💳 Faturação & Relatórios
- **Mensalidades Automáticas**: Geração inteligente de mensalidades baseada no valor/hora e número de sessões previstas.
- **Dashboards de Análise**: Gráficos estatísticos (Chart.js) para análise de evolução de receitas e distribuição de alunos.

### 👤 Área do Aluno
Interface simplificada e focada:
- Consulta do cronograma de sessões.
- Acesso a exercícios e feedback do explicador.
- Consulta do estado de pagamentos.

---

## 🛠️ Arquitetura Técnica

### Frontend
- **Vanilla JavaScript & ES6+ Modules**: Código limpo, modular e sem dependências pesadas.
- **CSS3 Moderno**: Utilização intensiva de tokens de design, Glassmorphism, e animações suaves.
- **Mobile-First**: Design totalmente responsivo testado em diversos ecrãs.

### Backend (Supabase)
- **Database (PostgreSQL)**: Esquema relacional otimizado com RLS (Row Level Security) para garantir privacidade total dos dados.
- **Authentication**: Sistema de login robusto por perfis (Admin, Explicador, Aluno).
- **Edge Functions**: Lógica de servidor para geração de faturios e processamento de dados complexos.
- **Storage**: Armazenamento seguro de ficheiros de exercícios e documentos.

---

## 📂 Estrutura de Ficheiros

```text
EduSphere/
├── css/                 # Estilos (base, nav, dashboards específicos)
├── pages/
│   └── explicador/      # Interface e lógica do painel de tutor
├── public/
│   ├── js/              # Lógica da aplicação (serviços e componentes)
│   ├── img/             # Assets e ícones PWA
│   └── admin.html       # Painel de administração
├── supabase/            # Esquemas SQL e migrações
├── index.html           # Landing page e Hub de Login
├── manifest.json        # Configuração PWA
└── service-worker.js    # Caching e suporte Offline
```

---

## 🗄️ Base de Dados (Esquema Principal)
- `app_users`: Mapeia utilizadores Auth para papéis e referências internas.
- `explicadores`: Dados de perfil e configurações de tutores.
- `alunos`: Perfis de alunos, valores por sessão e controlo de ativação.
- `sessoes_explicacao`: Registo de aulas agendadas e realizadas.
- `pagamentos`: Controlo financeiro por mês e ano.
- `exercicios`: Repositório de materiais pedagógicos.

---
© 2026 EduSphere | Desenvolvido com foco na excelência educativa por **antonioappleton**.
