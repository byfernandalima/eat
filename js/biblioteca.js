/* ëat · Biblioteca da nutri: tudo que é reaproveitado entre pacientes */

const SECOES_BIB = [
  ['receita', 'Receitas'], ['orientacao', 'Orientações'], ['formula', 'Fórmulas'], ['modelo_plano', 'Modelos de plano'],
  ['refeicao', 'Refeições favoritas'], ['alimento', 'Alimentos próprios'], ['medida', 'Medidas caseiras'], ['equivalentes', 'Equivalentes'], ['farmacia', 'Farmácias'], ['documento', 'Documentos']
];
// orientações iniciais no tom da ëat (a nutri edita, apaga ou cria as suas)
const ORIENTACOES_INICIAIS = [
  ['Hidratação sem neura', 'Água ao longo do dia', 'Meta: cerca de 35 ml por kg de peso por dia, ajustada ao calor e ao treino.\n\n• Deixe uma garrafa à vista: o que está à vista é lembrado.\n• Um copo ao acordar e um em cada refeição já resolve metade.\n• Chá sem açúcar e água com rodelas de fruta contam.\n• Urina clara é um bom sinal; escura, hora de beber mais.\n\nNão precisa forçar litros de uma vez: constância vale mais que volume.'],
  ['Mastigação e atenção', 'Comportamento', 'Comer devagar ajuda o corpo a perceber a saciedade (ela leva uns 20 minutos para chegar).\n\n• Pouse os talheres entre uma garfada e outra.\n• Sem celular ou TV na mesa, quando der.\n• Repare em cor, cheiro e textura: comer também é experiência.\n• Antes de repetir, espere alguns minutos e pergunte: ainda é fome?'],
  ['Intestino em dia', 'Saúde intestinal', '• Fibras todo dia: frutas com casca, verduras, legumes, feijão e integrais.\n• Aumente as fibras aos poucos e beba mais água junto.\n• Mexa o corpo: caminhar já estimula o intestino.\n• Respeite a vontade de ir ao banheiro; criar horário ajuda.\n\nSe houver dor, sangue ou mudança importante no hábito intestinal, avise.'],
  ['Comer fora sem culpa', 'Rotina', '• Olhe o cardápio antes e já chegue com uma escolha.\n• Monte o prato pensando em: proteína + vegetais + um carboidrato.\n• Molhos e frituras: escolha um, não todos.\n• Bebida: água ou com gás com limão entre as alcoólicas.\n\nUma refeição não define o plano. O que conta é o conjunto da semana.'],
  ['Lista de compras inteligente', 'Planejamento', '• Planeje as refeições da semana antes de ir ao mercado.\n• Compre com a lista e sem fome.\n• Rótulo: os ingredientes vêm em ordem de quantidade. Se açúcar ou gordura aparecem primeiro, atenção.\n• Feira e hortifruti primeiro; corredor de ultraprocessados por último (ou nunca).'],
  ['Sono e alimentação', 'Sono', 'Dormir mal aumenta a fome e a vontade de doce no dia seguinte.\n\n• Jantar leve, 2 a 3 horas antes de deitar.\n• Cafeína só até o meio da tarde.\n• Telas fora 30 minutos antes de dormir.\n• Horário parecido para dormir e acordar, inclusive no fim de semana.']
];

let secaoBib = 'receita';
async function telaBiblioteca(palco) {
  const wrap = h('div', { class: 'painel' }, h('p', { class: 'carregando' }, 'abrindo biblioteca…'));
  palco.append(wrap);
  try { await carregaBiblioteca(); } catch (e) { wrap.replaceChildren(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
  const conteudo = h('div');
  wrap.replaceChildren(
    h('div', { style: 'margin-top:6px' }, h('a', { href: '#', class: 'link' }, '← pacientes')),
    h('h1', null, 'Biblioteca'),
    h('p', { style: 'font-family:var(--serif);font-style:italic;font-size:22px;margin:0' }, 'o que você cria uma vez e usa sempre.'),
    h('nav', { class: 'abas-ficha', 'aria-label': 'Seções da biblioteca' }, SECOES_BIB.map(([k, rot]) =>
      h('a', { href: '#biblioteca/' + k, class: k === secaoBib ? 'on' : '' }, rot, ` (${bibTipo(k).length})`))),
    conteudo);
  ({ receita: bibReceitas, orientacao: bibOrientacoes, formula: bibFormulas, modelo_plano: bibModelos, refeicao: bibRefeicoes,
     alimento: bibAlimentos, medida: bibMedidas, equivalentes: bibEquivalentes, farmacia: bibFarmacias, documento: bibDocumentos })[secaoBib](conteudo);
}
const recarregaBib = () => render();
const botaoExcluirBib = (item, rot) => h('button', { class: 'link', type: 'button', onclick: async () => {
  if (!confirm(`Excluir ${rot || 'este item'}?`)) return;
  try { await apagaBib(item); recarregaBib(); } catch (e) { alert(traduzErro(e)); } } }, 'excluir');
function listaSimples(el, tipo, vazio, linha) {
  const itens = bibTipo(tipo);
  el.append(h('div', { class: 'bloco' }, itens.length ? itens.map(linha) : h('p', { class: 'vazio' }, vazio)));
}

/* ---------- receitas ---------- */
function bibReceitas(el) {
  const box = h('div');
  const abrir = (r) => { box.replaceChildren(formReceita(r, () => { box.replaceChildren(); recarregaBib(); })); box.scrollIntoView({ behavior: 'smooth' }); };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' }, h('button', { class: 'btn pri', type: 'button', onclick: () => abrir(null) }, '+ Nova receita')), box);
  listaSimples(el, 'receita', 'Nenhuma receita ainda. Receitas entram nos planos como qualquer alimento, com cálculo por porção.', (r) => {
    const a = alimento('receita:' + r.id);
    return h('div', { class: 'linha-exame' },
      h('div', null, h('b', null, r.titulo), h('div', { class: 'nota', style: 'margin:0' },
        [r.categoria, `${r.dados.porcoes || 1} porções`, a?.porcaoG && a.por100?.kcal != null ? `${fmtN(a.por100.kcal * a.porcaoG / 100, 0)} kcal/porção` : null].filter(Boolean).join(' · '))),
      h('div', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: () => abrir(r) }, 'abrir'), botaoExcluirBib(r, `a receita "${r.titulo}"`)));
  });
}
function formReceita(r, aoFim) {
  const d = clona(r?.dados || { ingredientes: [], porcoes: 1, preparo: '' });
  const iNome = h('input', { class: 'campo mini', value: r?.titulo || '' }), iCat = h('input', { class: 'campo mini', value: r?.categoria || '', placeholder: 'Ex.: Lanche, Café da manhã' });
  const iPorc = h('input', { class: 'campo mini', inputmode: 'numeric', value: d.porcoes || 1 }), iPeso = h('input', { class: 'campo mini', inputmode: 'decimal', value: d.pesoFinal || '', placeholder: 'opcional' });
  const iPrep = h('textarea', { class: 'campo', style: 'min-height:110px;font-size:15px', placeholder: 'Modo de preparo' }, d.preparo || '');
  const iFoto = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'campo mini' });
  const ingBox = h('div', { class: 'itens' }), tot = h('div', { 'aria-live': 'polite' }), msg = msgEl();
  const calcula = () => {
    const t = somaItens(d.ingredientes), porc = Math.max(1, num(iPorc.value) || 1);
    const peso = num(iPeso.value) || d.ingredientes.reduce((s, i) => s + (num(i.gramas) || 0), 0);
    tot.replaceChildren(h('div', { class: 'resumo' },
      h('div', null, h('small', null, 'Por porção'), h('b', null, `${fmtN(t.kcal / porc, 0)} kcal`), h('span', null, `${fmtN(peso / porc, 0)} g`)),
      h('div', null, h('small', null, 'Proteína'), h('b', null, `${fmtN(t.prot / porc, 1)} g`)),
      h('div', null, h('small', null, 'Carboidrato'), h('b', null, `${fmtN(t.carb / porc, 1)} g`)),
      h('div', null, h('small', null, 'Lipídeos'), h('b', null, `${fmtN(t.lip / porc, 1)} g`)),
      h('div', null, h('small', null, 'Fibra'), h('b', null, `${fmtN(t.fibra / porc, 1)} g`))));
  };
  const desenha = () => {
    ingBox.replaceChildren(...d.ingredientes.map((ing, i) => h('div', { class: 'item-linha' },
      h('span', { class: 'nome-item' }, alimento(ing.ref)?.nome || 'alimento removido'),
      campoQuantidade(ing, calcula), h('button', { class: 'link', type: 'button', 'aria-label': 'Remover ingrediente', onclick: () => { d.ingredientes.splice(i, 1); desenha(); } }, '×'))));
    calcula();
  };
  [iPorc, iPeso].forEach(x => x.addEventListener('input', calcula));
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    if (!iNome.value.trim()) return avisa(msg, 'erro', 'Dê um nome à receita.');
    if (!d.ingredientes.length) return avisa(msg, 'erro', 'Adicione pelo menos um ingrediente.');
    salvar.disabled = true;
    try {
      let arquivo = r?.arquivo || null;
      if (iFoto.files[0]) {
        const blob = await reduzImagem(iFoto.files[0], 1200);
        const caminho = `${sessao.user.id}/biblioteca/${novoUUID()}.jpg`;
        const { error } = await supa.storage.from('arquivos').upload(caminho, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        if (arquivo) await supa.storage.from('arquivos').remove([arquivo]);
        arquivo = caminho;
      }
      await salvaBib('receita', iNome.value.trim(), { ingredientes: d.ingredientes, porcoes: num(iPorc.value) || 1, pesoFinal: num(iPeso.value), preparo: iPrep.value }, { categoria: iCat.value.trim(), arquivo }, r?.id);
      aoFim();
    } catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, 'Salvar receita');
  desenha();
  return h('div', { class: 'bloco' }, h('h2', null, r ? r.titulo : 'Nova receita'),
    h('div', { class: 'grade-medidas' },
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Nome'), iNome), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Categoria'), iCat),
      h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Rende (porções)'), iPorc), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Peso final pronto', h('span', null, ' g')), iPeso),
      h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, r?.arquivo ? 'Trocar foto' : 'Foto (opcional)'), iFoto)),
    h('p', { class: 'nota' }, 'Peso final: se a receita perde água no preparo (assados, cozidos), pese pronta para o cálculo por porção ficar certo.'),
    h('h3', { class: 'sub' }, 'Ingredientes'), ingBox,
    buscaAlimentoCampo((a) => { d.ingredientes.push({ ref: a.ref, gramas: 100 }); desenha(); }, 'Adicionar ingrediente'),
    h('h3', { class: 'sub' }, 'Valor nutricional'), tot,
    h('label', null, 'Modo de preparo'), iPrep,
    h('div', { class: 'linha-btn' }, salvar, h('button', { class: 'btn sec', type: 'button', onclick: aoFim }, 'Cancelar')), msg);
}

/* ---------- orientações (modelos) ---------- */
function formOrientacao(o, aoSalvar, tipo = 'biblioteca') {
  const iT = h('input', { class: 'campo mini', value: o?.titulo || '' }), iC = h('input', { class: 'campo mini', value: o?.categoria || o?.dados?.categoria || '', placeholder: 'Ex.: Comportamento' });
  const iTx = h('textarea', { class: 'campo', style: 'min-height:180px;font-size:15px', placeholder: 'Use "•" ou "-" no começo da linha para listas.' }, o?.dados?.texto || '');
  const iV = h('input', { class: 'campo mini', type: 'url', value: o?.dados?.video || '', placeholder: 'https://youtube.com/…' });
  const iImg = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'campo mini' });
  const msg = msgEl();
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    if (!iT.value.trim() || !iTx.value.trim()) return avisa(msg, 'erro', 'Preencha título e texto.');
    salvar.disabled = true;
    try {
      let arquivo = o?.arquivo || null;
      if (iImg.files[0]) {
        const blob = await reduzImagem(iImg.files[0], 1200);
        const caminho = `${sessao.user.id}/${tipo === 'paciente' ? F.paciente.id : 'biblioteca'}/${novoUUID()}.jpg`;
        const { error } = await supa.storage.from('arquivos').upload(caminho, blob, { contentType: 'image/jpeg' }); if (error) throw error;
        if (arquivo) await supa.storage.from('arquivos').remove([arquivo]);
        arquivo = caminho;
      }
      await aoSalvar({ titulo: iT.value.trim(), categoria: iC.value.trim(), texto: iTx.value, video: iV.value.trim(), arquivo });
    } catch (e) { avisa(msg, 'erro', traduzErro(e)); salvar.disabled = false; }
  } }, 'Salvar orientação');
  return h('div', { class: 'bloco' }, h('h2', null, o ? 'Editar orientação' : 'Nova orientação'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Título'), iT), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Categoria'), iC)),
    h('label', null, 'Texto'), iTx,
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Vídeo (link, opcional)'), iV), h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Imagem (opcional)'), iImg)),
    h('div', { class: 'linha-btn' }, salvar), msg);
}
function bibOrientacoes(el) {
  const box = h('div');
  const abrir = (o) => { box.replaceChildren(formOrientacao(o, async (v) => { await salvaBib('orientacao', v.titulo, { texto: v.texto, video: v.video }, { categoria: v.categoria, arquivo: v.arquivo }, o?.id); recarregaBib(); })); box.scrollIntoView({ behavior: 'smooth' }); };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' },
    h('button', { class: 'btn pri', type: 'button', onclick: () => abrir(null) }, '+ Nova orientação'),
    !bibTipo('orientacao').length ? h('button', { class: 'btn sec', type: 'button', onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      for (const [t, c, tx] of ORIENTACOES_INICIAIS) await salvaBib('orientacao', t, { texto: tx }, { categoria: c });
      recarregaBib(); } }, 'Importar 6 modelos ëat') : null), box);
  listaSimples(el, 'orientacao', 'Nenhuma orientação ainda. Importe os modelos ëat para começar e adapte do seu jeito.', (o) => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, o.titulo), h('div', { class: 'nota', style: 'margin:0' }, [o.categoria, o.arquivo ? 'com imagem' : null, o.dados.video ? 'com vídeo' : null].filter(Boolean).join(' · '))),
    h('div', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: () => abrir(o) }, 'editar'), botaoExcluirBib(o, `a orientação "${o.titulo}"`))));
}

/* ---------- fórmulas manipuladas (modelos) ---------- */
function bibFormulas(el) {
  const box = h('div');
  const abrir = (f) => { box.replaceChildren(formFormula(f?.dados, async (dados, titulo) => { await salvaBib('formula', titulo, dados, { categoria: dados.objetivo || '' }, f?.id); recarregaBib(); }, f?.titulo)); box.scrollIntoView({ behavior: 'smooth' }); };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' }, h('button', { class: 'btn pri', type: 'button', onclick: () => abrir(null) }, '+ Novo modelo de fórmula')), box);
  listaSimples(el, 'formula', 'Nenhum modelo de fórmula ainda.', (f) => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, f.titulo), h('div', { class: 'nota', style: 'margin:0' }, (f.dados.componentes || []).map(c => `${c.ativo} ${c.dose}${c.unidade}`).join(' · '))),
    h('div', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: () => abrir(f) }, 'editar'), botaoExcluirBib(f, `o modelo "${f.titulo}"`))));
}
function formFormula(dados, aoSalvar, tituloAtual) {
  const d = clona(dados || { componentes: [{ ativo: '', dose: '', unidade: 'mg' }], forma: 'cápsulas', quantidade: '30', posologia: '', objetivo: '' });
  const iT = h('input', { class: 'campo mini', value: tituloAtual || '', placeholder: 'Ex.: Fórmula para queda de cabelo' });
  const compBox = h('div'), msg = msgEl();
  const desenha = () => compBox.replaceChildren(...d.componentes.map((c, i) => {
    const a = h('input', { class: 'campo mini', value: c.ativo, placeholder: 'Ativo' }), ds = h('input', { class: 'campo mini', value: c.dose, placeholder: 'Dose', inputmode: 'decimal' });
    const un = h('select', { class: 'campo mini' }, ['mg', 'mcg', 'g', 'UI', 'UFC', 'ml', '%'].map(u => h('option', { selected: u === c.unidade ? true : null }, u)));
    a.addEventListener('input', () => c.ativo = a.value); ds.addEventListener('input', () => c.dose = ds.value); un.addEventListener('change', () => c.unidade = un.value);
    return h('div', { class: 'comp-linha' }, a, ds, un, h('button', { class: 'link', type: 'button', 'aria-label': 'Remover ativo', onclick: () => { d.componentes.splice(i, 1); desenha(); } }, '×'));
  }));
  const campo = (k, rot, ph) => { const i = h('input', { class: 'campo mini', value: d[k] || '', placeholder: ph || '' }); i.addEventListener('input', () => d[k] = i.value); return h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, rot), i); };
  desenha();
  return h('div', { class: 'bloco' }, h('h2', null, 'Fórmula manipulada'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Nome do modelo'), iT)),
    h('h3', { class: 'sub' }, 'Ativos'), compBox,
    h('button', { class: 'link', type: 'button', onclick: () => { d.componentes.push({ ativo: '', dose: '', unidade: 'mg' }); desenha(); } }, '+ ativo'),
    h('div', { class: 'grade-medidas' }, campo('forma', 'Forma', 'cápsulas, sachê, solução…'), campo('quantidade', 'Quantidade', 'Ex.: 30 doses'), campo('posologia', 'Posologia', 'Ex.: 1 cápsula ao dia, após o almoço'), campo('objetivo', 'Objetivo (opcional)')),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async (ev) => {
      d.componentes = d.componentes.filter(c => c.ativo.trim());
      if (!iT.value.trim() || !d.componentes.length) return avisa(msg, 'erro', 'Dê um nome e inclua pelo menos um ativo.');
      ev.currentTarget.disabled = true;
      try { await aoSalvar(d, iT.value.trim()); } catch (e) { avisa(msg, 'erro', traduzErro(e)); ev.currentTarget.disabled = false; }
    } }, 'Salvar')), msg);
}

/* ---------- modelos de plano e refeições favoritas ---------- */
function bibModelos(el) {
  listaSimples(el, 'modelo_plano', 'Nenhum modelo ainda. No editor de plano, use "Salvar como modelo".', (m) => {
    const t = totaisPlano(m.dados);
    return h('div', { class: 'linha-exame' },
      h('div', null, h('b', null, m.titulo), h('div', { class: 'nota', style: 'margin:0' }, `${METODOS[m.dados.metodo]} · ${m.dados.refeicoes.length} refeições${t ? ' · ' + fmtN(t.kcal, 0) + ' kcal' : ''}`)),
      h('div', { class: 'acoes-linha' }, botaoExcluirBib(m, `o modelo "${m.titulo}"`)));
  });
}
function bibRefeicoes(el) {
  listaSimples(el, 'refeicao', 'Nenhuma refeição favorita. No editor de plano, use ★ numa refeição.', (f) => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, f.titulo), h('div', { class: 'nota', style: 'margin:0' }, [f.categoria, METODOS[f.dados.metodo], f.dados.kcal != null ? fmtN(f.dados.kcal, 0) + ' kcal' : null].filter(Boolean).join(' · '))),
    h('div', { class: 'acoes-linha' }, botaoExcluirBib(f, `a refeição "${f.titulo}"`))));
}

/* ---------- alimentos próprios ---------- */
function bibAlimentos(el) {
  const box = h('div');
  const abrir = (a) => {
    const p = a?.dados?.por100 || {};
    const iN = h('input', { class: 'campo mini', value: a?.titulo || '' }), iM = h('input', { class: 'campo mini', value: a?.dados?.marca || '', placeholder: 'Ex.: marca, fabricante' });
    const selCat = h('select', { class: 'campo mini' }, Object.entries(TACO_CATEGORIAS).map(([k, v]) => h('option', { value: k, selected: String(a?.categoria || 12) === k ? true : null }, v)));
    const ins = {}; const msg = msgEl();
    box.replaceChildren(h('div', { class: 'bloco' }, h('h2', null, a ? a.titulo : 'Novo alimento'),
      h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Nome'), iN), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Marca/fonte'), iM), h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Grupo'), selCat)),
      h('p', { class: 'nota' }, 'Valores por 100 g (ou 100 ml), como no rótulo convertido. Se o rótulo traz por porção, divida pela porção e multiplique por 100.'),
      h('div', { class: 'grade-medidas' }, NUTRIENTES.map(([k, rot, un]) => { ins[k] = h('input', { class: 'campo mini', inputmode: 'decimal', value: p[k] ?? '' }); return h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, rot, h('span', null, ' ' + un)), ins[k]); })),
      h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
        if (!iN.value.trim() || num(ins.kcal.value) == null) return avisa(msg, 'erro', 'Nome e energia são obrigatórios.');
        const por100 = Object.fromEntries(CHAVES_N.map(k => [k, num(ins[k].value)]));
        try { await salvaBib('alimento', iN.value.trim(), { marca: iM.value.trim(), por100 }, { categoria: selCat.value }, a?.id); recarregaBib(); } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
      } }, 'Salvar alimento')), msg));
    box.scrollIntoView({ behavior: 'smooth' });
  };
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' }, h('button', { class: 'btn pri', type: 'button', onclick: () => abrir(null) }, '+ Novo alimento')), box);
  listaSimples(el, 'alimento', 'Nenhum alimento próprio. Cadastre produtos de fabricantes ou preparações que não estão na TACO.', (a) => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, a.titulo), h('div', { class: 'nota', style: 'margin:0' }, `${a.dados.marca || 'próprio'} · ${fmtN(a.dados.por100?.kcal, 0)} kcal/100 g`)),
    h('div', { class: 'acoes-linha' }, h('button', { class: 'link', type: 'button', onclick: () => abrir(a) }, 'editar'), botaoExcluirBib(a, `o alimento "${a.titulo}"`))));
}

/* ---------- medidas caseiras ---------- */
function bibMedidas(el) {
  let ref = null;
  const nome = h('span', { class: 'nota' }, 'Escolha o alimento:');
  const iN = h('input', { class: 'campo mini', placeholder: 'Ex.: colher de sopa cheia' }), iG = h('input', { class: 'campo mini', inputmode: 'decimal', placeholder: 'gramas' });
  const msg = msgEl();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Nova medida'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'As medidas ficam guardadas para cada alimento e aparecem em todos os planos. Use a referência de medidas caseiras que você preferir.'),
    buscaAlimentoCampo((a) => { ref = a.ref; nome.textContent = a.nome; }), nome,
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Medida'), iN), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Gramas'), iG)),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
      if (!ref || !iN.value.trim() || !num(iG.value)) return avisa(msg, 'erro', 'Escolha o alimento e preencha medida e gramas.');
      try { await salvaBib('medida', iN.value.trim(), { ref, gramas: num(iG.value) }); recarregaBib(); } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
    } }, 'Salvar medida')), msg));
  const porAlimento = {}; bibTipo('medida').forEach(m => (porAlimento[m.dados.ref] = porAlimento[m.dados.ref] || []).push(m));
  el.append(h('div', { class: 'bloco' }, Object.keys(porAlimento).length ? Object.entries(porAlimento).sort((x, y) => (alimento(x[0])?.nome || '').localeCompare(alimento(y[0])?.nome || '')).map(([r, ms]) =>
    h('div', { class: 'linha-exame' }, h('div', null, h('b', null, alimento(r)?.nome || 'alimento removido'),
      h('div', { class: 'chips', style: 'margin-top:6px' }, ms.map(m => h('span', { class: 'chip' }, `${m.titulo} = ${fmtN(m.dados.gramas, 0)} g `, h('button', { class: 'link', type: 'button', 'aria-label': 'Excluir medida', onclick: async () => { await apagaBib(m); recarregaBib(); } }, '×')))))))
    : h('p', { class: 'vazio' }, 'Nenhuma medida ainda. Você também pode criar direto no plano, em "+ nova medida…".')));
}

/* ---------- equivalentes ---------- */
function bibEquivalentes(el) {
  const grupos = clona(gruposEquivalentes());
  const msg = msgEl();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Grupos de equivalentes'),
    h('p', { class: 'nota', style: 'margin-top:0' }, 'Baseado na pirâmide alimentar adaptada (Philippi et al., 1999). A porção de cada alimento é calculada para ter as calorias da porção do grupo.'),
    grupos.map(g => {
      const iK = h('input', { class: 'campo mini', inputmode: 'numeric', value: g.kcal, style: 'max-width:90px' }); iK.addEventListener('input', () => { g.kcal = num(iK.value) || g.kcal; lista(); });
      const corpo = h('div');
      const lista = () => corpo.replaceChildren(h('div', { class: 'chips' }, detalheGrupo(g).itens.map(({ a, gramas }) => h('span', { class: 'chip' }, `${a.nome.split(',').slice(0, 2).join(',')} · ${gramas} g `,
        h('button', { class: 'link', type: 'button', 'aria-label': 'Tirar do grupo', onclick: () => { g.refs = g.refs.filter(r => r !== a.ref); lista(); } }, '×')))));
      lista();
      return h('div', { class: 'grupo-equiv' }, h('div', { class: 'cabeca-lista' }, h('b', null, g.nome), h('span', { class: 'nota', style: 'margin-left:auto' }, 'kcal por porção'), iK),
        corpo, buscaAlimentoCampo((a) => { if (!g.refs.includes(a.ref)) g.refs.push(a.ref); lista(); }, 'Adicionar alimento ao grupo'));
    }),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
      const atual = bibTipo('equivalentes')[0];
      try { await salvaBib('equivalentes', 'Grupos de equivalentes', { grupos: grupos.map(({ id, kcal, refs }) => ({ id, kcal, refs })) }, {}, atual?.id); avisa(msg, 'ok', 'Grupos salvos.'); } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
    } }, 'Salvar grupos')), msg));
}

/* ---------- farmácias ---------- */
function bibFarmacias(el) {
  const iN = h('input', { class: 'campo mini' }), iT = h('input', { class: 'campo mini', type: 'tel' }), iE = h('input', { class: 'campo mini' }), msg = msgEl();
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Nova farmácia de manipulação'),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Nome'), iN), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Telefone/WhatsApp'), iT), h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Endereço'), iE)),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
      if (!iN.value.trim()) return avisa(msg, 'erro', 'Informe o nome.');
      try { await salvaBib('farmacia', iN.value.trim(), { telefone: iT.value.trim(), endereco: iE.value.trim() }); recarregaBib(); } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
    } }, 'Salvar farmácia')), msg));
  listaSimples(el, 'farmacia', 'Nenhuma farmácia cadastrada.', (f) => h('div', { class: 'linha-exame' },
    h('div', null, h('b', null, f.titulo), h('div', { class: 'nota', style: 'margin:0' }, [f.dados.telefone, f.dados.endereco].filter(Boolean).join(' · '))),
    h('div', { class: 'acoes-linha' }, botaoExcluirBib(f, `a farmácia "${f.titulo}"`))));
}
