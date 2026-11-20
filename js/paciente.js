/* ëat · questionário da paciente */
const params = new URLSearchParams(location.search);
const CONFIG = {
  paciente: (params.get('nome') || '').trim(),
  nutriId: ehUUID(params.get('n')) ? params.get('n').toLowerCase() : '',
  nutri: (params.get('nutri') || '').trim(),
  wa: (params.get('wa') || '').replace(/\D/g, '')
};
let supa = criaSupabase();
// com o link da nutri (?n=...), busca o nome e o WhatsApp dela no banco
async function carregaNutri() {
  if (!supa || !CONFIG.nutriId) return null;
  try {
    const { data } = await supa.rpc('perfil_publico', { p_nutri: CONFIG.nutriId });
    const p = Array.isArray(data) ? data[0] : data;
    if (p) { CONFIG.nutri = p.nome || CONFIG.nutri; CONFIG.wa = p.whatsapp || CONFIG.wa; }
    return p;
  } catch (_) { return null; }
}
const enviaPeloBanco = () => !!(supa && CONFIG.nutriId);
const nomeNutri = () => CONFIG.nutri || 'sua nutri';

/* ============ estado ============ */
const CHAVE_RASCUNHO = 'eat_anamnese_rascunho' + (CONFIG.nutriId ? '_' + CONFIG.nutriId.slice(0, 8) : '');
function novoEstado() { return { a: CONFIG.paciente ? { nome: CONFIG.paciente } : {}, i: 0, pts: 0, marcadas: {}, id: novoUUID(), enviado: false }; }
let S = store.get(CHAVE_RASCUNHO, null) || novoEstado();
if (CONFIG.paciente && !S.a.nome) S.a.nome = CONFIG.paciente;
if (!ehUUID(S.id)) S.id = novoUUID();
const salvar = () => store.set(CHAVE_RASCUNHO, S);

function passos() {
  const out = [{ k: 'boasvindas' }];
  ETAPAS.forEach((e, ei) => {
    out.push({ k: 'abertura', ei });
    e.perguntas.forEach(p => { if (!p.se || p.se(S.a)) out.push({ k: 'pergunta', ei, p }); });
  });
  out.push({ k: 'final' });
  return out;
}
function respondida(p) {
  const v = S.a[p.id];
  if (p.opcional) return true;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (p.tipo === 'freq') return p.itens.every(([id]) => v[id] !== undefined);
  return true;
}

/* ============ mascote ============ */
function mascote(grande) {
  return h('div', { class: 'ee' + (grande ? ' grande' : ''), 'aria-hidden': 'true' },
    h('i', { class: 'olho a' }), h('i', { class: 'olho b' }), h('span', { class: 'letra' }, 'e'));
}
let balaoEl = null, eeEl = null;
function fala(txt) {
  if (!txt || !balaoEl) return;
  balaoEl.textContent = txt;
  balaoEl.style.animation = 'none'; void balaoEl.offsetWidth; balaoEl.style.animation = '';
  if (eeEl) { eeEl.classList.remove('feliz'); void eeEl.offsetWidth; eeEl.classList.add('feliz'); }
}

/* ============ efeitos ============ */
function maisPontos(alvo) {
  const r = (alvo || $('#btnSeguir') || document.body).getBoundingClientRect();
  const el = h('div', { class: 'mais-pontos', style: `left:${r.left + r.width / 2 - 18}px;top:${r.top - 10}px` }, '+10');
  document.body.append(el); setTimeout(() => el.remove(), 1000);
  const p = $('#pts'); if (p) p.textContent = S.pts;
}
function confete(qtd = 70) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cores = ['#FF5E46', '#FF4416', '#C0DE5A', '#70774F', '#360105', '#fff'];
  for (let i = 0; i < qtd; i++) {
    const t = 7 + Math.random() * 10;
    const el = h('i', { class: 'confete', style:
      `left:${Math.random() * 100}vw;width:${t}px;height:${t * (Math.random() > .5 ? 1 : .75)}px;background:${cores[i % cores.length]};animation-duration:${1.8 + Math.random() * 1.8}s;animation-delay:${Math.random() * .4}s` });
    document.body.append(el); setTimeout(() => el.remove(), 4200);
  }
}
function figurinha(f, i) {
  // {nome} vira o primeiro nome da paciente (com a inicial maiúscula); sem nome, a linha some
  const nomeFig = (t) => t && t.includes('{nome}') ? t.replace('{nome}', (n => n && n[0].toUpperCase() + n.slice(1))(primeiro(S.a.nome)) || '').trim() : t;
  f = { ...f, g: nomeFig(f.g), s: nomeFig(f.s), c: nomeFig(f.c) };
  const cls = 'fig ' + f.cor + (f.tipo === 'redonda' ? ' redonda' : f.tipo === 'oval' ? ' oval' : '');
  return h('div', { class: cls, style: `--rot:${f.rot || -4}deg;--i:${i || 0}` },
    f.logo ? h('span', { class: 'g', style: 'font-size:34px;letter-spacing:-.04em' }, 'ëat') : h('span', { class: 'g' }, f.g),
    f.s ? h('span', { class: 's' }, f.s) : null,
    f.c ? h('span', { class: 'c' }, f.c) : null);
}

/* ============ respostas ============ */
function definir(p, v, alvo) {
  if (vazia(v)) delete S.a[p.id]; else S.a[p.id] = v;
  if (!vazia(S.a[p.id]) && !S.marcadas[p.id]) { S.marcadas[p.id] = 1; S.pts += 10; maisPontos(alvo); }
  atualizaNav(); salvar();
}
function reagir(p, v) {
  const r = p.reage ? p.reage(v, S.a) : '';
  if (r) fala(r);
}
let autoTimer = null;
function avancaSozinho() { clearTimeout(autoTimer); autoTimer = setTimeout(seguir, 650); }

/* ============ campos ============ */
function campo(p) {
  const v = S.a[p.id];
  switch (p.tipo) {
    case 'texto': case 'texto-longo': {
      const el = p.tipo === 'texto'
        ? h('input', { class: 'campo', type: p.input || 'text', inputmode: p.input === 'tel' ? 'tel' : p.input === 'email' ? 'email' : null, placeholder: p.ph || '', value: v || '', autocomplete: p.auto || 'off' })
        : h('textarea', { class: 'campo', placeholder: p.ph || '' }, v || '');
      let t;
      el.addEventListener('input', () => { definir(p, el.value, el); clearTimeout(t); t = setTimeout(() => el.value.trim() && reagir(p, el.value.trim()), 900); });
      if (p.tipo === 'texto') el.addEventListener('keydown', e => { if (e.key === 'Enter') seguir(); });
      setTimeout(() => { if (matchMedia('(hover:hover)').matches) el.focus(); }, 80);
      return el;
    }
    case 'data': case 'hora': {
      const el = h('input', { class: 'campo', type: p.tipo === 'data' ? 'date' : 'time', value: v || '', max: p.tipo === 'data' ? new Date().toISOString().slice(0, 10) : null });
      el.addEventListener('change', () => { definir(p, el.value, el); if (el.value) reagir(p, el.value); });
      el.addEventListener('input', () => definir(p, el.value, el));
      return el;
    }
    case 'numero': {
      const padrao = typeof p.padrao === 'function' ? p.padrao(S.a) : p.padrao;
      const inp = h('input', { class: 'campo', type: 'number', inputmode: 'decimal', step: p.passo, min: p.min, max: p.max, placeholder: String(padrao).replace('.', ','), value: v ?? '' });
      const muda = (d) => {
        const atual = parseFloat(inp.value);
        const base = isNaN(atual) ? padrao : atual + d;
        const n = Math.min(p.max, Math.max(p.min, Math.round(base / p.passo) * p.passo));
        inp.value = +n.toFixed(1); definir(p, +inp.value, inp);
      };
      inp.addEventListener('input', () => { const n = parseFloat(inp.value); definir(p, isNaN(n) ? undefined : n, inp); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') seguir(); });
      return h('div', { class: 'num' },
        h('button', { class: 'mais', type: 'button', 'aria-label': 'Diminuir', onclick: () => muda(-p.passo) }, '−'),
        inp,
        h('button', { class: 'mais', type: 'button', 'aria-label': 'Aumentar', onclick: () => muda(p.passo) }, '+'),
        h('span', { class: 'unid' }, p.unid));
    }
    case 'escolha': {
      const box = h('div', { class: 'opcoes', role: 'radiogroup' });
      if (p.ops.some(o => o[3])) box.classList.add('largas');
      p.ops.forEach(([val, rot, e, desc]) => {
        const b = h('button', { class: 'op' + (v === val ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': v === val ? 'true' : 'false',
          onclick: () => {
            box.querySelectorAll('.op').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
            b.classList.add('on'); b.setAttribute('aria-checked', 'true');
            definir(p, val, b); reagir(p, val); avancaSozinho();
          } }, h('span', { class: 'e' }, e), h('span', null, rot, desc ? h('small', { class: 'desc' }, desc) : null));
        box.append(b);
      });
      return box;
    }
    case 'multi': {
      const sel = new Set(Array.isArray(v) ? v : []);
      const box = h('div', { class: 'chips' });
      const pinta = () => box.querySelectorAll('.chip').forEach(c => { const on = sel.has(c.dataset.v); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      p.ops.forEach(([val, rot, e]) => {
        box.append(h('button', { class: 'chip', type: 'button', 'data-v': val, onclick: (ev) => {
          if (sel.has(val)) sel.delete(val);
          else {
            if (p.nenhum && val === p.nenhum) sel.clear();
            else if (p.nenhum) sel.delete(p.nenhum);
            sel.add(val);
          }
          pinta(); definir(p, [...sel], ev.currentTarget);
          if (sel.size) reagir(p, [...sel]);
        } }, h('span', null, e), rot));
      });
      pinta();
      return box;
    }
    case 'escala': {
      const box = h('div', { class: 'escala' });
      p.ops.forEach(([val, e, rot]) => {
        const b = h('button', { type: 'button', class: v === val ? 'on' : '', 'aria-label': rot, onclick: () => {
          box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
          definir(p, val, b); reagir(p, val); avancaSozinho();
        } }, h('span', { class: 'e' }, e), h('small', null, rot));
        box.append(b);
      });
      return box;
    }
    case 'regua': {
      if (v === undefined) { S.a[p.id] = p.padrao; }
      const atual = S.a[p.id];
      const fmt = p.fmt || (n => String(n).replace('.', ','));
      const unid = typeof p.unid === 'function' ? p.unid() : (p.unid || '');
      const valor = h('div', { class: 'valor' }, fmt(atual), unid ? h('span', null, unid) : null);
      const emo = h('div', { class: 'emo' }, p.emo ? p.emo(atual) : '');
      const r = h('input', { type: 'range', min: p.min, max: p.max, step: p.passo, value: atual, 'aria-label': typeof p.t === 'string' ? p.t : '' });
      const pinta = (n) => { r.style.setProperty('--p', ((n - p.min) / (p.max - p.min) * 100) + '%'); valor.firstChild.textContent = fmt(n); if (p.emo) emo.textContent = p.emo(n); };
      pinta(atual);
      let t;
      r.addEventListener('input', () => { const n = +r.value; pinta(n); definir(p, n, r); clearTimeout(t); t = setTimeout(() => reagir(p, n), 500); });
      setTimeout(() => { if (!S.marcadas[p.id]) { S.marcadas[p.id] = 1; S.pts += 10; } atualizaNav(); salvar(); });
      return h('div', { class: 'regua' }, valor, emo, r, h('div', { class: 'ext' }, h('span', null, p.ext?.[0] || p.min), h('span', null, p.ext?.[1] || p.max)));
    }
    case 'agua': {
      const n = typeof v === 'number' ? v : 0;
      const grade = h('div', { class: 'copos' });
      const total = h('div', { class: 'agua-total' });
      const pinta = (q) => {
        grade.querySelectorAll('.copo').forEach((c, i) => c.classList.toggle('on', i < q));
        total.replaceChildren(document.createTextNode(`${q} ${q === 1 ? 'copo' : 'copos'}${q >= 16 ? ' ou mais' : ''}`), h('small', null, `≈ ${litros(q)} litros por dia · ${faixaAgua(q)}`));
      };
      for (let i = 0; i < 16; i++) {
        grade.append(h('button', { class: 'copo', type: 'button', 'aria-label': `${i + 1} copos`, onclick: (ev) => {
          const atual = S.a[p.id] || 0;
          const q = atual === i + 1 ? i : i + 1;
          pinta(q); definir(p, q, ev.currentTarget); clearTimeout(autoTimer); autoTimer = setTimeout(() => reagir(p, q), 400);
        } }));
      }
      pinta(n);
      return h('div', null, grade, total,
        h('div', { style: 'text-align:center' }, h('button', { class: 'link', type: 'button', onclick: (ev) => { pinta(0); definir(p, 0, ev.currentTarget); fala('Sincera. Gostei. Vamos trabalhar isso juntas.'); } }, 'quase não bebo água 😅')));
    }
    case 'freq': {
      const val = Object.assign({}, v || {});
      const box = h('div', { class: 'freq' });
      p.itens.forEach(([id, rot, e]) => {
        const linha = h('div', { class: 'freq-linha' + (val[id] !== undefined ? ' ok' : '') });
        const ops = h('div', { class: 'freq-ops', role: 'radiogroup', 'aria-label': rot });
        FREQ_NIVEIS.forEach((nv, ni) => {
          ops.append(h('button', { type: 'button', class: val[id] === ni ? 'on' : '', onclick: (ev) => {
            val[id] = ni; ops.querySelectorAll('button').forEach((b, bi) => b.classList.toggle('on', bi === ni));
            linha.classList.add('ok'); definir(p, { ...val }, ev.currentTarget);
            const faltam = p.itens.filter(([k]) => val[k] === undefined).length;
            if (!faltam) fala('Mapa completo. Isso aqui vale ouro pra montar seu plano.');
            else if (faltam === Math.floor(p.itens.length / 2)) fala('Metade já foi!');
          } }, nv));
        });
        linha.append(h('div', { class: 'freq-nome' }, h('span', { class: 'e' }, e), rot), ops);
        box.append(linha);
      });
      return box;
    }
  }
}

/* ============ telas da anamnese ============ */
function topo(lista) {
  const atual = lista[S.i];
  const t = $('#topo'); t.replaceChildren();
  const linha = h('div', { class: 'topo-in' },
    h('div', { class: 'logo' }, 'ëat'),
    h('div', { class: 'pontos', title: 'Seus pontos' }, h('b', null, h('i'), h('i')), h('span', { id: 'pts' }, S.pts), ' pts'));
  t.append(linha);
  if (atual.k === 'boasvindas' || atual.k === 'final') return;
  const trilha = h('div', { class: 'trilha', 'aria-hidden': 'true' });
  ETAPAS.forEach((e, ei) => {
    const daEtapa = lista.filter(x => x.ei === ei && x.k === 'pergunta');
    const pos = lista.slice(0, S.i + 1).filter(x => x.ei === ei && x.k === 'pergunta').length;
    let pct = ei < atual.ei ? 100 : ei > atual.ei ? 0 : (daEtapa.length ? pos / daEtapa.length * 100 : 0);
    const seg = h('div', { class: 'seg' + (ei === atual.ei ? ' atual' : '') }, h('i'));
    trilha.append(seg);
    requestAnimationFrame(() => requestAnimationFrame(() => seg.firstChild.style.width = pct + '%'));
  });
  t.append(trilha, h('div', { class: 'etapa-label' }, `Etapa ${atual.ei + 1} de ${ETAPAS.length} · ${ETAPAS[atual.ei].titulo.replace('.', '')}`));
}

let navCfg = {};
function nav(cfg) {
  navCfg = cfg;
  const n = $('#nav'); n.replaceChildren();
  if (!cfg) { n.style.display = 'none'; return; }
  n.style.display = '';
  const inner = h('div', { class: 'nav-in' });
  if (cfg.voltar) inner.append(h('button', { class: 'btn sec', type: 'button', 'aria-label': 'Voltar', onclick: voltar }, '←'));
  inner.append(h('button', { class: 'btn pri', id: 'btnSeguir', type: 'button', onclick: seguir }, cfg.rotulo || 'Continuar'));
  n.append(inner); atualizaNav();
}
function atualizaNav() {
  const b = $('#btnSeguir'); if (!b) return;
  const lista = passos(); const s = lista[S.i];
  if (s && s.k === 'pergunta') {
    const ok = respondida(s.p);
    b.disabled = !ok;
    b.textContent = s.p.opcional && vazia(S.a[s.p.id]) ? 'Pular' : 'Continuar →';
  }
}
function seguir() {
  clearTimeout(autoTimer);
  const lista = passos(); const s = lista[S.i];
  if (s.k === 'pergunta' && !respondida(s.p)) { const b = $('#btnSeguir'); b && (b.classList.remove('treme'), void b.offsetWidth, b.classList.add('treme')); return; }
  S.i = Math.min(S.i + 1, lista.length - 1); salvar(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function voltar() { clearTimeout(autoTimer); S.i = Math.max(0, S.i - 1); salvar(); render(); }

function render() {
  const lista = passos();
  if (S.i >= lista.length) S.i = lista.length - 1;
  const s = lista[S.i];
  topo(lista);
  const palco = $('#palco'); palco.replaceChildren();
  balaoEl = eeEl = null;
  if (s.k === 'boasvindas') return telaBoasVindas(palco);
  if (s.k === 'abertura') return telaAbertura(palco, s);
  if (s.k === 'final') return telaFinal(palco);

  const p = s.p;
  eeEl = mascote(); balaoEl = h('div', { class: 'balao' }, p.dica || DICAS[(TODAS.findIndex(x => x.id === p.id)) % DICAS.length]);
  const titulo = typeof p.t === 'function' ? p.t(S.a) : p.t;
  const numEtapa = lista.filter(x => x.ei === s.ei && x.k === 'pergunta');
  const pos = numEtapa.indexOf(s) + 1;
  palco.append(
    h('div', { class: 'guia' }, eeEl, balaoEl),
    h('section', { class: 'card', 'aria-live': 'polite' },
      h('p', { class: 'kicker' }, `${String(pos).padStart(2, '0')} / ${String(numEtapa.length).padStart(2, '0')}`),
      h('h1', { class: 'pergunta' }, titulo, p.opcional ? h('span', { class: 'opcional' }, 'opcional') : null),
      p.ajuda ? h('p', { class: 'ajuda' }, p.ajuda) : h('div', { style: 'height:12px' }),
      campo(p)));
  nav({ voltar: true });
}

function telaBoasVindas(palco) {
  const temRascunho = S.i === 0 && Object.keys(S.marcadas || {}).length > 0;
  const nome = primeiro(S.a.nome);
  palco.append(h('section', { class: 'hero', style: 'padding-top:18px' },
    mascote(true),
    h('h1', null, nome ? `Oi, ${nome}.` : 'Oi, tudo bem?'),
    h('p', { class: 'serif' }, 'Bora conversar sobre o que vai pro seu prato?'),
    h('p', null, `Eu sou o ë e vou te guiar pela sua anamnese: o questionário que ajuda ${nomeNutri()} a montar um plano feito pra você, não pra uma tabela.`),
    h('p', null, `São ${ETAPAS.length} etapas rápidas, uma pergunta por vez. Você ganha pontos e figurinhas no caminho, e tudo fica salvo se precisar parar.`),
    h('div', { class: 'lista-etapas' }, ETAPAS.map(e => h('span', null, e.titulo.replace('.', '')))),
    temRascunho ? h('div', { class: 'acoes' },
      h('p', { class: 'nota', style: 'margin:0' }, 'Você já começou antes. Quer continuar de onde parou?')) : null,
    h('p', { class: 'nota' }, 'Leva uns 10 minutos. Suas respostas só vão pra sua nutri.')));
  if (temRascunho) {
    const lista = passos();
    const ultimo = Math.max(1, lista.findIndex(x => x.k === 'pergunta' && !respondida(x.p)));
    const n = $('#nav'); n.style.display = ''; n.replaceChildren(h('div', { class: 'nav-in' },
      h('button', { class: 'btn sec', type: 'button', onclick: () => { if (confirm('Apagar as respostas e começar do zero?')) { S = novoEstado(); salvar(); render(); } } }, 'Recomeçar'),
      h('button', { class: 'btn pri', id: 'btnSeguir', type: 'button', onclick: () => { S.i = ultimo === -1 ? lista.length - 1 : ultimo; salvar(); render(); } }, 'Continuar →')));
  } else nav({ rotulo: 'Bora começar →' });
}

function telaAbertura(palco, s) {
  const e = ETAPAS[s.ei];
  if (s.ei > 0) {
    const anterior = ETAPAS[s.ei - 1];
    palco.append(h('div', { class: 'conquista' }, figurinha(anterior.fig),
      h('div', null, h('div', { class: 'tit' }, 'figurinha desbloqueada'), h('div', { class: 'nome' }, `Etapa ${s.ei} concluída!`))));
    setTimeout(() => confete(50), 150);
  }
  palco.append(h('section', { class: 'abertura ' + e.tema },
    h('div', { class: 'trema', 'aria-hidden': 'true' }, h('i'), h('i')),
    h('p', { class: 'num-etapa' }, `${String(s.ei + 1).padStart(2, '0')} / ${String(ETAPAS.length).padStart(2, '0')} · etapa`),
    h('h2', null, e.titulo), h('p', null, e.sub)));
  nav({ voltar: true, rotulo: s.ei === 0 ? 'Começar →' : 'Seguir →' });
}

function figurinhasGanhas() {
  const lista = ETAPAS.map(e => e.fig);
  if ((S.a.agua || 0) >= 10) lista.push({ tipo: 'oval', cor: 't-lima', g: '💧 hidratada', s: 'de verdade', rot: 4 });
  return lista;
}
async function telaFinal(palco) {
  const nome = primeiro(S.a.nome);
  salvar();
  nav(null);
  // 1) com link da nutri e ainda não enviado: pede consentimento e envia
  if (enviaPeloBanco() && !S.enviado) {
    const marca = h('input', { type: 'checkbox' });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    const botao = h('button', { class: 'btn pri', type: 'button', disabled: true }, `Enviar para ${nomeNutri()}`);
    marca.addEventListener('change', () => { botao.disabled = !marca.checked; });
    botao.addEventListener('click', async () => {
      botao.disabled = true; botao.textContent = 'Enviando…'; msg.textContent = '';
      try { await enviarParaBanco(); render(); }
      catch (e) {
        msg.className = 'form-msg erro';
        msg.textContent = /nutri_invalida/.test(e.message || '') ? 'Esse link não está mais ativo. Peça um link novo para sua nutri, ou envie pelo WhatsApp abaixo.' : 'Não deu pra enviar agora. Confira sua internet e tente de novo. Suas respostas continuam salvas aqui.';
        botao.disabled = !marca.checked; botao.textContent = 'Tentar de novo';
      }
    });
    palco.append(h('section', { class: 'hero', style: 'padding-top:10px' },
      mascote(true),
      h('h1', null, nome ? `Terminou, ${nome}!` : 'Terminou!'),
      h('p', { class: 'serif' }, 'Falta só um toque pra suas respostas chegarem.'),
      h('label', { class: 'consentimento' }, marca,
        h('span', null, `Autorizo o envio das minhas respostas para ${CONFIG.nutri || 'minha nutricionista'}, que vai usá-las apenas no meu atendimento nutricional.`)),
      h('div', { class: 'acoes' }, botao,
        h('button', { class: 'link', type: 'button', onclick: () => { S.i = 1; salvar(); render(); } }, 'revisar respostas antes')),
      msg,
      h('p', { class: 'nota' }, 'Seus dados de saúde ficam guardados com segurança e só a sua nutri tem acesso.')));
    return;
  }
  // 2) enviado (ou link sem nutri): comemoração, álbum e PDF
  setTimeout(() => confete(120), 200);
  const figs = figurinhasGanhas();
  palco.append(h('section', { class: 'hero', style: 'padding-top:10px' },
    mascote(true),
    h('h1', null, nome ? `Pronto, ${nome}!` : 'Prontinho!'),
    h('p', { class: 'serif' }, 'Tudo o que a gente consome vira a gente. Agora a sua nutri sabe por onde começar.'),
    S.enviado ? h('p', null, h('span', { class: 'enviado' }, `✓ Enviado para ${nomeNutri()}`)) : null,
    h('div', { class: 'card', style: 'padding:18px 14px' },
      h('p', { class: 'kicker', style: 'text-align:center' }, `seu álbum · ${S.pts} pontos`),
      h('div', { class: 'album' }, figs.map((f, i) => figurinha(f, i)))),
    h('div', { class: 'acoes' },
      !S.enviado ? h('button', { class: 'btn zap', type: 'button', onclick: enviarWhatsApp }, `Enviar para ${nomeNutri()} pelo WhatsApp`) : null,
      h('button', { class: S.enviado ? 'btn pri' : 'btn sec', type: 'button', onclick: baixarRespostas }, 'Baixar minhas respostas em PDF'),
      h('button', { class: 'link', type: 'button', onclick: () => { S.i = 1; S.enviado = false; salvar(); render(); } }, S.enviado ? 'corrigir alguma resposta' : 'revisar respostas'),
      S.enviado ? h('button', { class: 'link', type: 'button', onclick: () => {
        if (confirm('Começar uma anamnese nova, para outra pessoa? As respostas desta tela saem deste aparelho (a nutri já recebeu).')) { store.del(CHAVE_RASCUNHO); S = novoEstado(); S.a = {}; salvar(); render(); }
      } }, 'responder para outra pessoa') : null),
    h('p', { class: 'nota' }, S.enviado
      ? 'Se corrigir alguma resposta, é só enviar de novo no final: a versão da sua nutri é atualizada.'
      : 'Ao enviar pelo WhatsApp, vai junto um código que a nutri usa para abrir tudo organizado no painel.')));
}


function registroAtual() { return { id: S.id, enviadoEm: new Date().toISOString(), nutri: CONFIG.nutri, respostas: S.a, pts: S.pts }; }
async function enviarParaBanco() {
  const { error } = await supa.rpc('enviar_anamnese', { p_id: S.id, p_nutri: CONFIG.nutriId, p_nome: S.a.nome || '', p_respostas: S.a, p_pontos: S.pts });
  if (error) throw error;
  S.enviado = true; S.enviadoEm = new Date().toISOString(); salvar();
}
async function enviarWhatsApp() {
  const cod = await codifica(registroAtual());
  const msg = `Oi${CONFIG.nutri ? ', ' + CONFIG.nutri : ''}! Aqui está minha anamnese ëat 📋\n${resumoTexto(S.a)}\n\n🔐 Código para o painel (não precisa ler):\n${cod}`;
  const url = (CONFIG.wa ? `https://wa.me/${CONFIG.wa}` : 'https://wa.me/') + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank', 'noopener');
}
function baixarRespostas(ev) { gerarPDF(registroAtual(), ev && ev.currentTarget); }

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) seguir();
});
render();
carregaNutri().then(() => { const s = passos()[S.i]; if (s && (s.k === 'boasvindas' || s.k === 'final')) render(); });
