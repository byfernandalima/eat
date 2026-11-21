/* ëat · área da paciente: entrar, aceitar o convite da nutri e acompanhar
   consultas, anamneses, avaliações e planos (só o que a nutri liberou). */
const supa = criaSupabase();
const CHAVE_CONVITE = 'eat_convite';
let geracao = 0, carregando = null, conviteInvalido = false;
let sessao = null, area = null, fichaSel = 0, aba = 'inicio', modo = 'entrar', recuperando = false, convite = null, aviso = null;

const urlArea = () => location.origin + location.pathname;
const lerConvite = () => {
  const q = new URLSearchParams(location.search).get('convite') || store.get(CHAVE_CONVITE, '');
  const [id, token] = String(q || '').split('.');
  return ehUUID(id) && ehUUID(token) ? { id, token } : null;
};
function traduzErro(e) {
  const m = (e && (e.message || e.error_description || String(e))) || '';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Você ainda não confirmou seu e-mail. Abra o link que enviamos para a sua caixa de entrada.';
  if (/already registered|already exists/i.test(m)) return 'Esse e-mail já tem conta. Toque em "já tenho conta" e entre com sua senha.';
  if (/Password should be at least|weak password/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/valid email|invalid.*email/i.test(m)) return 'Esse e-mail não parece válido.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Confira sua internet.';
  if (/same.*password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da antiga.';
  return 'Algo deu errado: ' + m;
}
const msgBox = () => h('p', { class: 'form-msg', role: 'status' });
const diz = (el, tipo, t) => { el.className = 'form-msg ' + tipo; el.textContent = t; };
const mascote = () => h('div', { class: 'ee grande', 'aria-hidden': 'true' }, h('i', { class: 'olho a' }), h('i', { class: 'olho b' }), h('span', { class: 'letra' }, 'e'));
const dataLonga = (d) => new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/* ============ topo ============ */
function topo() {
  const t = $('#topo');
  t.replaceChildren(h('div', { class: 'topo-in' },
    h('div', { class: 'logo' }, 'ëat', h('small', null, 'minha área')),
    sessao ? h('button', { class: 'btn sec topo-sair', type: 'button', onclick: sair }, 'Sair') : null));
}

/* ============ roteamento ============ */
async function render() {
  const g = ++geracao; // só a renderização mais recente desenha (login chega em mais de um evento)
  topo();
  const palco = $('#palco'); palco.replaceChildren();
  if (!supa) return palco.append(h('p', { class: 'form-msg erro' }, 'O site ainda não está conectado ao banco.'));
  if (recuperando) return telaNovaSenha(palco);
  if (!sessao) return telaEntrar(palco, g);
  if (!area) {
    palco.append(h('p', { class: 'carregando' }, 'abrindo sua área…'));
    try { carregando = carregando || carregaArea().finally(() => { carregando = null; }); await carregando; }
    catch (e) { if (g === geracao) palco.replaceChildren(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
    if (g === geracao) render();
    return;
  }
  if (!area.length) return telaSemFicha(palco);
  telaArea(palco);
}

async function carregaArea() {
  convite = conviteInvalido ? null : lerConvite();
  if (convite) {
    const { data: ok, error } = await supa.rpc('aceitar_convite', { p_paciente: convite.id, p_token: convite.token });
    store.del(CHAVE_CONVITE);
    if (!error && ok) aviso = 'Pronto! Seu acesso foi ativado.';
    if (new URLSearchParams(location.search).has('convite')) history.replaceState(null, '', urlArea());
    convite = null;
  }
  const { data, error } = await supa.rpc('area_paciente');
  if (error) throw error;
  area = data || [];
  if (fichaSel >= area.length) fichaSel = 0;
}

/* ============ entrar / criar acesso pelo convite / esqueci ============ */
async function telaEntrar(palco, g) {
  convite = conviteInvalido ? null : lerConvite();
  let info = null;
  if (convite) {
    store.set(CHAVE_CONVITE, `${convite.id}.${convite.token}`);
    const { data } = await supa.rpc('convite_info', { p_paciente: convite.id, p_token: convite.token });
    if (g !== geracao) return;
    info = data?.[0] || null;
    if (!info) { store.del(CHAVE_CONVITE); convite = null; conviteInvalido = true; }
    else if (modo === 'entrar' && !info.ja_tem_acesso && !telaEntrar.escolheu) modo = 'criar';
  }
  const msg = msgBox();
  const iEmail = h('input', { class: 'campo', type: 'email', autocomplete: 'email', placeholder: 'voce@email.com', value: info?.email || '' });
  const iSenha = h('input', { class: 'campo', type: 'password', autocomplete: modo === 'criar' ? 'new-password' : 'current-password', placeholder: modo === 'criar' ? 'Mínimo 6 caracteres' : '' });
  const iSenha2 = h('input', { class: 'campo', type: 'password', autocomplete: 'new-password' });
  const botao = h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:18px' },
    modo === 'criar' ? 'Criar meu acesso' : modo === 'esqueci' ? 'Enviar link' : 'Entrar');
  const trocar = (m) => { modo = m; telaEntrar.escolheu = true; render(); };
  const form = h('form', { novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault(); msg.textContent = '';
    const email = iEmail.value.trim(), senha = iSenha.value;
    if (!email) return diz(msg, 'erro', 'Informe seu e-mail.');
    if (modo !== 'esqueci' && senha.length < 6) return diz(msg, 'erro', 'A senha precisa ter pelo menos 6 caracteres.');
    if (modo === 'criar' && senha !== iSenha2.value) return diz(msg, 'erro', 'As duas senhas não são iguais.');
    const rot = botao.textContent; botao.disabled = true; botao.textContent = 'Só um instante…';
    try {
      if (modo === 'entrar') {
        const { error } = await supa.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else if (modo === 'criar') {
        const volta = new URL(urlArea()); volta.searchParams.set('convite', `${convite.id}.${convite.token}`);
        const { data, error } = await supa.auth.signUp({ email, password: senha,
          options: { data: { papel: 'paciente', nome: info?.paciente || '' }, emailRedirectTo: volta.toString() } });
        if (error) throw error;
        if (data.user && !(data.user.identities || []).length) { modo = 'entrar'; telaEntrar.escolheu = true; render(); return; }
        if (!data.session) diz(msg, 'ok', `Quase lá! Enviamos um link para ${email}. Abra o e-mail e toque no link para ativar sua área.`);
      } else {
        const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: urlArea() });
        if (error) throw error;
        diz(msg, 'ok', `Se existir uma conta com ${email}, você vai receber um link para criar uma nova senha.`);
      }
    } catch (e) { diz(msg, 'erro', traduzErro(e)); }
    finally { botao.disabled = false; botao.textContent = rot; }
  } },
    h('label', null, 'E-mail'), iEmail,
    modo !== 'esqueci' ? [h('label', null, modo === 'criar' ? 'Crie uma senha' : 'Senha'), iSenha] : null,
    modo === 'criar' ? [h('label', null, 'Repita a senha'), iSenha2] : null,
    botao, msg,
    h('div', { class: 'links-auth' },
      modo === 'entrar' ? h('button', { class: 'link', type: 'button', onclick: () => trocar('esqueci') }, 'esqueci minha senha') : null,
      modo === 'criar' ? h('button', { class: 'link', type: 'button', onclick: () => trocar('entrar') }, 'já tenho conta, quero entrar') : null,
      modo === 'esqueci' || (modo === 'entrar' && info && !info.ja_tem_acesso) ? h('button', { class: 'link', type: 'button', onclick: () => trocar(modo === 'esqueci' ? 'entrar' : 'criar') }, modo === 'esqueci' ? 'voltar para o login' : 'ainda não tenho senha') : null));

  const titulo = modo === 'criar' ? `Oi, ${info?.paciente || 'tudo bem'}!` : modo === 'esqueci' ? 'Nova senha.' : 'Sua área.';
  const sub = modo === 'criar' ? `${info?.nutri || 'Sua nutri'} liberou sua área. Crie uma senha para acompanhar consultas, anamnese, avaliações e planos.`
    : modo === 'esqueci' ? 'acontece com todo mundo.' : 'consultas, anamnese e planos num lugar só.';
  palco.append(h('section', { class: 'auth painel' },
    h('section', { class: 'hero' }, mascote(), h('h1', null, titulo), h('p', { class: modo === 'criar' ? '' : 'serif' }, sub)),
    conviteInvalido ? h('p', { class: 'form-msg erro' }, 'Esse convite expirou ou já foi usado. Entre com sua senha ou peça um link novo para sua nutri.') : null,
    h('div', { class: 'bloco' }, form),
    modo === 'entrar' && !info ? h('p', { class: 'nota', style: 'text-align:center' }, 'Ainda não tem acesso? Peça para sua nutri liberar: ela te manda um link para criar a senha.') : null,
    h('p', { class: 'nota', style: 'text-align:center' }, h('a', { class: 'link', href: 'painel.html' }, 'Sou nutricionista'))));
  setTimeout(() => (iEmail.value ? iSenha : iEmail).focus(), 50);
}

function telaNovaSenha(palco) {
  const i1 = h('input', { class: 'campo', type: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 6 caracteres' });
  const i2 = h('input', { class: 'campo', type: 'password', autocomplete: 'new-password' });
  const msg = msgBox();
  palco.append(h('section', { class: 'auth painel' }, h('h1', null, 'Crie sua nova senha'),
    h('div', { class: 'bloco' }, h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      if (i1.value.length < 6) return diz(msg, 'erro', 'A senha precisa ter pelo menos 6 caracteres.');
      if (i1.value !== i2.value) return diz(msg, 'erro', 'As duas senhas não são iguais.');
      const { error } = await supa.auth.updateUser({ password: i1.value });
      if (error) return diz(msg, 'erro', traduzErro(error));
      recuperando = false; history.replaceState(null, '', urlArea()); render();
    } }, h('label', null, 'Nova senha'), i1, h('label', null, 'Repita a nova senha'), i2,
      h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:18px' }, 'Salvar nova senha'), msg))));
}

function telaSemFicha(palco) {
  palco.append(h('section', { class: 'auth painel' },
    h('section', { class: 'hero' }, mascote(), h('h1', null, 'Quase lá.'), h('p', { class: 'serif' }, 'sua conta ainda não está ligada a uma nutri.')),
    h('div', { class: 'bloco' },
      h('p', { style: 'margin-top:0' }, 'Peça para sua nutricionista liberar seu acesso. Ela te manda um link: abra esse link estando conectada a esta conta e pronto.'),
      h('p', { class: 'nota' }, `Conta: ${sessao.user.email}`),
      sessao.user.user_metadata?.papel !== 'paciente' ? h('a', { class: 'btn sec', href: 'painel.html' }, 'Sou nutricionista: ir para o painel') : null)));
}

/* ============ área ============ */
const ABAS = [['inicio', 'Início'], ['consultas', 'Consultas'], ['anamnese', 'Anamnese'], ['avaliacoes', 'Avaliações'], ['planos', 'Planos']];
function telaArea(palco) {
  const f = area[fichaSel];
  const conteudo = h('div', { class: 'aba-pac' });
  palco.append(h('div', { class: 'painel' },
    h('section', { class: 'hero', style: 'padding-top:6px' },
      h('h1', null, `Oi, ${primeiro(f.paciente.nome) || 'tudo bem'}.`),
      h('p', { class: 'serif' }, 'tudo o que a gente consome vira a gente.')),
    aviso ? h('p', { class: 'form-msg ok' }, aviso) : null,
    area.length > 1 ? h('div', { class: 'chips nutris' }, area.map((x, i) => h('button', { class: 'chip' + (i === fichaSel ? ' on' : ''), type: 'button', onclick: () => { fichaSel = i; render(); } }, x.nutri.nome || 'Nutri'))) : null,
    h('nav', { class: 'abas abas-pac', 'aria-label': 'Seções' }, ABAS.map(([k, rot]) => h('button', { type: 'button', class: k === aba ? 'on' : '', 'aria-current': k === aba ? 'page' : null, onclick: () => { aba = k; aviso = null; render(); } }, rot))),
    conteudo));
  ({ inicio: abaInicio, consultas: abaConsultas, anamnese: abaAnamnese, avaliacoes: abaAvaliacoes, planos: abaPlanos })[aba](conteudo, f);
  // no celular as abas rolam de lado: mantém a aba escolhida à vista
  { const nav = $('.abas-pac'), on = nav?.querySelector('.on'); if (on) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; }
}
const vazio = (t) => h('p', { class: 'vazio' }, t);
const doTipo = (f, ...tipos) => f.registros.filter(r => tipos.includes(r.tipo));

/* ---------- início ---------- */
function abaInicio(el, f) {
  const agora = Date.now();
  const prox = f.consultas.filter(c => new Date(c.fim) > agora && c.status !== 'faltou')[0];
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Próxima consulta'), prox ? cartaoConsulta(prox, true) : vazio('Nenhuma consulta marcada.')));
  const fone = (f.nutri.whatsapp || '').replace(/\D/g, '');
  el.append(h('div', { class: 'bloco nutri-card' },
    h('div', null, h('small', { class: 'kicker' }, 'sua nutri'), h('b', { class: 'nutri-nome' }, f.nutri.nome || 'Nutricionista'),
      f.nutri.crn ? h('div', { class: 'nota', style: 'margin:0' }, 'CRN ' + f.nutri.crn.replace(/^\s*crn[\s:-]*/i, '')) : null,
      f.nutri.endereco ? h('div', { class: 'nota', style: 'margin:4px 0 0' }, f.nutri.endereco) : null),
    fone ? h('a', { class: 'btn zap', href: `https://wa.me/${fone}`, target: '_blank', rel: 'noopener' }, 'Falar no WhatsApp') : null));
  const novidades = f.registros.slice().sort((a, b) => (b.compartilhado_em || b.criado_em).localeCompare(a.compartilhado_em || a.criado_em)).slice(0, 4);
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Novidades da sua nutri'),
    novidades.length ? novidades.map(r => h('button', { class: 'novidade', type: 'button', onclick: () => { aba = ['antropometria', 'exame'].includes(r.tipo) ? 'avaliacoes' : 'planos'; render(); } },
      h('span', { class: 'nov-ic', 'aria-hidden': 'true' }, ICONES[r.tipo] || '📄'),
      h('span', null, h('b', null, tituloRegistro(r)), h('small', null, `liberado em ${new Date(r.compartilhado_em || r.criado_em).toLocaleDateString('pt-BR')}`)),
      h('span', { 'aria-hidden': 'true' }, '→')))
    : vazio('Quando sua nutri liberar avaliações e planos, eles aparecem aqui.')));
}
const ICONES = { antropometria: '📏', exame: '🧪', plano: '🥗', suplementos: '💊', orientacao: '📝', documento: '📄' };
function tituloRegistro(r) {
  const t = r.dados?.titulo;
  return { antropometria: 'Avaliação física', exame: 'Resultados de exames', plano: t || 'Plano alimentar', suplementos: 'Prescrição de suplementos', orientacao: t || 'Orientação', documento: t || 'Documento' }[r.tipo] || 'Registro';
}

/* ---------- consultas ---------- */
const STATUS = { agendada: ['a confirmar', 'st-agendada'], confirmada: ['confirmada', 'st-confirmada'], realizada: ['realizada', 'st-realizada'], faltou: ['não compareceu', 'st-faltou'] };
function cartaoConsulta(c, destaque) {
  const futura = new Date(c.fim) > Date.now();
  const [rot, cls] = STATUS[c.status] || [c.status, ''];
  const msg = msgBox();
  const online = c.modalidade === 'online';
  return h('div', { class: 'consulta' + (destaque ? ' destaque' : '') },
    h('div', { class: 'cons-data' }, h('b', null, dataLonga(c.inicio)), h('span', null, `${hora(c.inicio)} às ${hora(c.fim)}`)),
    h('div', { class: 'cons-info' }, h('span', { class: 'selo-st ' + cls }, rot), h('span', null, [c.tipo, online ? 'online' : 'presencial'].filter(Boolean).join(' · '))),
    futura && (online && c.sala || c.status === 'agendada') ? h('div', { class: 'linha-btn' },
      online && c.sala ? h('a', { class: 'btn esc', href: c.sala, target: '_blank', rel: 'noopener' }, 'Entrar na sala (Google Meet)') : null,
      c.status === 'agendada' ? h('button', { class: 'btn pri', type: 'button', onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const { data, error } = await supa.rpc('confirmar_consulta', { p_id: c.id, p_token: c.token });
        if (error || !data) { diz(msg, 'erro', error ? traduzErro(error) : 'Não deu para confirmar. Fale com sua nutri.'); ev.currentTarget.disabled = false; return; }
        c.status = 'confirmada'; render();
      } }, 'Confirmar presença') : null) : null,
    msg);
}
function abaConsultas(el, f) {
  const agora = Date.now();
  const proximas = f.consultas.filter(c => new Date(c.fim) > agora);
  const anteriores = f.consultas.filter(c => new Date(c.fim) <= agora).reverse();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Próximas'), proximas.length ? proximas.map(c => cartaoConsulta(c)) : vazio('Nenhuma consulta marcada.')));
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Anteriores'), anteriores.length ? anteriores.map(c => cartaoConsulta(c)) : vazio('Nenhuma ainda.')));
}

/* ---------- anamnese ---------- */
function abaAnamnese(el, f) {
  if (!f.anamneses.length) { el.append(h('div', { class: 'bloco' }, vazio('Você ainda não respondeu a anamnese. Peça o link para sua nutri.'))); return; }
  f.anamneses.forEach(an => {
    const a = an.respostas || {};
    const corpo = h('div', { class: 'secao-resp', hidden: true });
    const ver = h('button', { class: 'btn sec', type: 'button', onclick: () => {
      if (!corpo.childNodes.length) ETAPAS.forEach(e => {
        const itens = e.perguntas.filter(p => !p.se || p.se(a));
        if (itens.length) corpo.append(h('h3', null, e.titulo.replace('.', '')), h('dl', null, itens.map(p => [h('dt', null, tituloP(p)), h('dd', null, formata(p, a[p.id]) || '—')])));
      });
      corpo.hidden = !corpo.hidden; ver.textContent = corpo.hidden ? 'Ver respostas' : 'Esconder respostas';
    } }, 'Ver respostas');
    const reg = { id: an.id, enviadoEm: an.criado_em, respostas: a, pts: an.pontos };
    el.append(h('div', { class: 'bloco' },
      h('h2', null, `Respondida em ${new Date(an.criado_em).toLocaleDateString('pt-BR')}`),
      h('p', { class: 'nota', style: 'margin-top:0' }, `${an.pontos || 0} pontos no questionário`),
      h('div', { class: 'linha-btn' }, ver, h('button', { class: 'btn esc', type: 'button', onclick: (ev) => gerarPDF(reg, ev.currentTarget, abreJanelaPDF()) }, 'Ver em PDF')),
      corpo));
  });
}

/* ---------- avaliações ---------- */
function abaAvaliacoes(el, f) {
  const ant = doTipo(f, 'antropometria'), ex = doTipo(f, 'exame');
  if (!ant.length && !ex.length) { el.append(h('div', { class: 'bloco' }, vazio('Sua nutri ainda não liberou avaliações. Elas aparecem aqui depois da consulta.'))); return; }
  const sexo = f.paciente.sexo || 'F', anos = idade(f.paciente.nascimento);
  if (ant.length) {
    const calc = ant.map(r => ({ r, c: calculaAntropometria(r.dados, sexo, anos) }));
    const ult = calc[calc.length - 1];
    const ind = (t, v, s) => h('div', { class: 'ind' }, h('small', null, t), h('b', null, v), h('span', null, s || ''));
    el.append(h('div', { class: 'bloco' }, h('h2', null, 'Avaliação física'),
      h('p', { class: 'nota', style: 'margin-top:0' }, `Última em ${dataBR(ult.r.data)}`),
      h('div', { class: 'indicadores' },
        ind('Peso', num(ult.r.dados.peso) != null ? `${fmtN(num(ult.r.dados.peso))} kg` : '—'),
        ind('IMC', ult.c.imc ? fmtN(ult.c.imc) : '—', ult.c.imcClasse),
        ult.c.gordura != null ? ind('% gordura', `${fmtN(ult.c.gordura)}%`) : null,
        num(ult.r.dados.circ?.cintura) != null ? ind('Cintura', `${fmtN(num(ult.r.dados.circ.cintura))} cm`) : null),
      calc.length > 1 ? graficoLinha('Peso (kg)', calc.map(({ r }) => ({ d: r.data, v: num(r.dados.peso) })).filter(p => p.v != null)) : null,
      calc.length > 1 ? (() => {
        const temG = calc.some(({ c }) => c.gordura != null), temC = calc.some(({ r }) => num(r.dados.circ?.cintura) != null);
        return h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
          h('thead', null, h('tr', null, ['Data', 'Peso', 'IMC', temG ? '% G' : null, temC ? 'Cintura' : null].filter(Boolean).map(t => h('th', null, t)))),
          h('tbody', null, calc.slice().reverse().map(({ r, c }) => h('tr', null, h('td', null, dataBR(r.data)), h('td', null, fmtN(num(r.dados.peso))), h('td', null, fmtN(c.imc)),
            temG ? h('td', null, c.gordura != null ? fmtN(c.gordura) : '—') : null, temC ? h('td', null, fmtN(num(r.dados.circ?.cintura))) : null)))));
      })() : null));
  }
  ex.slice().reverse().forEach(r => {
    const itens = Object.entries(r.dados.valores || {}).filter(([, v]) => num(v) != null);
    el.append(h('div', { class: 'bloco' }, h('h2', null, `Exames de ${dataBR(r.data)}`),
      r.dados.laboratorio ? h('p', { class: 'nota', style: 'margin-top:0' }, r.dados.laboratorio) : null,
      h('p', { class: 'nota', style: 'margin-top:0' }, 'Fora da referência não é diagnóstico: sua nutri explica o que significa para você.'),
      h('div', { class: 'lista-exames' }, itens.map(([k, v]) => {
        const e = exame(k), n = num(v), ref = referencia(k, sexo, r.dados.refs?.[k]), st = statusExame(n, ref);
        return h('div', { class: 'ex-linha' },
          h('span', { class: 'ex-nome' }, e ? e[1] : k, h('small', null, `ref. ${textoRef(ref, e ? e[2] : '')}`)),
          h('span', { class: 'ex-val st-' + st }, `${fmtN(n, n % 1 ? (n < 10 ? 2 : 1) : 0)} ${e ? e[2] : ''}`, st === 'alto' ? ' ↑' : st === 'baixo' ? ' ↓' : ''));
      }))));
  });
}
// gráfico simples em SVG (sem biblioteca)
function graficoLinha(titulo, pts) {
  if (pts.length < 2) return null;
  const W = 320, H = 120, P = 18;
  const vs = pts.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs), amp = max - min || 1;
  const x = (i) => P + i * (W - 2 * P) / (pts.length - 1), y = (v) => H - P - (v - min) / amp * (H - 2 * P);
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'graf-svg'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${titulo}: ` + pts.map(p => `${dataBR(p.d)} ${fmtN(p.v)}`).join('; '));
  const el = (n, a) => { const e = document.createElementNS(ns, n); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); svg.append(e); return e; };
  el('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' '), fill: 'none', stroke: '#360105', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
  pts.forEach((p, i) => {
    el('circle', { cx: x(i), cy: y(p.v), r: 4.5, fill: i === pts.length - 1 ? '#FF4416' : '#360105', stroke: '#F3F1E2', 'stroke-width': 2 });
    if (i === 0 || i === pts.length - 1) { const t = el('text', { x: x(i), y: y(p.v) - 9, 'text-anchor': i ? 'end' : 'start', 'font-size': 12, 'font-weight': 700, fill: '#360105' }); t.textContent = fmtN(p.v); }
  });
  return h('div', { class: 'graf' }, h('small', { class: 'kicker' }, titulo), svg);
}

/* ---------- planos, prescrições, orientações e documentos ---------- */
function abaPlanos(el, f) {
  const pdfs = doTipo(f, 'plano', 'suplementos', 'documento').filter(r => r.pdf).reverse();
  const ors = doTipo(f, 'orientacao').reverse();
  if (!pdfs.length && !ors.length) { el.append(h('div', { class: 'bloco' }, vazio('Sua nutri ainda não liberou planos ou orientações.'))); return; }
  if (pdfs.length) el.append(h('div', { class: 'bloco' }, h('h2', null, 'Planos e prescrições'), pdfs.map(r => {
    const nome = `${slug(tituloRegistro(r))}-${r.data}.pdf`;
    const abrir = async (ev, baixar) => {
      const b = ev.currentTarget, rot = b.textContent; b.disabled = true; b.textContent = 'abrindo…';
      try {
        const { data, error } = await supa.storage.from('arquivos').download(r.pdf);
        if (error) throw error;
        if (baixar) { const a = h('a', { href: URL.createObjectURL(data), download: nome }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
        else await mostraPDF(data, nome);
      } catch (e) { alert('Não deu para abrir: ' + traduzErro(e)); }
      b.disabled = false; b.textContent = rot;
    };
    return h('div', { class: 'item-plano' },
      h('span', { class: 'nov-ic', 'aria-hidden': 'true' }, ICONES[r.tipo]),
      h('div', null, h('b', null, tituloRegistro(r)), h('small', null, `${dataBR(r.data)}${r.compartilhado_em ? ' · atualizado em ' + new Date(r.compartilhado_em).toLocaleDateString('pt-BR') : ''}`)),
      h('div', { class: 'acoes-plano' },
        h('button', { class: 'btn esc', type: 'button', onclick: (ev) => abrir(ev, false) }, 'Ver'),
        h('button', { class: 'btn sec', type: 'button', onclick: (ev) => abrir(ev, true) }, 'Baixar')));
  })));
  ors.forEach(r => el.append(h('div', { class: 'bloco orientacao' },
    h('small', { class: 'kicker' }, `orientação · ${dataBR(r.data)}`), h('h2', null, r.dados.titulo || 'Orientação'),
    h('p', { class: 'texto-or' }, r.dados.texto || ''),
    r.dados.video ? h('a', { class: 'link', href: r.dados.video, target: '_blank', rel: 'noopener' }, 'assistir ao vídeo ↗') : null)));
}

/* ============ sair / iniciar ============ */
async function sair() { await supa.auth.signOut(); area = null; aba = 'inicio'; fichaSel = 0; aviso = null; modo = 'entrar'; render(); }

async function iniciar() {
  if (!supa) return render();
  supa.auth.onAuthStateChange((evento, s) => {
    if (evento === 'PASSWORD_RECOVERY') recuperando = true;
    const trocou = (s?.user?.id || null) !== (sessao?.user?.id || null);
    sessao = s;
    if (trocou) { area = null; aba = 'inicio'; fichaSel = 0; setTimeout(render, 0); }
  });
  const { data } = await supa.auth.getSession();
  sessao = data.session;
  render();
}
iniciar();
