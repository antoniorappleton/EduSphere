-- Diagnóstico pontual (só leitura, não altera nada): confirma se o número de
-- explicações previstas de Bryan Oliveira e Costa bate certo com as sessões
-- realmente dadas, e se o valor previsto/pago está coerente com isso.
--
-- Execute no SQL Editor do Supabase e envia-me os 3 resultados.

-- 1) Dados base do aluno: valor por sessão e nº de sessões/mês configurado.
--    8 sessões * valor_explicacao deve dar 200€, se for esse o cálculo usado.
SELECT id_aluno, nome, apelido, valor_explicacao, sessoes_mes, dia_semana_preferido, is_active
FROM public.alunos
WHERE nome ILIKE '%Bryan%' AND apelido ILIKE '%Oliveira%';

-- 2) Pagamentos por período: previsto vs pago vs excedente/crédito transitado,
--    para todos os meses que existam (não assume que é só Setembro).
SELECT p.ano, p.mes, p.valor_previsto, p.valor_pago, p.estado,
       p.excedente_transitado, p.credito_recebido, p.data_pagamento
FROM public.pagamentos p
JOIN public.alunos a ON a.id_aluno = p.id_aluno
WHERE a.nome ILIKE '%Bryan%' AND a.apelido ILIKE '%Oliveira%'
-- ano/mes são text em produção (ver nota no add_excedente_transitado.sql) —
-- cast para int para a ordem ficar cronológica e não lexicográfica (senão
-- "10" aparecia antes de "9").
ORDER BY p.ano::int, p.mes::int;

-- 3) Sessões reais por mês, com contagem por estado (REALIZADA/AGENDADA/
--    CANCELADA) — compara esta contagem com sessoes_mes/valor_previsto.
SELECT
  date_trunc('month', s.data)::date AS mes_sessao,
  s.estado,
  COUNT(*) AS n_sessoes
FROM public.sessoes_explicacao s
JOIN public.alunos a ON a.id_aluno = s.id_aluno
WHERE a.nome ILIKE '%Bryan%' AND a.apelido ILIKE '%Oliveira%'
GROUP BY 1, 2
ORDER BY 1, 2;
