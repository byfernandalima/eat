/* ëat · banco de alimentos: TACO + alimentos próprios + receitas, medidas caseiras, cálculo e equivalentes */

const NUTRIENTES = [
  ['kcal', 'Energia', 'kcal'], ['prot', 'Proteína', 'g'], ['carb', 'Carboidrato', 'g'], ['lip', 'Lipídeos', 'g'],
  ['fibra', 'Fibra', 'g'], ['sodio', 'Sódio', 'mg'], ['calcio', 'Cálcio', 'mg'], ['ferro', 'Ferro', 'mg'],
  ['potassio', 'Potássio', 'mg'], ['magnesio', 'Magnésio', 'mg'], ['zinco', 'Zinco', 'mg'], ['vitC', 'Vitamina C', 'mg'], ['colesterol', 'Colesterol', 'mg']
];
const CHAVES_N = NUTRIENTES.map(n => n[0]);
const semAcentos = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Biblioteca da nutri carregada uma vez por sessão (alimentos próprios, medidas, receitas, modelos…)
let BIB = null;
async function carregaBiblioteca(forcar) {
  if (BIB && !forcar) return BIB;
  const { data, error } = await supa.from('biblioteca').select('*').order('titulo');
  if (error) throw error;
  BIB = data || [];
  indiceAlimentos = null;
  return BIB;
}
const bibTipo = (tipo) => (BIB || []).filter(b => b.tipo === tipo);
async function salvaBib(tipo, titulo, dados, extra = {}, id) {
  const linha = { nutri_id: sessao.user.id, tipo, titulo, dados, atualizado_em: new Date().toISOString(), ...extra };
  const q = id ? supa.from('biblioteca').update(linha).eq('id', id).select().single() : supa.from('biblioteca').insert(linha).select().single();
  const { data, error } = await q;
  if (error) throw error;
  BIB = (BIB || []).filter(b => b.id !== data.id).concat(data);
  indiceAlimentos = null;
  return data;
}
async function apagaBib(item) {
  if (item.arquivo) await supa.storage.from('arquivos').remove([item.arquivo]);
  const { error } = await supa.from('biblioteca').delete().eq('id', item.id);
  if (error) throw error;
  BIB = BIB.filter(b => b.id !== item.id);
  indiceAlimentos = null;
}

/* ---------- índice único de alimentos: ref = "taco:ID" | "proprio:UUID" | "receita:UUID" ---------- */
let indiceAlimentos = null;
function tacoParaObj(a) {
  const [id, cat, nome, kcal, prot, carb, lip, fibra, sodio, calcio, ferro, potassio, magnesio, zinco, vitC, colesterol] = a;
  return { ref: 'taco:' + id, fonte: 'TACO', nome, categoria: cat, por100: { kcal, prot, carb, lip, fibra, sodio, calcio, ferro, potassio, magnesio, zinco, vitC, colesterol } };
}
function receitaParaObj(r) {
  const d = r.dados || {};
  const tot = somaItens(d.ingredientes || []);
  const pesoTotal = num(d.pesoFinal) || (d.ingredientes || []).reduce((s, i) => s + (num(i.gramas) || 0), 0);
  const porcoes = Math.max(1, num(d.porcoes) || 1);
  const por100 = {}; CHAVES_N.forEach(k => { por100[k] = pesoTotal ? tot[k] / pesoTotal * 100 : null; });
  return { ref: 'receita:' + r.id, fonte: 'Receita', nome: r.titulo, categoria: 13, por100, porcaoG: pesoTotal / porcoes, item: r };
}
function indice() {
  if (indiceAlimentos) return indiceAlimentos;
  const lista = TACO.map(tacoParaObj);
  bibTipo('alimento').forEach(b => lista.push({ ref: 'proprio:' + b.id, fonte: b.dados.marca || 'Próprio', nome: b.titulo, categoria: num(b.categoria) || 11, por100: b.dados.por100 || {}, item: b }));
  bibTipo('receita').forEach(r => { try { lista.push(receitaParaObj(r)); } catch (_) { /* receita incompleta */ } });
  lista.forEach(a => { a.busca = semAcentos(a.nome); });
  indiceAlimentos = { lista, porRef: Object.fromEntries(lista.map(a => [a.ref, a])) };
  return indiceAlimentos;
}
const alimento = (ref) => indice().porRef[ref] || null;
function buscaAlimentos(termo, limite = 15) {
  const palavras = semAcentos(termo).split(/[\s,]+/).filter(Boolean);
  if (!palavras.length) return [];
  return indice().lista
    .filter(a => palavras.every(p => a.busca.includes(p)))
    .map(a => ({ a, peso: (a.fonte !== 'TACO' ? -2 : 0) + (a.busca.startsWith(palavras[0]) ? -1 : 0) + a.nome.length / 100 }))
    .sort((x, y) => x.peso - y.peso).slice(0, limite).map(x => x.a);
}

/* ---------- medidas caseiras (cadastradas pela nutri, reaproveitadas em todos os planos) ---------- */
function medidasDe(ref) {
  const m = bibTipo('medida').filter(b => b.dados.ref === ref).map(b => ({ nome: b.titulo, gramas: num(b.dados.gramas), id: b.id }));
  const a = alimento(ref);
  if (a?.porcaoG) m.unshift({ nome: 'porção', gramas: a.porcaoG });
  return m;
}
// plural das palavras da medida até a preposição: "colher de servir" → "colheres de servir",
// "unidade média" → "unidades médias", "pão francês" → "pães franceses"
const PLURAIS_IRREGULARES = { 'pão': 'pães', 'mão': 'mãos', 'grão': 'grãos', 'cálice': 'cálices' };
function pluralPalavra(p) {
  const min = p.toLowerCase();
  if (PLURAIS_IRREGULARES[min]) return PLURAIS_IRREGULARES[min];
  if (/ês$/i.test(p)) return p.replace(/ês$/i, 'eses');
  if (/[rz]$/i.test(p)) return p + 'es';
  if (/ão$/i.test(p)) return p.replace(/ão$/i, 'ões');
  if (/m$/i.test(p)) return p.replace(/m$/i, 'ns');
  if (/[aeiou]l$/i.test(p)) return p.replace(/l$/i, 'is');
  if (/[aeiouáéíóúâêô]$/i.test(p)) return p + 's';
  return p;
}
function pluralMedida(m) {
  const palavras = m.split(' ');
  const i = palavras.findIndex((w, k) => k > 0 && /^(de|do|da|dos|das|com|sem|em|para)$/i.test(w));
  const fim = i === -1 ? palavras.length : i;
  // não mexe em números, siglas ou palavras em maiúsculas (ex.: "ml", "UHT")
  return palavras.map((w, k) => k < fim && !/^\d/.test(w) && w !== w.toUpperCase() ? pluralPalavra(w) : w).join(' ');
}
// texto da quantidade: "2 colheres de sopa (50 g)"
function textoQtd(item) {
  const g = num(item.gramas) || 0;
  if (item.medida && num(item.qtd)) {
    const q = num(item.qtd);
    return `${fmtN(q, q % 1 ? 1 : 0)} ${q > 1 ? pluralMedida(item.medida) : item.medida} (${fmtN(g, 0)} g)`;
  }
  return `${fmtN(g, 0)} g`;
}

/* ---------- cálculo ---------- */
function nutrientesItem(item) {
  const a = alimento(item.ref); const g = num(item.gramas) || 0;
  const r = {}; CHAVES_N.forEach(k => { const v = a?.por100?.[k]; r[k] = v == null ? 0 : v * g / 100; });
  return r;
}
function somaItens(itens) {
  const t = {}; CHAVES_N.forEach(k => t[k] = 0);
  itens.forEach(i => { const n = nutrientesItem(i); CHAVES_N.forEach(k => t[k] += n[k]); });
  return t;
}
// gramas de um substituto com a mesma energia do item original
function gramasEquivalentes(refOrigem, gOrigem, refDestino) {
  const a = alimento(refOrigem), b = alimento(refDestino);
  const kcal = (a?.por100?.kcal || 0) * gOrigem / 100;
  if (!b?.por100?.kcal) return gOrigem;
  return Math.round(kcal / b.por100.kcal * 100 / 5) * 5;
}
const distribuicao = (t) => {
  const kp = t.prot * 4, kc = t.carb * 4, kl = t.lip * 9, tot = kp + kc + kl || 1;
  return { p: kp / tot * 100, c: kc / tot * 100, l: kl / tot * 100 };
};

/* ---------- grupos de equivalentes (pirâmide alimentar adaptada, Philippi et al., 1999) ---------- */
// kcal por porção de referência; a lista de alimentos de cada grupo é editável na Biblioteca
const GRUPOS_EQUIV_PADRAO = [
  { id: 'cereais', nome: 'Cereais, pães, tubérculos e raízes', kcal: 150, sugestoes: ['Arroz, integral, cozido', 'Arroz, tipo 1, cozido', 'Pão, trigo, francês', 'Pão, trigo, forma, integral', 'Batata, inglesa, cozida', 'Batata, doce, cozida', 'Mandioca, cozida', 'Macarrão, trigo, cru', 'Aveia, flocos, crua', 'Cuscuz, de milho, cozido com sal', 'Tapioca, com manteiga'] },
  { id: 'hortalicas', nome: 'Hortaliças', kcal: 15, sugestoes: ['Alface, crespa, crua', 'Tomate, com semente, cru', 'Cenoura, crua', 'Brócolis, cozido', 'Abobrinha, italiana, cozida', 'Pepino, cru', 'Couve, manteiga, refogada', 'Chuchu, cozido', 'Abóbora, cabotian, cozida'] },
  { id: 'frutas', nome: 'Frutas', kcal: 70, sugestoes: ['Banana, prata, crua', 'Maçã, Fuji, com casca, crua', 'Mamão, Papaia, cru', 'Laranja, pêra, crua', 'Melancia, crua', 'Morango, cru', 'Abacaxi, cru', 'Manga, Palmer, crua', 'Uva, Itália, crua', 'Kiwi, cru'] },
  { id: 'leguminosas', nome: 'Leguminosas', kcal: 55, sugestoes: ['Feijão, carioca, cozido', 'Feijão, preto, cozido', 'Lentilha, cozida', 'Grão-de-bico, cru', 'Ervilha, em vagem'] },
  { id: 'carnes', nome: 'Carnes e ovos', kcal: 190, sugestoes: ['Frango, peito, sem pele, grelhado', 'Carne, bovina, patinho, sem gordura, grelhado', 'Ovo, de galinha, inteiro, cozido/10minutos', 'Merluza, filé, assado', 'Carne, bovina, músculo, sem gordura, cozido', 'Sardinha, conserva em óleo', 'Atum, conserva em óleo'] },
  { id: 'leite', nome: 'Leite e derivados', kcal: 120, sugestoes: ['Leite, de vaca, desnatado, UHT', 'Leite, de vaca, integral', 'Iogurte, natural', 'Iogurte, natural, desnatado', 'Queijo, minas, frescal', 'Queijo, mozarela', 'Queijo, requeijão, cremoso'] },
  { id: 'oleos', nome: 'Óleos e gorduras', kcal: 73, sugestoes: ['Azeite, de oliva, extra virgem', 'Óleo, de soja', 'Manteiga, com sal', 'Margarina, com óleo hidrogenado, com sal (65% de lipídeos)', 'Castanha-do-Brasil, crua', 'Amendoim, grão, cru'] },
  { id: 'acucares', nome: 'Açúcares e doces', kcal: 110, sugestoes: ['Açúcar, refinado', 'Mel, de abelha', 'Doce, de leite, cremoso', 'Chocolate, ao leite', 'Geléia, mocotó, natural'] }
];
// grupos efetivos: padrão + personalização salva na biblioteca (tipo 'equivalentes')
function gruposEquivalentes() {
  const salvo = bibTipo('equivalentes')[0]?.dados?.grupos;
  return GRUPOS_EQUIV_PADRAO.map(g => {
    const s = salvo?.find(x => x.id === g.id);
    let refs = s?.refs;
    if (!refs) refs = g.sugestoes.map(n => indice().lista.find(a => a.fonte === 'TACO' && a.nome.trim() === n)?.ref).filter(Boolean);
    return { id: g.id, nome: g.nome, kcal: num(s?.kcal) || g.kcal, refs };
  });
}
// porção equivalente de cada alimento do grupo e média de macros por porção
function detalheGrupo(g) {
  const itens = g.refs.map(ref => alimento(ref)).filter(a => a?.por100?.kcal).map(a => ({ a, gramas: Math.round(g.kcal / a.por100.kcal * 100) }));
  const media = { prot: 0, carb: 0, lip: 0, fibra: 0 };
  itens.forEach(({ a, gramas }) => ['prot', 'carb', 'lip', 'fibra'].forEach(k => media[k] += (a.por100[k] || 0) * gramas / 100 / itens.length));
  return { itens, media };
}
