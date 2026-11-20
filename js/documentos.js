/* ëat · documentos profissionais (atestados, declarações, encaminhamentos) com papel timbrado */

const caminhoLogo = () => `${sessao.user.id}/perfil/logo.png`;
let logoCache;
async function carregaLogo(forcar) {
  if (logoCache !== undefined && !forcar) return logoCache;
  const { data, error } = await supa.storage.from('arquivos').download(caminhoLogo());
  if (error || !data) { logoCache = null; return null; }
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(data); });
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
  logoCache = { url, w: img.naturalWidth, h: img.naturalHeight };
  return logoCache;
}
const crnTexto = () => perfil?.crn ? 'CRN ' + perfil.crn.replace(/^\s*crn[\s:-]*/i, '') : '';

// cabeçalho do papel timbrado; devolve o y onde o conteúdo começa
async function cabecalhoTimbrado(doc) {
  const W = 210, M = 20;
  const logo = await carregaLogo().catch(() => null);
  let x = M;
  if (logo) { const hgt = 18, w = Math.min(40, hgt * logo.w / logo.h); doc.addImage(logo.url, 'PNG', M, 12, w, w * logo.h / logo.w); x = M + w + 6; }
  doc.setTextColor(54, 1, 5); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(limpaPDF(perfil?.nome || ''), x, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120, 90, 90);
  doc.text(limpaPDF(['Nutricionista', crnTexto()].filter(Boolean).join(' · ')), x, 23.5);
  const contato = [perfil?.telefone, perfil?.endereco].filter(Boolean).join(' · ');
  if (contato) doc.text(doc.splitTextToSize(limpaPDF(contato), W - x - M).slice(0, 2), x, 28.5);
  doc.setDrawColor(255, 68, 22); doc.setLineWidth(0.8); doc.line(M, 36, W - M, 36); doc.setLineWidth(0.2);
  return 50;
}
function rodapeTimbrado(doc) {
  const W = 210, H = 297, M = 20;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setDrawColor(232, 229, 202); doc.line(M, H - 16, W - M, H - 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 90, 90);
    doc.text(limpaPDF(perfil?.rodape || [perfil?.nome, crnTexto(), perfil?.telefone].filter(Boolean).join(' · ')), M, H - 10);
    if (n > 1) doc.text(`${i} / ${n}`, W - M, H - 10, { align: 'right' });
  }
}

/* ---------- modelos ---------- */
const MODELOS_DOC = [
  { titulo: 'Atestado de comparecimento', texto: 'Atesto, para os devidos fins, que {paciente}{cpf_texto} esteve sob meus cuidados em consulta de nutrição no dia {data}, no horário de {hora_inicio} às {hora_fim}.' },
  { titulo: 'Declaração de acompanhamento nutricional', texto: 'Declaro, para os devidos fins, que {paciente}{cpf_texto} está em acompanhamento nutricional comigo desde {inicio_acompanhamento}, com consultas periódicas.' },
  { titulo: 'Encaminhamento', texto: 'Encaminho {paciente}{cpf_texto}, {idade} anos, para avaliação com ____________________.\n\nMotivo: ____________________\n\nAgradeço a atenção e coloco-me à disposição para discutir o caso.' },
  { titulo: 'Documento livre', texto: '' }
];
const modelosDocumento = () => MODELOS_DOC.concat(bibTipo('documento').map(b => ({ titulo: b.titulo, texto: b.dados.texto || '', bib: b })));
function preencheModelo(texto, extra = {}) {
  const p = F.paciente;
  const primeiraConsulta = [...F.anamneses.map(a => a.criado_em.slice(0, 10)), ...F.registros.map(r => r.data)].sort()[0];
  const vals = {
    paciente: p.nome || '', cpf: p.cpf || '', cpf_texto: p.cpf ? `, CPF ${p.cpf},` : '', idade: idadeF() ?? '___',
    data: new Date().toLocaleDateString('pt-BR'), hora_inicio: '__:__', hora_fim: '__:__',
    inicio_acompanhamento: primeiraConsulta ? dataBR(primeiraConsulta) : '__/__/____',
    nutri: perfil?.nome || '', crn: crnTexto(), ...extra
  };
  return texto.replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m);
}

/* ---------- aba na ficha ---------- */
async function abaDocumentos(el) {
  try { await carregaBiblioteca(); } catch (e) { el.append(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
  const box = h('div');
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' }, h('button', { class: 'btn pri', type: 'button', onclick: () => { box.replaceChildren(formDocumento(null, () => { box.replaceChildren(); render(); })); box.scrollIntoView({ behavior: 'smooth' }); } }, '+ Novo documento')), box);
  const docs = doTipo('documento').slice().reverse();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Documentos emitidos'), docs.length ? docs.map(r => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, r.dados.titulo), h('div', { class: 'nota', style: 'margin:0' }, dataBR(r.data))),
    h('div', { class: 'acoes-linha' },
      h('button', { class: 'link', type: 'button', onclick: () => gerarDocumentoPDF(r, abreJanelaPDF()).catch(e => alert(e.message)) }, 'visualizar'),
      h('button', { class: 'link', type: 'button', onclick: () => gerarDocumentoPDF(r).catch(e => alert(e.message)) }, 'baixar'),
      linkGovBr(),
      h('button', { class: 'link', type: 'button', onclick: () => { box.replaceChildren(formDocumento(r, () => { box.replaceChildren(); render(); })); box.scrollIntoView({ behavior: 'smooth' }); } }, 'editar'),
      h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm('Excluir este documento?')) { await apagaRegistro(r); render(); } } }, 'excluir'))))
    : h('p', { class: 'vazio' }, 'Nenhum documento emitido.')));
}
function formDocumento(reg, aoFim) {
  const modelos = modelosDocumento();
  const sel = h('select', { class: 'campo mini' }, modelos.map((m, i) => h('option', { value: i }, m.titulo)));
  const iT = h('input', { class: 'campo mini', value: reg?.dados.titulo || modelos[0].titulo });
  const iData = h('input', { class: 'campo mini', type: 'date', value: reg?.data || hoje() });
  const iIni = h('input', { class: 'campo mini', type: 'time' }), iFim = h('input', { class: 'campo mini', type: 'time' });
  const iTx = h('textarea', { class: 'campo', style: 'min-height:200px;font-size:15px' }, reg?.dados.texto || '');
  const msg = msgEl();
  const aplica = () => {
    const m = modelos[sel.value]; iT.value = m.titulo;
    const d = new Date(iData.value + 'T12:00:00');
    iTx.value = preencheModelo(m.texto, { data: d.toLocaleDateString('pt-BR'), hora_inicio: iIni.value || '__:__', hora_fim: iFim.value || '__:__' });
  };
  // sugere o horário da última consulta da paciente na agenda
  (async () => {
    const { data } = await supa.from('agenda').select('inicio, fim').eq('paciente_id', F.paciente.id).lte('inicio', new Date().toISOString()).order('inicio', { ascending: false }).limit(1);
    if (data?.[0]) { const i = new Date(data[0].inicio), f = new Date(data[0].fim); iIni.value = horaTxt(i); iFim.value = horaTxt(f); if (!reg) { iData.value = isoDia(i); aplica(); } }
  })();
  sel.addEventListener('change', aplica); [iData, iIni, iFim].forEach(x => x.addEventListener('change', () => { if (!reg) aplica(); }));
  if (!reg) aplica();
  const campo = (rot, el, largo) => h('div', { class: 'mini-campo' + (largo ? ' largo' : '') }, h('label', { class: 'mini-rot' }, rot), el);
  return h('div', { class: 'bloco' }, h('h2', null, reg ? 'Editar documento' : 'Novo documento'),
    h('div', { class: 'grade-medidas' }, reg ? null : campo('Modelo', sel, true), campo('Título', iT, true), campo('Data', iData), campo('Consulta: início', iIni), campo('fim', iFim)),
    h('p', { class: 'nota' }, 'O texto já vem preenchido com os dados da paciente. Edite à vontade antes de salvar.'),
    iTx,
    h('div', { class: 'linha-btn' },
      h('button', { class: 'btn pri', type: 'button', onclick: async (ev) => {
        if (!iT.value.trim() || !iTx.value.trim()) return avisa(msg, 'erro', 'Preencha título e texto.');
        const b = ev.currentTarget; b.disabled = true;
        try { const r = await salvaRegistro('documento', iData.value || hoje(), { titulo: iT.value.trim(), texto: iTx.value }, null, reg?.id); aoFim(); gerarDocumentoPDF(r, abreJanelaPDF()).catch(() => {}); }
        catch (e) { avisa(msg, 'erro', traduzErro(e)); b.disabled = false; }
      } }, 'Salvar e visualizar'),
      h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
}
async function gerarDocumentoPDF(reg, janela) {
  const jsPDF = await carregaJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 20, W = 210;
  let y = await cabecalhoTimbrado(doc);
  doc.setTextColor(54, 1, 5); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(limpaPDF(reg.dados.titulo.toUpperCase()), W / 2, y + 4, { align: 'center' }); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
  limpaPDF(reg.dados.texto).split('\n').forEach(par => {
    const linhas = par.trim() ? doc.splitTextToSize(par, W - 2 * M) : [''];
    linhas.forEach(l => { if (y > 240) { doc.addPage(); y = 30; } doc.text(l, M, y); y += 6.5; });
    y += 2;
  });
  y += 8;
  const cidade = (perfil?.endereco || '').split(/[,–-]/).map(s => s.trim()).filter(Boolean).pop() || '';
  doc.text(limpaPDF(`${cidade ? cidade + ', ' : ''}${new Date(reg.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.`), M, y);
  y = Math.max(y + 34, 220); if (y > 262) { doc.addPage(); y = 60; }
  await assinaturaNoPDF(doc, (W - 80) / 2, y, 80);
  doc.setDrawColor(54, 1, 5); doc.line((W - 80) / 2, y, (W + 80) / 2, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(limpaPDF(perfil?.nome || ''), W / 2, y + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(limpaPDF(['Nutricionista', crnTexto()].filter(Boolean).join(' · ')), W / 2, y + 11, { align: 'center' });
  rodapeTimbrado(doc);
  entregaPDF(doc, `${slug(reg.dados.titulo)}-${slug(F.paciente.nome)}-${reg.data}.pdf`, janela);
}

/* ---------- biblioteca: modelos próprios ---------- */
function bibDocumentos(el) {
  const iT = h('input', { class: 'campo mini', placeholder: 'Ex.: Declaração para academia' });
  const iTx = h('textarea', { class: 'campo', style: 'min-height:140px;font-size:15px', placeholder: 'Use {paciente}, {cpf}, {cpf_texto}, {idade}, {data}, {hora_inicio}, {hora_fim}, {inicio_acompanhamento}, {nutri}, {crn}' });
  const msg = msgEl();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Novo modelo de documento'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Os campos entre chaves são preenchidos sozinhos com os dados da paciente na hora de emitir. Já existem modelos prontos de atestado de comparecimento, declaração de acompanhamento e encaminhamento.'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Título'), iT)), iTx,
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
      if (!iT.value.trim() || !iTx.value.trim()) return avisa(msg, 'erro', 'Preencha título e texto.');
      try { await salvaBib('documento', iT.value.trim(), { texto: iTx.value }); recarregaBib(); } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
    } }, 'Salvar modelo')), msg));
  listaSimples(el, 'documento', 'Nenhum modelo próprio ainda.', (d) => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, d.titulo), h('div', { class: 'nota', style: 'margin:0' }, (d.dados.texto || '').slice(0, 90) + '…')),
    h('div', { class: 'acoes-linha' }, botaoExcluirBib(d, `o modelo "${d.titulo}"`))));
}

/* ---------- perfil: papel timbrado ---------- */
function campoPapelTimbrado() {
  const iEnd = h('input', { class: 'campo', value: perfil?.endereco || '', placeholder: 'Rua, número, sala – Cidade/UF' });
  const iTel = h('input', { class: 'campo', type: 'tel', value: perfil?.telefone || '', placeholder: '(91) 99999-9999' });
  const iDoc = h('input', { class: 'campo', value: perfil?.documento || '', placeholder: 'CPF ou CNPJ (sai no recibo)' });
  const iRod = h('input', { class: 'campo', value: perfil?.rodape || '', placeholder: 'Ex.: @seuinstagram · seusite.com.br' });
  const iLogo = h('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'campo mini' });
  const previa = h('div', { class: 'ass-previa', style: 'min-height:70px' }, h('span', { class: 'nota' }, 'carregando…'));
  let removerLogo = false;
  carregaLogo(true).then(l => previa.replaceChildren(l ? h('img', { src: l.url, alt: 'Seu logo' }) : h('span', { class: 'nota' }, 'Sem logo.'))).catch(() => previa.replaceChildren(h('span', { class: 'nota' }, 'Sem logo.')));
  iLogo.addEventListener('change', () => { const f = iLogo.files[0]; if (f) { removerLogo = false; previa.replaceChildren(h('img', { src: URL.createObjectURL(f), alt: 'Novo logo' })); } });
  const el = h('div', { class: 'campo-assinatura' },
    h('h3', { class: 'sub' }, 'Papel timbrado (atestados, declarações e recibos)'),
    h('label', null, 'Logo'), previa,
    h('div', { class: 'linha-btn', style: 'margin-top:6px;align-items:center' }, iLogo, h('button', { class: 'link', type: 'button', onclick: () => { removerLogo = true; iLogo.value = ''; previa.replaceChildren(h('span', { class: 'nota' }, 'O logo será removido ao salvar.')); } }, 'remover logo')),
    h('label', null, 'Endereço do consultório'), iEnd, h('label', null, 'Telefone do consultório'), iTel,
    h('label', null, 'CPF ou CNPJ'), iDoc, h('label', null, 'Rodapé dos documentos'), iRod);
  async function salvar() {
    const campos = { endereco: iEnd.value.trim().slice(0, 200), telefone: iTel.value.trim().slice(0, 40), documento: iDoc.value.trim().slice(0, 30), rodape: iRod.value.trim().slice(0, 160) };
    const { error } = await supa.from('perfis').update(campos).eq('id', sessao.user.id);
    if (error) throw error;
    Object.assign(perfil, campos);
    if (removerLogo || iLogo.files[0]) {
      await supa.storage.from('arquivos').remove([caminhoLogo()]);
      if (iLogo.files[0]) {
        const img = await createImageBitmap(iLogo.files[0]); const esc = Math.min(1, 600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
        const { error: e2 } = await supa.storage.from('arquivos').upload(caminhoLogo(), blob, { contentType: 'image/png' });
        if (e2) throw e2;
      }
      removerLogo = false; await carregaLogo(true);
    }
  }
  return { el, salvar };
}
