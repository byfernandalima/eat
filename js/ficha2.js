/* ëat · ficha: abas Infantil (OMS) e Gestação (curvas brasileiras) */

const idadeEmDias = (nasc, dataIso) => nasc && dataIso ? Math.round((new Date(dataIso + 'T12:00:00') - new Date(nasc + 'T12:00:00')) / 86400000) : null;
function idadeTexto(dias) {
  if (dias == null) return '—';
  const a = Math.floor(dias / 365.25), m = Math.floor((dias - a * 365.25) / 30.4375);
  if (a === 0) return m === 0 ? `${dias} dias` : `${m} ${m === 1 ? 'mês' : 'meses'}`;
  return `${a} ${a === 1 ? 'ano' : 'anos'}${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`;
}
const fmtZ = (z) => z == null ? '—' : (z > 0 ? '+' : z < 0 ? '−' : '') + fmtN(Math.abs(z), 2);

// gráfico com curvas de referência (linhas tracejadas) + pontos da paciente; um só eixo y
function graficoCurvas(titulo, refs, pontos, eixoX, un, opcoes = {}) {
  const wrap = h('div', { class: 'grafico grande' }, h('div', { class: 'g-tit' }, titulo));
  const legenda = h('div', { class: 'g-legenda' }, ...refs.map(r => h('span', null, h('i', { class: r.fill ? 'leg-faixa' : 'leg-linha' + (r.forte ? ' forte' : '') }), r.nome)),
    h('span', null, h('i', { class: 'leg-ponto' }), opcoes.nomePaciente || 'Paciente'));
  const canvas = h('canvas', { role: 'img', 'aria-label': `${titulo}. Medidas: ` + (pontos.map(p => `${fmtN(p.x, 1)} ${eixoX}: ${fmtN(p.y, 1)} ${un}`).join('; ') || 'nenhuma') });
  wrap.append(legenda, h('div', { class: 'g-area alta' }, canvas));
  requestAnimationFrame(() => {
    if (!window.Chart || !canvas.isConnected) return;
    const ds = refs.map(r => ({ type: 'line', data: r.dados, borderColor: r.forte ? '#70774F' : 'rgba(112,119,79,.55)', borderWidth: r.forte ? 2 : 1.5,
      borderDash: r.forte ? [] : [6, 4], pointRadius: 0, pointHoverRadius: 0, fill: r.fill ?? false, backgroundColor: r.fundo || 'transparent', tension: 0.2, label: r.nome, order: 2 }));
    ds.push({ type: 'line', data: pontos, label: opcoes.nomePaciente || 'Paciente', borderColor: '#360105', borderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
      pointBackgroundColor: '#360105', pointBorderColor: '#F3F1E2', pointBorderWidth: 2, tension: 0, order: 1 });
    graficos.push(new Chart(canvas, {
      data: { datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#360105', titleColor: '#E8E5CA', bodyColor: '#fff',
          filter: (it) => it.datasetIndex === ds.length - 1,
          callbacks: { title: (it) => it[0] ? `${fmtN(it[0].parsed.x, 1)} ${eixoX}` : '', label: (c) => `${fmtN(c.parsed.y, 1)} ${un}` } } },
        scales: { x: { type: 'linear', min: opcoes.xMin, max: opcoes.xMax, title: { display: true, text: eixoX, color: 'rgba(54,1,5,.6)' }, grid: { color: 'rgba(54,1,5,.06)' }, ticks: { color: 'rgba(54,1,5,.6)' } },
          y: { title: { display: true, text: un, color: 'rgba(54,1,5,.6)' }, grid: { color: 'rgba(54,1,5,.08)' }, border: { display: false }, ticks: { color: 'rgba(54,1,5,.6)' } } } }
    }));
  });
  return wrap;
}

/* ============ INFANTIL ============ */
const INDICADORES_INF = [
  ['imc', 'IMC para a idade', 'kg/m²'], ['estatura', 'Estatura para a idade', 'cm'], ['peso', 'Peso para a idade', 'kg'], ['pc', 'Perímetro cefálico', 'cm']
];
function abaInfantil(el) {
  const nasc = F.paciente.nascimento;
  if (!nasc) { el.append(h('div', { class: 'bloco' }, h('p', { class: 'form-msg erro' }, 'Para a avaliação infantil, cadastre a data de nascimento na aba Dados.'))); return; }
  const diasHoje = idadeEmDias(nasc, hoje());
  const lista = doTipo('infantil');
  const box = h('div');
  el.append(h('div', { class: 'bloco', style: 'margin-top:0' },
    h('p', { style: 'margin:0' }, h('b', null, 'Idade hoje: '), idadeTexto(diasHoje)),
    h('p', { class: 'nota', style: 'margin:4px 0 0' }, 'Referências: Padrões de Crescimento da OMS 2006 (0–5 anos) e Referência OMS 2007 (5–19 anos). Classificação conforme o Ministério da Saúde (SISVAN).')),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: () => { box.replaceChildren(formInfantil(null, () => { box.replaceChildren(); render(); })); box.scrollIntoView({ behavior: 'smooth' }); } }, '+ Nova medida')), box);
  if (!lista.length) { el.append(h('div', { class: 'bloco' }, h('p', { class: 'vazio' }, 'Nenhuma medida ainda.'))); return; }
  const aval = lista.map(r => ({ r, dias: idadeEmDias(nasc, r.data), a: avaliaCrianca(r.dados, sexoF(), idadeEmDias(nasc, r.data)) }));
  const ult = aval[aval.length - 1];
  el.append(h('div', { class: 'bloco' }, h('h2', null, `Última medida · ${dataCurta(ult.r.data)} (${idadeTexto(ult.dias)})`), cartoesInfantil(ult.a)));
  // gráficos: faixa etária conforme as medidas
  const maxDias = Math.max(...aval.map(x => x.dias)), minDias = Math.min(...aval.map(x => x.dias));
  // até 5 anos: 0–5; depois: 5–19; se cruzar os 5 anos, mostra de 0 até ~3 anos além da última medida
  const [ini, fim] = maxDias <= 1826 ? [0, 1826] : minDias >= 1826 ? [1826, 6940] : [0, Math.min(6940, Math.ceil((maxDias + 3 * 365.25) / 365.25) * 365.25)];
  const grafs = h('div', { class: 'graficos largo' });
  INDICADORES_INF.forEach(([ind, nome, un]) => {
    const tab = ind; let i0 = ini, i1 = fim;
    if (ind === 'peso') { i1 = Math.min(fim, 3653); if (i0 >= i1) return; }
    if (ind === 'pc') { if (ini >= 1826) return; i1 = 1826; }
    const pts = aval.map(({ r, dias, a }) => {
      const v = ind === 'imc' ? a.imc : ind === 'estatura' ? num(r.dados.estatura) : ind === 'peso' ? num(r.dados.peso) : num(r.dados.pc);
      return v != null && dias >= i0 && dias <= i1 ? { x: dias / 365.25, y: v } : null;
    }).filter(Boolean);
    if (!pts.length) return;
    const passo = (i1 - i0) > 3000 ? 91.3 : 30.4375;
    grafs.append(graficoCurvas(`${nome} (${sexoF() === 'M' ? 'meninos' : 'meninas'})`, [
      { nome: 'z +2', dados: curvaReferencia(tab, sexoF(), 2, i0, i1, passo) },
      { nome: 'Mediana (z 0)', dados: curvaReferencia(tab, sexoF(), 0, i0, i1, passo), forte: true },
      { nome: 'z −2', dados: curvaReferencia(tab, sexoF(), -2, i0, i1, passo) }
    ], pts, 'anos', un, { xMin: Math.round(i0 / 365.25), xMax: Math.round(i1 / 365.25) }));
  });
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Curvas de crescimento'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Linhas: mediana e ±2 escores-z da OMS. Pontos: medidas da paciente.'), grafs));
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Histórico'), h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Data', 'Idade', 'Peso', 'Estatura', 'IMC', 'z IMC/I', 'z E/I', ''].map(t => h('th', null, t)))),
    h('tbody', null, aval.slice().reverse().map(({ r, dias, a }) => {
      const z = (ind) => a.itens.find(i => i.ind === ind);
      const cel = (it) => it ? h('td', { class: it.alerta ? 'st-alto' : '' , title: it.classe }, fmtZ(it.z)) : h('td', { class: 'vazia' }, '—');
      return h('tr', null, h('td', null, dataCurta(r.data)), h('td', null, idadeTexto(dias)), h('td', null, fmtN(num(r.dados.peso), 2)),
        h('td', null, fmtN(num(r.dados.estatura))), h('td', null, a.imc ? fmtN(a.imc) : '—'), cel(z('imc')), cel(z('estatura')),
        h('td', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm(`Excluir a medida de ${dataCurta(r.data)}?`)) { await apagaRegistro(r); render(); } } }, 'excluir')));
    }))))));
}
function cartoesInfantil(a) {
  if (!a.itens.length) return h('p', { class: 'nota' }, a.avisos.join(' ') || 'Preencha peso e estatura.');
  return h('div', null, h('div', { class: 'cartoes-z' }, a.itens.map(i => h('div', { class: 'cz' + (i.alerta ? ' alerta' : '') },
    h('small', null, i.nome), h('b', null, `${fmtN(i.valor, i.un === 'kg' ? 2 : 1)} ${i.un}`),
    h('span', { class: 'cz-z' }, `z ${fmtZ(i.z)} · P${fmtN(i.p, 0)}`),
    h('span', { class: 'cz-classe' }, i.alerta ? '⚠ ' : '✓ ', i.classe)))),
    a.avisos.length ? h('p', { class: 'nota' }, a.avisos.join(' ')) : null);
}
function formInfantil(reg, aoFim) {
  const nasc = F.paciente.nascimento;
  const d = { peso: '', estatura: '', pc: '', posicao: '' };
  const iData = h('input', { class: 'campo mini', type: 'date', value: hoje(), max: hoje(), min: nasc });
  const res = h('div', { 'aria-live': 'polite' }), msg = msgEl();
  const selPos = h('select', { class: 'campo mini' }, h('option', { value: 'deitado' }, 'Deitada (comprimento)'), h('option', { value: 'em_pe' }, 'Em pé (estatura)'));
  const ajustaPos = () => { const dias = idadeEmDias(nasc, iData.value); if (!d.posicao) selPos.value = dias < 731 ? 'deitado' : 'em_pe'; };
  selPos.addEventListener('change', () => { d.posicao = selPos.value; atualiza(); });
  const inp = (k, rot, un) => { const [l, i] = campoNum(rot, '', { un }); i.addEventListener('input', () => { d[k] = i.value; atualiza(); }); return h('div', { class: 'mini-campo' }, l, i); };
  function atualiza() {
    ajustaPos();
    const dias = idadeEmDias(nasc, iData.value);
    if (dias == null || dias < 0) { res.replaceChildren(h('p', { class: 'form-msg erro' }, 'A data é anterior ao nascimento.')); return; }
    res.replaceChildren(h('p', { class: 'nota', style: 'margin:0 0 8px' }, `Idade na medida: ${idadeTexto(dias)}`), cartoesInfantil(avaliaCrianca({ ...d, posicao: selPos.value }, sexoF(), dias)));
  }
  iData.addEventListener('change', atualiza);
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    if (!num(d.peso) && !num(d.estatura)) return avisa(msg, 'erro', 'Informe peso ou estatura.');
    salvar.disabled = true;
    try { await salvaRegistro('infantil', iData.value || hoje(), { peso: num(d.peso), estatura: num(d.estatura), pc: num(d.pc), posicao: selPos.value }); aoFim(); }
    catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, 'Salvar medida');
  const box = h('div', { class: 'bloco' }, h('h2', null, 'Nova medida'),
    h('div', { class: 'grade-medidas' },
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Data'), iData),
      inp('peso', 'Peso', 'kg'), inp('estatura', 'Comprimento/estatura', 'cm'),
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Como foi medida'), selPos),
      inp('pc', 'Perímetro cefálico', 'cm (até 5 anos)')),
    h('h3', { class: 'sub' }, 'Resultado'), res,
    h('div', { class: 'linha-btn' }, salvar, h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
  atualiza();
  return box;
}

/* ============ GESTAÇÃO ============ */
function gestacaoAtual() { const g = doTipo('gestacao_info'); return g[g.length - 1] || null; }
function abaGestacao(el) {
  const info = gestacaoAtual();
  const box = h('div');
  const abrirInfo = () => { box.replaceChildren(formGestacaoInfo(info, () => { box.replaceChildren(); render(); })); box.scrollIntoView({ behavior: 'smooth' }); };
  if (!info) {
    el.append(h('div', { class: 'bloco', style: 'margin-top:0' }, h('h2', null, 'Acompanhamento gestacional'),
      h('p', { class: 'nota', style: 'margin-top:0' }, 'Use as curvas brasileiras de ganho de peso gestacional (Kac et al., 2021), as mesmas da Caderneta da Gestante.'),
      h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: abrirInfo }, 'Iniciar acompanhamento'))), box);
    return;
  }
  const g = info.dados;
  const imcPre = g.pesoPre && g.altura ? g.pesoPre / (g.altura / 100) ** 2 : null;
  const cat = categoriaGestacional(imcPre), ref = GESTACAO[cat];
  const igHoje = idadeGestacional(hoje(), g.dum, g.dpp);
  const dpp = g.dpp || (g.dum ? new Date(new Date(g.dum + 'T12:00:00').getTime() + 280 * 86400000).toISOString().slice(0, 10) : null);
  const tri = trimestre(igHoje?.semanas);
  const medidas = doTipo('gestacao').filter(r => r.data >= (g.dum || '0000')).map(r => {
    const ig = idadeGestacional(r.data, g.dum, g.dpp); const ganho = num(r.dados.peso) - g.pesoPre;
    const fx = ig ? faixaGestacional(cat, ig.decimal) : null;
    const st = fx && ig.decimal >= 10 ? (ganho < fx.min ? 'abaixo' : ganho > fx.max ? 'acima' : 'dentro') : null;
    return { r, ig, ganho, fx, st };
  });
  const card = (tit, val, sub) => h('div', { class: 'ind' }, h('small', null, tit), h('b', null, val), h('span', null, sub || ''));
  const ultima = medidas[medidas.length - 1];
  el.append(h('div', { class: 'indicadores', style: 'margin-top:0' },
    card('Idade gestacional', igHoje ? `${igHoje.semanas}s ${igHoje.resto}d` : '—', tri ? `${tri}º trimestre · DPP ${dpp ? dataCurta(dpp) : '—'}` : 'fora do período'),
    card('IMC pré-gestacional', imcPre ? fmtN(imcPre) : '—', ref ? ref.nome.split(' (')[0] : ''),
    card('Meta até 40 semanas', ref ? ref.total : '—', ref ? `ganho total · ${ref.percentis}` : ''),
    card('Ganho atual', ultima ? `${ultima.ganho >= 0 ? '+' : '−'}${fmtN(Math.abs(ultima.ganho))} kg` : '—',
      ultima?.st ? (ultima.st === 'dentro' ? '✓ dentro da faixa' : ultima.st === 'acima' ? '↑ acima da faixa' : '↓ abaixo da faixa') : 'sem medida'),
    card('Energia adicional', tri ? `+${ADICIONAL_GESTACAO[tri]} kcal` : '—', 'por dia, somar ao GET (DRI 2005)')));
  const boxMedida = h('div');
  el.append(h('div', { class: 'linha-btn' },
    h('button', { class: 'btn pri', type: 'button', onclick: () => { boxMedida.replaceChildren(formGestacaoMedida(g, cat, () => { boxMedida.replaceChildren(); render(); })); boxMedida.scrollIntoView({ behavior: 'smooth' }); } }, '+ Registrar peso'),
    h('button', { class: 'btn sec', type: 'button', onclick: abrirInfo }, 'Editar dados da gestação')), box, boxMedida);
  if (!cat) { el.append(h('p', { class: 'form-msg erro' }, 'Falta peso pré-gestacional ou altura para definir a curva.')); return; }
  // gráfico: faixa recomendada (entre as linhas) + pontos
  const sem = []; for (let w = 10; w <= 40; w += 0.5) sem.push(w);
  const pts = medidas.filter(m => m.ig && m.ig.decimal >= 10).map(m => ({ x: m.ig.decimal, y: m.ganho }));
  el.append(h('div', { class: 'bloco' }, h('h2', null, `Ganho de peso · ${ref.nome}`),
    h('div', { class: 'graficos um' }, graficoCurvas('Ganho de peso acumulado', [
      { nome: `Limite superior (${ref.percentis.split('–')[1]})`, dados: sem.map(w => ({ x: w, y: faixaGestacional(cat, w).max })) },
      { nome: `Faixa recomendada (${ref.percentis})`, dados: sem.map(w => ({ x: w, y: faixaGestacional(cat, w).min })), fill: '-1', fundo: 'rgba(192,222,90,.45)', forte: true }
    ], pts, 'semanas', 'kg', { xMin: 10, xMax: 40, nomePaciente: 'Ganho da paciente' })),
    h('p', { class: 'nota' }, 'Curvas brasileiras de ganho de peso gestacional (Kac et al., Am J Clin Nutr 2021), adotadas na Caderneta da Gestante 2022. As curvas começam na 10ª semana. Valores semanais lidos das curvas oficiais (precisão ≈ 0,3 kg); os totais em 40 semanas são os publicados.')));
  if (medidas.length) el.append(h('div', { class: 'bloco' }, h('h2', null, 'Evolução por semana'), h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Data', 'IG', 'Peso', 'Ganho', 'Faixa para a IG', 'Situação', ''].map(t => h('th', null, t)))),
    h('tbody', null, medidas.slice().reverse().map(m => h('tr', null,
      h('td', null, dataCurta(m.r.data)), h('td', null, m.ig ? `${m.ig.semanas}s ${m.ig.resto}d` : '—'), h('td', null, fmtN(num(m.r.dados.peso))),
      h('td', null, `${m.ganho >= 0 ? '+' : '−'}${fmtN(Math.abs(m.ganho))}`), h('td', null, m.fx && m.ig.decimal >= 10 ? `${fmtN(m.fx.min)} a ${fmtN(m.fx.max)} kg` : 'antes da 10ª semana'),
      h('td', { class: m.st && m.st !== 'dentro' ? 'st-alto' : '' }, m.st === 'dentro' ? '✓ dentro' : m.st === 'acima' ? '↑ acima' : m.st === 'abaixo' ? '↓ abaixo' : '—'),
      h('td', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir este registro?')) { await apagaRegistro(m.r); render(); } } }, 'excluir')))))))));
}
function formGestacaoInfo(info, aoFim) {
  const g = info?.dados || {};
  const an = F.anamneses[0]?.respostas || {};
  const ant = doTipo('antropometria'); const ultA = ant[ant.length - 1]?.dados || {};
  const iDum = h('input', { class: 'campo mini', type: 'date', value: g.dum || an.dum || '', max: hoje() });
  const iDpp = h('input', { class: 'campo mini', type: 'date', value: g.dpp || '' });
  const [lP, iP] = campoNum('Peso pré-gestacional', g.pesoPre ?? an.pesoUsual ?? '', { un: 'kg' });
  const [lA, iA] = campoNum('Altura', g.altura ?? ultA.altura ?? an.altura ?? '', { un: 'cm' });
  const msg = msgEl();
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    const dados = { dum: iDum.value || null, dpp: iDpp.value || null, pesoPre: num(iP.value), altura: num(iA.value) };
    if (!dados.dum && !dados.dpp) return avisa(msg, 'erro', 'Informe a DUM ou a data provável do parto.');
    if (!dados.pesoPre || !dados.altura) return avisa(msg, 'erro', 'Informe peso pré-gestacional e altura.');
    salvar.disabled = true;
    try { await salvaRegistro('gestacao_info', hoje(), dados, null, info?.id); aoFim(); }
    catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, 'Salvar');
  return h('div', { class: 'bloco' }, h('h2', null, info ? 'Dados da gestação' : 'Iniciar acompanhamento'),
    h('div', { class: 'grade-medidas' },
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'DUM (última menstruação)'), iDum),
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'ou DPP (pelo ultrassom)'), iDpp),
      h('div', { class: 'mini-campo' }, lP, iP), h('div', { class: 'mini-campo' }, lA, iA)),
    h('p', { class: 'nota' }, 'Se informar as duas datas, a idade gestacional usa a DUM. Peso e altura vêm da anamnese/avaliação quando existem.'),
    h('div', { class: 'linha-btn' }, salvar, h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
}
function formGestacaoMedida(g, cat, aoFim) {
  const iData = h('input', { class: 'campo mini', type: 'date', value: hoje(), max: hoje(), min: g.dum || null });
  const [lP, iP] = campoNum('Peso', '', { un: 'kg' });
  const res = h('div', { 'aria-live': 'polite' }), msg = msgEl();
  const atualiza = () => {
    const ig = idadeGestacional(iData.value, g.dum, g.dpp), peso = num(iP.value);
    if (!ig) { res.replaceChildren(h('p', { class: 'nota' }, 'Data fora do período da gestação.')); return; }
    const fx = faixaGestacional(cat, ig.decimal);
    const ganho = peso ? peso - g.pesoPre : null;
    const st = fx && ganho != null ? (ganho < fx.min ? '↓ abaixo da faixa' : ganho > fx.max ? '↑ acima da faixa' : '✓ dentro da faixa') : '';
    res.replaceChildren(h('div', { class: 'resumo' },
      h('div', null, h('small', null, 'Idade gestacional'), h('b', null, `${ig.semanas}s ${ig.resto}d`), h('span', null, `${trimestre(ig.semanas)}º trimestre`)),
      h('div', null, h('small', null, 'Ganho acumulado'), h('b', null, ganho != null ? `${ganho >= 0 ? '+' : '−'}${fmtN(Math.abs(ganho))} kg` : '—'), h('span', null, st)),
      h('div', null, h('small', null, 'Faixa para a IG'), h('b', null, fx ? `${fmtN(fx.min)} a ${fmtN(fx.max)}` : '—'), h('span', null, fx ? 'kg' : 'a partir da 10ª semana'))));
  };
  iData.addEventListener('change', atualiza); iP.addEventListener('input', atualiza);
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    if (!num(iP.value)) return avisa(msg, 'erro', 'Informe o peso.');
    salvar.disabled = true;
    try { await salvaRegistro('gestacao', iData.value || hoje(), { peso: num(iP.value) }); aoFim(); }
    catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, 'Salvar peso');
  atualiza();
  return h('div', { class: 'bloco' }, h('h2', null, 'Registrar peso'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Data'), iData), h('div', { class: 'mini-campo' }, lP, iP)),
    res, h('div', { class: 'linha-btn' }, salvar, h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
}
