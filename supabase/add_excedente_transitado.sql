-- Transição de excedente de pagamento entre períodos de faturação.
--
-- Quando um aluno paga mais do que o valor_previsto de um mês (ex: previsto
-- 90€ para 3 explicações, mas pago 150€), os 60€ a mais contam como
-- adiantamento de sessões do mês seguinte. Este ficheiro:
--   1) acrescenta as duas colunas novas usadas por essa lógica
--      (aditivo — não mexe em nada existente);
--   2) corrige retroativamente Setembro para os alunos que já pagaram além
--      do previsto nesse período (Vasco Varela Pinto e Bryan), transitando
--      o excedente para Outubro do mesmo ano.
--
-- A partir de agora, a Edge Function expl-alunos (ver
-- sincronizarExcedenteTransitado em supabase/functions/expl-alunos/index.ts)
-- mantém estas colunas atualizadas automaticamente sempre que um pagamento é
-- registado/editado — este script só preenche o histórico que já existia
-- antes dessa lógica entrar em produção.
--
-- Execute este ficheiro no SQL Editor do Supabase. É seguro voltar a correr
-- (idempotente): ADD COLUMN IF NOT EXISTS e o bloco de correção recalculam
-- sempre a partir dos valores atuais, nunca somam em cima de uma correção
-- anterior.

BEGIN;

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS excedente_transitado DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS credito_recebido DECIMAL(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pagamentos.excedente_transitado IS
  'Parte do valor pago NESTE período que excede o valor_previsto e foi reservada para o mês seguinte (informativo, mostrado no relatório de fim de período deste mês).';
COMMENT ON COLUMN public.pagamentos.credito_recebido IS
  'Crédito recebido de um excedente pago no mês ANTERIOR, já aplicado ao que falta pagar neste período.';

-- Correção pontual de Setembro para Vasco Varela Pinto e Bryan (match
-- flexível por nome/apelido, para não depender de como o nome foi dividido
-- entre as colunas `nome`/`apelido`). Processa qualquer linha de Setembro
-- destes alunos, em qualquer ano em que exista.
DO $$
DECLARE
  rec RECORD;
  v_excesso NUMERIC(10,2);
  v_prox_ano INT;
  v_prox_id UUID;
  v_prox_prev NUMERIC(10,2);
  v_prox_pago NUMERIC(10,2);
  v_novo_estado pagamento_estado;
BEGIN
  FOR rec IN
    SELECT p.id_pagamento, p.id_aluno, p.id_explicador, p.ano, p.mes,
           p.valor_previsto, p.valor_pago, a.nome, a.apelido
    FROM public.pagamentos p
    JOIN public.alunos a ON a.id_aluno = p.id_aluno
    WHERE p.mes = 9
      AND (
        (a.nome ILIKE '%Vasco%' AND (COALESCE(a.nome,'') || ' ' || COALESCE(a.apelido,'')) ILIKE '%Varela%Pinto%')
        OR a.nome ILIKE '%Bryan%'
        OR a.apelido ILIKE '%Bryan%'
      )
  LOOP
    v_excesso := GREATEST(COALESCE(rec.valor_pago, 0) - COALESCE(rec.valor_previsto, 0), 0);

    RAISE NOTICE 'Aluno % % — Setembro %: previsto=%, pago=%, excedente a transitar para Outubro=%',
      rec.nome, rec.apelido, rec.ano, rec.valor_previsto, rec.valor_pago, v_excesso;

    UPDATE public.pagamentos
      SET excedente_transitado = v_excesso
      WHERE id_pagamento = rec.id_pagamento;

    IF v_excesso > 0 THEN
      v_prox_ano := rec.ano; -- Setembro -> Outubro nunca muda de ano

      SELECT id_pagamento, valor_previsto, valor_pago
        INTO v_prox_id, v_prox_prev, v_prox_pago
      FROM public.pagamentos
      WHERE id_aluno = rec.id_aluno AND ano = v_prox_ano AND mes = 10;

      IF FOUND THEN
        v_novo_estado := CASE
          WHEN v_prox_prev > 0 AND (COALESCE(v_prox_pago, 0) + v_excesso) >= v_prox_prev THEN 'PAGO'
          WHEN (COALESCE(v_prox_pago, 0) + v_excesso) > 0 THEN 'PARCIAL'
          ELSE 'PENDENTE'
        END;

        UPDATE public.pagamentos
          SET credito_recebido = v_excesso,
              estado = v_novo_estado
          WHERE id_pagamento = v_prox_id;

        RAISE NOTICE '  -> Outubro %: previsto=%, pago=%, credito aplicado=%, novo estado=%',
          v_prox_ano, v_prox_prev, v_prox_pago, v_excesso, v_novo_estado;
      ELSE
        INSERT INTO public.pagamentos
          (id_aluno, id_explicador, ano, mes, valor_previsto, valor_pago, credito_recebido, estado)
        VALUES
          (rec.id_aluno, rec.id_explicador, v_prox_ano, 10, 0, 0, v_excesso, 'PAGO');

        RAISE NOTICE '  -> Outubro % ainda não tinha registo: criado com credito_recebido=%',
          v_prox_ano, v_excesso;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
