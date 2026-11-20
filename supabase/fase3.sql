-- ëat · fase 3: análises de IA ficam salvas na ficha da paciente
-- Rode depois do fase2.sql: Supabase → SQL Editor → New query → colar → Run.
alter table public.registros drop constraint if exists registros_tipo_check;
alter table public.registros add constraint registros_tipo_check
  check (tipo in ('antropometria', 'energia', 'exame', 'foto', 'infantil', 'gestacao', 'gestacao_info', 'ia'));
