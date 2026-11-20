/* ëat · funções de IA na ficha: leitura de laudo, avaliação integrada e estimativa por foto.
   Tudo passa pela Edge Function "ia" no Supabase (a chave da Anthropic nunca vem para o navegador). */

// liga/desliga em js/config.js (iaAtiva). Desligada: nenhum botão, aba ou chamada de IA aparece.
const iaAtiva = () => window.EAT_CONFIG?.iaAtiva === true;

async function chamaIA(acao, corpo) {
  if (!iaAtiva()) throw new Error('As funções de IA estão desativadas.');
  const { data, error } = await supa.functions.invoke('ia', { body: { acao, ...corpo } });
  if (error) {
    let txt = '';
    try { txt = (await error.context?.json())?.erro; } catch (_) {}
    throw new Error(txt || (/Failed to send|fetch/i.test(error.message) ? 'Não consegui falar com o servidor de IA. A função "ia" foi publicada no Supabase?' : error.message));
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}
const listaIA = (acao) => doTipo('ia').filter(r => r.dados?.acao === acao).reverse();
const avisoIA = () => h('p', { class: 'nota aviso-ia' }, '✦ Gerado por IA (Claude) como apoio à decisão. Confira com seu julgamento clínico antes de usar.');
function carregandoIA(el, txt) {
  const box = h('div', { class: 'carregando-ia', role: 'status' }, h('span', { class: 'pontinhos', 'aria-hidden': 'true' }, h('i'), h('i')), txt);
  el.replaceChildren(box); return box;
}

/* ---------- 1. ler PDF do laudo ---------- */
async function lerExameComIA(reg, botao, aoTerminar) {
  const rot = botao.textContent;
  botao.disabled = true; botao.textContent = 'lendo o laudo… (até 1 min)';
  try {
    const catalogo = EXAMES.filter(e => e[0] !== 'homa' && e[0] !== 'naoHdl').map(([id, nome, unidade]) => ({ id, nome, unidade }));
    const r = await chamaIA('ler_exame', { registroId: reg.id, catalogo });
    aoTerminar(r.resultado);
  } catch (e) { alert(e.message); }
  finally { botao.disabled = false; botao.textContent = rot; }
}
function blocoSugestaoIA(sug, outros) {
  const n = sug.resultados.filter(x => x.id !== 'outro' && exame(x.id)).length;
  return h('div', { class: 'sugestao-ia' },
    h('b', null, `✦ A IA leu o laudo e preencheu ${n} resultado${n === 1 ? '' : 's'}. Revise antes de salvar.`),
    sug.pontos_revisao?.length ? h('ul', null, sug.pontos_revisao.map(p => h('li', null, p))) : null,
    outros.length ? h('details', null, h('summary', null, `${outros.length} exame${outros.length === 1 ? '' : 's'} fora do catálogo (vão salvos junto)`),
      h('ul', null, outros.map(o => h('li', null, `${o.nome}: ${fmtN(o.valor, o.valor % 1 ? 2 : 0)} ${o.unidade || ''}${o.refMin != null || o.refMax != null ? ` (ref. ${o.refMin ?? '…'}–${o.refMax ?? '…'})` : ''}`)))) : null);
}

/* ---------- 2. avaliação integrada ---------- */
function materiaisDisponiveis() {
  const m = [];
  F.anamneses.forEach(a => m.push({ tipo: 'anamnese', id: a.id, rot: `Anamnese · ${new Date(a.criado_em).toLocaleDateString('pt-BR')}` }));
  const nomes = { antropometria: 'Antropometria', exame: 'Exames', energia: 'Gasto energético', infantil: 'Medida infantil', gestacao_info: 'Dados da gestação', gestacao: 'Peso gestacional' };
  Object.keys(nomes).forEach(t => doTipo(t).slice().reverse().forEach(r => m.push({ tipo: t, id: r.id, rot: `${nomes[t]} · ${dataCurta(r.data)}` })));
  return m;
}
// indicadores já calculados no navegador, para a IA não recalcular errado
function resumosParaIA(selecionados) {
  const linhas = [];
  selecionados.forEach(s => {
    const r = F.registros.find(x => x.id === s.id);
    if (!r) return;
    if (r.tipo === 'antropometria') {
      const c = calculaAntropometria(r.dados, sexoF(), idadeF());
      linhas.push(`Antropometria ${r.data}: IMC ${fmtN(c.imc)} (${c.imcClasse}); %G ${c.gordura != null ? fmtN(c.gordura) + '% por ' + c.protocoloNome : 'não calculado'}; massa magra ${c.massaMagra != null ? fmtN(c.massaMagra) + ' kg' : '—'}; cintura: ${c.cinturaRisco || '—'}; RCQ ${c.rcq ? fmtN(c.rcq, 2) + ' (' + c.rcqRisco + ')' : '—'}.`);
    } else if (r.tipo === 'exame') {
      const itens = Object.entries(r.dados.valores || {}).map(([k, v]) => {
        const e = exame(k); const st = statusExame(num(v), referencia(k, sexoF(), r.dados.refs?.[k]));
        return e ? `${e[1]} ${v} ${e[2]} (${st === 'normal' ? 'dentro da referência' : st === 'alto' ? 'ACIMA' : 'ABAIXO'})` : null;
      }).filter(Boolean);
      linhas.push(`Exames ${r.data}: ${itens.join('; ')}.`);
    } else if (r.tipo === 'infantil' && F.paciente.nascimento) {
      const a = avaliaCrianca(r.dados, sexoF(), idadeEmDias(F.paciente.nascimento, r.data));
      linhas.push(`Medida infantil ${r.data}: ${a.itens.map(i => `${i.nome} z ${fmtZ(i.z)} (${i.classe})`).join('; ')}.`);
    }
  });
  return linhas.join('\n');
}
function mostraIntegrada(reg) {
  const r = reg.dados.resultado || {};
  const lista = (tit, itens) => itens?.length ? [h('h3', { class: 'sub' }, tit), h('ul', { class: 'lista-ia' }, itens.map(i => h('li', null, i)))] : null;
  return h('div', { class: 'bloco resultado-ia' },
    h('div', { class: 'cabeca-lista' }, h('h2', null, `Avaliação integrada · ${dataCurta(reg.data)}`),
      h('button', { class: 'link', type: 'button', style: 'margin-left:auto', onclick: async () => { if (confirm('Excluir esta análise?')) { await apagaRegistro(reg); render(); } } }, 'excluir')),
    h('p', { class: 'nota', style: 'margin-top:4px' }, `${reg.dados.materiais?.length || 0} materiais analisados`),
    h('p', { class: 'sintese' }, r.sintese || ''),
    lista('Achados principais', r.achados), lista('Relações entre os dados', r.relacoes),
    lista('Sugestões de conduta', r.condutas), lista('Para investigar', r.investigar),
    r.limitacoes ? h('p', { class: 'nota' }, h('b', null, 'Limitações: '), r.limitacoes) : null,
    avisoIA());
}
function abaIntegrada(el) {
  const mats = materiaisDisponiveis();
  const marcados = new Set();
  const status = h('div'), msg = msgEl();
  const contador = h('span', { class: 'nota' }, '0 de 5 selecionados');
  const gerar = h('button', { class: 'btn pri', type: 'button', disabled: true, onclick: async () => {
    const sel = mats.filter(m => marcados.has(m.id));
    gerar.disabled = true; msg.textContent = '';
    carregandoIA(status, 'Cruzando os materiais… pode levar até 2 minutos.');
    try {
      const r = await chamaIA('avaliacao_integrada', { pacienteId: F.paciente.id, materiais: sel.map(({ tipo, id }) => ({ tipo, id })), resumos: resumosParaIA(sel) });
      F.registros.push(r.registro); render();
    } catch (e) { status.replaceChildren(); avisa(msg, 'erro', e.message); gerar.disabled = false; }
  } }, '✦ Gerar avaliação integrada');
  const caixas = mats.map(m => {
    const c = h('input', { type: 'checkbox' });
    c.addEventListener('change', () => {
      if (c.checked && marcados.size >= 5) { c.checked = false; avisa(msg, 'erro', 'Escolha no máximo 5 materiais.'); return; }
      c.checked ? marcados.add(m.id) : marcados.delete(m.id); msg.textContent = '';
      contador.textContent = `${marcados.size} de 5 selecionados`; gerar.disabled = !marcados.size;
    });
    return h('label', { class: 'check' }, c, m.rot);
  });
  el.append(h('div', { class: 'bloco', style: 'margin-top:0' }, h('h2', null, '✦ Avaliação integrada'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Escolha até 5 materiais. A IA cruza as informações e devolve uma análise de apoio à conduta: síntese, achados, relações entre os dados, sugestões e o que investigar.'),
    mats.length ? h('div', { class: 'materiais' }, caixas) : h('p', { class: 'vazio' }, 'Ainda não há materiais: registre anamnese, avaliação ou exames primeiro.'),
    h('div', { class: 'linha-btn', style: 'align-items:center' }, gerar, contador), status, msg));
  listaIA('avaliacao_integrada').forEach(r => el.append(mostraIntegrada(r)));
}

/* ---------- 3. estimativa corporal por foto ---------- */
function blocoEstimativaFoto(fotos) {
  const porData = {}; fotos.forEach(f => (porData[f.data] = porData[f.data] || []).push(f));
  const datas = Object.keys(porData).sort().reverse();
  const sel = h('select', { class: 'campo mini' }, datas.map(d => h('option', { value: d }, `${dataCurta(d)} · ${porData[d].length} foto${porData[d].length > 1 ? 's' : ''}`)));
  const status = h('div'), msg = msgEl();
  const ant = doTipo('antropometria'); const ultA = ant[ant.length - 1];
  const botao = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    const escolhidas = porData[sel.value].slice(0, 3);
    botao.disabled = true; msg.textContent = '';
    carregandoIA(status, 'Analisando as fotos…');
    const contexto = [`sexo ${sexoF() === 'M' ? 'masculino' : 'feminino'}`, idadeF() != null ? `${idadeF()} anos` : null,
      ultA ? `peso ${ultA.dados.peso} kg e altura ${ultA.dados.altura} cm em ${ultA.data}` : null].filter(Boolean).join(', ');
    try { const r = await chamaIA('estimativa_foto', { fotoIds: escolhidas.map(f => f.id), contexto }); F.registros.push(r.registro); render(); }
    catch (e) { status.replaceChildren(); avisa(msg, 'erro', e.message); botao.disabled = false; }
  } }, '✦ Estimar com IA');
  const historico = listaIA('estimativa_foto').map(reg => {
    const r = reg.dados.resultado || {};
    return h('div', { class: 'estimativa' },
      h('div', { class: 'cabeca-lista' }, h('b', null, dataCurta(reg.data)),
        h('button', { class: 'link', type: 'button', style: 'margin-left:auto', onclick: async () => { if (confirm('Excluir esta estimativa?')) { await apagaRegistro(reg); render(); } } }, 'excluir')),
      h('div', { class: 'est-faixa' }, r.gordura_min != null ? `${fmtN(r.gordura_min, 0)}% a ${fmtN(r.gordura_max, 0)}% de gordura` : 'Não foi possível estimar',
        h('span', null, ` · confiança ${r.confianca || 'baixa'}`)),
      r.observacoes?.length ? h('ul', { class: 'lista-ia' }, r.observacoes.map(o => h('li', null, o))) : null,
      r.limitacoes ? h('p', { class: 'nota' }, r.limitacoes) : null);
  });
  return h('div', { class: 'bloco' }, h('h2', null, '✦ Estimativa corporal por foto'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Estimativa visual de baixa precisão, em faixa. Não substitui dobras cutâneas nem bioimpedância. Usa até 3 fotos da data escolhida (frente, lado e costas funcionam melhor).'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Fotos de'), sel)),
    h('div', { class: 'linha-btn' }, botao), status, msg, historico, historico.length ? avisoIA() : null);
}
