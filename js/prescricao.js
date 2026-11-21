/* ëat · prescrições da paciente (suplementos, fórmulas, orientações) e PDFs do plano */

/* ============ aba Prescrições ============ */
async function abaPrescricoes(el) {
  try { await carregaBiblioteca(); } catch (e) { el.append(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
  const box = h('div');
  const abrir = (fn) => { box.replaceChildren(fn(() => { box.replaceChildren(); render(); })); box.scrollIntoView({ behavior: 'smooth' }); };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' },
    h('button', { class: 'btn pri', type: 'button', onclick: () => abrir((fim) => formSuplementos(null, fim)) }, '+ Suplementos / fórmulas'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => abrir(formOrientacaoPaciente) }, '+ Orientação')), box);
  const sups = doTipo('suplementos').slice().reverse();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Suplementos e fórmulas'), sups.length ? sups.map(r => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, dataCurta(r.data)), h('div', { class: 'nota', style: 'margin:0' }, r.dados.itens.map(i => i.nome || 'Fórmula manipulada').join(' · '))),
    h('div', { class: 'acoes-linha' },
      h('button', { class: 'link', type: 'button', onclick: () => { const w = abreJanelaPDF(); gerarReceituarioPDF(r, w).catch(e => { w?.close(); alert(e.message); }); } }, 'visualizar'),
      h('button', { class: 'link', type: 'button', onclick: () => gerarReceituarioPDF(r).catch(e => alert(e.message)) }, 'baixar'),
      controleArea(r, () => gerarReceituarioPDF(r, { blob: true })),
      linkGovBr(),
      h('button', { class: 'link', type: 'button', onclick: () => abrir((fim) => formSuplementos(r, fim)) }, 'editar'),
      h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir esta prescrição?')) { await apagaRegistro(r); render(); } } }, 'excluir'))))
    : h('p', { class: 'vazio' }, 'Nenhuma prescrição de suplementos.')));
  const ors = doTipo('orientacao').slice().reverse();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Orientações da paciente'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Entram no PDF do plano quando você marcar na hora de gerar.'),
    ors.length ? ors.map(r => h('div', { class: 'linha-exame' },
      h('div', null, h('b', null, r.dados.titulo), h('div', { class: 'nota', style: 'margin:0' }, `${dataCurta(r.data)}${r.dados.categoria ? ' · ' + r.dados.categoria : ''}`)),
      h('div', { class: 'acoes-linha' }, controleArea(r),
        h('button', { class: 'link', type: 'button', onclick: () => abrir((fim) => formOrientacao({ titulo: r.dados.titulo, categoria: r.dados.categoria, dados: r.dados, arquivo: r.arquivo }, async (v) => { await salvaRegistro('orientacao', r.data, { titulo: v.titulo, categoria: v.categoria, texto: v.texto, video: v.video }, v.arquivo, r.id); fim(); }, 'paciente')) }, 'editar'),
        h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir esta orientação?')) { await apagaRegistro(r); render(); } } }, 'excluir'))))
      : h('p', { class: 'vazio' }, 'Nenhuma orientação ainda.')));
}
function formOrientacaoPaciente(aoFim) {
  const modelos = bibTipo('orientacao');
  const sel = h('select', { class: 'campo mini' }, h('option', { value: '' }, 'Em branco'), modelos.map(m => h('option', { value: m.id }, m.titulo)));
  const area = h('div');
  const monta = () => {
    const m = modelos.find(x => x.id === sel.value);
    area.replaceChildren(formOrientacao(m ? { titulo: m.titulo, categoria: m.categoria, dados: m.dados } : null, async (v) => {
      let arquivo = v.arquivo;
      if (!arquivo && m?.arquivo) { // copia a imagem do modelo para a pasta da paciente
        const { data } = await supa.storage.from('arquivos').download(m.arquivo);
        if (data) arquivo = await enviaArquivo(data, 'jpg', 'image/jpeg');
      }
      await salvaRegistro('orientacao', hoje(), { titulo: v.titulo, categoria: v.categoria, texto: v.texto, video: v.video }, arquivo);
      aoFim();
    }, 'paciente'));
  };
  sel.addEventListener('change', monta); monta();
  return h('div', null, h('div', { class: 'bloco' }, h('h2', null, 'Nova orientação'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Partir de um modelo da biblioteca'), sel)),
    modelos.length ? null : h('p', { class: 'nota' }, 'Dica: na Biblioteca → Orientações dá para importar 6 modelos prontos.')), area);
}

/* ---------- suplementos e fórmulas ---------- */
function formSuplementos(reg, aoFim) {
  const itens = clona(reg?.dados.itens || []);
  const farmacias = bibTipo('farmacia'), formulas = bibTipo('formula');
  const lista = h('div'), msg = msgEl();
  const iObs = h('textarea', { class: 'campo', style: 'min-height:60px;font-size:15px', placeholder: 'Observações gerais (opcional)' }, reg?.dados.observacoes || '');
  const desenha = () => lista.replaceChildren(...itens.map((it, i) => {
    const campo = (k, rot, ph, largo) => { const x = h('input', { class: 'campo mini', value: it[k] || '', placeholder: ph || '' }); x.addEventListener('input', () => it[k] = x.value); return h('div', { class: 'mini-campo' + (largo ? ' largo' : '') }, h('label', { class: 'mini-rot' }, rot), x); };
    const remover = h('button', { class: 'link', type: 'button', onclick: () => { itens.splice(i, 1); desenha(); } }, 'remover');
    if (it.tipo === 'manipulado') {
      const selF = h('select', { class: 'campo mini' }, h('option', { value: '' }, 'Sem farmácia indicada'), farmacias.map(f => h('option', { value: f.id, selected: f.id === it.farmaciaId ? true : null }, f.titulo)));
      selF.addEventListener('change', () => it.farmaciaId = selF.value);
      return h('div', { class: 'presc-item' }, h('div', { class: 'cabeca-lista' }, h('b', null, `${i + 1}. Fórmula manipulada`), h('span', { style: 'margin-left:auto' }, remover)),
        formFormulaEmbutida(it), h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Farmácia'), selF), campo('duracao', 'Duração', 'Ex.: 60 dias')));
    }
    return h('div', { class: 'presc-item' }, h('div', { class: 'cabeca-lista' }, h('b', null, `${i + 1}. Suplemento`), h('span', { style: 'margin-left:auto' }, remover)),
      h('div', { class: 'grade-medidas' }, campo('nome', 'Suplemento', 'Ex.: Creatina monohidratada', true), campo('dose', 'Dose', 'Ex.: 3 g'), campo('posologia', 'Como tomar', 'Ex.: 1x ao dia, com água', true), campo('duracao', 'Duração', 'Ex.: contínuo'), campo('obs', 'Observação', '', true)));
  }));
  const selModelo = h('select', { class: 'campo mini' }, h('option', { value: '' }, '+ Fórmula a partir de modelo…'), formulas.map(f => h('option', { value: f.id }, f.titulo)));
  selModelo.addEventListener('change', () => { const f = formulas.find(x => x.id === selModelo.value); if (f) { itens.push({ tipo: 'manipulado', nome: f.titulo, ...clona(f.dados) }); desenha(); } selModelo.value = ''; });
  desenha();
  return h('div', { class: 'bloco' }, h('h2', null, reg ? 'Editar prescrição' : 'Prescrição de suplementos'), lista,
    h('div', { class: 'linha-btn' },
      h('button', { class: 'btn sec', type: 'button', onclick: () => { itens.push({ tipo: 'industrializado' }); desenha(); } }, '+ Suplemento'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => { itens.push({ tipo: 'manipulado', nome: '', componentes: [{ ativo: '', dose: '', unidade: 'mg' }], forma: 'cápsulas', quantidade: '30 doses', posologia: '' }); desenha(); } }, '+ Fórmula manipulada'),
      formulas.length ? selModelo : null),
    h('label', null, 'Observações'), iObs,
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async (ev) => {
      const validos = itens.filter(i => i.tipo === 'manipulado' ? (i.componentes || []).some(c => c.ativo?.trim()) : i.nome?.trim());
      if (!validos.length) return avisa(msg, 'erro', 'Inclua pelo menos um suplemento ou fórmula.');
      ev.currentTarget.disabled = true;
      try { await salvaRegistro('suplementos', reg?.data || hoje(), { itens: validos, observacoes: iObs.value }, null, reg?.id); aoFim(); }
      catch (e) { avisa(msg, 'erro', traduzErro(e)); ev.currentTarget.disabled = false; }
    } }, 'Salvar prescrição'), h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
}
function formFormulaEmbutida(it) {
  it.componentes = it.componentes || [];
  const box = h('div');
  const desenha = () => box.replaceChildren(...it.componentes.map((c, i) => {
    const a = h('input', { class: 'campo mini', value: c.ativo || '', placeholder: 'Ativo' }), d = h('input', { class: 'campo mini', value: c.dose || '', placeholder: 'Dose' });
    const u = h('select', { class: 'campo mini' }, ['mg', 'mcg', 'g', 'UI', 'UFC', 'ml', '%'].map(x => h('option', { selected: x === c.unidade ? true : null }, x)));
    a.addEventListener('input', () => c.ativo = a.value); d.addEventListener('input', () => c.dose = d.value); u.addEventListener('change', () => c.unidade = u.value);
    return h('div', { class: 'comp-linha' }, a, d, u, h('button', { class: 'link', type: 'button', 'aria-label': 'Remover ativo', onclick: () => { it.componentes.splice(i, 1); desenha(); } }, '×'));
  }), h('button', { class: 'link', type: 'button', onclick: () => { it.componentes.push({ ativo: '', dose: '', unidade: 'mg' }); desenha(); } }, '+ ativo'));
  const campo = (k, rot) => { const x = h('input', { class: 'campo mini', value: it[k] || '' }); x.addEventListener('input', () => it[k] = x.value); return h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, rot), x); };
  desenha();
  return h('div', null, box, h('div', { class: 'grade-medidas' }, campo('forma', 'Forma'), campo('quantidade', 'Quantidade'), campo('posologia', 'Posologia')));
}

/* ============ PDFs ============ */
// "CRN-3 12345" ou "CRN7-17656" viram "CRN 3 12345" / "CRN 7-17656", sem repetir a sigla
const textoCRN = () => perfil?.crn ? 'CRN ' + perfil.crn.replace(/^\s*crn[\s:-]*/i, '') : '';
const COR_PDF = { bordo: [54, 1, 5], coral: [255, 94, 70], laranja: [255, 68, 22], lima: [192, 222, 90], creme: [232, 229, 202], suave: [120, 90, 90] };
function novoDocPDF(jsPDF, subtitulo) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18;
  const ctx = { doc, W, H, M, y: 0, larg: W - 2 * M - 8 };
  ctx.cabecalho = () => {
    doc.setFillColor(...COR_PDF.bordo); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(...COR_PDF.creme); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('ëat', M, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(subtitulo, W - M, 12, { align: 'right' });
    doc.setFontSize(9); doc.text(limpaPDF(F.paciente.nome || ''), W - M, 18, { align: 'right' });
    doc.setFillColor(...COR_PDF.laranja); doc.rect(W - 9, 26, 2.4, H - 26, 'F'); doc.rect(W - 5, 26, 2.4, H - 26, 'F');
    ctx.y = 38;
  };
  ctx.garante = (alt) => { if (ctx.y + alt > H - 20) { doc.addPage(); ctx.cabecalho(); } };
  ctx.titulo = (txt, cor = COR_PDF.coral) => {
    ctx.garante(16);
    doc.setFillColor(...COR_PDF.creme); doc.roundedRect(M, ctx.y - 6, ctx.larg, 10, 2, 2, 'F');
    doc.setFillColor(...cor); doc.rect(M, ctx.y - 6, 2.2, 10, 'F');
    doc.setTextColor(...COR_PDF.bordo); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.text(limpaPDF(txt), M + 6, ctx.y + 0.8);
    ctx.y += 11;
  };
  ctx.texto = (txt, { tam = 10.5, cor = COR_PDF.bordo, negrito = false, recuo = 0, espaco = 1.5 } = {}) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(...cor);
    const linhas = doc.splitTextToSize(limpaPDF(txt), ctx.larg - recuo);
    const alt = tam * 0.42;
    linhas.forEach(l => { ctx.garante(alt + 1); doc.text(l, M + recuo, ctx.y); ctx.y += alt; });
    ctx.y += espaco;
  };
  ctx.rodape = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...COR_PDF.suave);
      doc.text(limpaPDF(`${perfil?.nome || ''}${textoCRN() ? ' · ' + textoCRN() : ''}`), M, H - 9); doc.text(`${i} / ${n}`, W - M - 8, H - 9, { align: 'right' }); }
  };
  ctx.cabecalho();
  return ctx;
}
async function imagemDataURL(caminho) {
  const u = await urlsAssinadas([caminho]); if (!u[caminho]) return null;
  const blob = await (await fetch(u[caminho])).blob();
  return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
}

/* ---------- opções do PDF do plano ---------- */
function abrePDFPlano(reg, paraArea) {
  let resolve, reject; const promessa = new Promise((ok, erro) => { resolve = ok; reject = erro; });
  const ors = doTipo('orientacao');
  const marc = new Set(ors.map(o => o.id));
  const cK = h('input', { type: 'checkbox' }), cL = h('input', { type: 'checkbox', checked: reg.dados.metodo === 'alimentos' ? true : null, disabled: reg.dados.metodo !== 'alimentos' ? true : null });
  const cR = h('input', { type: 'checkbox', checked: true });
  const iDias = h('input', { class: 'campo mini', inputmode: 'numeric', value: '7', style: 'max-width:70px' });
  const msg = msgEl();
  const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Gerar PDF do plano' }, h('div', { class: 'modal-caixa bloco' },
    h('h2', null, paraArea ? 'Enviar para a área da paciente' : 'PDF para a paciente'),
    paraArea ? h('p', { class: 'nota', style: 'margin-top:0' }, 'Ela vai ver este PDF na área dela. Se você mudar o plano depois, toque em "atualizar".') : null,
    h('label', { class: 'check' }, cK, 'Mostrar calorias e macronutrientes'),
    h('label', { class: 'check' }, cR, 'Incluir receitas usadas no plano'),
    h('label', { class: 'check' }, cL, 'Incluir lista de compras para ', iDias, ' dias'),
    ors.length ? h('div', null, h('h3', { class: 'sub' }, 'Orientações'), ors.map(o => { const c = h('input', { type: 'checkbox', checked: true }); c.addEventListener('change', () => c.checked ? marc.add(o.id) : marc.delete(o.id)); return h('label', { class: 'check' }, c, o.dados.titulo); })) : null,
    h('div', { class: 'linha-btn' },
      paraArea ? h('button', { class: 'btn pri', type: 'button', onclick: (ev) => gera(ev.currentTarget, 'area') }, 'Enviar para a paciente') : null,
      h('button', { class: paraArea ? 'btn sec' : 'btn pri', type: 'button', onclick: (ev) => gera(ev.currentTarget, true) }, 'Visualizar'),
      paraArea ? null : h('button', { class: 'btn sec', type: 'button', onclick: (ev) => gera(ev.currentTarget, false) }, 'Baixar PDF'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => { dlg.remove(); if (paraArea) reject(new Error('cancelado')); } }, 'Cancelar')), msg));
  async function gera(botao, visualizar) {
    if (visualizar === 'area') {
      const rot = botao.textContent; botao.disabled = true; botao.textContent = 'Gerando…';
      try { const blob = await gerarPlanoPDF(reg, { kcal: cK.checked, receitas: cR.checked, lista: cL.checked ? Math.max(1, num(iDias.value) || 7) : 0, orientacoes: ors.filter(o => marc.has(o.id)), janela: { blob: true } }); dlg.remove(); resolve(blob); }
      catch (e) { avisa(msg, 'erro', 'Não deu para gerar o PDF: ' + e.message); botao.disabled = false; botao.textContent = rot; }
      return;
    }
    const janela = visualizar ? abreJanelaPDF() : null;
    const rot = botao.textContent; botao.disabled = true; botao.textContent = 'Gerando…';
    try { await gerarPlanoPDF(reg, { kcal: cK.checked, receitas: cR.checked, lista: cL.checked ? Math.max(1, num(iDias.value) || 7) : 0, orientacoes: ors.filter(o => marc.has(o.id)), janela }); dlg.remove(); }
    catch (e) { janela?.close(); avisa(msg, 'erro', 'Não deu para gerar o PDF: ' + e.message); botao.disabled = false; botao.textContent = rot; }
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) { dlg.remove(); if (paraArea) reject(new Error('cancelado')); } });
  document.body.append(dlg);
  return promessa;
}

async function gerarPlanoPDF(reg, op) {
  const jsPDF = await carregaJsPDF();
  const D = reg.dados, c = novoDocPDF(jsPDF, 'Plano alimentar'), doc = c.doc;
  c.texto(D.titulo || 'Plano alimentar', { tam: 18, negrito: true, espaco: 0.5 });
  c.texto(`${METODOS[D.metodo]} · ${dataBR(reg.data)}`, { tam: 10, cor: COR_PDF.suave, espaco: 4 });
  if (op.kcal) { const t = totaisPlano(D); if (t) { const d = distribuicao(t);
    c.texto(`Total do dia: ${fmtN(t.kcal, 0)} kcal · proteína ${fmtN(t.prot, 0)} g (${fmtN(d.p, 0)}%) · carboidrato ${fmtN(t.carb, 0)} g (${fmtN(d.c, 0)}%) · lipídeos ${fmtN(t.lip, 0)} g (${fmtN(d.l, 0)}%)`, { tam: 9.5, cor: COR_PDF.suave, espaco: 4 }); } }
  const grupos = gruposEquivalentes();
  const receitasUsadas = new Map();
  const temConteudo = (r) => (r.itens || []).length || Object.values(r.porcoes || {}).some(Boolean) || (r.composicao || []).length || (r.texto || '').trim();
  D.refeicoes.filter(temConteudo).forEach(r => {
    const tr = op.kcal ? totaisRefeicao(r, D.metodo) : null;
    c.titulo(`${r.horario ? r.horario + '  ' : ''}${r.nome}${tr ? `  ·  ${fmtN(tr.kcal, 0)} kcal` : ''}`);
    if (D.metodo === 'alimentos') {
      r.itens.forEach(it => {
        const a = alimento(it.ref); if (a?.item?.tipo === 'receita') receitasUsadas.set(a.item.id, a.item);
        c.texto(`•  ${a?.nome || 'alimento'} — ${textoQtd(it)}`, { recuo: 2, espaco: 0.6 });
        (it.subs || []).forEach(s => c.texto(`ou ${alimento(s.ref)?.nome || ''} — ${textoQtd(s)}`, { recuo: 8, tam: 9.5, cor: COR_PDF.suave, espaco: 0.4 }));
      });
    } else if (D.metodo === 'equivalentes') {
      grupos.forEach(g => { const n = num(r.porcoes?.[g.id]); if (n) c.texto(`•  ${fmtN(n, n % 1 ? 1 : 0)} ${n === 1 ? 'porção' : 'porções'} de ${g.nome.toLowerCase()}`, { recuo: 2, espaco: 0.6 }); });
    } else {
      if (r.composicao?.length) c.texto(`Monte com: ${r.composicao.join(' + ')}`, { negrito: true, recuo: 2, espaco: 1 });
    }
    if (r.texto) c.texto(r.texto, { recuo: 2, tam: 9.5, cor: COR_PDF.suave });
    c.y += 2;
  });
  if (D.observacoes) { c.titulo('Observações', COR_PDF.lima); c.texto(D.observacoes); }
  if (D.metodo === 'equivalentes') {
    c.titulo('Lista de equivalentes: escolha um alimento do grupo por porção', COR_PDF.lima);
    grupos.forEach(g => {
      const det = detalheGrupo(g); if (!det.itens.length) return;
      c.texto(`${g.nome} (1 porção ≈ ${g.kcal} kcal)`, { negrito: true, espaco: 0.6 });
      det.itens.forEach(({ a, gramas }) => { const m = medidasDe(a.ref)[0];
        c.texto(`${a.nome} — ${gramas} g${m ? ` (≈ ${fmtN(gramas / m.gramas, 1)} ${m.nome})` : ''}`, { recuo: 4, tam: 9.5, espaco: 0.3 }); });
      c.y += 2;
    });
  }
  if (op.receitas && receitasUsadas.size) {
    c.titulo('Receitas', COR_PDF.lima);
    for (const r of receitasUsadas.values()) {
      c.texto(r.titulo, { negrito: true, tam: 12, espaco: 1 });
      if (r.arquivo) { try { const img = await imagemDataURL(r.arquivo); if (img) { c.garante(48); doc.addImage(img, 'JPEG', c.M, c.y, 60, 45); c.y += 48; } } catch (_) { /* sem foto */ } }
      c.texto(`Rende ${r.dados.porcoes || 1} porções. Ingredientes:`, { tam: 9.5, cor: COR_PDF.suave, espaco: 0.5 });
      (r.dados.ingredientes || []).forEach(i => c.texto(`•  ${alimento(i.ref)?.nome || ''} — ${textoQtd(i)}`, { recuo: 2, tam: 9.5, espaco: 0.3 }));
      if (r.dados.preparo) { c.y += 1; c.texto(r.dados.preparo, { tam: 9.5 }); }
      c.y += 3;
    }
  }
  for (const o of op.orientacoes) {
    c.titulo(o.dados.titulo, COR_PDF.lima);
    if (o.arquivo) { try { const img = await imagemDataURL(o.arquivo); if (img) { c.garante(52); doc.addImage(img, 'JPEG', c.M, c.y, 70, 49); c.y += 52; } } catch (_) { /* sem imagem */ } }
    c.texto(o.dados.texto || '');
    if (o.dados.video) c.texto(`Vídeo: ${o.dados.video}`, { tam: 9, cor: COR_PDF.suave });
  }
  if (op.lista) {
    doc.addPage(); c.cabecalho();
    c.texto(`Lista de compras · ${op.lista} dias`, { tam: 16, negrito: true, espaco: 1 });
    c.texto('Quantidades aproximadas, já somando todas as refeições do plano. Substituições não entram.', { tam: 9, cor: COR_PDF.suave, espaco: 3 });
    listaCompras(D, op.lista).forEach(gr => { c.titulo(gr.cat, COR_PDF.lima); gr.itens.forEach(i => c.texto(`[  ]  ${i.nome} — ${fmtPeso(i.gramas)}`, { recuo: 2, espaco: 0.5 })); });
  }
  c.rodape();
  return entregaPDF(doc, `plano-${slug(F.paciente.nome)}-${reg.data}.pdf`, op.janela);
}

async function gerarReceituarioPDF(reg, janela) {
  const jsPDF = await carregaJsPDF();
  const c = novoDocPDF(jsPDF, 'Prescrição de suplementos'), doc = c.doc;
  c.texto('Prescrição', { tam: 18, negrito: true, espaco: 0.5 });
  c.texto(`Paciente: ${F.paciente.nome} · ${dataBR(reg.data)}`, { tam: 10, cor: COR_PDF.suave, espaco: 5 });
  reg.dados.itens.forEach((it, i) => {
    c.garante(24);
    if (it.tipo === 'manipulado') {
      c.texto(`${i + 1}. Fórmula manipulada${it.nome ? ' — ' + it.nome : ''}`, { negrito: true, tam: 11.5, espaco: 1 });
      (it.componentes || []).filter(x => x.ativo).forEach(x => c.texto(`${x.ativo} ......... ${x.dose} ${x.unidade}`, { recuo: 4, espaco: 0.4 }));
      c.texto(`${it.forma ? 'Manipular em ' + it.forma : ''}${it.quantidade ? ' · quantidade: ' + it.quantidade : ''}`, { recuo: 4, tam: 9.5, cor: COR_PDF.suave, espaco: 0.6 });
      if (it.posologia) c.texto(`Posologia: ${it.posologia}`, { recuo: 4, espaco: 0.4 });
      if (it.duracao) c.texto(`Duração: ${it.duracao}`, { recuo: 4, espaco: 0.4 });
      const f = bibTipo('farmacia').find(x => x.id === it.farmaciaId);
      if (f) c.texto(`Farmácia sugerida: ${f.titulo}${f.dados.telefone ? ' · ' + f.dados.telefone : ''}${f.dados.endereco ? ' · ' + f.dados.endereco : ''}`, { recuo: 4, tam: 9, cor: COR_PDF.suave });
    } else {
      c.texto(`${i + 1}. ${it.nome}${it.dose ? ' — ' + it.dose : ''}`, { negrito: true, tam: 11.5, espaco: 0.8 });
      if (it.posologia) c.texto(`Como tomar: ${it.posologia}`, { recuo: 4, espaco: 0.4 });
      if (it.duracao) c.texto(`Duração: ${it.duracao}`, { recuo: 4, espaco: 0.4 });
      if (it.obs) c.texto(it.obs, { recuo: 4, tam: 9.5, cor: COR_PDF.suave });
    }
    c.y += 3;
  });
  if (reg.dados.observacoes) { c.y += 2; c.texto(reg.dados.observacoes, { tam: 10 }); }
  if (c.y + 40 > c.H - 25) { doc.addPage(); c.cabecalho(); } // assinatura sempre inteira na mesma página
  const ya = Math.max(c.y + 24, c.H - 60);
  await assinaturaNoPDF(doc, c.M, ya, 80);
  doc.setDrawColor(...COR_PDF.bordo); doc.line(c.M, ya, c.M + 80, ya);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...COR_PDF.bordo); doc.text(limpaPDF(perfil?.nome || ''), c.M, ya + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(limpaPDF(`Nutricionista${textoCRN() ? ' · ' + textoCRN() : ''}`), c.M, ya + 11);
  c.rodape();
  return entregaPDF(doc, `prescricao-${slug(F.paciente.nome)}-${reg.data}.pdf`, janela);
}
