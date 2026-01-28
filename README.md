# EduSphere
App de apoio a explicadores, pais e alunos.

## Visão Geral
EduSphere é uma plataforma web desenvolvida para gerir o ecossistema de explicações, facilitando a comunicação e gestão entre explicadores, alunos e encarregados de educação.

## Funcionalidades Principais

### Explicador
- **Dashboard**: Visão geral de alunos ativos, próximas sessões e KPIs financeiros.
- **Gestão de Alunos**:
  - Criação e edição de perfis de alunos.
  - Marcação de alunos como "Ativo" ou "Inativo" (Bloqueado).
  - **NOV**: Filtro "Mostrar inativos" na lista de alunos para gestão facilitada.
- **Calendário**:
  - Agendamento de sessões (drag & drop ou via botão).
  - Visualização de sessões por semana.
  - As sessões de alunos inativos são automaticamente filtradas do calendário.
- **Faturação**:
  - Controlo de mensalidades (Pagos, Pendentes, Parciais).
  - Emissão de avisos de pagamento aos encarregados.

### Administrador
- **Dashboard**: Interface premium com KPIs do sistema e atalhos rápidos.
- **Gestão de Utilizadores**: Controlo de contas de Explicadores e Alunos.
- **Logs de Sistema**: Visualização de atividade recente da plataforma.
- **Configuração Global**: Acesso a configurações do sistema.

## Tecnologias
- HTML5, CSS3 (com variáveis CSS para temas).
- JavaScript (Vanilla + ES6 Modules).
- Supabase (Backend: Auth, Database, Edge Functions).

## Notas de Desenvolvimento
- A app utiliza Service Workers para caching e performance (`v6` atual).
- A interface é responsiva e adaptada para mobile.
