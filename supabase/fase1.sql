-- ëat · fase 1: ficha da paciente, avaliações, exames e fotos
-- Rode DEPOIS do schema.sql: Supabase → SQL Editor → New query → colar → Run.
-- Pode rodar mais de uma vez sem problema.

-- ---------- CRN no perfil (vai no pedido de exames) ----------
alter table public.perfis add column if not exists crn text not null default '';

-- ---------- pacientes ----------
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  nutri_id uuid not null references public.perfis (id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  telefone text not null default '',
  nascimento date,
  sexo text not null default 'F' check (sexo in ('F', 'M')),
  observacoes text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pacientes_nutri_nome on public.pacientes (nutri_id, nome);
alter table public.pacientes enable row level security;
drop policy if exists "pacientes: nutri gerencia as suas" on public.pacientes;
create policy "pacientes: nutri gerencia as suas" on public.pacientes
  for all to authenticated using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);

alter table public.anamneses add column if not exists paciente_id uuid references public.pacientes (id) on delete set null;
create index if not exists anamneses_paciente on public.anamneses (paciente_id);

-- ---------- registros (antropometria, energia, exames, fotos) ----------
create table if not exists public.registros (
  id uuid primary key default gen_random_uuid(),
  nutri_id uuid not null references public.perfis (id) on delete cascade,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  tipo text not null check (tipo in ('antropometria', 'energia', 'exame', 'foto')),
  data date not null default current_date,
  dados jsonb not null default '{}'::jsonb,
  arquivo text,            -- caminho no Storage (PDF do exame ou foto)
  criado_em timestamptz not null default now()
);
create index if not exists registros_paciente_tipo on public.registros (paciente_id, tipo, data);
alter table public.registros enable row level security;
drop policy if exists "registros: nutri gerencia os seus" on public.registros;
create policy "registros: nutri gerencia os seus" on public.registros
  for all to authenticated using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);

revoke all on table public.pacientes, public.registros from anon;
grant select, insert, update, delete on table public.pacientes, public.registros to authenticated;

-- ---------- arquivos (fotos e PDFs) no Storage, pasta por nutri ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arquivos', 'arquivos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "arquivos: nutri lê os seus" on storage.objects;
create policy "arquivos: nutri lê os seus" on storage.objects
  for select to authenticated using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "arquivos: nutri envia os seus" on storage.objects;
create policy "arquivos: nutri envia os seus" on storage.objects
  for insert to authenticated with check (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "arquivos: nutri apaga os seus" on storage.objects;
create policy "arquivos: nutri apaga os seus" on storage.objects
  for delete to authenticated using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- anamnese enviada pelo link cria/encontra a ficha da paciente ----------
create or replace function public.enviar_anamnese(
  p_id uuid, p_nutri uuid, p_nome text, p_respostas jsonb, p_pontos integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_respostas ->> 'email', '')));
  v_nome text := left(trim(coalesce(p_nome, '')), 200);
  v_nasc date;
  v_paciente uuid;
begin
  if not exists (select 1 from public.perfis where id = p_nutri) then
    raise exception 'nutri_invalida';
  end if;
  if jsonb_typeof(p_respostas) <> 'object' or pg_column_size(p_respostas) > 200000 then
    raise exception 'respostas_invalidas';
  end if;
  begin v_nasc := (p_respostas ->> 'nascimento')::date; exception when others then v_nasc := null; end;

  -- reenvio: mantém a paciente já ligada
  select paciente_id into v_paciente from public.anamneses where id = p_id and nutri_id = p_nutri;
  -- mesma paciente pelo e-mail, ou pelo nome + nascimento
  if v_paciente is null and v_email <> '' then
    select id into v_paciente from public.pacientes where nutri_id = p_nutri and lower(email) = v_email limit 1;
  end if;
  if v_paciente is null and v_nome <> '' then
    select id into v_paciente from public.pacientes
      where nutri_id = p_nutri and lower(nome) = lower(v_nome) and (nascimento is not distinct from v_nasc) limit 1;
  end if;
  if v_paciente is null then
    insert into public.pacientes (nutri_id, nome, email, telefone, nascimento, sexo)
    values (p_nutri, v_nome, v_email, left(coalesce(p_respostas ->> 'telefone', ''), 40), v_nasc, 'F')
    returning id into v_paciente;
  end if;

  insert into public.anamneses (id, nutri_id, paciente_id, paciente_nome, respostas, pontos)
  values (p_id, p_nutri, v_paciente, v_nome, p_respostas, greatest(0, least(coalesce(p_pontos, 0), 100000)))
  on conflict (id) do update
    set paciente_nome = excluded.paciente_nome,
        respostas = excluded.respostas,
        pontos = excluded.pontos,
        vista = false,
        atualizado_em = now()
    where public.anamneses.nutri_id = excluded.nutri_id
      and public.anamneses.criado_em > now() - interval '7 days';
  return true;
end $$;
revoke all on function public.enviar_anamnese(uuid, uuid, text, jsonb, integer) from public;
grant execute on function public.enviar_anamnese(uuid, uuid, text, jsonb, integer) to anon, authenticated;

-- ---------- anamneses antigas ganham ficha ----------
do $$
declare r record; v_paciente uuid; v_nasc date;
begin
  for r in select * from public.anamneses where paciente_id is null loop
    begin v_nasc := (r.respostas ->> 'nascimento')::date; exception when others then v_nasc := null; end;
    select id into v_paciente from public.pacientes
      where nutri_id = r.nutri_id and (
        (coalesce(r.respostas ->> 'email', '') <> '' and lower(email) = lower(r.respostas ->> 'email'))
        or (lower(nome) = lower(r.paciente_nome) and nascimento is not distinct from v_nasc))
      limit 1;
    if v_paciente is null then
      insert into public.pacientes (nutri_id, nome, email, telefone, nascimento)
      values (r.nutri_id, r.paciente_nome, lower(coalesce(r.respostas ->> 'email', '')), coalesce(r.respostas ->> 'telefone', ''), v_nasc)
      returning id into v_paciente;
    end if;
    update public.anamneses set paciente_id = v_paciente where id = r.id;
  end loop;
end $$;
