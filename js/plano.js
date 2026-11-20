/* ëat · plano alimentar: por alimentos, por equivalentes ou qualitativo */

const METODOS = { alimentos: 'Por alimentos', equivalentes: 'Por equivalentes', qualitativo: 'Qualitativo' };
const REFEICOES_PADRAO = [['Café da manhã', '07:00'], ['Lanche da manhã', '10:00'], ['Almoço', '12:30'], ['Lanche da tarde', '16:00'], ['Jantar', '19:30']];
const COMPOSICAO = ['Proteína', 'Carboidrato', 'Vegetais', 'Fruta', 'Gordura boa', 'Laticínio', 'Leguminosa', 'Líquidos'];
const novaRefeicao = (nome, horario) => ({ id: novoUUID(), nome, horario, itens: [], porcoes: {}, composicao: [], texto: '' });
const clona = (o) => JSON.parse(JSON.stringify(o));

/* ---------- campo de busca de alimentos (reutilizado em receitas e equivalentes) ---------- */
function buscaAlimentoCampo(aoEscolher, placeholder = 'Buscar alimento (ex.: arroz integral cozido)') {
  const inp = h('input', { class: 'campo mini', type: 'search', placeholder, autocomplete: 'off', 'aria-label': 'Buscar alimento' });
  const lista = h('div', { class: 'busca-lista', role: 'listbox' });
  let resultados = [], sel = -1;
  const pinta = () => lista.replaceChildren(...resultados.map((a, i) => h('button', { type: 'button', role: 'option', class: 'busca-item' + (i === sel ? ' sel' : ''), onmousedown: (e) => { e.preventDefault(); escolhe(a); } },
    h('span', null, a.nome), h('small', null, `${a.fonte} · ${a.por100.kcal != null ? fmtN(a.por100.kcal, 0) + ' kcal/100 g' : 'sem kcal'}`))));
  const escolhe = (a) => { inp.value = ''; resultados = []; pinta(); aoEscolher(a); inp.focus(); };
  inp.addEventListener('input', () => { resultados = buscaAlimentos(inp.value); sel = resultados.length ? 0 : -1; pinta(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, resultados.length - 1); pinta(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); pinta(); e.preventDefault(); }
    else if (e.key === 'Enter' && resultados[sel]) { escolhe(resultados[sel]); e.preventDefault(); }
    else if (e.key === 'Escape') { resultados = []; pinta(); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { resultados = []; pinta(); }, 150));
  return h('div', { class: 'busca-alimento' }, inp, lista);
}

/* ---------- quantidade: gramas ou medida caseira ---------- */
function campoQuantidade(item, aoMudar) {
  const opcoes = () => [{ nome: 'g', gramas: 1 }].concat(medidasDe(item.ref));
  const sel = h('select', { class: 'campo mini un', 'aria-label': 'Unidade' });
  const qtd = h('input', { class: 'campo mini qtd', inputmode: 'decimal', 'aria-label': 'Quantidade' });
  const preenche = () => {
    sel.replaceChildren(...opcoes().map(o => h('option', { value: o.nome, selected: (item.medida || 'g') === o.nome ? true : null }, o.nome === 'g' ? 'g' : `${o.nome} (${fmtN(o.gramas, 0)} g)`)),
      h('option', { value: '__nova' }, '+ nova medida…'));
    qtd.value = item.medida ? String(item.qtd ?? 1).replace('.', ',') : String(Math.round(num(item.gramas) || 0));
  };
  preenche();
  qtd.addEventListener('input', () => {
    const q = num(qtd.value) || 0; const m = opcoes().find(o => o.nome === (item.medida || 'g'));
    if (item.medida) { item.qtd = q; item.gramas = q * (m?.gramas || 1); } else item.gramas = q;
    aoMudar();
  });
  sel.addEventListener('change', async () => {
    if (sel.value === '__nova') {
      const nome = prompt(`Nome da medida para "${alimento(item.ref)?.nome}" (ex.: colher de sopa cheia, unidade média, fatia):`)?.trim();
      const g = nome ? num(prompt(`Quantos gramas tem 1 ${nome}?`)) : null;
      if (nome && g) { try { await salvaBib('medida', nome, { ref: item.ref, gramas: g }); item.medida = nome; item.qtd = 1; item.gramas = g; } catch (e) { alert(traduzErro(e)); } }
      preenche(); aoMudar(); return;
    }
    const m = opcoes().find(o => o.nome === sel.value);
    if (sel.value === 'g') { delete item.medida; delete item.qtd; }
    else { item.medida = m.nome; item.qtd = Math.max(0.5, Math.round((num(item.gramas) || m.gramas) / m.gramas * 2) / 2); item.gramas = item.qtd * m.gramas; }
    preenche(); aoMudar();
  });
  return h('div', { class: 'qtd-campo' }, qtd, sel);
}

/* ---------- resumo nutricional do plano ---------- */
function totaisRefeicao(r, metodo) {
  if (metodo === 'alimentos') return somaItens(r.itens);
  if (metodo === 'equivalentes') {
    const t = { kcal: 0, prot: 0, carb: 0, lip: 0, fibra: 0 };
    gruposEquivalentes().forEach(g => { const n = num(r.porcoes?.[g.id]) || 0; if (!n) return; const d = detalheGrupo(g);
      t.kcal += g.kcal * n; ['prot', 'carb', 'lip', 'fibra'].forEach(k => t[k] += d.media[k] * n); });
    return t;
  }
  return null;
}
function totaisPlano(dados) {
  if (dados.metodo === 'qualitativo') return null;
  const t = { kcal: 0, prot: 0, carb: 0, lip: 0, fibra: 0, sodio: 0 };
  dados.refeicoes.forEach(r => { const x = totaisRefeicao(r, dados.metodo); Object.keys(t).forEach(k => t[k] += x[k] || 0); });
  return t;
}
function barraResumo(dados) {
  const t = totaisPlano(dados);
  if (!t) return h('div', { class: 'resumo-plano' }, h('span', null, 'Plano qualitativo: sem cálculo de calorias.'));
  const meta = num(dados.metaKcal), d = distribuicao(t);
  const ant = doTipo('antropometria'); const peso = num(ant[ant.length - 1]?.dados.peso);
  const pct = meta ? t.kcal / meta * 100 : null;
  const it = (rot, val, sub, cls) => h('div', { class: 'rp-item ' + (cls || '') }, h('small', null, rot), h('b', null, val), sub ? h('span', null, sub) : null);
  return h('div', { class: 'resumo-plano', 'aria-live': 'polite' },
    it('Energia', `${fmtN(t.kcal, 0)} kcal`, meta ? `${fmtN(pct, 0)}% da meta (${fmtN(meta, 0)})` : 'sem meta', meta && Math.abs(pct - 100) > 10 ? 'fora' : ''),
    it('Proteína', `${fmtN(t.prot, 0)} g`, `${fmtN(d.p, 0)}%${peso ? ' · ' + fmtN(t.prot / peso, 1) + ' g/kg' : ''}`),
    it('Carboidrato', `${fmtN(t.carb, 0)} g`, `${fmtN(d.c, 0)}%`),
    it('Lipídeos', `${fmtN(t.lip, 0)} g`, `${fmtN(d.l, 0)}%`),
    it('Fibra', `${fmtN(t.fibra, 0)} g`, dados.metodo === 'equivalentes' ? 'média dos grupos' : (t.sodio ? `sódio ${fmtN(t.sodio, 0)} mg` : '')));
}

/* ---------- aba do plano na ficha ---------- */
let editorPlano = null; // { id, data, dados, sujo }
async function abaPlano(el) {
  try { await carregaBiblioteca(); } catch (e) { el.append(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
  if (editorPlano && editorPlano.pac === F.paciente.id) return telaEditorPlano(el);
  editorPlano = null;
  const planos = doTipo('plano').slice().reverse();
  const box = h('div');
  el.append(h('div', { class: 'linha-btn', style: 'margin-top:0' }, h('button', { class: 'btn pri', type: 'button', onclick: () => { box.replaceChildren(formNovoPlano()); box.scrollIntoView({ behavior: 'smooth' }); } }, '+ Novo plano')), box);
  if (!planos.length) { el.append(h('div', { class: 'bloco' }, h('p', { class: 'vazio' }, 'Nenhum plano ainda.'))); return; }
  el.append(h('div', { class: 'bloco' }, h('h2', null, 'Planos'), planos.map(r => {
    const t = totaisPlano(r.dados);
    return h('div', { class: 'linha-exame' },
      h('div', null, h('b', null, r.dados.titulo || 'Plano alimentar'), r.dados.ativo ? h('span', { class: 'selo-nova', style: 'background:var(--musgo)' }, 'atual') : null,
        h('div', { class: 'nota', style: 'margin:0' }, `${dataCurta(r.data)} · ${METODOS[r.dados.metodo]} · ${r.dados.refeicoes.length} refeições${t ? ' · ' + fmtN(t.kcal, 0) + ' kcal' : ''}`)),
      h('div', { class: 'acoes-linha' },
        h('button', { class: 'link', type: 'button', onclick: () => { editorPlano = { pac: F.paciente.id, id: r.id, data: r.data, dados: clona(r.dados) }; render(); } }, 'abrir'),
        h('button', { class: 'link', type: 'button', onclick: () => abrePDFPlano(r) }, 'PDF'),
        h('button', { class: 'link', type: 'button', onclick: () => { editorPlano = { pac: F.paciente.id, data: hoje(), dados: { ...clona(r.dados), titulo: (r.dados.titulo || 'Plano') + ' (cópia)', ativo: false }, sujo: true }; render(); } }, 'duplicar'),
        h('button', { class: 'link', type: 'button', onclick: async () => { if (confirm(`Excluir o plano "${r.dados.titulo}"?`)) { await apagaRegistro(r); render(); } } }, 'excluir')));
  })));
}
function formNovoPlano() {
  let metodo = 'alimentos';
  const modelos = bibTipo('modelo_plano');
  const selModelo = h('select', { class: 'campo mini' }, h('option', { value: '' }, 'Em branco (refeições padrão)'), modelos.map(m => h('option', { value: m.id }, `${m.titulo} · ${METODOS[m.dados.metodo] || ''}`)));
  const ops = h('div', { class: 'opcoes-metodo' }, Object.entries(METODOS).map(([k, rot]) => {
    const b = h('button', { type: 'button', class: 'op' + (k === metodo ? ' on' : ''), onclick: () => { metodo = k; ops.querySelectorAll('.op').forEach(x => x.classList.toggle('on', x === b)); } },
      h('span', null, rot, h('small', { class: 'desc' }, k === 'alimentos' ? 'Itens e quantidades definidos, com substituições' : k === 'equivalentes' ? 'Porções por grupo; a paciente escolhe na lista de trocas' : 'Orientações sobre a composição das refeições, sem quantidades')));
    return b;
  }));
  const ultimaE = doTipo('energia').slice(-1)[0];
  return h('div', { class: 'bloco' }, h('h2', null, 'Novo plano'),
    h('h3', { class: 'sub' }, 'Método'), ops,
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Começar de'), selModelo)),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: () => {
      const m = modelos.find(x => x.id === selModelo.value);
      const dados = m ? { ...clona(m.dados), titulo: m.titulo } : { titulo: 'Plano alimentar', metodo, refeicoes: REFEICOES_PADRAO.map(([n, hr]) => novaRefeicao(n, hr)) };
      if (m && dados.metodo !== metodo && !confirm(`O modelo é "${METODOS[dados.metodo]}". Usar o método do modelo?`)) return;
      dados.metaKcal = dados.metaKcal || (ultimaE ? Math.round(ultimaE.dados.resultado?.vet) : null);
      dados.refeicoes.forEach(r => { r.id = novoUUID(); });
      editorPlano = { pac: F.paciente.id, data: hoje(), dados, sujo: true }; render();
    } }, 'Criar plano')));
}

/* ---------- editor ---------- */
function telaEditorPlano(el) {
  const E = editorPlano, D = E.dados;
  const resumoBox = h('div', { class: 'resumo-sticky' });
  const marca = () => { E.sujo = true; resumoBox.replaceChildren(barraResumo(D)); salvarBtn.textContent = 'Salvar plano •'; };
  const msg = msgEl();
  const salvarBtn = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    salvarBtn.disabled = true;
    try {
      if (D.ativo) for (const r of doTipo('plano')) if (r.id !== E.id && r.dados.ativo) await salvaRegistro('plano', r.data, { ...r.dados, ativo: false }, null, r.id);
      const reg = await salvaRegistro('plano', E.data || hoje(), D, null, E.id);
      E.id = reg.id; E.sujo = false; salvarBtn.textContent = 'Salvo ✓'; avisa(msg, 'ok', 'Plano salvo na ficha.');
    } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
    salvarBtn.disabled = false;
  } }, E.sujo ? 'Salvar plano •' : 'Salvar plano');
  const fechar = () => { if (E.sujo && !confirm('Sair sem salvar as alterações?')) return; editorPlano = null; render(); };
  const iTit = h('input', { class: 'campo mini', value: D.titulo || '' }); iTit.addEventListener('input', () => { D.titulo = iTit.value; marca(); });
  const iMeta = h('input', { class: 'campo mini', inputmode: 'numeric', value: D.metaKcal ?? '' }); iMeta.addEventListener('input', () => { D.metaKcal = num(iMeta.value); marca(); });
  const iData = h('input', { class: 'campo mini', type: 'date', value: E.data || hoje() }); iData.addEventListener('change', () => { E.data = iData.value; marca(); });
  const cAtivo = h('input', { type: 'checkbox', checked: D.ativo ? true : null }); cAtivo.addEventListener('change', () => { D.ativo = cAtivo.checked; marca(); });
  const iObs = h('textarea', { class: 'campo', style: 'min-height:70px;font-size:15px', placeholder: 'Observações gerais do plano (aparecem no PDF)' }, D.observacoes || '');
  iObs.addEventListener('input', () => { D.observacoes = iObs.value; marca(); });
  const refeicoesBox = h('div');
  const desenhaRefeicoes = () => { refeicoesBox.replaceChildren(...D.refeicoes.map((r, i) => cartaoRefeicao(r, i))); marca(); };
  function cartaoRefeicao(r, i) {
    const iNome = h('input', { class: 'campo mini nome-ref', value: r.nome }); iNome.addEventListener('input', () => { r.nome = iNome.value; marca(); });
    const iHora = h('input', { class: 'campo mini', type: 'time', value: r.horario || '' }); iHora.addEventListener('input', () => { r.horario = iHora.value; marca(); });
    const totalRef = h('span', { class: 'total-ref' });
    const atualizaTotal = () => { const t = totaisRefeicao(r, D.metodo); totalRef.textContent = t ? `${fmtN(t.kcal, 0)} kcal` : ''; marca(); };
    let corpo;
    if (D.metodo === 'alimentos') corpo = corpoAlimentos(r, atualizaTotal);
    else if (D.metodo === 'equivalentes') corpo = corpoEquivalentes(r, atualizaTotal);
    else corpo = corpoQualitativo(r, marca);
    const iTxt = D.metodo !== 'qualitativo' ? h('textarea', { class: 'campo obs-ref', placeholder: 'Observação desta refeição (opcional)' }, r.texto || '') : null;
    iTxt?.addEventListener('input', () => { r.texto = iTxt.value; marca(); });
    atualizaTotal();
    return h('div', { class: 'refeicao' },
      h('div', { class: 'ref-cab' }, iHora, iNome, totalRef,
        h('div', { class: 'ref-acoes' },
          h('button', { class: 'link', type: 'button', title: 'Subir', disabled: i === 0 ? true : null, onclick: () => { D.refeicoes.splice(i - 1, 0, D.refeicoes.splice(i, 1)[0]); desenhaRefeicoes(); } }, '↑'),
          h('button', { class: 'link', type: 'button', title: 'Descer', disabled: i === D.refeicoes.length - 1 ? true : null, onclick: () => { D.refeicoes.splice(i + 1, 0, D.refeicoes.splice(i, 1)[0]); desenhaRefeicoes(); } }, '↓'),
          h('button', { class: 'link', type: 'button', title: 'Salvar como refeição favorita', onclick: async () => {
            const nome = prompt('Nome da refeição favorita:', r.nome); if (!nome) return;
            const t = totaisRefeicao(r, D.metodo);
            try { await salvaBib('refeicao', nome, { metodo: D.metodo, itens: r.itens, porcoes: r.porcoes, composicao: r.composicao, texto: r.texto, kcal: t?.kcal ?? null }, { categoria: r.nome }); alert('Salva nas refeições favoritas.'); } catch (e) { alert(traduzErro(e)); }
          } }, '★'),
          h('button', { class: 'link', type: 'button', title: 'Remover refeição', onclick: () => { if (confirm(`Remover "${r.nome}"?`)) { D.refeicoes.splice(i, 1); desenhaRefeicoes(); } } }, '×'))),
      corpo, iTxt);
  }
  const favs = () => bibTipo('refeicao').filter(f => f.dados.metodo === D.metodo);
  const adicionar = h('div', { class: 'linha-btn' },
    h('button', { class: 'btn sec', type: 'button', onclick: () => { D.refeicoes.push(novaRefeicao('Nova refeição', '')); desenhaRefeicoes(); } }, '+ Refeição'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => abreFavoritas() }, '★ Refeição favorita'));
  const favBox = h('div');
  function abreFavoritas() {
    const lista = favs();
    const filtro = h('input', { class: 'campo mini', type: 'search', placeholder: 'Filtrar por nome ou categoria' });
    const fMin = h('input', { class: 'campo mini', inputmode: 'numeric', placeholder: 'kcal mín' }), fMax = h('input', { class: 'campo mini', inputmode: 'numeric', placeholder: 'kcal máx' });
    const res = h('div');
    const desenha = () => {
      const t = semAcentos(filtro.value), mi = num(fMin.value), ma = num(fMax.value);
      const vis = lista.filter(f => (!t || semAcentos(f.titulo + ' ' + f.categoria).includes(t)) && (mi == null || (f.dados.kcal ?? 0) >= mi) && (ma == null || (f.dados.kcal ?? 1e9) <= ma));
      res.replaceChildren(...(vis.length ? vis.map(f => h('div', { class: 'fav-item' },
        h('div', null, h('b', null, f.titulo), h('div', { class: 'nota', style: 'margin:0' }, [f.categoria, f.dados.kcal != null ? fmtN(f.dados.kcal, 0) + ' kcal' : null,
          (f.dados.itens || []).map(x => alimento(x.ref)?.nome?.split(',')[0]).filter(Boolean).slice(0, 4).join(', ')].filter(Boolean).join(' · '))),
        h('button', { class: 'btn sec', type: 'button', onclick: () => { const r = novaRefeicao(f.categoria || f.titulo, ''); Object.assign(r, clona({ itens: f.dados.itens || [], porcoes: f.dados.porcoes || {}, composicao: f.dados.composicao || [], texto: f.dados.texto || '' })); D.refeicoes.push(r); favBox.replaceChildren(); desenhaRefeicoes(); } }, 'Adicionar')))
        : [h('p', { class: 'vazio' }, lista.length ? 'Nada com esse filtro.' : `Nenhuma favorita do método "${METODOS[D.metodo]}". Use ★ numa refeição para salvar.`)]));
    };
    [filtro, fMin, fMax].forEach(x => x.addEventListener('input', desenha)); desenha();
    favBox.replaceChildren(h('div', { class: 'bloco' }, h('h2', null, 'Refeições favoritas'), h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, filtro), fMin, fMax), res,
      h('button', { class: 'link', type: 'button', onclick: () => favBox.replaceChildren() }, 'fechar')));
  }
  el.append(
    h('div', { class: 'bloco', style: 'margin-top:0' },
      h('div', { class: 'cabeca-lista' }, h('h2', null, `${METODOS[D.metodo]}`), h('button', { class: 'link', type: 'button', style: 'margin-left:auto', onclick: fechar }, '← voltar aos planos')),
      h('div', { class: 'grade-medidas' },
        h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Título'), iTit),
        h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Data'), iData),
        D.metodo !== 'qualitativo' ? h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Meta', h('span', null, ' kcal')), iMeta) : null),
      h('label', { class: 'check' }, cAtivo, 'Plano atual da paciente')),
    resumoBox, refeicoesBox, adicionar, favBox,
    h('div', { class: 'bloco' }, h('h2', null, 'Observações'), iObs),
    h('div', { class: 'linha-btn barra-salvar' }, salvarBtn,
      h('button', { class: 'btn sec', type: 'button', onclick: async () => { const nome = prompt('Nome do modelo:', D.titulo); if (!nome) return;
        try { await salvaBib('modelo_plano', nome, clona({ ...D, ativo: false, titulo: nome })); avisa(msg, 'ok', `Modelo "${nome}" salvo na biblioteca.`); } catch (e) { avisa(msg, 'erro', traduzErro(e)); } } }, 'Salvar como modelo'),
      E.id ? h('button', { class: 'btn sec', type: 'button', onclick: () => { if (E.sujo) return avisa(msg, 'erro', 'Salve o plano antes de gerar o PDF.'); abrePDFPlano(F.registros.find(r => r.id === E.id)); } }, 'PDF para a paciente') : null),
    msg);
  const estavaSujo = !!E.sujo;
  desenhaRefeicoes();
  E.sujo = estavaSujo; salvarBtn.textContent = E.sujo ? 'Salvar plano •' : 'Salvar plano';
}

function corpoAlimentos(r, atualiza) {
  const box = h('div', { class: 'itens' });
  const desenha = () => { box.replaceChildren(...r.itens.map((it, i) => linhaItem(r, it, i, desenha, atualiza))); atualiza(); };
  // receita entra como "1 porção"; demais alimentos como 100 g (ou a primeira medida caseira cadastrada)
  const busca = buscaAlimentoCampo((a) => {
    const m = a.porcaoG ? { nome: 'porção', gramas: a.porcaoG } : medidasDe(a.ref)[0];
    r.itens.push(m ? { ref: a.ref, gramas: m.gramas, medida: m.nome, qtd: 1, subs: [] } : { ref: a.ref, gramas: 100, subs: [] });
    desenha();
  });
  desenha();
  return h('div', null, box, busca);
}
function linhaItem(r, it, i, redesenha, atualiza) {
  const a = alimento(it.ref);
  const kcal = h('span', { class: 'kcal-item' });
  const pintaKcal = () => { kcal.textContent = `${fmtN(nutrientesItem(it).kcal, 0)} kcal`; atualiza(); };
  const subsBox = h('div', { class: 'subs', hidden: it.subs?.length ? null : true });
  const desenhaSubs = () => {
    it.subs = it.subs || [];
    subsBox.replaceChildren(h('div', { class: 'subs-tit' }, 'Pode trocar por:'),
      ...it.subs.map((s, k) => {
        const kcalS = h('span', { class: 'kcal-item' }, `${fmtN(nutrientesItem(s).kcal, 0)} kcal`);
        return h('div', { class: 'sub-linha' },
          h('span', { class: 'nome-item' }, alimento(s.ref)?.nome || 'alimento removido'),
          campoQuantidade(s, () => { kcalS.textContent = `${fmtN(nutrientesItem(s).kcal, 0)} kcal`; }),
          kcalS,
          h('button', { class: 'link', type: 'button', 'aria-label': 'Remover substituição', onclick: () => { it.subs.splice(k, 1); desenhaSubs(); atualiza(); } }, '×'));
      }),
      buscaAlimentoCampo((b) => { it.subs.push({ ref: b.ref, gramas: gramasEquivalentes(it.ref, num(it.gramas) || 0, b.ref) }); desenhaSubs(); atualiza(); }, 'Adicionar substituição (quantidade com as mesmas calorias)'));
    subsBtn.textContent = `⇄ ${it.subs.length || ''}`.trim();
  };
  const subsBtn = h('button', { class: 'link', type: 'button', title: 'Substituições', onclick: () => { subsBox.hidden = !subsBox.hidden; } }, '⇄');
  const linha = h('div', { class: 'item' },
    h('div', { class: 'item-linha' },
      h('span', { class: 'nome-item' }, a?.nome || 'alimento removido', a && a.fonte !== 'TACO' ? h('small', null, ' · ' + a.fonte) : null),
      campoQuantidade(it, pintaKcal), kcal, subsBtn,
      h('button', { class: 'link', type: 'button', 'aria-label': 'Remover alimento', onclick: () => { r.itens.splice(i, 1); redesenha(); } }, '×')),
    subsBox);
  pintaKcal(); desenhaSubs();
  return linha;
}
function corpoEquivalentes(r, atualiza) {
  r.porcoes = r.porcoes || {};
  return h('div', { class: 'equiv' }, gruposEquivalentes().map(g => {
    const v = h('span', { class: 'equiv-n' }, fmtN(num(r.porcoes[g.id]) || 0, 1));
    const muda = (d) => { r.porcoes[g.id] = Math.max(0, (num(r.porcoes[g.id]) || 0) + d); if (!r.porcoes[g.id]) delete r.porcoes[g.id]; v.textContent = fmtN(num(r.porcoes[g.id]) || 0, 1); linha.classList.toggle('on', !!r.porcoes[g.id]); atualiza(); };
    const linha = h('div', { class: 'equiv-linha' + (r.porcoes[g.id] ? ' on' : '') },
      h('span', null, g.nome, h('small', null, ` · ${g.kcal} kcal/porção`)),
      h('div', { class: 'stepper' }, h('button', { type: 'button', 'aria-label': 'menos meia porção', onclick: () => muda(-0.5) }, '−'), v, h('button', { type: 'button', 'aria-label': 'mais meia porção', onclick: () => muda(0.5) }, '+')));
    return linha;
  }));
}
function corpoQualitativo(r, marca) {
  r.composicao = r.composicao || [];
  const chips = h('div', { class: 'chips' }, COMPOSICAO.map(c => {
    const b = h('button', { type: 'button', class: 'chip' + (r.composicao.includes(c) ? ' on' : ''), onclick: () => {
      r.composicao.includes(c) ? r.composicao.splice(r.composicao.indexOf(c), 1) : r.composicao.push(c); b.classList.toggle('on'); marca(); } }, c);
    return b;
  }));
  const t = h('textarea', { class: 'campo', style: 'min-height:80px;font-size:15px', placeholder: 'Ex.: Monte o prato com metade de vegetais, 1/4 de proteína magra e 1/4 de carboidrato integral. Prefira frutas inteiras ao suco.' }, r.texto || '');
  t.addEventListener('input', () => { r.texto = t.value; marca(); });
  return h('div', null, h('p', { class: 'nota', style: 'margin:4px 0' }, 'Composição da refeição:'), chips, t);
}

/* ---------- lista de compras ---------- */
function listaCompras(dados, dias = 7) {
  const soma = {};
  const add = (ref, g) => { soma[ref] = (soma[ref] || 0) + g; };
  dados.refeicoes.forEach(r => (r.itens || []).forEach(it => {
    const a = alimento(it.ref);
    if (a?.item?.tipo === 'receita') (a.item.dados.ingredientes || []).forEach(ing => add(ing.ref, (num(ing.gramas) || 0) * (num(it.gramas) || 0) / (a.porcaoG * (num(a.item.dados.porcoes) || 1))));
    else add(it.ref, num(it.gramas) || 0);
  }));
  const grupos = {};
  Object.entries(soma).forEach(([ref, g]) => { const a = alimento(ref); if (!a) return; const cat = TACO_CATEGORIAS[a.categoria] || 'Outros';
    (grupos[cat] = grupos[cat] || []).push({ nome: a.nome, gramas: g * dias }); });
  return Object.entries(grupos).map(([cat, itens]) => ({ cat, itens: itens.sort((x, y) => x.nome.localeCompare(y.nome)) }));
}
const fmtPeso = (g) => g >= 1000 ? `${fmtN(g / 1000, 1)} kg` : `${fmtN(Math.ceil(g / 10) * 10, 0)} g`;

// aviso ao fechar a página com plano não salvo
window.addEventListener('beforeunload', (e) => { if (editorPlano?.sujo) { e.preventDefault(); e.returnValue = ''; } });
