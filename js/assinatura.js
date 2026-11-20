/* ëat · assinatura da nutri (imagem) para os PDFs de prescrição e pedido de exames.
   Fica no Storage, na pasta privada da nutri: <id>/perfil/assinatura.png */

const caminhoAssinatura = () => `${sessao.user.id}/perfil/assinatura.png`;
let assinaturaCache; // undefined = não carregada; null = não tem; { url, w, h } = imagem pronta para o jsPDF

async function carregaAssinatura(forcar) {
  if (assinaturaCache !== undefined && !forcar) return assinaturaCache;
  const { data, error } = await supa.storage.from('arquivos').download(caminhoAssinatura());
  if (error || !data) { assinaturaCache = null; return null; }
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(data); });
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
  assinaturaCache = { url, w: img.naturalWidth, h: img.naturalHeight };
  return assinaturaCache;
}
// desenha a assinatura no PDF, centralizada na linha (x, y = início da linha; larg = largura da linha)
async function assinaturaNoPDF(doc, x, yLinha, larg) {
  const a = await carregaAssinatura().catch(() => null);
  if (!a) return;
  const altMax = 20, largMax = larg;
  let w = largMax, h = w * a.h / a.w;
  if (h > altMax) { h = altMax; w = h * a.w / a.h; }
  doc.addImage(a.url, 'PNG', x + (larg - w) / 2, yLinha - h - 1, w, h);
}
const linkGovBr = () => h('a', { class: 'link', href: 'https://assinador.iti.br/', target: '_blank', rel: 'noopener', title: 'Assinatura digital com validade jurídica (ICP-Brasil), grátis com conta gov.br' }, 'assinar no gov.br ↗');

// recorta as bordas vazias da assinatura desenhada
function recortaCanvas(c) {
  const ctx = c.getContext('2d'), { width: W, height: H } = c, d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null;
  const m = 8, out = document.createElement('canvas');
  out.width = x1 - x0 + 2 * m; out.height = y1 - y0 + 2 * m;
  out.getContext('2d').drawImage(c, x0 - m, y0 - m, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/* Campo de assinatura para o perfil. Devolve { el, salvar } — salvar() grava a alteração escolhida. */
function campoAssinatura() {
  let pendente = null; // { tipo: 'nova', blob } | { tipo: 'remover' }
  const previa = h('div', { class: 'ass-previa' }, h('span', { class: 'nota' }, 'carregando…'));
  const area = h('div');
  const mostra = (url) => previa.replaceChildren(url ? h('img', { src: url, alt: 'Sua assinatura' }) : h('span', { class: 'nota' }, 'Nenhuma assinatura cadastrada.'));
  carregaAssinatura(true).then(a => mostra(a?.url)).catch(() => mostra(null));

  const abrePad = () => {
    const c = h('canvas', { class: 'ass-pad', width: 900, height: 300, 'aria-label': 'Área para desenhar a assinatura' });
    const ctx = c.getContext('2d');
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a1a40';
    let desenhando = false, ultimo = null, vazio = true;
    const ponto = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', (e) => { desenhando = true; ultimo = ponto(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
    c.addEventListener('pointermove', (e) => {
      if (!desenhando) return;
      const p = ponto(e); ctx.beginPath(); ctx.moveTo(...ultimo); ctx.lineTo(...p); ctx.stroke(); ultimo = p; vazio = false;
    });
    const solta = () => { desenhando = false; };
    c.addEventListener('pointerup', solta); c.addEventListener('pointercancel', solta);
    area.replaceChildren(h('div', { class: 'ass-caixa' },
      h('p', { class: 'nota', style: 'margin:0 0 6px' }, 'Assine no quadro abaixo (mouse, dedo ou caneta).'),
      c,
      h('div', { class: 'linha-btn' },
        h('button', { class: 'btn pri', type: 'button', onclick: () => {
          if (vazio) return;
          const rec = recortaCanvas(c); if (!rec) return;
          rec.toBlob(blob => { pendente = { tipo: 'nova', blob }; mostra(rec.toDataURL('image/png')); area.replaceChildren(h('p', { class: 'form-msg ok' }, 'Assinatura pronta. Clique em Salvar para guardar.')); }, 'image/png');
        } }, 'Usar esta assinatura'),
        h('button', { class: 'btn sec', type: 'button', onclick: () => { ctx.clearRect(0, 0, c.width, c.height); vazio = true; } }, 'Limpar'),
        h('button', { class: 'btn sec', type: 'button', onclick: () => area.replaceChildren() }, 'Cancelar'))));
  };
  const arquivo = h('input', { type: 'file', accept: 'image/png,image/jpeg', style: 'display:none', onchange: async () => {
    const f = arquivo.files[0]; if (!f) return;
    // converte para PNG com fundo branco removido (pixels quase brancos ficam transparentes)
    const img = await createImageBitmap(f);
    const esc = Math.min(1, 1200 / img.width), c = document.createElement('canvas');
    c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
    const dados = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < dados.data.length; i += 4) if (dados.data[i] > 225 && dados.data[i + 1] > 225 && dados.data[i + 2] > 225) dados.data[i + 3] = 0;
    ctx.putImageData(dados, 0, 0);
    const rec = recortaCanvas(c) || c;
    rec.toBlob(blob => { pendente = { tipo: 'nova', blob }; mostra(rec.toDataURL('image/png')); area.replaceChildren(h('p', { class: 'form-msg ok' }, 'Imagem pronta. Clique em Salvar para guardar.')); }, 'image/png');
  } });
  const el = h('div', { class: 'campo-assinatura' },
    h('label', null, 'Assinatura (sai na prescrição e no pedido de exames)'),
    previa,
    h('div', { class: 'linha-btn', style: 'margin-top:8px' },
      h('button', { class: 'btn sec', type: 'button', onclick: abrePad }, '✍ Desenhar'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => arquivo.click() }, 'Enviar imagem'),
      h('button', { class: 'link', type: 'button', onclick: () => { pendente = { tipo: 'remover' }; mostra(null); area.replaceChildren(h('p', { class: 'form-msg ok' }, 'A assinatura será removida ao salvar.')); } }, 'remover'),
      arquivo),
    area,
    h('p', { class: 'nota' }, 'Esta é uma assinatura em imagem. Para assinatura digital com validade jurídica (certificado ICP-Brasil), baixe o PDF e assine no ', linkGovBr(), ' (grátis com conta gov.br).'));
  async function salvar() {
    if (!pendente) return;
    const caminho = caminhoAssinatura();
    await supa.storage.from('arquivos').remove([caminho]);
    if (pendente.tipo === 'nova') {
      const { error } = await supa.storage.from('arquivos').upload(caminho, pendente.blob, { contentType: 'image/png' });
      if (error) throw error;
    }
    pendente = null;
    await carregaAssinatura(true);
  }
  return { el, salvar };
}
