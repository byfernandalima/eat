/* ëat · ficha da paciente: resumo, anamneses, antropometria, energia, exames, fotos e dados */

const ABAS_FICHA = [
  ['resumo', 'Resumo'], ['anamnese', 'Anamnese'], ['antropometria', 'Antropometria'],
  ['energia', 'Gasto energético'], ['exames', 'Exames'], ['fotos', 'Fotos'], ['plano', 'Plano alimentar'], ['prescricoes', 'Prescrições'], ['documentos', 'Documentos'], ['ia', '✦ Avaliação integrada'], ['dados', 'Dados']
];
let F = null; // ficha aberta: { paciente, anamneses, registros }

/* ============ utilidades ============ */
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dataCurta = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a.slice(2)}`; };
const msgEl = () => h('p', { class: 'form-msg', role: 'status' });
const avisa = (el, tipo, txt) => { el.className = 'form-msg ' + tipo; el.textContent = txt; };
const doTipo = (tipo) => (F?.registros || []).filter(r => r.tipo === tipo).sort((a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em));
const idadeF = () => idade(F?.paciente?.nascimento);
const sexoF = () => F?.paciente?.sexo || 'F';
function campoNum(rot, valor, attrs = {}) {
  const i = h('input', { class: 'campo mini', type: 'text', inputmode: 'decimal', value: valor ?? '', placeholder: attrs.ph || '', 'aria-label': rot });
  return [h('label', { class: 'mini-rot' }, rot, attrs.un ? h('span', null, ' ' + attrs.un) : null), i];
}

const graficos = [];
function limpaGraficos() { graficos.splice(0).forEach(g => g.destroy()); }
function miniGrafico(titulo, pontos, un, casas = 1, menorMelhor) {
  const ult = pontos[pontos.length - 1], ant = pontos[pontos.length - 2];
  const delta = ult && ant ? ult.v - ant.v : null;
  const wrap = h('div', { class: 'grafico' },
    h('div', { class: 'g-tit' }, titulo),
    h('div', { class: 'g-ult' }, ult ? `${fmtN(ult.v, casas)} ${un}` : '—',
      delta != null && Math.abs(delta) >= 10 ** -casas ? h('span', { class: 'g-delta' }, `${delta > 0 ? '▲' : '▼'} ${fmtN(Math.abs(delta), casas)}`) : null));
  if (pontos.length < 2) { wrap.append(h('p', { class: 'nota', style: 'margin:6px 0 0' }, pontos.length ? 'Com mais uma avaliação aparece a evolução.' : 'Sem dados ainda.')); return wrap; }
  const canvas = h('canvas', { role: 'img', 'aria-label': `${titulo}: ` + pontos.map(p => `${dataCurta(p.data)} ${fmtN(p.v, casas)} ${un}`).join('; ') });
  wrap.append(h('div', { class: 'g-area' }, canvas));
  requestAnimationFrame(() => {
    if (!window.Chart || !canvas.isConnected) return;
    graficos.push(new Chart(canvas, {
      type: 'line',
      data: { labels: pontos.map(p => dataCurta(p.data)), datasets: [{ data: pontos.map(p => p.v), borderColor: '#360105', borderWidth: 2,
        pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#360105', pointBorderColor: '#F3F1E2', pointBorderWidth: 2, tension: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { displayColors: false, backgroundColor: '#360105', titleColor: '#E8E5CA', bodyColor: '#fff',
          callbacks: { label: c => `${fmtN(c.parsed.y, casas)} ${un}` } } },
        scales: { x: { grid: { display: false }, ticks: { color: 'rgba(54,1,5,.6)', maxRotation: 0, autoSkip: true } },
          y: { grid: { color: 'rgba(54,1,5,.08)' }, border: { display: false }, ticks: { color: 'rgba(54,1,5,.6)', maxTicksLimit: 4 } } } }
    }));
  });
  return wrap;
}
if (window.Chart) { Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif"; Chart.defaults.font.size = 12; }

/* ============ arquivos no Storage ============ */
async function enviaArquivo(blob, ext, tipoMime) {
  const caminho = `${sessao.user.id}/${F.paciente.id}/${novoUUID()}.${ext}`;
  const { error } = await supa.storage.from('arquivos').upload(caminho, blob, { contentType: tipoMime || blob.type, upsert: false });
  if (error) throw error;
  return caminho;
}
async function urlsAssinadas(caminhos) {
  if (!caminhos.length) return {};
  const { data } = await supa.storage.from('arquivos').createSignedUrls(caminhos, 3600);
  return Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}
async function reduzImagem(arquivo, max = 1600) {
  const img = await createImageBitmap(arquivo);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
}

/* ============ carregar ============ */
async function carregaFicha(id) {
  const [p, a, r] = await Promise.all([
    supa.from('pacientes').select('*').eq('id', id).maybeSingle(),
    supa.from('anamneses').select('id, criado_em, vista, origem, respostas').eq('paciente_id', id).order('criado_em', { ascending: false }),
    supa.from('registros').select('*').eq('paciente_id', id).order('data', { ascending: true })
  ]);
  if (p.error) throw p.error;
  if (!p.data) return null;
  return { paciente: p.data, anamneses: a.data || [], registros: r.data || [] };
}
async function salvaRegistro(tipo, data, dados, arquivo, idExistente) {
  const linha = { nutri_id: sessao.user.id, paciente_id: F.paciente.id, tipo, data, dados, arquivo: arquivo || null };
  const q = idExistente ? supa.from('registros').update(linha).eq('id', idExistente).select().single()
                        : supa.from('registros').insert(linha).select().single();
  const { data: novo, error } = await q;
  if (error) throw error;
  F.registros = F.registros.filter(x => x.id !== novo.id).concat(novo);
  return novo;
}
async function apagaRegistro(reg) {
  const arqs = [reg.arquivo, reg.pdf_paciente].filter(Boolean);
  if (arqs.length) await supa.storage.from('arquivos').remove(arqs);
  const { error } = await supa.from('registros').delete().eq('id', reg.id);
  if (error) throw error;
  F.registros = F.registros.filter(x => x.id !== reg.id);
}

/* ============ tela da ficha ============ */
async function telaFicha(palco, id, aba) {
  limpaGraficos();
  const wrap = h('div', { class: 'painel' }, h('p', { class: 'carregando' }, 'abrindo ficha…'));
  palco.append(wrap);
  try { if (!F || F.paciente.id !== id) F = await carregaFicha(id); }
  catch (e) { wrap.replaceChildren(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
  if (!F) { wrap.replaceChildren(h('p', { class: 'form-msg erro' }, 'Paciente não encontrada.'), h('a', { href: '#', class: 'link' }, '← voltar')); return; }
  const p = F.paciente, i = idadeF();
  // abas que dependem da paciente: infantil até 19 anos; gestação para mulheres a partir de 10 anos
  const abas = ABAS_FICHA.slice();
  const posAntro = abas.findIndex(a => a[0] === 'antropometria') + 1;
  if (p.sexo !== 'M' && (i == null || i >= 10)) abas.splice(posAntro, 0, ['gestacao', 'Gestação']);
  if (i == null || i < 20) abas.splice(posAntro, 0, ['infantil', 'Infantil']);
  if (!iaAtiva()) abas.splice(abas.findIndex(a => a[0] === 'ia'), 1);
  aba = abas.some(a => a[0] === aba) ? aba : 'resumo';
  const conteudo = h('div', { class: 'aba-conteudo' });
  wrap.replaceChildren(
    h('div', { class: 'nao-imprime', style: 'margin-top:6px' }, h('a', { href: '#', class: 'link' }, '← pacientes')),
    h('div', { class: 'ficha-cab' },
      h('span', { class: 'av grande' }, (primeiro(p.nome) || '?')[0].toUpperCase()),
      h('div', null, h('h1', { style: 'margin:0' }, p.nome || 'Sem nome'),
        h('p', { class: 'nota', style: 'margin:2px 0 0' }, [i != null ? `${i} anos` : 'idade não informada', p.sexo === 'M' ? 'masculino' : 'feminino', p.telefone].filter(Boolean).join(' · ')))),
    h('nav', { class: 'abas-ficha nao-imprime', 'aria-label': 'Seções da ficha' },
      abas.map(([k, rot]) => h('a', { href: `#pac/${id}/${k}`, class: k === aba ? 'on' : '', 'aria-current': k === aba ? 'page' : null }, rot))),
    conteudo);
  const telas = { resumo: abaResumo, anamnese: abaAnamnese, antropometria: abaAntropometria, energia: abaEnergia, exames: abaExames, fotos: abaFotos, dados: abaDados, infantil: abaInfantil, gestacao: abaGestacao, ia: abaIntegrada, plano: abaPlano, prescricoes: abaPrescricoes, documentos: abaDocumentos };
  await telas[aba](conteudo);
}

/* ---------- resumo ---------- */
function abaResumo(el) {
  const ant = doTipo('antropometria'), ult = ant[ant.length - 1];
  const res = ult ? calculaAntropometria(ult.dados, sexoF(), idadeF()) : null;
  const en = doTipo('energia'), ultE = en[en.length - 1];
  const ex = doTipo('exame'), ultEx = ex[ex.length - 1];
  const alterados = ultEx ? Object.entries(ultEx.dados.valores || {}).filter(([k, v]) => statusExame(num(v), referencia(k, sexoF(), ultEx.dados.refs?.[k])) !== 'normal' && num(v) != null) : [];
  const an = F.anamneses[0];
  const card = (tit, val, sub, href) => h('a', { class: 'ind', href }, h('small', null, tit), h('b', null, val), h('span', null, sub));
  el.append(
    h('div', { class: 'indicadores' },
      card('Peso', ult ? `${fmtN(num(ult.dados.peso))} kg` : '—', ult ? `em ${dataCurta(ult.data)}` : 'sem avaliação', `#pac/${F.paciente.id}/antropometria`),
      card('IMC', res?.imc ? fmtN(res.imc) : '—', res?.imcClasse || '', `#pac/${F.paciente.id}/antropometria`),
      card('% gordura', res?.gordura != null ? `${fmtN(res.gordura)}%` : '—', res?.protocoloNome || '', `#pac/${F.paciente.id}/antropometria`),
      card('VET', ultE ? `${fmtN(ultE.dados.resultado?.vet, 0)} kcal` : '—', ultE ? EQUACOES_TMB[ultE.dados.equacao]?.nome.split(' ·')[0] : 'sem cálculo', `#pac/${F.paciente.id}/energia`),
      card('Exames', ultEx ? `${alterados.length} alterado${alterados.length === 1 ? '' : 's'}` : '—', ultEx ? `em ${dataCurta(ultEx.data)}` : 'sem resultados', `#pac/${F.paciente.id}/exames`)));
  if (an) {
    const al = alertas(an.respostas || {});
    el.append(h('div', { class: 'bloco' }, h('h2', null, 'Pontos de atenção da anamnese'),
      h('p', { class: 'nota', style: 'margin-top:0' }, `Respondida em ${new Date(an.criado_em).toLocaleDateString('pt-BR')}. `, h('a', { href: '#p/' + an.id, class: 'link' }, 'ver completa')),
      al.length ? h('ul', { class: 'alertas' }, al.map(x => h('li', null, x))) : h('p', { class: 'vazio' }, 'Nada que chame atenção.')));
  } else el.append(h('div', { class: 'bloco' }, h('h2', null, 'Anamnese'), h('p', { class: 'vazio' }, 'Ainda não respondeu. Mande o link pelo painel.')));
  if (alterados.length) el.append(h('div', { class: 'bloco' }, h('h2', null, 'Exames fora da referência'),
    h('ul', { class: 'alertas' }, alterados.map(([k, v]) => { const e = exame(k); const st = statusExame(num(v), referencia(k, sexoF(), ultEx.dados.refs?.[k]));
      const n = num(v);
      return h('li', null, `${e ? e[1] : k}: ${fmtN(n, n % 1 ? (n < 10 ? 2 : 1) : 0)} ${e ? e[2] : ''} (${st === 'alto' ? '↑ acima' : '↓ abaixo'})`); }))));
  if (F.paciente.observacoes) el.append(h('div', { class: 'bloco' }, h('h2', null, 'Observações'), h('p', { style: 'white-space:pre-wrap;margin:0' }, F.paciente.observacoes)));
}

/* ---------- anamneses ---------- */
function abaAnamnese(el) {
  if (!F.anamneses.length) {
    const u = new URL(urlQuestionario()); u.searchParams.set('n', sessao.user.id); if (F.paciente.nome) u.searchParams.set('nome', F.paciente.nome);
    el.append(h('div', { class: 'bloco' }, h('p', { class: 'vazio' }, 'Nenhuma anamnese ainda.'),
      h('p', { class: 'nota' }, 'Mande este link. Se ela usar o mesmo e-mail ou nome e nascimento, a anamnese cai nesta ficha.'),
      h('div', { class: 'linkbox' }, u.toString())));
    return;
  }
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Anamneses'), F.anamneses.map(a => h('a', { class: 'pac', href: '#p/' + a.id, style: 'color:inherit;text-decoration:none' },
    h('span', { class: 'av' }, '📋'),
    h('span', { class: 'info' }, h('b', null, new Date(a.criado_em).toLocaleDateString('pt-BR'), !a.vista ? h('span', { class: 'selo-nova' }, 'nova') : null),
      h('span', null, a.origem === 'importada' ? 'importada' : 'pelo link')), h('span', { 'aria-hidden': 'true' }, '→')))));
}

/* ---------- antropometria ---------- */
function abaAntropometria(el) {
  const lista = doTipo('antropometria');
  const formBox = h('div');
  const abrir = (reg) => { formBox.replaceChildren(formAntropometria(reg, () => { formBox.replaceChildren(); render(); })); formBox.scrollIntoView({ behavior: 'smooth' }); };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' }, h('button', { class: 'btn pri', type: 'button', onclick: () => abrir(null) }, '+ Nova avaliação')), formBox);
  if (!lista.length) { el.append(h('div', { class: 'bloco' }, h('p', { class: 'vazio' }, 'Nenhuma avaliação ainda. Comece pela primeira.'))); return; }
  const calc = lista.map(r => ({ r, c: calculaAntropometria(r.dados, sexoF(), idade(F.paciente.nascimento)) }));
  const serie = (fn) => calc.map(({ r, c }) => ({ data: r.data, v: fn(r, c) })).filter(p => p.v != null && isFinite(p.v));
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Evolução'),
    h('div', { class: 'graficos' },
      miniGrafico('Peso', serie(r => num(r.dados.peso)), 'kg'),
      miniGrafico('IMC', serie((r, c) => c.imc), 'kg/m²'),
      miniGrafico('% de gordura', serie((r, c) => c.gordura), '%'),
      miniGrafico('Massa magra', serie((r, c) => c.massaMagra), 'kg'),
      miniGrafico('Cintura', serie(r => num(r.dados.circ?.cintura)), 'cm'),
      miniGrafico('Quadril', serie(r => num(r.dados.circ?.quadril)), 'cm'))));
  const linhas = calc.slice().reverse();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Avaliações'),
    h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Data', 'Peso', 'IMC', '% G', 'M. magra', 'Cintura', 'RCQ', ''].map(t => h('th', null, t)))),
      h('tbody', null, linhas.map(({ r, c }) => h('tr', null,
        h('td', null, dataCurta(r.data)), h('td', null, fmtN(num(r.dados.peso))), h('td', null, fmtN(c.imc)), h('td', null, c.gordura != null ? fmtN(c.gordura) : '—'),
        h('td', null, c.massaMagra != null ? fmtN(c.massaMagra) : '—'), h('td', null, fmtN(num(r.dados.circ?.cintura))), h('td', null, c.rcq ? fmtN(c.rcq, 2) : '—'),
        h('td', { class: 'acoes-linha' }, controleArea(r), h('button', { class: 'link', type: 'button', onclick: () => abrir(r) }, 'abrir'),
          h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm(`Excluir a avaliação de ${dataCurta(r.data)}?`)) { await apagaRegistro(r); render(); } } }, 'excluir')))))))));
}

function formAntropometria(reg, aoSalvar) {
  const ant = doTipo('antropometria'), base = reg?.dados || {};
  const ultima = ant[ant.length - 1]?.dados || {};
  const d = { peso: base.peso ?? '', altura: base.altura ?? ultima.altura ?? '', circ: { ...(base.circ || {}) }, dobras: { ...(base.dobras || {}) },
    protocolo: base.protocolo || ultima.protocolo || 'pollock3', bio: { ...(base.bio || {}) }, obs: base.obs || '' };
  const iData = h('input', { class: 'campo mini', type: 'date', value: reg?.data || hoje(), max: hoje() });
  const resultado = h('div', { class: 'resultado-calc', 'aria-live': 'polite' });
  const msg = msgEl();
  const liga = ([rot, inp], alvo, k) => { inp.addEventListener('input', () => { alvo[k] = inp.value; atualiza(); }); return h('div', { class: 'mini-campo' }, rot, inp); };
  const grade = (lista, alvo, un) => h('div', { class: 'grade-medidas' }, lista.map(([k, rot]) => liga(campoNum(rot, alvo[k], { un }), alvo, k)));
  const sel = h('select', { class: 'campo mini' }, Object.entries(PROTOCOLOS).map(([k, p]) => h('option', { value: k, selected: k === d.protocolo ? true : null }, p.nome)));
  const dobrasUsadas = h('p', { class: 'nota', style: 'margin:6px 0 0' });
  sel.addEventListener('change', () => { d.protocolo = sel.value; atualiza(); });
  const iObs = h('textarea', { class: 'campo', style: 'min-height:70px;font-size:15px' }, d.obs);
  iObs.addEventListener('input', () => { d.obs = iObs.value; });

  function atualiza() {
    const r = calculaAntropometria(d, sexoF(), idadeF());
    const p = PROTOCOLOS[d.protocolo];
    dobrasUsadas.textContent = 'Usa: ' + p.dobras(sexoF()).map(k => DOBRAS.find(x => x[0] === k)[1].toLowerCase()).join(', ') + '.';
    const it = (rot, v, sub) => h('div', null, h('small', null, rot), h('b', null, v), sub ? h('span', null, sub) : null);
    resultado.replaceChildren(
      h('div', { class: 'resumo' },
        it('IMC', r.imc ? fmtN(r.imc) : '—', r.imcClasse),
        it('% gordura', r.gordura != null ? fmtN(r.gordura) + '%' : '—', r.protocoloNome || ''),
        it('Massa gorda', r.massaGorda != null ? fmtN(r.massaGorda) + ' kg' : '—'),
        it('Massa magra', r.massaMagra != null ? fmtN(r.massaMagra) + ' kg' : '—'),
        it('Cintura', num(d.circ.cintura) ? fmtN(num(d.circ.cintura)) + ' cm' : '—', r.cinturaRisco || ''),
        it('RCQ', r.rcq ? fmtN(r.rcq, 2) : '—', r.rcqRisco || ''),
        it('Cintura/estatura', r.rcest ? fmtN(r.rcest, 2) : '—', r.rcestRisco || ''),
        it('CMB', r.cmb ? fmtN(r.cmb) + ' cm' : '—', 'circ. muscular do braço')),
      r.avisos.length ? h('p', { class: 'nota' }, r.avisos.join(' ')) : null);
  }
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    if (!num(d.peso)) return avisa(msg, 'erro', 'Informe pelo menos o peso.');
    salvar.disabled = true;
    try {
      const c = calculaAntropometria(d, sexoF(), idadeF());
      await salvaRegistro('antropometria', iData.value || hoje(), { ...d, resultado: { imc: c.imc, gordura: c.gordura, massaMagra: c.massaMagra, massaGorda: c.massaGorda } }, null, reg?.id);
      aoSalvar();
    } catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, reg ? 'Salvar alterações' : 'Salvar avaliação');
  const pesoAlt = h('div', { class: 'grade-medidas' },
    h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Data'), iData),
    liga(campoNum('Peso', d.peso, { un: 'kg' }), d, 'peso'),
    liga(campoNum('Altura', d.altura, { un: 'cm' }), d, 'altura'));
  const box = h('div', { class: 'bloco form-aval' },
    h('h2', null, reg ? `Avaliação de ${dataCurta(reg.data)}` : 'Nova avaliação'),
    pesoAlt,
    h('h3', { class: 'sub' }, 'Circunferências (cm)'), grade(CIRCUNFERENCIAS, d.circ),
    h('h3', { class: 'sub' }, 'Dobras cutâneas (mm)'),
    h('div', { class: 'mini-campo', style: 'max-width:360px' }, h('label', { class: 'mini-rot' }, 'Protocolo'), sel), dobrasUsadas,
    grade(DOBRAS, d.dobras),
    h('details', { class: 'sub-det' }, h('summary', null, 'Bioimpedância (opcional)'),
      h('div', { class: 'grade-medidas' },
        liga(campoNum('% gordura', d.bio.gordura, { un: '%' }), d.bio, 'gordura'),
        liga(campoNum('Massa muscular', d.bio.musculo, { un: 'kg' }), d.bio, 'musculo'),
        liga(campoNum('Água corporal', d.bio.agua, { un: '%' }), d.bio, 'agua'),
        liga(campoNum('Gordura visceral', d.bio.visceral, { un: 'nível' }), d.bio, 'visceral')),
      h('p', { class: 'nota' }, 'Se não houver dobras, o % de gordura da bioimpedância entra nos cálculos.')),
    h('h3', { class: 'sub' }, 'Resultado'), resultado,
    h('label', null, 'Observações'), iObs,
    h('div', { class: 'linha-btn' }, salvar, h('button', { class: 'btn sec', type: 'button', onclick: aoSalvar }, 'Cancelar')), msg);
  atualiza();
  return box;
}

/* ---------- gasto energético ---------- */
function abaEnergia(el) {
  const ant = doTipo('antropometria'), ult = ant[ant.length - 1];
  const c = ult ? calculaAntropometria(ult.dados, sexoF(), idadeF()) : {};
  const d = { equacao: 'mifflin', peso: ult ? num(ult.dados.peso) : null, altura: ult ? num(ult.dados.altura) : null, idade: idadeF(), sexo: sexoF(),
    massaMagra: c.massaMagra || null, fa: 1.375, ajuste: 0, protG: 1.6, gordPct: 30 };
  const resultado = h('div', { 'aria-live': 'polite' }), comparacao = h('div');
  const msg = msgEl();
  const inp = (k, rot, un) => { const [l, i] = campoNum(rot, d[k], { un }); i.addEventListener('input', () => { d[k] = num(i.value); atualiza(); }); return h('div', { class: 'mini-campo' }, l, i); };
  const selEq = h('select', { class: 'campo mini' }, Object.entries(EQUACOES_TMB).map(([k, e]) => h('option', { value: k }, e.nome)));
  selEq.addEventListener('change', () => { d.equacao = selEq.value; atualiza(); });
  const selFa = h('select', { class: 'campo mini' }, FATORES_ATIVIDADE.map(([v, rot]) => h('option', { value: v, selected: v === d.fa ? true : null }, `${String(v).replace('.', ',')} · ${rot}`)));
  selFa.addEventListener('change', () => { d.fa = +selFa.value; atualiza(); });
  function atualiza() {
    const r = calculaEnergia(d);
    if (!r || r.erro) { resultado.replaceChildren(h('p', { class: 'form-msg erro' }, r?.erro || 'Preencha os dados.')); comparacao.replaceChildren(); return; }
    const it = (rot, v, sub) => h('div', null, h('small', null, rot), h('b', null, v), sub ? h('span', null, sub) : null);
    resultado.replaceChildren(h('div', { class: 'resumo' },
      it('TMB', fmtN(r.tmb, 0) + ' kcal', 'taxa metabólica basal'),
      it('GET', fmtN(r.get, 0) + ' kcal', `TMB × ${String(d.fa).replace('.', ',')}`),
      it('VET', fmtN(r.vet, 0) + ' kcal', d.ajuste ? `GET ${d.ajuste > 0 ? '+' : '−'} ${Math.abs(d.ajuste)} kcal` : 'sem ajuste'),
      r.proteinaG != null ? it('Proteína', fmtN(r.proteinaG, 0) + ' g', `${fmtN(d.protG)} g/kg · ${fmtN(r.proteinaG * 4 / r.vet * 100, 0)}%`) : null,
      r.gorduraG != null ? it('Gordura', fmtN(r.gorduraG, 0) + ' g', `${fmtN(d.gordPct, 0)}% do VET`) : null,
      r.carboG != null ? it('Carboidrato', fmtN(r.carboG, 0) + ' g', `${fmtN(r.carboG * 4 / r.vet * 100, 0)}% · o restante`) : null));
    comparacao.replaceChildren(h('table', { class: 'tabela' }, h('thead', null, h('tr', null, h('th', null, 'Equação'), h('th', null, 'TMB'), h('th', null, 'GET'))),
      h('tbody', null, Object.entries(EQUACOES_TMB).map(([k, e]) => { const x = calculaEnergia({ ...d, equacao: k });
        return h('tr', { class: k === d.equacao ? 'sel' : '' }, h('td', null, e.nome), h('td', null, x && !x.erro ? fmtN(x.tmb, 0) : '—'), h('td', null, x && !x.erro ? fmtN(x.get, 0) : '—')); }))));
  }
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    const r = calculaEnergia(d); if (!r || r.erro) return avisa(msg, 'erro', r?.erro || 'Preencha os dados.');
    salvar.disabled = true;
    try { await salvaRegistro('energia', hoje(), { ...d, resultado: r }); render(); }
    catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, 'Salvar cálculo');
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Calcular necessidade energética'),
    ult ? h('p', { class: 'nota', style: 'margin-top:0' }, `Peso, altura e massa magra puxados da avaliação de ${dataCurta(ult.data)}. Pode ajustar.`)
        : h('p', { class: 'nota', style: 'margin-top:0' }, 'Sem avaliação registrada: preencha peso e altura.'),
    h('div', { class: 'grade-medidas' },
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Equação'), selEq),
      inp('peso', 'Peso', 'kg'), inp('altura', 'Altura', 'cm'), inp('idade', 'Idade', 'anos'), inp('massaMagra', 'Massa magra', 'kg'),
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Fator de atividade'), selFa),
      inp('ajuste', 'Ajuste', 'kcal (− déficit / + superávit)'), inp('protG', 'Proteína', 'g/kg'), inp('gordPct', 'Gordura', '% do VET')),
    h('h3', { class: 'sub' }, 'Resultado'), resultado,
    h('details', { class: 'sub-det' }, h('summary', null, 'Comparar todas as equações'), comparacao),
    h('div', { class: 'linha-btn' }, salvar), msg));
  atualiza();
  const hist = doTipo('energia').reverse();
  if (hist.length) el.append(h('div', { class: 'bloco' }, h('h2', null, 'Cálculos salvos'), h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Data', 'Equação', 'TMB', 'GET', 'VET', ''].map(t => h('th', null, t)))),
    h('tbody', null, hist.map(r => h('tr', null, h('td', null, dataCurta(r.data)), h('td', null, EQUACOES_TMB[r.dados.equacao]?.nome.split(' ·')[0] || r.dados.equacao),
      h('td', null, fmtN(r.dados.resultado?.tmb, 0)), h('td', null, fmtN(r.dados.resultado?.get, 0)), h('td', null, h('b', null, fmtN(r.dados.resultado?.vet, 0))),
      h('td', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir este cálculo?')) { await apagaRegistro(r); render(); } } }, 'excluir')))))))));
}

/* ---------- exames ---------- */
const GRUPOS_EXAMES = [...new Set(EXAMES.map(e => e[5]))];
function abaExames(el) {
  const box = h('div');
  const abrir = (fn) => { box.replaceChildren(fn(() => { box.replaceChildren(); render(); })); box.scrollIntoView({ behavior: 'smooth' }); };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' },
    h('button', { class: 'btn pri', type: 'button', onclick: () => abrir(formResultados) }, '+ Lançar resultados'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => abrir(formPedido) }, 'Pedido de exames (PDF)')), box);
  const lista = doTipo('exame');
  if (!lista.length) { el.append(h('div', { class: 'bloco' }, h('p', { class: 'vazio' }, 'Nenhum resultado lançado ainda.'))); return; }
  const datas = lista.slice(-5);
  const usados = EXAMES.filter(e => datas.some(r => num(r.dados.valores?.[e[0]]) != null));
  const celula = (r, e) => {
    const v = num(r.dados.valores?.[e[0]]); if (v == null) return h('td', { class: 'vazia' }, '—');
    const st = statusExame(v, referencia(e[0], sexoF(), r.dados.refs?.[e[0]]));
    return h('td', { class: 'st-' + st, title: st === 'normal' ? 'dentro da referência' : st === 'alto' ? 'acima da referência' : 'abaixo da referência' },
      fmtN(v, v % 1 ? (v < 10 ? 2 : 1) : 0), st === 'alto' ? ' ↑' : st === 'baixo' ? ' ↓' : '');
  };
  const grafBox = h('div');
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Histórico'),
    h('p', { class: 'nota', style: 'margin-top:0' }, '↑ acima e ↓ abaixo da referência. Toque no nome do exame para ver a evolução.'),
    h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela exames' },
      h('thead', null, h('tr', null, h('th', null, 'Exame'), h('th', null, 'Referência'), datas.map(r => h('th', null, dataCurta(r.data))))),
      h('tbody', null, usados.map(e => h('tr', null,
        h('td', null, h('button', { class: 'link', type: 'button', onclick: () => {
          limpaGraficos();
          grafBox.replaceChildren(h('div', { class: 'graficos um' }, miniGrafico(`${e[1]} (${e[2]})`, lista.map(r => ({ data: r.data, v: num(r.dados.valores?.[e[0]]) })).filter(p => p.v != null), e[2], 2)));
          grafBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } }, e[1])),
        h('td', { class: 'ref' }, textoRef(referencia(e[0], sexoF()), e[2])),
        datas.map(r => celula(r, e))))))),
    grafBox));
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Lançamentos'), lista.slice().reverse().map(r => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, dataCurta(r.data)), r.dados.laboratorio ? ` · ${r.dados.laboratorio}` : '',
      h('div', { class: 'nota', style: 'margin:0' }, `${Object.values(r.dados.valores || {}).filter(v => num(v) != null).length} resultados`)),
    h('div', { class: 'acoes-linha' }, controleArea(r),
      r.arquivo ? h('button', { class: 'link', type: 'button', onclick: async () => { const u = await urlsAssinadas([r.arquivo]); if (u[r.arquivo]) window.open(u[r.arquivo], '_blank', 'noopener'); } }, 'abrir PDF') : null,
      r.arquivo && iaAtiva() ? h('button', { class: 'link ia', type: 'button', onclick: (ev) => lerExameComIA(r, ev.currentTarget, (sug) => abrir((fim) => formResultados(fim, r, sug))) }, '✦ ler com IA') : null,
      h('button', { class: 'link', type: 'button', onclick: () => abrir((fim) => formResultados(fim, r)) }, 'editar'),
      h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm(`Excluir os resultados de ${dataCurta(r.data)}${r.arquivo ? ' e o PDF anexado' : ''}?`)) { await apagaRegistro(r); render(); } } }, 'excluir'))))));
}

function formResultados(aoFim, reg, sug) {
  const dados = { laboratorio: reg?.dados.laboratorio || '', valores: { ...(reg?.dados.valores || {}) }, refs: JSON.parse(JSON.stringify(reg?.dados.refs || {})), outros: reg?.dados.outros || [] };
  // sugestão da IA (leitura do PDF): preenche o formulário para a nutri revisar antes de salvar
  if (sug) {
    if (sug.laboratorio && !dados.laboratorio) dados.laboratorio = sug.laboratorio;
    sug.resultados.forEach(x => {
      if (x.id === 'outro' || !exame(x.id)) { dados.outros.push({ nome: x.nome_no_laudo, valor: x.valor, unidade: x.unidade, refMin: x.ref_min, refMax: x.ref_max }); return; }
      dados.valores[x.id] = String(x.valor).replace('.', ',');
      const [pmin, pmax] = referencia(x.id, sexoF());
      if ((x.ref_min != null || x.ref_max != null) && (x.ref_min !== pmin || x.ref_max !== pmax)) dados.refs[x.id] = { min: x.ref_min, max: x.ref_max };
    });
  }
  const dataSug = sug && /^\d{4}-\d{2}-\d{2}$/.test(sug.data_coleta || '') && sug.data_coleta <= hoje() ? sug.data_coleta : null;
  const iData = h('input', { class: 'campo mini', type: 'date', value: dataSug || reg?.data || hoje(), max: hoje() });
  const iLab = h('input', { class: 'campo mini', value: dados.laboratorio, placeholder: 'Ex.: Fleury' });
  const iPdf = h('input', { type: 'file', accept: 'application/pdf', class: 'campo mini' });
  const msg = msgEl();
  const linhas = {};
  const linha = (e) => {
    const [id, nome, un] = e;
    const iv = h('input', { class: 'campo mini', inputmode: 'decimal', value: dados.valores[id] ?? '', 'aria-label': nome, readonly: id === 'homa' ? true : null, placeholder: id === 'homa' ? 'automático' : '' });
    const chip = h('span', { class: 'chip-st' });
    const rmin = h('input', { class: 'campo mini ref-in', inputmode: 'decimal', placeholder: 'mín', value: dados.refs[id]?.min ?? '', 'aria-label': `${nome}: referência mínima do laboratório` });
    const rmax = h('input', { class: 'campo mini ref-in', inputmode: 'decimal', placeholder: 'máx', value: dados.refs[id]?.max ?? '', 'aria-label': `${nome}: referência máxima do laboratório` });
    const pinta = () => {
      const st = statusExame(num(iv.value), referencia(id, sexoF(), dados.refs[id]));
      chip.className = 'chip-st ' + (st ? 'st-' + st : '');
      chip.textContent = st === 'alto' ? '↑ acima' : st === 'baixo' ? '↓ abaixo' : st === 'normal' ? '✓ ok' : '';
    };
    iv.addEventListener('input', () => { dados.valores[id] = iv.value; if (id === 'glicemia' || id === 'insulina') atualizaHoma(); pinta(); });
    const refIn = () => { const mi = num(rmin.value), ma = num(rmax.value); if (mi == null && ma == null) delete dados.refs[id]; else dados.refs[id] = { min: mi, max: ma }; pinta(); };
    rmin.addEventListener('input', refIn); rmax.addEventListener('input', refIn);
    linhas[id] = { iv, pinta };
    pinta();
    return h('div', { class: 'linha-res' },
      h('label', { class: 'res-nome' }, nome, h('small', null, `ref. ${textoRef(referencia(id, sexoF()), un)}`)),
      h('div', { class: 'res-val' }, iv, h('span', { class: 'unid-mini' }, un), chip),
      h('div', { class: 'res-ref' }, rmin, rmax));
  };
  function atualizaHoma() {
    const v = homaIR(num(dados.valores.glicemia), num(dados.valores.insulina));
    dados.valores.homa = v != null ? arred(v, 2) : '';
    if (linhas.homa) { linhas.homa.iv.value = v != null ? fmtN(v, 2) : ''; linhas.homa.pinta(); }
  }
  const grupos = GRUPOS_EXAMES.map((g, gi) => h('details', { class: 'sub-det', open: gi === 0 || EXAMES.some(e => e[5] === g && dados.valores[e[0]] != null && dados.valores[e[0]] !== '') ? true : null },
    h('summary', null, g), EXAMES.filter(e => e[5] === g).map(linha)));
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    const preenchidos = Object.entries(dados.valores).filter(([, v]) => num(v) != null);
    if (!preenchidos.length && !iPdf.files[0]) return avisa(msg, 'erro', 'Preencha pelo menos um resultado ou anexe o PDF.');
    salvar.disabled = true; salvar.textContent = 'Salvando…';
    try {
      let arquivo = reg?.arquivo || null;
      if (iPdf.files[0]) {
        if (iPdf.files[0].size > 15 * 1024 * 1024) throw new Error('O PDF passa de 15 MB.');
        const novo = await enviaArquivo(iPdf.files[0], 'pdf', 'application/pdf');
        if (arquivo) await supa.storage.from('arquivos').remove([arquivo]);
        arquivo = novo;
      }
      const valores = Object.fromEntries(preenchidos.map(([k, v]) => [k, num(v)]));
      await salvaRegistro('exame', iData.value || hoje(), { laboratorio: iLab.value.trim(), valores, refs: dados.refs, outros: dados.outros, revisadoIA: !!sug || reg?.dados.revisadoIA || undefined }, arquivo, reg?.id);
      aoFim();
    } catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; salvar.textContent = 'Salvar resultados'; }
  } }, 'Salvar resultados');
  return h('div', { class: 'bloco' },
    h('h2', null, reg ? `Resultados de ${dataCurta(reg.data)}` : 'Lançar resultados'),
    h('div', { class: 'grade-medidas' },
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Data da coleta'), iData),
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Laboratório'), iLab),
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, reg?.arquivo ? 'Trocar PDF do laudo' : 'PDF do laudo (opcional)'), iPdf)),
    sug ? blocoSugestaoIA(sug, dados.outros) : null,
    h('p', { class: 'nota' }, 'Referências gerais para adultos. Se o laudo trouxer outra faixa, preencha mín/máx ao lado: ela passa a valer para esse resultado.'),
    grupos,
    h('div', { class: 'linha-btn' }, salvar, h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
}

function formPedido(aoFim) {
  const marcados = new Set();
  const iOutros = h('textarea', { class: 'campo', style: 'min-height:70px;font-size:15px', placeholder: 'Outros exames, um por linha' });
  const iInd = h('input', { class: 'campo mini', placeholder: 'Ex.: avaliação nutricional, investigação de anemia' });
  const msg = msgEl();
  const grupos = GRUPOS_EXAMES.map(g => h('fieldset', { class: 'grupo-pedido' }, h('legend', null, g,
    h('button', { class: 'link', type: 'button', style: 'margin-left:8px;font-size:13px', onclick: (ev) => {
      const caixas = ev.currentTarget.closest('fieldset').querySelectorAll('input'); const todos = [...caixas].every(c => c.checked);
      caixas.forEach(c => { c.checked = !todos; c.dispatchEvent(new Event('change')); });
    } }, 'todos')),
    EXAMES.filter(e => e[5] === g && e[0] !== 'homa' && e[0] !== 'naoHdl').map(e => {
      const c = h('input', { type: 'checkbox' }); c.addEventListener('change', () => c.checked ? marcados.add(e[1]) : marcados.delete(e[1]));
      return h('label', { class: 'check' }, c, e[1]);
    })));
  const gera = async (botao, visualizar) => {
    const itens = [...marcados].concat(iOutros.value.split('\n').map(s => s.trim()).filter(Boolean));
    if (!itens.length) return avisa(msg, 'erro', 'Marque pelo menos um exame.');
    if (!perfil?.crn) avisa(msg, 'ok', 'Dica: cadastre seu CRN em Perfil para ele sair no pedido.');
    const janela = visualizar ? abreJanelaPDF() : null;
    botao.disabled = true;
    try { await gerarPedidoPDF(itens, iInd.value.trim(), janela); } catch (e) { janela?.close(); avisa(msg, 'erro', 'Não deu pra gerar o PDF. Verifique a internet.'); }
    botao.disabled = false;
  };
  const gerar = h('button', { class: 'btn pri', type: 'button', onclick: (ev) => gera(ev.currentTarget, true) }, 'Visualizar pedido');
  const baixarPedido = h('button', { class: 'btn sec', type: 'button', onclick: (ev) => gera(ev.currentTarget, false) }, 'Baixar PDF');
  return h('div', { class: 'bloco' }, h('h2', null, 'Pedido de exames'),
    h('div', { class: 'grupos-pedido' }, grupos),
    h('label', null, 'Outros exames'), iOutros,
    h('label', null, 'Indicação clínica (opcional)'), iInd,
    h('div', { class: 'linha-btn' }, gerar, baixarPedido, h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Fechar')),
    h('p', { class: 'nota' }, 'Para assinatura digital com validade jurídica, baixe o PDF e ', linkGovBr(), '.'), msg);
}

async function gerarPedidoPDF(itens, indicacao, janela) {
  const jsPDF = await carregaJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 20;
  const bordo = [54, 1, 5], suave = [120, 90, 90];
  doc.setFillColor(...bordo); doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(232, 229, 202); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('ëat', M, 17);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Solicitação de exames laboratoriais', W - M, 15, { align: 'right' });
  doc.setFillColor(255, 68, 22); doc.rect(W - 9, 26, 2.4, H - 26, 'F'); doc.rect(W - 5, 26, 2.4, H - 26, 'F');
  let y = 42;
  doc.setTextColor(...suave); doc.setFontSize(9); doc.text('PACIENTE', M, y);
  doc.setTextColor(...bordo); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(limpaPDF(F.paciente.nome || ''), M, y + 7);
  const i = idadeF();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...suave);
  doc.text([i != null ? `${i} anos` : null, F.paciente.nascimento ? `nasc. ${dataBR(F.paciente.nascimento)}` : null].filter(Boolean).join('  ·  '), M, y + 13);
  y += 26;
  if (indicacao) { doc.setTextColor(...suave); doc.setFontSize(9); doc.text('INDICAÇÃO CLÍNICA', M, y); doc.setTextColor(...bordo); doc.setFontSize(11);
    const l = doc.splitTextToSize(limpaPDF(indicacao), W - 2 * M - 8); doc.text(l, M, y + 6); y += 10 + l.length * 5; }
  doc.setTextColor(...suave); doc.setFontSize(9); doc.text('SOLICITO', M, y); y += 7;
  doc.setTextColor(...bordo); doc.setFontSize(11.5);
  itens.forEach(it => { if (y > H - 60) { doc.addPage(); y = 25; } doc.text('•  ' + limpaPDF(it), M + 2, y); y += 6.5; });
  const yA = Math.max(y + 20, H - 55);
  await assinaturaNoPDF(doc, M, yA, 80);
  doc.setDrawColor(...bordo); doc.line(M, yA, M + 80, yA);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(limpaPDF(perfil?.nome || ''), M, yA + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(limpaPDF(`Nutricionista${perfil?.crn ? ' · CRN ' + perfil.crn.replace(/^\s*crn[\s:-]*/i, '') : ''}`), M, yA + 11);
  doc.setTextColor(...suave); doc.text(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), W - M - 8, yA + 6, { align: 'right' });
  entregaPDF(doc, `pedido-exames-${slug(F.paciente.nome)}.pdf`, janela);
}

/* ---------- fotos ---------- */
const POSES = [['frente', 'Frente'], ['lado', 'Lado'], ['costas', 'Costas'], ['outra', 'Outra']];
async function abaFotos(el) {
  const fotos = doTipo('foto');
  const iData = h('input', { class: 'campo mini', type: 'date', value: hoje(), max: hoje() });
  const selPose = h('select', { class: 'campo mini' }, POSES.map(([k, r]) => h('option', { value: k }, r)));
  const iArq = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, class: 'campo mini' });
  const msg = msgEl();
  const enviar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    const arqs = [...iArq.files]; if (!arqs.length) return avisa(msg, 'erro', 'Escolha uma ou mais fotos.');
    enviar.disabled = true;
    try {
      for (let k = 0; k < arqs.length; k++) {
        enviar.textContent = `Enviando ${k + 1} de ${arqs.length}…`;
        const blob = await reduzImagem(arqs[k]);
        const caminho = await enviaArquivo(blob, 'jpg', 'image/jpeg');
        await salvaRegistro('foto', iData.value || hoje(), { pose: selPose.value }, caminho);
      }
      render();
    } catch (e) { avisa(msg, 'erro', /createImageBitmap|decode/i.test(e.message || '') ? 'Formato de imagem não suportado. Use JPG ou PNG.' : traduzErro(e)); enviar.disabled = false; enviar.textContent = 'Enviar fotos'; }
  } }, 'Enviar fotos');
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Adicionar fotos'),
    h('div', { class: 'grade-medidas' },
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Data'), iData),
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Posição'), selPose),
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Fotos'), iArq)),
    h('p', { class: 'nota' }, 'As fotos são reduzidas antes de enviar e ficam privadas: só você vê.'),
    h('div', { class: 'linha-btn' }, enviar), msg));
  if (!fotos.length) { el.append(h('div', { class: 'bloco' }, h('p', { class: 'vazio' }, 'Nenhuma foto ainda.'))); return; }
  if (iaAtiva()) el.append(blocoEstimativaFoto(fotos));
  const urls = await urlsAssinadas(fotos.map(f => f.arquivo).filter(Boolean));
  const porData = {}; fotos.forEach(f => (porData[f.data] = porData[f.data] || []).push(f));
  const datas = Object.keys(porData).sort();
  // comparar duas datas
  const selA = h('select', { class: 'campo mini' }, datas.map(d => h('option', { value: d }, dataCurta(d))));
  const selB = h('select', { class: 'campo mini' }, datas.map(d => h('option', { value: d, selected: d === datas[datas.length - 1] ? true : null }, dataCurta(d))));
  const comp = h('div', { class: 'comparar' });
  const desenhaComp = () => {
    const poses = POSES.map(p => p[0]).filter(p => (porData[selA.value] || []).some(f => f.dados.pose === p) || (porData[selB.value] || []).some(f => f.dados.pose === p));
    comp.replaceChildren(...poses.map(p => h('div', { class: 'comp-linha' },
      h('div', { class: 'comp-pose' }, POSES.find(x => x[0] === p)[1]),
      [selA.value, selB.value].map(d => { const f = (porData[d] || []).find(x => x.dados.pose === p);
        return h('figure', null, f && urls[f.arquivo] ? h('img', { src: urls[f.arquivo], alt: `${POSES.find(x => x[0] === p)[1]} em ${dataCurta(d)}`, loading: 'lazy' }) : h('div', { class: 'sem-foto' }, 'sem foto'),
          h('figcaption', null, dataCurta(d))); }))));
  };
  selA.addEventListener('change', desenhaComp); selB.addEventListener('change', desenhaComp);
  if (datas.length > 1) {
    el.append(h('div', { class: 'bloco' }, h('h2', null, 'Comparar'),
      h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Antes'), selA), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Depois'), selB)), comp));
    desenhaComp();
  }
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Galeria'), datas.slice().reverse().map(d => h('div', null,
    h('h3', { class: 'sub' }, dataCurta(d)),
    h('div', { class: 'galeria' }, porData[d].map(f => h('figure', null,
      urls[f.arquivo] ? h('a', { href: urls[f.arquivo], target: '_blank', rel: 'noopener' }, h('img', { src: urls[f.arquivo], alt: `${POSES.find(x => x[0] === f.dados.pose)?.[1] || 'Foto'} em ${dataCurta(d)}`, loading: 'lazy' })) : h('div', { class: 'sem-foto' }, 'indisponível'),
      h('figcaption', null, POSES.find(x => x[0] === f.dados.pose)?.[1] || '', ' ',
        h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir esta foto?')) { await apagaRegistro(f); render(); } } }, 'excluir')))))))));
}

/* ---------- dados da paciente ---------- */
function abaDados(el) {
  const p = F.paciente;
  el.append(blocoAcessoPaciente());
  const c = (rot, k, attrs = {}) => { const i = h('input', { class: 'campo', value: p[k] || '', ...attrs }); return [h('label', null, rot), i]; };
  const [lN, iN] = c('Nome', 'nome'), [lE, iE] = c('E-mail', 'email', { type: 'email' }), [lT, iT] = c('Telefone', 'telefone', { type: 'tel' });
  const [lD, iD] = c('Data de nascimento', 'nascimento', { type: 'date', max: hoje() });
  const selS = h('select', { class: 'campo' }, h('option', { value: 'F', selected: p.sexo !== 'M' ? true : null }, 'Feminino'), h('option', { value: 'M', selected: p.sexo === 'M' ? true : null }, 'Masculino'));
  const iO = h('textarea', { class: 'campo', style: 'min-height:90px;font-size:15px' }, p.observacoes || '');
  const msg = msgEl();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Dados da paciente'), h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    if (!iN.value.trim()) return avisa(msg, 'erro', 'O nome é obrigatório.');
    const novo = { nome: iN.value.trim(), email: iE.value.trim().toLowerCase(), telefone: iT.value.trim(), nascimento: iD.value || null, sexo: selS.value, observacoes: iO.value, atualizado_em: new Date().toISOString() };
    const { error } = await supa.from('pacientes').update(novo).eq('id', p.id);
    if (error) return avisa(msg, 'erro', traduzErro(error));
    Object.assign(F.paciente, novo); listaPacientes = null; avisa(msg, 'ok', 'Dados salvos.');
  } }, lN, iN, lE, iE, lT, iT, lD, iD, h('label', null, 'Sexo (usado nos cálculos)'), selS, h('label', null, 'Observações'), iO,
    h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:14px' }, 'Salvar'), msg)));
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Excluir paciente'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Apaga a ficha, avaliações, cálculos, exames e fotos. As anamneses continuam no painel, sem ficha.'),
    h('button', { class: 'btn sec', type: 'button', onclick: async () => {
      if (prompt(`Para confirmar, digite o nome da paciente: ${p.nome}`)?.trim().toLowerCase() !== (p.nome || '').trim().toLowerCase()) return;
      const arquivos = F.registros.map(r => r.arquivo).filter(Boolean);
      if (arquivos.length) await supa.storage.from('arquivos').remove(arquivos);
      const { error } = await supa.from('pacientes').delete().eq('id', p.id);
      if (error) return alert(traduzErro(error));
      F = null; listaPacientes = null; lista = null; location.hash = '';
    } }, 'Excluir paciente e todos os registros')));
}

/* ---------- nova paciente ---------- */
function telaNovaPaciente(palco) {
  const iN = h('input', { class: 'campo', autocomplete: 'off' }), iE = h('input', { class: 'campo', type: 'email' }), iT = h('input', { class: 'campo', type: 'tel' });
  const iD = h('input', { class: 'campo', type: 'date', max: hoje() });
  const selS = h('select', { class: 'campo' }, h('option', { value: 'F' }, 'Feminino'), h('option', { value: 'M' }, 'Masculino'));
  const msg = msgEl();
  palco.append(h('div', { class: 'painel auth' }, h('div', { style: 'margin-top:6px' }, h('a', { href: '#', class: 'link' }, '← voltar')),
    h('h1', null, 'Nova paciente'),
    h('div', { class: 'bloco' }, h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      if (!iN.value.trim()) return avisa(msg, 'erro', 'Informe o nome.');
      const { data, error } = await supa.from('pacientes').insert({ nutri_id: sessao.user.id, nome: iN.value.trim(), email: iE.value.trim().toLowerCase(), telefone: iT.value.trim(), nascimento: iD.value || null, sexo: selS.value }).select().single();
      if (error) return avisa(msg, 'erro', traduzErro(error));
      listaPacientes = null; F = null; location.hash = `#pac/${data.id}/resumo`;
    } }, h('label', null, 'Nome'), iN, h('label', null, 'Data de nascimento'), iD, h('label', null, 'Sexo'), selS,
      h('label', null, 'E-mail (opcional)'), iE, h('label', null, 'Telefone (opcional)'), iT,
      h('p', { class: 'nota' }, 'Com o mesmo e-mail, a anamnese que ela responder pelo link cai direto nesta ficha.'),
      h('button', { class: 'btn pri', type: 'submit', style: 'width:100%;margin-top:10px' }, 'Criar ficha'), msg))));
  setTimeout(() => iN.focus(), 50);
}
