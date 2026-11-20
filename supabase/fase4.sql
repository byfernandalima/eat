-- ëat · fase 4: plano alimentar, prescrições e biblioteca da nutri
-- Rode depois do fase3.sql: Supabase → SQL Editor → New query → colar → Run.

-- planos, suplementos e orientações da paciente ficam em "registros"
alter table public.registros drop constraint if exists registros_tipo_check;
alter table public.registros add constraint registros_tipo_check
  check (tipo in ('antropometria', 'energia', 'exame', 'foto', 'infantil', 'gestacao', 'gestacao_info', 'ia',
                  'plano', 'suplementos', 'orientacao'));

-- biblioteca da nutri: alimentos próprios, medidas caseiras, modelos de plano, refeições favoritas,
-- receitas, orientações, fórmulas manipuladas, farmácias e grupos de equivalentes
create table if not exists public.biblioteca (
  id uuid primary key default gen_random_uuid(),
  nutri_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('alimento', 'medida', 'modelo_plano', 'refeicao', 'receita', 'orientacao', 'formula', 'farmacia', 'equivalentes')),
  titulo text not null default '',
  categoria text not null default '',
  dados jsonb not null default '{}'::jsonb,
  arquivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists biblioteca_nutri_tipo on public.biblioteca (nutri_id, tipo, titulo);
alter table public.biblioteca enable row level security;
drop policy if exists "biblioteca: nutri gerencia a sua" on public.biblioteca;
create policy "biblioteca: nutri gerencia a sua" on public.biblioteca
  for all to authenticated using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);
revoke all on table public.biblioteca from anon;
grant select, insert, update, delete on table public.biblioteca to authenticated;

-- fotos de receitas e imagens de orientações também aceitam no Storage (mesma pasta da nutri)
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] where id = 'arquivos';
