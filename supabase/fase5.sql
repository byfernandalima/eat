-- ëat · fase 5: gestão do consultório (agenda, teleconsulta, financeiro, documentos)
-- Rode depois do fase4.sql: Supabase → SQL Editor → New query → colar → Run.

-- ---------- perfil: papel timbrado, documento fiscal, meta e link da agenda ----------
alter table public.perfis add column if not exists endereco text not null default '';
alter table public.perfis add column if not exists telefone text not null default '';
alter table public.perfis add column if not exists documento text not null default '';      -- CPF ou CNPJ (sai no recibo)
alter table public.perfis add column if not exists rodape text not null default '';         -- texto do rodapé do papel timbrado
alter table public.perfis add column if not exists meta_mensal numeric not null default 0;
alter table public.perfis add column if not exists ics_token uuid not null default gen_random_uuid(); -- link secreto da agenda para o Google
alter table public.pacientes add column if not exists cpf text not null default '';

-- ---------- agenda (consultas e bloqueios) ----------
create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  nutri_id uuid not null references public.perfis (id) on delete cascade,
  categoria text not null default 'consulta' check (categoria in ('consulta', 'bloqueio')),
  paciente_id uuid references public.pacientes (id) on delete set null,
  paciente_nome text not null default '',
  tipo text not null default '',
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'agendada' check (status in ('agendada', 'confirmada', 'realizada', 'faltou', 'cancelada')),
  modalidade text not null default 'presencial' check (modalidade in ('presencial', 'online')),
  sala text not null default '',
  encaixe boolean not null default false,
  valor numeric not null default 0,
  observacao text not null default '',
  token uuid not null default gen_random_uuid(),          -- link de confirmação da paciente
  confirmado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists agenda_nutri_inicio on public.agenda (nutri_id, inicio);
alter table public.agenda enable row level security;
drop policy if exists "agenda: nutri gerencia a sua" on public.agenda;
create policy "agenda: nutri gerencia a sua" on public.agenda
  for all to authenticated using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);

-- ---------- financeiro ----------
create table if not exists public.financeiro (
  id uuid primary key default gen_random_uuid(),
  nutri_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null default '',
  categoria text not null default '',
  valor numeric not null check (valor >= 0),
  data date not null default current_date,
  pago boolean not null default true,
  forma text not null default '',
  paciente_id uuid references public.pacientes (id) on delete set null,
  consulta_id uuid references public.agenda (id) on delete set null,
  recibo integer,                                          -- número do recibo emitido
  criado_em timestamptz not null default now()
);
create index if not exists financeiro_nutri_data on public.financeiro (nutri_id, data);
alter table public.financeiro enable row level security;
drop policy if exists "financeiro: nutri gerencia o seu" on public.financeiro;
create policy "financeiro: nutri gerencia o seu" on public.financeiro
  for all to authenticated using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);

revoke all on table public.agenda, public.financeiro from anon;
grant select, insert, update, delete on table public.agenda, public.financeiro to authenticated;

-- biblioteca: tipos de consulta e modelos de documento
alter table public.biblioteca drop constraint if exists biblioteca_tipo_check;
alter table public.biblioteca add constraint biblioteca_tipo_check
  check (tipo in ('alimento', 'medida', 'modelo_plano', 'refeicao', 'receita', 'orientacao', 'formula', 'farmacia', 'equivalentes', 'tipo_consulta', 'documento'));
-- documentos emitidos para a paciente
alter table public.registros drop constraint if exists registros_tipo_check;
alter table public.registros add constraint registros_tipo_check
  check (tipo in ('antropometria', 'energia', 'exame', 'foto', 'infantil', 'gestacao', 'gestacao_info', 'ia',
                  'plano', 'suplementos', 'orientacao', 'documento'));

-- ---------- confirmação pela paciente (link sem login) ----------
create or replace function public.consulta_publica(p_id uuid, p_token uuid)
returns table (inicio timestamptz, fim timestamptz, tipo text, modalidade text, sala text, status text, paciente text, nutri text, endereco text)
language sql stable security definer set search_path = public as $$
  select a.inicio, a.fim, a.tipo, a.modalidade, a.sala, a.status, a.paciente_nome, p.nome, p.endereco
  from public.agenda a join public.perfis p on p.id = a.nutri_id
  where a.id = p_id and a.token = p_token and a.categoria = 'consulta';
$$;
create or replace function public.confirmar_consulta(p_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.agenda set status = 'confirmada', confirmado_em = now()
  where id = p_id and token = p_token and status = 'agendada' and inicio > now();
  return found;
end $$;
revoke all on function public.consulta_publica(uuid, uuid) from public;
revoke all on function public.confirmar_consulta(uuid, uuid) from public;
grant execute on function public.consulta_publica(uuid, uuid) to anon, authenticated;
grant execute on function public.confirmar_consulta(uuid, uuid) to anon, authenticated;

-- ---------- agenda para o Google (link secreto, sem login e sem chave de servidor) ----------
create or replace function public.agenda_ics(p_token uuid)
returns table (nutri text, endereco text, id uuid, categoria text, paciente_nome text, tipo text, inicio timestamptz, fim timestamptz,
               status text, modalidade text, sala text, encaixe boolean, observacao text)
language sql stable security definer set search_path = public as $$
  select p.nome, p.endereco, a.id, a.categoria, a.paciente_nome, a.tipo, a.inicio, a.fim, a.status, a.modalidade, a.sala, a.encaixe, a.observacao
  from public.perfis p
  left join public.agenda a on a.nutri_id = p.id and a.status <> 'cancelada'
    and a.inicio between now() - interval '60 days' and now() + interval '365 days'
  where p.ics_token = p_token
  order by a.inicio;
$$;
revoke all on function public.agenda_ics(uuid) from public;
grant execute on function public.agenda_ics(uuid) to anon, authenticated;
