-- ëat · fase 6: área da paciente (login próprio, por convite da nutri)
-- Rode depois do fase5.sql: Supabase → SQL Editor → New query → colar → Run. Pode rodar mais de uma vez.
--
-- Como fica protegido:
--  • A paciente só ganha acesso pelo link de convite que a nutri gera na ficha (token secreto, uso único).
--  • Ela lê tudo por funções que devolvem SÓ o que é dela: consultas (sem valor nem observação interna),
--    anamneses e os registros que a nutri marcou para mostrar. Nenhuma tabela é aberta para ela.
--  • Conta de paciente não vira conta de nutri (não ganha perfil).

-- ---------- ligação paciente ↔ conta ----------
alter table public.pacientes add column if not exists usuario_id uuid references auth.users (id) on delete set null;
alter table public.pacientes add column if not exists convite_token uuid;
alter table public.pacientes add column if not exists convite_em timestamptz;
alter table public.pacientes add column if not exists acesso_desde timestamptz;
create index if not exists pacientes_usuario on public.pacientes (usuario_id);

-- a nutri pode gerar convite e remover acesso, mas não pode ligar a ficha a uma conta qualquer:
-- só a função aceitar_convite liga (com o token certo)
create or replace function public.protege_usuario_paciente()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is not null and new.usuario_id is distinct from old.usuario_id
     and coalesce(current_setting('eat.aceite', true), '') <> '1' then
    raise exception 'usuario_so_por_convite';
  end if;
  return new;
end $$;
drop trigger if exists protege_usuario_paciente on public.pacientes;
create trigger protege_usuario_paciente before update on public.pacientes
  for each row execute function public.protege_usuario_paciente();

-- ---------- o que a nutri libera ----------
alter table public.registros add column if not exists compartilhado boolean not null default false;
alter table public.registros add column if not exists compartilhado_em timestamptz;
alter table public.registros add column if not exists pdf_paciente text;   -- PDF gerado para a área da paciente (plano, prescrição, documento)

-- ---------- conta de paciente não ganha perfil de nutri ----------
create or replace function public.novo_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'papel', '') = 'paciente' then
    return new;
  end if;
  insert into public.perfis (id, nome, whatsapp)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
          left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'whatsapp', ''), '\D', '', 'g'), 20))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- convite ----------
-- quem abre o link vê só o primeiro nome e a nutri (para saber que é o convite certo)
create or replace function public.convite_info(p_paciente uuid, p_token uuid)
returns table (paciente text, nutri text, email text, ja_tem_acesso boolean)
language sql stable security definer set search_path = public as $$
  select split_part(trim(pa.nome), ' ', 1), pe.nome, pa.email, pa.usuario_id is not null
  from public.pacientes pa join public.perfis pe on pe.id = pa.nutri_id
  where pa.id = p_paciente and pa.convite_token = p_token
    and pa.convite_em > now() - interval '30 days';
$$;
revoke all on function public.convite_info(uuid, uuid) from public;
grant execute on function public.convite_info(uuid, uuid) to anon, authenticated;

create or replace function public.aceitar_convite(p_paciente uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  perform set_config('eat.aceite', '1', true);
  update public.pacientes
     set usuario_id = auth.uid(), convite_token = null, acesso_desde = now()
   where id = p_paciente and convite_token = p_token
     and convite_em > now() - interval '30 days'
     and (usuario_id is null or usuario_id = auth.uid());
  return found;
end $$;
revoke all on function public.aceitar_convite(uuid, uuid) from public;
grant execute on function public.aceitar_convite(uuid, uuid) to authenticated;

-- ---------- tudo da área da paciente numa chamada ----------
create or replace function public.area_paciente()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'paciente', jsonb_build_object('id', pa.id, 'nome', pa.nome, 'nascimento', pa.nascimento, 'sexo', pa.sexo),
    'nutri', jsonb_build_object('nome', pe.nome, 'whatsapp', pe.whatsapp, 'crn', pe.crn, 'endereco', pe.endereco, 'meet_link', pe.meet_link),
    'consultas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'token', a.token, 'tipo', a.tipo, 'inicio', a.inicio, 'fim', a.fim, 'status', a.status,
                                          'modalidade', a.modalidade, 'sala', coalesce(nullif(a.sala, ''), case when a.modalidade = 'online' then pe.meet_link else '' end))
                       order by a.inicio)
      from public.agenda a
      where a.paciente_id = pa.id and a.categoria = 'consulta' and a.status <> 'cancelada'), '[]'::jsonb),
    'anamneses', coalesce((
      select jsonb_agg(jsonb_build_object('id', an.id, 'criado_em', an.criado_em, 'pontos', an.pontos, 'respostas', an.respostas) order by an.criado_em desc)
      from public.anamneses an where an.paciente_id = pa.id), '[]'::jsonb),
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'tipo', r.tipo, 'data', r.data, 'criado_em', r.criado_em,
                                          'compartilhado_em', r.compartilhado_em, 'pdf', r.pdf_paciente,
                                          'dados', case when r.tipo in ('antropometria', 'exame', 'orientacao') then r.dados else
                                                     jsonb_build_object('titulo', r.dados -> 'titulo') end)
                       order by r.data, r.criado_em)
      from public.registros r where r.paciente_id = pa.id and r.compartilhado), '[]'::jsonb)
  ) order by pa.criado_em), '[]'::jsonb)
  from public.pacientes pa join public.perfis pe on pe.id = pa.nutri_id
  where auth.uid() is not null and pa.usuario_id = auth.uid();
$$;
revoke all on function public.area_paciente() from public;
grant execute on function public.area_paciente() to authenticated;

-- ---------- PDFs liberados: a paciente pode abrir só os dela ----------
create or replace function public.paciente_pode_ler(p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.registros r join public.pacientes pa on pa.id = r.paciente_id
    where r.pdf_paciente = p_nome and r.compartilhado and pa.usuario_id = auth.uid());
$$;
revoke all on function public.paciente_pode_ler(text) from public;
grant execute on function public.paciente_pode_ler(text) to authenticated;

drop policy if exists "arquivos: paciente lê os liberados" on storage.objects;
create policy "arquivos: paciente lê os liberados" on storage.objects
  for select to authenticated using (bucket_id = 'arquivos' and public.paciente_pode_ler(name));
