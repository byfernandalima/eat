-- ëat · banco de dados da anamnese
-- Rode este arquivo inteiro UMA vez em: Supabase → SQL Editor → New query → colar → Run.
--
-- Como os dados ficam protegidos:
--  • Cada nutri só lê, edita e apaga as anamneses dela (Row Level Security).
--  • A paciente não faz login. Ela só consegue ENVIAR respostas para a nutri do link,
--    pela função enviar_anamnese, e nunca consegue ler nada do banco.

-- ---------- perfis das nutricionistas ----------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  whatsapp text not null default '',
  criado_em timestamptz not null default now()
);
alter table public.perfis enable row level security;

drop policy if exists "perfil: ler o próprio" on public.perfis;
create policy "perfil: ler o próprio" on public.perfis
  for select to authenticated using (auth.uid() = id);
drop policy if exists "perfil: editar o próprio" on public.perfis;
create policy "perfil: editar o próprio" on public.perfis
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "perfil: criar o próprio" on public.perfis;
create policy "perfil: criar o próprio" on public.perfis
  for insert to authenticated with check (auth.uid() = id);

-- cria o perfil automaticamente quando a nutri se cadastra
create or replace function public.novo_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, whatsapp)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
          left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'whatsapp', ''), '\D', '', 'g'), 20))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_perfil();

-- ---------- anamneses ----------
create table if not exists public.anamneses (
  id uuid primary key,
  nutri_id uuid not null references public.perfis (id) on delete cascade,
  paciente_nome text not null default '',
  respostas jsonb not null,
  pontos integer not null default 0,
  vista boolean not null default false,
  origem text not null default 'link',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists anamneses_nutri_data on public.anamneses (nutri_id, criado_em desc);
alter table public.anamneses enable row level security;

drop policy if exists "anamnese: nutri lê as suas" on public.anamneses;
create policy "anamnese: nutri lê as suas" on public.anamneses
  for select to authenticated using (auth.uid() = nutri_id);
drop policy if exists "anamnese: nutri edita as suas" on public.anamneses;
create policy "anamnese: nutri edita as suas" on public.anamneses
  for update to authenticated using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);
drop policy if exists "anamnese: nutri apaga as suas" on public.anamneses;
create policy "anamnese: nutri apaga as suas" on public.anamneses
  for delete to authenticated using (auth.uid() = nutri_id);
drop policy if exists "anamnese: nutri importa para si" on public.anamneses;
create policy "anamnese: nutri importa para si" on public.anamneses
  for insert to authenticated with check (auth.uid() = nutri_id);

-- ---------- funções públicas usadas pelo link da paciente ----------
-- nome e WhatsApp da nutri para mostrar no questionário (só quem tem o link sabe o id)
create or replace function public.perfil_publico(p_nutri uuid)
returns table (nome text, whatsapp text)
language sql stable security definer set search_path = public as $$
  select nome, whatsapp from public.perfis where id = p_nutri;
$$;

-- recebe as respostas da paciente. Reenviar com o mesmo id atualiza a anamnese
-- (vale por 7 dias, para ela poder revisar e mandar de novo).
create or replace function public.enviar_anamnese(
  p_id uuid, p_nutri uuid, p_nome text, p_respostas jsonb, p_pontos integer
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.perfis where id = p_nutri) then
    raise exception 'nutri_invalida';
  end if;
  if jsonb_typeof(p_respostas) <> 'object' or pg_column_size(p_respostas) > 200000 then
    raise exception 'respostas_invalidas';
  end if;
  insert into public.anamneses (id, nutri_id, paciente_nome, respostas, pontos)
  values (p_id, p_nutri, left(coalesce(p_nome, ''), 200), p_respostas, greatest(0, least(coalesce(p_pontos, 0), 100000)))
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

-- ---------- permissões de tabela ----------
-- só quem está logado (a nutri) acessa as tabelas; as regras acima limitam às linhas dela.
-- a paciente (anon) não tem acesso direto a nenhuma tabela, só às duas funções abaixo.
revoke all on table public.perfis, public.anamneses from anon;
grant select, insert, update on table public.perfis to authenticated;
grant select, insert, update, delete on table public.anamneses to authenticated;

revoke all on function public.perfil_publico(uuid) from public;
revoke all on function public.enviar_anamnese(uuid, uuid, text, jsonb, integer) from public;
grant execute on function public.perfil_publico(uuid) to anon, authenticated;
grant execute on function public.enviar_anamnese(uuid, uuid, text, jsonb, integer) to anon, authenticated;
