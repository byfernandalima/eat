/* ëat · financeiro do consultório: lançamentos, resumo do mês, meta, previsão e recibos */

const CATEGORIAS_FIN = {
  receita: ['Consultas', 'Pacotes / acompanhamento', 'Avaliações', 'Materiais e cursos', 'Outros'],
  despesa: ['Aluguel / sala', 'Software e assinaturas', 'Marketing', 'Impostos e taxas', 'Materiais', 'Cursos e eventos', 'Outros']
};
const FORMAS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Transferência', 'Boleto'];
let finMes = new Date(); finMes.setDate(1);
const reais = (v) => (num(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// valor por extenso (reais e centavos) para o recibo
function porExtenso(valor) {
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = (n) => {
    if (n === 100) return 'cem';
    const p = [];
    if (n >= 100) { p.push(c[Math.floor(n / 100)]); n %= 100; }
    if (n >= 20) { p.push(d[Math.floor(n / 10)]); n %= 10; }
    if (n > 0) p.push(u[n]);
    return p.join(' e ');
  };
  const inteiro = (n) => {
    if (n === 0) return 'zero';
    const partes = [], mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), resto = n % 1000;
    if (mi) partes.push(ate999(mi) + (mi === 1 ? ' milhão' : ' milhões'));
    if (mil) partes.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
    if (resto) partes.push(ate999(resto));
    // "e" antes da última parte quando ela é < 100 ou centena redonda (ex.: mil e cem, dois mil e cinquenta)
    if (partes.length > 1 && (resto < 100 || resto % 100 === 0)) return partes.slice(0, -1).join(' ') + ' e ' + partes[partes.length - 1];
    return partes.join(' ');
  };
  const total = Math.round((num(valor) || 0) * 100), r = Math.floor(total / 100), ct = total % 100;
  const txtR = r ? `${inteiro(r)} ${r === 1 ? 'real' : (r % 1e6 === 0 ? 'de reais' : 'reais')}` : '';
  const txtC = ct ? `${ate999(ct)} ${ct === 1 ? 'centavo' : 'centavos'}` : '';
  return [txtR, txtC].filter(Boolean).join(' e ') || 'zero real';
}

async function telaFinanceiro(palco) {
  const wrap = h('div', { class: 'painel' }, h('p', { class: 'carregando' }, 'abrindo financeiro…'));
  palco.append(wrap);
  const ini = new Date(finMes.getFullYear(), finMes.getMonth(), 1), fim = new Date(finMes.getFullYear(), finMes.getMonth() + 1, 1);
  const seis = new Date(finMes.getFullYear(), finMes.getMonth() - 5, 1);
  const [lan, hist, prev, pacs] = await Promise.all([
    supa.from('financeiro').select('*').gte('data', isoDia(ini)).lt('data', isoDia(fim)).order('data', { ascending: false }),
    supa.from('financeiro').select('tipo, valor, data, pago').gte('data', isoDia(seis)).lt('data', isoDia(fim)),
    supa.from('agenda').select('valor, inicio, status').eq('categoria', 'consulta').gte('inicio', new Date().toISOString()).lt('inicio', fim.toISOString()).in('status', ['agendada', 'confirmada']),
    agendaPacientes ? { data: agendaPacientes } : supa.from('pacientes').select('id, nome, telefone, cpf').order('nome')
  ]);
  if (lan.error) { wrap.replaceChildren(h('p', { class: 'form-msg erro' }, traduzErro(lan.error))); return; }
  agendaPacientes = pacs.data || [];
  const L = lan.data || [];
  const soma = (f) => L.filter(f).reduce((s, x) => s + num(x.valor), 0);
  const receb = soma(x => x.tipo === 'receita' && x.pago), desp = soma(x => x.tipo === 'despesa' && x.pago);
  const aReceber = soma(x => x.tipo === 'receita' && !x.pago), aPagar = soma(x => x.tipo === 'despesa' && !x.pago);
  const previsto = (prev.data || []).reduce((s, x) => s + num(x.valor), 0);
  const meta = num(perfil?.meta_mensal) || 0;
  const card = (t, v, s, cls) => h('div', { class: 'ind ' + (cls || '') }, h('small', null, t), h('b', null, v), h('span', null, s || ''));
  const mover = (n) => { finMes = new Date(finMes.getFullYear(), finMes.getMonth() + n, 1); render(); };
  // histórico de 6 meses (tabela)
  const meses = [...Array(6)].map((_, k) => new Date(seis.getFullYear(), seis.getMonth() + k, 1));
  const linhaMes = (m) => { const chave = isoDia(m).slice(0, 7); const xs = (hist.data || []).filter(x => x.data.startsWith(chave) && x.pago);
    const r = xs.filter(x => x.tipo === 'receita').reduce((s, x) => s + num(x.valor), 0), dd = xs.filter(x => x.tipo === 'despesa').reduce((s, x) => s + num(x.valor), 0);
    return h('tr', null, h('td', null, m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })), h('td', null, reais(r)), h('td', null, reais(dd)), h('td', { class: r - dd < 0 ? 'st-baixo' : '' }, reais(r - dd))); };
  const filtro = { tipo: '' };
  const listaBox = h('div');
  const desenhaLista = () => {
    const xs = L.filter(x => !filtro.tipo || x.tipo === filtro.tipo);
    listaBox.replaceChildren(...(xs.length ? xs.map(x => h('div', { class: 'linha-exame fin-' + x.tipo },
      h('div', null, h('b', null, `${x.tipo === 'receita' ? '+' : '−'} ${reais(x.valor)}`), ' ', x.descricao,
        h('div', { class: 'nota', style: 'margin:0' }, [dataBR(x.data), x.categoria, x.forma, x.pago ? (x.tipo === 'receita' ? 'recebido' : 'pago') : (x.tipo === 'receita' ? '⏳ a receber' : '⏳ a pagar'), x.recibo ? `recibo nº ${x.recibo}` : null].filter(Boolean).join(' · '))),
      h('div', { class: 'acoes-linha' },
        !x.pago ? h('button', { class: 'link', type: 'button', onclick: async () => { await supa.from('financeiro').update({ pago: true }).eq('id', x.id); render(); } }, x.tipo === 'receita' ? 'recebido' : 'pago') : null,
        x.tipo === 'receita' && x.pago ? h('button', { class: 'link', type: 'button', onclick: () => emitirRecibo(x, abreJanelaPDF()).catch(e => alert(e.message)) }, 'recibo') : null,
        h('button', { class: 'link', type: 'button', onclick: () => formLancamento(x) }, 'editar'),
        h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir este lançamento?')) { await supa.from('financeiro').delete().eq('id', x.id); render(); } } }, 'excluir'))))
      : [h('p', { class: 'vazio' }, 'Nenhum lançamento neste mês.')]));
  };
  const filtroBtn = (v, rot) => h('button', { type: 'button', class: filtro.tipo === v ? 'on' : '', onclick: (e) => { filtro.tipo = v; e.currentTarget.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); desenhaLista(); } }, rot);
  const iMeta = h('input', { class: 'campo mini', inputmode: 'decimal', value: meta || '', placeholder: 'Ex.: 8000', style: 'max-width:140px' });
  wrap.replaceChildren(
    h('div', { style: 'margin-top:6px' }, h('a', { href: '#', class: 'link' }, '← pacientes')),
    h('div', { class: 'cabeca-lista', style: 'margin:8px 0 12px' }, h('h1', { style: 'margin:0' }, 'Financeiro'),
      h('div', { class: 'linha-btn', style: 'margin:0 0 0 auto' },
        h('button', { class: 'btn pri', type: 'button', onclick: () => formLancamento({ tipo: 'receita' }) }, '+ Receita'),
        h('button', { class: 'btn sec', type: 'button', onclick: () => formLancamento({ tipo: 'despesa' }) }, '+ Despesa'))),
    h('div', { class: 'agenda-barra' }, h('div', { class: 'agenda-nav' }, h('button', { type: 'button', 'aria-label': 'Mês anterior', onclick: () => mover(-1) }, '‹'),
      h('button', { type: 'button', onclick: () => { finMes = new Date(); finMes.setDate(1); render(); } }, 'Este mês'), h('button', { type: 'button', 'aria-label': 'Próximo mês', onclick: () => mover(1) }, '›')),
      h('b', { class: 'agenda-titulo' }, finMes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))),
    h('div', { class: 'indicadores' },
      card('Recebido', reais(receb), `${L.filter(x => x.tipo === 'receita' && x.pago).length} lançamentos`),
      card('Despesas', reais(desp), aPagar ? `+ ${reais(aPagar)} a pagar` : 'pagas no mês'),
      card('Saldo', reais(receb - desp), 'recebido − despesas', receb - desp < 0 ? 'negativo' : ''),
      card('A receber', reais(aReceber), 'lançado e não recebido'),
      card('Previsto na agenda', reais(previsto), `${(prev.data || []).length} consultas até o fim do mês`)),
    h('div', { class: 'bloco' }, h('h2', null, 'Meta do mês'),
      meta ? h('div', { class: 'meta-barra', role: 'img', 'aria-label': `Meta: ${reais(receb)} de ${reais(meta)}` },
        h('i', { style: `width:${Math.min(100, receb / meta * 100)}%` }), h('i', { class: 'prev', style: `width:${Math.min(100 - Math.min(100, receb / meta * 100), previsto / meta * 100)}%` })) : null,
      meta ? h('p', { class: 'nota' }, `${reais(receb)} recebidos de ${reais(meta)} (${fmtN(receb / meta * 100, 0)}%). Com o previsto na agenda, chega a ${fmtN((receb + previsto) / meta * 100, 0)}%.`) : h('p', { class: 'nota', style: 'margin-top:0' }, 'Defina uma meta de faturamento mensal para acompanhar aqui.'),
      h('div', { class: 'linha-btn', style: 'align-items:center' }, iMeta, h('button', { class: 'btn sec', type: 'button', onclick: async () => {
        const v = num(iMeta.value) || 0; const { error } = await supa.from('perfis').update({ meta_mensal: v }).eq('id', sessao.user.id);
        if (error) return alert(traduzErro(error)); perfil.meta_mensal = v; render(); } }, 'Salvar meta'))),
    h('div', { class: 'bloco' }, h('div', { class: 'cabeca-lista' }, h('h2', { style: 'margin:0' }, 'Lançamentos'),
      h('div', { class: 'abas', style: 'margin:0 0 0 auto' }, filtroBtn('', 'Todos'), filtroBtn('receita', 'Receitas'), filtroBtn('despesa', 'Despesas'))), listaBox),
    h('div', { class: 'bloco' }, h('h2', null, 'Últimos 6 meses'), h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Mês', 'Recebido', 'Despesas', 'Saldo'].map(t => h('th', null, t)))), h('tbody', null, meses.map(linhaMes))))));
  desenhaLista();
}

function formLancamento(x) {
  const tipo = x.tipo;
  const iDesc = h('input', { class: 'campo mini', value: x.descricao || '', placeholder: tipo === 'receita' ? 'Ex.: Consulta · Ana' : 'Ex.: Aluguel da sala' });
  const selCat = h('select', { class: 'campo mini' }, CATEGORIAS_FIN[tipo].map(c => h('option', { selected: c === x.categoria ? true : null }, c)));
  const iVal = h('input', { class: 'campo mini', inputmode: 'decimal', value: x.valor != null ? String(x.valor).replace('.', ',') : '' });
  const iData = h('input', { class: 'campo mini', type: 'date', value: x.data || isoDia(new Date()) });
  const selForma = h('select', { class: 'campo mini' }, h('option', { value: '' }, '—'), FORMAS.map(f => h('option', { selected: f === x.forma ? true : null }, f)));
  const selPac = h('select', { class: 'campo mini' }, h('option', { value: '' }, '— nenhuma —'), (agendaPacientes || []).map(p => h('option', { value: p.id, selected: p.id === x.paciente_id ? true : null }, p.nome)));
  const cPago = h('input', { type: 'checkbox', checked: x.pago === false ? null : true });
  const cRep = h('input', { type: 'checkbox' }); const iRep = h('input', { class: 'campo mini', inputmode: 'numeric', value: '12', style: 'max-width:70px' });
  const msg = msgEl();
  const campo = (rot, el, largo) => h('div', { class: 'mini-campo' + (largo ? ' largo' : '') }, h('label', { class: 'mini-rot' }, rot), el);
  const fechar = modal(`${x.id ? 'Editar' : 'Nova'} ${tipo}`,
    h('div', { class: 'grade-medidas' }, campo('Descrição', iDesc, true), campo('Valor (R$)', iVal), campo('Data', iData), campo('Categoria', selCat, true), campo('Forma de pagamento', selForma),
      tipo === 'receita' ? campo('Paciente', selPac, true) : null),
    h('label', { class: 'check' }, cPago, tipo === 'receita' ? 'Já recebido' : 'Já pago'),
    !x.id ? h('label', { class: 'check' }, cRep, 'Repetir todo mês por ', iRep, ' meses (ex.: aluguel, pacote mensal)') : null,
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async (ev) => {
      const valor = num(iVal.value);
      if (!iDesc.value.trim() || valor == null || valor < 0) return avisa(msg, 'erro', 'Preencha descrição e valor.');
      const base = { nutri_id: sessao.user.id, tipo, descricao: iDesc.value.trim(), categoria: selCat.value, valor, data: iData.value, pago: cPago.checked, forma: selForma.value, paciente_id: tipo === 'receita' ? (selPac.value || null) : null };
      ev.currentTarget.disabled = true;
      let error;
      if (x.id) ({ error } = await supa.from('financeiro').update(base).eq('id', x.id));
      else {
        const n = cRep.checked ? Math.max(1, Math.min(36, num(iRep.value) || 1)) : 1;
        const [a, m, d] = iData.value.split('-').map(Number);
        const linhas = [...Array(n)].map((_, k) => { const dt = new Date(a, m - 1 + k, Math.min(d, new Date(a, m + k, 0).getDate())); return { ...base, data: isoDia(dt), pago: k === 0 ? base.pago : false }; });
        ({ error } = await supa.from('financeiro').insert(linhas));
      }
      if (error) { ev.currentTarget.disabled = false; return avisa(msg, 'erro', traduzErro(error)); }
      fechar(); render();
    } }, 'Salvar')), msg);
}

async function emitirRecibo(x, janela) {
  let numero = x.recibo;
  if (!numero) {
    const { data } = await supa.from('financeiro').select('recibo').not('recibo', 'is', null).order('recibo', { ascending: false }).limit(1);
    numero = (data?.[0]?.recibo || 0) + 1;
    const { error } = await supa.from('financeiro').update({ recibo: numero }).eq('id', x.id);
    if (error) throw error;
    x.recibo = numero;
  }
  const pac = (agendaPacientes || []).find(p => p.id === x.paciente_id);
  const jsPDF = await carregaJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = await cabecalhoTimbrado(doc);
  const M = 20, W = 210;
  doc.setTextColor(54, 1, 5); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(`RECIBO Nº ${String(numero).padStart(4, '0')}`, M, y + 6);
  doc.setFontSize(16); doc.text(limpaPDF(reais(x.valor)), W - M, y + 6, { align: 'right' });
  y += 20;
  const corpo = `Recebi de ${pac?.nome || x.descricao}${pac?.cpf ? `, CPF ${pac.cpf}` : ''}, a importância de ${reais(x.valor)} (${porExtenso(x.valor)}), referente a ${x.descricao || x.categoria}${x.forma ? `, pago via ${x.forma.toLowerCase()}` : ''}.`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
  const linhas = doc.splitTextToSize(limpaPDF(corpo), W - 2 * M - 6); doc.text(linhas, M, y); y += linhas.length * 6.5 + 8;
  const quitacao = 'Para clareza e como prova de quitação, firmo o presente recibo.';
  doc.text(limpaPDF(quitacao), M, y); y += 14;
  const cidade = (perfil?.endereco || '').split(/[,–-]/).map(s => s.trim()).filter(Boolean).pop() || '';
  doc.text(limpaPDF(`${cidade ? cidade + ', ' : ''}${new Date(x.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.`), M, y);
  y = Math.max(y + 34, 200);
  await assinaturaNoPDF(doc, M, y, 80);
  doc.setDrawColor(54, 1, 5); doc.line(M, y, M + 80, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(limpaPDF(perfil?.nome || ''), M, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(limpaPDF(['Nutricionista', perfil?.crn ? 'CRN ' + perfil.crn.replace(/^\s*crn[\s:-]*/i, '') : null, perfil?.documento ? 'CPF/CNPJ ' + perfil.documento : null].filter(Boolean).join(' · ')), M, y + 11);
  rodapeTimbrado(doc);
  entregaPDF(doc, `recibo-${String(numero).padStart(4, '0')}-${slug(pac?.nome || x.descricao)}.pdf`, janela);
  if (document.querySelector('#palco')) render();
}
