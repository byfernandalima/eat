/* ëat · painel da nutricionista (login + anamneses no Supabase) */
let supa = criaSupabase();
let sessao = null, perfil = null, lista = null, listaPacientes = null, modoAuth = 'entrar', recuperandoSenha = false, filtro = '';
// vindo da página inicial pelo botão "Criar conta" (painel.html#criar) já abre a aba de cadastro
if (location.hash === '#criar') { modoAuth = 'criar'; history.replaceState(null, '', location.pathname); }

const urlPainel = () => location.origin + location.pathname;
const urlQuestionario = () => new URL('anamnese.html', location.href.split('#')[0].split('?')[0]).toString();

function traduzErro(e) {
  const m = (e && (e.message || e.error_description || String(e))) || '';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Você ainda não confirmou seu e-mail. Abra o link que enviamos para a sua caixa de entrada.';
  if (/already registered|already exists/i.test(m)) return 'Já existe uma conta com esse e-mail. Tente entrar ou recuperar a senha.';
  if (/Password should be at least|weak password/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/valid email|invalid.*email/i.test(m)) return 'Esse e-mail não parece válido.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Confira sua internet.';
  if (/same.*password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da antiga.';
  return 'Algo deu errado: ' + m;
}

/* ============ topo ============ */
function topoPainel() {
  const t = $('#topo');
  const linha = h('div', { class: 'topo-in' }, h('a', { class: 'logo', href: '#', style: 'color:inherit;text-decoration:none' }, 'ëat', h('small', null, 'painel da nutri')));
  if (sessao) linha.append(h('div', { class: 'usuario' },
    h('span', { class: 'nome' }, perfil?.nome || sessao.user.email),
    h('a', { class: 'btn sec', href: '#agenda' }, 'Agenda'),
    h('a', { class: 'btn sec', href: '#financeiro' }, 'Financeiro'),
    h('a', { class: 'btn sec', href: '#biblioteca' }, 'Biblioteca'),
    h('a', { class: 'btn sec', href: '#perfil' }, 'Perfil'),
    h('button', { class: 'btn sec', type: 'button', onclick: sair }, 'Sair')));
  t.replaceChildren(linha);
}

/* ============ roteamento ============ */
function render() {
  topoPainel();
  const palco = $('#palco'); palco.replaceChildren();
  if (!supa) return telaSemConfig(palco);
  if (recuperandoSenha) return telaNovaSenha(palco);
  if (!sessao) return telaAuth(palco);
  const [rota, id] = location.hash.replace(/^#/, '').split('/');
  if (rota === 'p' && id) return telaDetalhe(palco, id);
  if (rota === 'pac' && id === 'nova') return telaNovaPaciente(palco);
  if (rota === 'pac' && id) return telaFicha(palco, id, location.hash.split('/')[2]);
  if (rota === 'perfil') return telaPerfil(palco);
  if (rota === 'agenda') return telaAgenda(palco);
  if (rota === 'financeiro') return telaFinanceiro(palco);
  if (rota === 'biblioteca') { if (SECOES_BIB.some(s => s[0] === id)) secaoBib = id; return telaBiblioteca(palco); }
  return telaLista(palco);
}

function telaSemConfig(palco) {
  palco.append(h('section', { class: 'painel auth' },
    h('h1', null, 'Falta conectar o banco'),
    h('p', { class: 'serif', style: 'font-family:var(--serif);font-style:italic;font-size:22px' }, 'quase lá.'),
    h('div', { class: 'bloco' },
      h('p', null, 'O painel precisa do Supabase para guardar as contas e as anamneses.'),
      h('ol', { style: 'line-height:1.6;padding-left:20px' },
        h('li', null, 'Crie o projeto no supabase.com'),
        h('li', null, 'Rode o arquivo supabase/schema.sql no SQL Editor'),
        h('li', null, 'Cole a Project URL e a chave anon em js/config.js')),
      h('p', { class: 'nota' }, 'O passo a passo completo está no arquivo LEIA-ME.md.'))));
}

/* ============ login / cadastro / esqueci a senha ============ */
function telaAuth(palco) {
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const erro = (t) => { msg.className = 'form-msg erro'; msg.textContent = t; };
  const ok = (t) => { msg.className = 'form-msg ok'; msg.textContent = t; };
  const campoF = (rot, attrs) => [h('label', null, rot), h('input', { class: 'campo', ...attrs })];
  const iEmail = h('input', { class: 'campo', type: 'email', autocomplete: 'email', required: true, placeholder: 'voce@email.com' });
  const iSenha = h('input', { class: 'campo', type: 'password', autocomplete: modoAuth === 'criar' ? 'new-password' : 'current-password', required: true, minlength: 6, placeholder: modoAuth === 'criar' ? 'Mínimo 6 caracteres' : '' });
  const iNome = h('input', { class: 'campo', autocomplete: 'name', required: true, placeholder: 'Ex.: Carla Mendes' });
  const iWa = h('input', { class: 'campo', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(11) 99999-9999' });
  const botao = h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:18px' },
    modoAuth === 'entrar' ? 'Entrar' : modoAuth === 'criar' ? 'Criar minha conta' : 'Enviar link de recuperação');

  const form = h('form', { novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault(); msg.textContent = '';
    const email = iEmail.value.trim(), senha = iSenha.value;
    if (!email) return erro('Informe seu e-mail.');
    if (modoAuth !== 'esqueci' && senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.');
    if (modoAuth === 'criar' && !iNome.value.trim()) return erro('Informe seu nome.');
    botao.disabled = true; const rot = botao.textContent; botao.textContent = 'Só um instante…';
    try {
      if (modoAuth === 'entrar') {
        const { error } = await supa.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else if (modoAuth === 'criar') {
        let wa = iWa.value.replace(/\D/g, ''); if (wa && wa.length <= 11) wa = '55' + wa;
        const { data, error } = await supa.auth.signUp({ email, password: senha,
          options: { data: { nome: iNome.value.trim(), whatsapp: wa }, emailRedirectTo: urlPainel() } });
        if (error) throw error;
        if (!data.session) ok(`Conta criada! Enviamos um link de confirmação para ${email}. Abra o e-mail, confirme e depois entre aqui.`);
      } else {
        const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: urlPainel() });
        if (error) throw error;
        ok(`Se existir uma conta com ${email}, você vai receber um link para criar uma nova senha.`);
      }
    } catch (e) { erro(traduzErro(e)); }
    finally { botao.disabled = false; botao.textContent = rot; }
  } },
    modoAuth === 'criar' ? [h('label', null, 'Seu nome'), iNome] : null,
    h('label', null, 'E-mail'), iEmail,
    modoAuth !== 'esqueci' ? [h('label', null, 'Senha'), iSenha] : null,
    modoAuth === 'criar' ? [h('label', null, 'WhatsApp (opcional)'), iWa, h('p', { class: 'nota', style: 'margin-top:6px' }, 'Aparece para a paciente, caso ela queira falar com você.')] : null,
    botao, msg,
    modoAuth === 'entrar' ? h('div', { style: 'text-align:center;margin-top:10px' }, h('button', { class: 'link', type: 'button', onclick: () => { modoAuth = 'esqueci'; render(); } }, 'esqueci minha senha')) : null,
    modoAuth === 'esqueci' ? h('div', { style: 'text-align:center;margin-top:10px' }, h('button', { class: 'link', type: 'button', onclick: () => { modoAuth = 'entrar'; render(); } }, 'voltar para o login')) : null);

  const aba = (m, rot) => h('button', { type: 'button', class: modoAuth === m || (m === 'entrar' && modoAuth === 'esqueci') ? 'on' : '', onclick: () => { modoAuth = m; render(); } }, rot);
  palco.append(h('section', { class: 'auth painel' },
    h('section', { class: 'hero' },
      h('div', { class: 'ee', 'aria-hidden': 'true' }, h('i', { class: 'olho a' }), h('i', { class: 'olho b' }), h('span', { class: 'letra' }, 'e')),
      h('h1', null, modoAuth === 'criar' ? 'Bora começar.' : modoAuth === 'esqueci' ? 'Nova senha.' : 'Oi, nutri.'),
      h('p', { class: 'serif' }, modoAuth === 'esqueci' ? 'acontece com todo mundo.' : 'pergunta boa > resposta pronta.')),
    modoAuth !== 'esqueci' ? h('div', { class: 'abas', role: 'tablist' }, aba('entrar', 'Entrar'), aba('criar', 'Criar conta')) : null,
    h('div', { class: 'bloco' }, form)));
  setTimeout(() => (modoAuth === 'criar' ? iNome : iEmail).focus(), 50);
}

function telaNovaSenha(palco) {
  const i1 = h('input', { class: 'campo', type: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 6 caracteres' });
  const i2 = h('input', { class: 'campo', type: 'password', autocomplete: 'new-password' });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const botao = h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:18px' }, 'Salvar nova senha');
  palco.append(h('section', { class: 'auth painel' },
    h('h1', null, 'Crie sua nova senha'),
    h('div', { class: 'bloco' }, h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      if (i1.value.length < 6) { msg.className = 'form-msg erro'; msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
      if (i1.value !== i2.value) { msg.className = 'form-msg erro'; msg.textContent = 'As duas senhas não são iguais.'; return; }
      botao.disabled = true;
      const { error } = await supa.auth.updateUser({ password: i1.value });
      botao.disabled = false;
      if (error) { msg.className = 'form-msg erro'; msg.textContent = traduzErro(error); return; }
      recuperandoSenha = false; history.replaceState(null, '', urlPainel()); render();
    } }, h('label', null, 'Nova senha'), i1, h('label', null, 'Repita a nova senha'), i2, botao, msg))));
}

async function sair() { await supa.auth.signOut(); lista = null; listaPacientes = null; perfil = null; F = null; location.hash = ''; }

/* ============ dados ============ */
async function carregaPerfil() {
  const { data } = await supa.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle();
  perfil = data || { nome: sessao.user.user_metadata?.nome || '', whatsapp: '' };
}
async function carregaLista() {
  const { data, error } = await supa.from('anamneses')
    .select('id, paciente_nome, criado_em, atualizado_em, vista, origem, motivos:respostas->motivos')
    .order('criado_em', { ascending: false });
  if (error) throw error;
  lista = data || [];
}

/* ============ lista ============ */
function blocoLink() {
  const iNome = h('input', { class: 'campo', placeholder: 'Nome da paciente (opcional)' });
  const caixa = h('div', { class: 'linkbox' });
  const montar = () => {
    const u = new URL(urlQuestionario()); u.searchParams.set('n', sessao.user.id);
    if (iNome.value.trim()) u.searchParams.set('nome', iNome.value.trim());
    return u.toString();
  };
  const atualiza = () => { caixa.textContent = montar(); };
  iNome.addEventListener('input', atualiza); atualiza();
  const copiar = h('button', { class: 'btn esc', type: 'button', onclick: async () => {
    const url = montar();
    try { await navigator.clipboard.writeText(url); copiar.textContent = 'Copiado ✓'; setTimeout(() => copiar.textContent = 'Copiar link', 2000); }
    catch (_) { prompt('Copie o link:', url); }
  } }, 'Copiar link');
  return h('div', { class: 'bloco' },
    h('h2', null, 'Link para suas pacientes'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'As respostas de quem abrir este link caem direto aqui no seu painel. Colocar o nome é opcional: a tela de boas-vindas já cumprimenta a paciente.'),
    iNome, caixa,
    h('div', { class: 'linha-btn' }, copiar,
      h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: '#', onclick: (e) => { e.currentTarget.href = montar(); } }, 'Abrir questionário'),
      h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: '#', onclick: (e) => {
        e.currentTarget.href = 'https://wa.me/?text=' + encodeURIComponent(`Oi${iNome.value.trim() ? ', ' + primeiro(iNome.value) : ''}! Antes da nossa consulta, responde esse questionário rapidinho? Leva uns 10 minutos 💛\n${montar()}`);
      } }, 'Mandar no WhatsApp')));
}

async function carregaPacientes() {
  const { data, error } = await supa.from('pacientes')
    .select('id, nome, nascimento, criado_em, atualizado_em, anamneses(id, vista, criado_em)')
    .order('nome', { ascending: true });
  if (error) throw error;
  listaPacientes = (data || []).map(p => ({ ...p, novas: (p.anamneses || []).filter(a => !a.vista).length,
    ultimaAnamnese: (p.anamneses || []).map(a => a.criado_em).sort().pop() || null }));
}
async function telaLista(palco) {
  const wrap = h('div', { class: 'painel' });
  wrap.append(h('h1', null, `Oi, ${primeiro(perfil?.nome) || 'nutri'}.`),
    h('p', { style: 'font-family:var(--serif);font-style:italic;font-size:22px;margin:0' }, 'tudo o que a gente consome vira a gente.'),
    blocoLink());
  const bloco = h('div', { class: 'bloco' });
  const cab = h('div', { class: 'cabeca-lista' }, h('h2', null, 'Pacientes'),
    h('a', { class: 'btn pri', href: '#pac/nova', style: 'margin-left:auto;padding:8px 12px;font-size:14px' }, '+ Nova paciente'),
    h('button', { class: 'btn sec', type: 'button', style: 'margin-left:0', onclick: async () => { listaPacientes = null; render(); } }, 'Atualizar'));
  const busca = h('input', { class: 'campo busca', type: 'search', placeholder: 'Buscar paciente pelo nome', value: filtro });
  const itens = h('div', null, h('p', { class: 'carregando' }, 'carregando…'));
  bloco.append(cab, busca, itens);
  wrap.append(bloco, blocoImportar());
  palco.append(wrap);
  const semAcento = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const desenha = () => {
    const termo = semAcento(filtro.trim());
    const ordem = listaPacientes.slice().sort((a, b) => (b.novas > 0) - (a.novas > 0) || semAcento(a.nome).localeCompare(semAcento(b.nome)));
    const vis = ordem.filter(p => !termo || semAcento(p.nome).includes(termo));
    itens.replaceChildren();
    if (!listaPacientes.length) return itens.append(h('p', { class: 'vazio' }, 'Nenhuma paciente ainda. Mande o link acima ou crie uma ficha em "+ Nova paciente".'));
    if (!vis.length) return itens.append(h('p', { class: 'vazio' }, 'Ninguém com esse nome.'));
    vis.forEach(p => {
      const i = idade(p.nascimento);
      itens.append(h('a', { class: 'pac', href: `#pac/${p.id}/resumo`, style: 'color:inherit;text-decoration:none' },
        h('span', { class: 'av' }, (primeiro(p.nome) || '?')[0].toUpperCase()),
        h('span', { class: 'info' },
          h('b', null, p.nome || 'Sem nome', p.novas ? h('span', { class: 'selo-nova' }, p.novas > 1 ? `${p.novas} anamneses novas` : 'anamnese nova') : null),
          h('span', null, [i != null ? `${i} anos` : null, p.ultimaAnamnese ? `anamnese em ${new Date(p.ultimaAnamnese).toLocaleDateString('pt-BR')}` : 'sem anamnese'].filter(Boolean).join(' · '))),
        h('span', { 'aria-hidden': 'true' }, '→')));
    });
  };
  busca.addEventListener('input', () => { filtro = busca.value; if (listaPacientes) desenha(); });
  try { if (!listaPacientes) await carregaPacientes(); desenha(); }
  catch (e) { itens.replaceChildren(h('p', { class: 'form-msg erro' }, traduzErro(e))); }
}

function blocoImportar() {
  const ta = h('textarea', { class: 'campo', placeholder: 'Cole aqui a mensagem do WhatsApp ou o código do PDF (começa com EAT…)' });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  return h('details', { class: 'bloco' },
    h('summary', { style: 'cursor:pointer;font-family:var(--titulo);font-weight:800;font-size:18px' }, 'Importar anamnese recebida por WhatsApp ou PDF'),
    h('p', { class: 'nota' }, 'Para respostas que chegaram fora do link, como um PDF ou uma mensagem com código.'),
    ta,
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
      msg.textContent = '';
      let reg;
      try { reg = await decodifica(ta.value); } catch (_) { msg.className = 'form-msg erro'; msg.textContent = 'Não encontrei um código válido. Confira se copiou o trecho inteiro que começa com EAT.'; return; }
      const id = novoUUID(), resp = reg.respostas || {};
      const email = (resp.email || '').trim().toLowerCase();
      let pac = null;
      if (email) pac = (await supa.from('pacientes').select('id').eq('email', email).limit(1)).data?.[0];
      if (!pac && (resp.nome || '').trim()) pac = (await supa.from('pacientes').select('id').ilike('nome', resp.nome.trim()).limit(1)).data?.[0];
      if (!pac) {
        const novo = await supa.from('pacientes').insert({ nutri_id: sessao.user.id, nome: (resp.nome || 'Sem nome').slice(0, 200), email, telefone: resp.telefone || '', nascimento: resp.nascimento || null }).select('id').single();
        if (novo.error) { msg.className = 'form-msg erro'; msg.textContent = traduzErro(novo.error); return; }
        pac = novo.data;
      }
      const { error } = await supa.from('anamneses').insert({
        id, nutri_id: sessao.user.id, paciente_id: pac.id, paciente_nome: (resp.nome || '').slice(0, 200), respostas: resp,
        pontos: reg.pts || 0, origem: 'importada', criado_em: reg.enviadoEm || new Date().toISOString()
      });
      if (error) { msg.className = 'form-msg erro'; msg.textContent = traduzErro(error); return; }
      lista = null; listaPacientes = null; F = null; location.hash = '#p/' + id;
    } }, 'Importar')), msg);
}

/* ============ detalhe ============ */
async function telaDetalhe(palco, id) {
  const wrap = h('div', { class: 'painel' }, h('p', { class: 'carregando' }, 'abrindo anamnese…'));
  palco.append(wrap);
  const { data: r, error } = await supa.from('anamneses').select('*').eq('id', id).maybeSingle();
  wrap.replaceChildren();
  if (error || !r) {
    wrap.append(h('p', { class: 'form-msg erro' }, error ? traduzErro(error) : 'Anamnese não encontrada.'), h('a', { href: '#', class: 'link' }, '← voltar'));
    return;
  }
  if (!r.vista) { supa.from('anamneses').update({ vista: true }).eq('id', id).then(() => { listaPacientes = null; if (F) { const x = F.anamneses.find(i => i.id === id); if (x) x.vista = true; } }); }
  const a = r.respostas || {};
  const i = idade(a.nascimento), im = imc(a);
  const al = alertas(a);
  const reg = { id: r.id, enviadoEm: r.criado_em, respostas: a, pts: r.pontos };
  wrap.append(
    h('div', { class: 'nao-imprime', style: 'margin-top:6px;display:flex;gap:14px;flex-wrap:wrap' },
      h('a', { href: r.paciente_id ? `#pac/${r.paciente_id}/anamnese` : '#', class: 'link' }, r.paciente_id ? '← ficha da paciente' : '← pacientes'),
      r.paciente_id ? h('a', { href: `#pac/${r.paciente_id}/resumo`, class: 'link' }, 'abrir ficha') : null),
    h('h1', null, a.nome || r.paciente_nome || 'Paciente'),
    h('p', { class: 'nota', style: 'margin:0' }, `Respondida em ${new Date(r.criado_em).toLocaleString('pt-BR')}` +
      (new Date(r.atualizado_em) - new Date(r.criado_em) > 60000 ? ` · atualizada em ${new Date(r.atualizado_em).toLocaleString('pt-BR')}` : '') +
      (r.origem === 'importada' ? ' · importada' : '')),
    h('div', { class: 'resumo' },
      h('div', null, h('small', null, 'Idade'), h('b', null, i != null ? `${i} anos` : '—')),
      h('div', null, h('small', null, 'Peso / altura'), h('b', null, a.peso ? `${String(a.peso).replace('.', ',')} kg` : '—'),
        h('div', { class: 'nota', style: 'margin:0' }, [a.altura ? `${a.altura} cm` : '', a.pesoUsual ? `usual ${String(a.pesoUsual).replace('.', ',')} kg` : ''].filter(Boolean).join(' · '))),
      h('div', null, h('small', null, 'IMC'), h('b', null, im ? im.toFixed(1).replace('.', ',') : '—'), h('div', { class: 'nota', style: 'margin:0' }, im ? classeImc(im) : '')),
      h('div', null, h('small', null, 'Contato'), h('div', { style: 'font-weight:600;font-size:14px;word-break:break-all' }, a.telefone || '—'), h('div', { class: 'nota', style: 'margin:0;word-break:break-all' }, a.email || ''))),
    al.length ? h('div', { class: 'bloco' }, h('h2', null, 'Pontos de atenção'), h('ul', { class: 'alertas' }, al.map(x => h('li', null, x)))) : null);
  const resp = h('div', { class: 'bloco secao-resp' }, h('h2', null, 'Respostas completas'));
  ETAPAS.forEach(e => {
    const itens = e.perguntas.filter(p => (!p.se || p.se(a)));
    if (!itens.length) return;
    resp.append(h('h3', null, e.titulo.replace('.', '')), h('dl', null, itens.map(p => [h('dt', null, tituloP(p)), h('dd', null, formata(p, a[p.id]) || '—')])));
  });
  const fone = (a.telefone || '').replace(/\D/g, '');
  wrap.append(resp, h('div', { class: 'linha-btn nao-imprime' },
    h('button', { class: 'btn esc', type: 'button', onclick: (ev) => gerarPDF(reg, ev.currentTarget, abreJanelaPDF()) }, 'Visualizar PDF'),
    h('button', { class: 'btn sec', type: 'button', onclick: (ev) => gerarPDF(reg, ev.currentTarget) }, 'Baixar PDF'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => print() }, 'Imprimir'),
    fone ? h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone.length <= 11 ? '55' + fone : fone}` }, 'WhatsApp da paciente') : null,
    h('button', { class: 'btn sec', type: 'button', onclick: async () => {
      if (!confirm(`Excluir a anamnese de ${a.nome || 'esta paciente'}? Ela será apagada do banco e não dá pra desfazer.`)) return;
      const { error: err } = await supa.from('anamneses').delete().eq('id', id);
      if (err) return alert(traduzErro(err));
      lista = null; listaPacientes = null; F = null; location.hash = r.paciente_id ? `#pac/${r.paciente_id}/anamnese` : '';
    } }, 'Excluir')));
  window.scrollTo(0, 0);
}

/* ============ perfil ============ */
function telaPerfil(palco) {
  const iNome = h('input', { class: 'campo', value: perfil?.nome || '', autocomplete: 'name' });
  const iWa = h('input', { class: 'campo', type: 'tel', value: perfil?.whatsapp || '', placeholder: '5511999999999' });
  const iCrn = h('input', { class: 'campo', value: perfil?.crn || '', placeholder: 'Ex.: CRN-3 12345' });
  const iMeet = h('input', { class: 'campo', type: 'url', value: perfil?.meet_link || '', placeholder: 'https://meet.google.com/abc-defg-hij' });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const assinatura = campoAssinatura();
  const timbrado = campoPapelTimbrado();
  palco.append(h('div', { class: 'painel auth' },
    h('div', { style: 'margin-top:6px' }, h('a', { href: '#', class: 'link' }, '← voltar')),
    h('h1', null, 'Seu perfil'),
    h('div', { class: 'bloco' }, h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      let wa = iWa.value.replace(/\D/g, ''); if (wa && wa.length <= 11) wa = '55' + wa;
      const meet = iMeet.value.trim();
      if (meet && !/^https?:\/\//i.test(meet)) { msg.className = 'form-msg erro'; msg.textContent = 'O link do Google Meet precisa começar com https://'; return; }
      const { error } = await supa.from('perfis').update({ nome: iNome.value.trim().slice(0, 120), whatsapp: wa, crn: iCrn.value.trim().slice(0, 40), meet_link: meet.slice(0, 200) }).eq('id', sessao.user.id);
      if (error) { msg.className = 'form-msg erro'; msg.textContent = traduzErro(error); return; }
      try { await timbrado.salvar(); await assinatura.salvar(); } catch (e) { msg.className = 'form-msg erro'; msg.textContent = 'Perfil salvo em parte: ' + traduzErro(e); return; }
      Object.assign(perfil, { nome: iNome.value.trim(), whatsapp: wa, crn: iCrn.value.trim(), meet_link: meet }); iWa.value = wa;
      msg.className = 'form-msg ok'; msg.textContent = 'Perfil salvo.'; topoPainel();
    } },
      h('label', null, 'Nome (aparece para as pacientes)'), iNome,
      h('label', null, 'WhatsApp (com DDD)'), iWa,
      h('label', null, 'CRN (sai no pedido de exames)'), iCrn,
      h('label', null, 'Link fixo do Google Meet (teleconsultas)'), iMeet,
      h('p', { class: 'nota', style: 'margin:6px 0 0' }, 'No Google Meet, clique em "Nova reunião" → "Criar uma reunião para depois" e cole o link aqui. Ele vale para todas as consultas online. ',
        h('a', { class: 'link', href: 'https://meet.google.com/', target: '_blank', rel: 'noopener' }, 'abrir o Google Meet ↗')),
      timbrado.el,
      assinatura.el,
      h('p', { class: 'nota' }, `E-mail da conta: ${sessao.user.email}`),
      h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:10px' }, 'Salvar'), msg)),
    h('div', { class: 'bloco' }, h('h2', null, 'Senha'),
      h('p', { class: 'nota', style: 'margin-top:0' }, 'Enviamos um link para o seu e-mail para você criar uma nova senha.'),
      h('button', { class: 'btn sec', type: 'button', onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        const { error } = await supa.auth.resetPasswordForEmail(sessao.user.email, { redirectTo: urlPainel() });
        b.disabled = false; b.textContent = error ? traduzErro(error) : 'Link enviado ✓';
      } }, 'Trocar minha senha'))));
}

/* ============ início ============ */
async function iniciar() {
  if (!supa) return render();
  supa.auth.onAuthStateChange((evento, s) => {
    if (evento === 'PASSWORD_RECOVERY') recuperandoSenha = true;
    const trocouUsuario = (s?.user?.id || null) !== (sessao?.user?.id || null);
    sessao = s;
    if (trocouUsuario) { lista = null; listaPacientes = null; perfil = null; F = null; }
    // não chamar o Supabase direto aqui dentro (recomendação da biblioteca)
    setTimeout(async () => { if (sessao && !perfil) { await carregaPerfil(); } render(); }, 0);
  });
  const { data } = await supa.auth.getSession();
  sessao = data.session;
  if (sessao) await carregaPerfil();
  render();
}
window.addEventListener('hashchange', () => { if (supa) { limpaGraficos(); render(); } });
iniciar();
