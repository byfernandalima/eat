/* ëat · avaliação infantil (OMS) e gestacional (curvas brasileiras) — funções puras */

/* ---------------- OMS: LMS → escore-z ---------------- */
function lmsEm(tab, sexo, x) {
  const t = OMS[tab]?.[sexo === 'M' ? 'M' : 'F'];
  if (!t || x == null || x < t[0][0] || x > t[t.length - 1][0]) return null;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid][0] <= x) lo = mid; else hi = mid; }
  const a = t[lo], b = t[hi], f = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
  return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
}
const valorNoZ = ({ L, M, S }, z) => L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
// indicadores de peso usam o ajuste da OMS para |z| > 3
const TABELAS_PESO = ['peso', 'imc', 'pesoComprimento', 'pesoEstatura'];
function zScore(tab, sexo, x, valor) {
  const lms = lmsEm(tab, sexo, x); if (!lms || !valor) return null;
  const { L, M, S } = lms;
  let z = L === 0 ? Math.log(valor / M) / S : (Math.pow(valor / M, L) - 1) / (L * S);
  if (TABELAS_PESO.includes(tab)) {
    if (z > 3) { const sd3 = valorNoZ(lms, 3), sd23 = sd3 - valorNoZ(lms, 2); z = 3 + (valor - sd3) / sd23; }
    else if (z < -3) { const sd3 = valorNoZ(lms, -3), sd23 = valorNoZ(lms, -2) - sd3; z = -3 + (valor - sd3) / sd23; }
  }
  return z;
}
// percentil a partir do z (aproximação da normal acumulada)
function percentil(z) {
  if (z == null) return null;
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return (z > 0 ? 1 - p : p) * 100;
}

/* ---------------- classificações (Ministério da Saúde / SISVAN, base OMS) ---------------- */
function classifica(indicador, z, anos) {
  if (z == null) return '';
  if (indicador === 'peso') return z < -3 ? 'Muito baixo peso para a idade' : z < -2 ? 'Baixo peso para a idade' : z <= 2 ? 'Peso adequado para a idade' : 'Peso elevado para a idade';
  if (indicador === 'estatura') return z < -3 ? 'Muito baixa estatura para a idade' : z < -2 ? 'Baixa estatura para a idade' : 'Estatura adequada para a idade';
  if (indicador === 'pc') return z < -2 ? 'Abaixo do esperado' : z > 2 ? 'Acima do esperado' : 'Adequado';
  // IMC/idade e peso/estatura
  if (anos < 5) return z < -3 ? 'Magreza acentuada' : z < -2 ? 'Magreza' : z <= 1 ? 'Eutrofia' : z <= 2 ? 'Risco de sobrepeso' : z <= 3 ? 'Sobrepeso' : 'Obesidade';
  return z < -3 ? 'Magreza acentuada' : z < -2 ? 'Magreza' : z <= 1 ? 'Eutrofia' : z <= 2 ? 'Sobrepeso' : z <= 3 ? 'Obesidade' : 'Obesidade grave';
}
const alertaZ = (indicador, z) => z == null ? false : indicador === 'estatura' ? z < -2 : indicador === 'imc' || indicador === 'pesoEstatura' ? (z < -2 || z > 1) : (z < -2 || z > 2);

/** Avalia uma medida infantil. idadeDias = idade na data da medida. */
function avaliaCrianca({ peso, estatura, pc, posicao }, sexo, idadeDias) {
  peso = num(peso); estatura = num(estatura); pc = num(pc);
  const anos = idadeDias / 365.25;
  const r = { anos, itens: [], avisos: [] };
  if (anos > 19.05) { r.avisos.push('Acima de 19 anos: use a avaliação de adultos (antropometria).'); return r; }
  // comprimento (deitado) até 2 anos; estatura (em pé) depois. Ajuste da OMS de 0,7 cm se medido diferente.
  let alt = estatura;
  if (alt != null) {
    if (idadeDias < 731 && posicao === 'em_pe') alt += 0.7;
    if (idadeDias >= 731 && posicao === 'deitado') alt -= 0.7;
  }
  const add = (ind, nome, valor, un, z) => { if (z != null) r.itens.push({ ind, nome, valor, un, z, p: percentil(z), classe: classifica(ind, z, anos), alerta: alertaZ(ind, z) }); };
  if (peso && anos <= 10) add('peso', 'Peso para a idade', peso, 'kg', zScore('peso', sexo, idadeDias, peso));
  if (alt) add('estatura', idadeDias < 731 ? 'Comprimento para a idade' : 'Estatura para a idade', estatura, 'cm', zScore('estatura', sexo, idadeDias, alt));
  if (peso && alt) {
    r.imc = peso / (alt / 100) ** 2;
    add('imc', 'IMC para a idade', r.imc, 'kg/m²', zScore('imc', sexo, idadeDias, r.imc));
    if (anos < 5) {
      const tab = idadeDias < 731 ? 'pesoComprimento' : 'pesoEstatura';
      add('pesoEstatura', idadeDias < 731 ? 'Peso para o comprimento' : 'Peso para a estatura', peso, 'kg', zScore(tab, sexo, alt, peso));
    }
  }
  if (pc && idadeDias <= 1826) add('pc', 'Perímetro cefálico para a idade', pc, 'cm', zScore('pc', sexo, idadeDias, pc));
  if (peso && anos > 10) r.avisos.push('Peso para a idade só é usado até 10 anos; a partir daí vale o IMC para a idade.');
  return r;
}
// pontos da curva de referência (idade em anos no eixo x)
function curvaReferencia(tab, sexo, z, diasIni, diasFim, passo = 30.4375) {
  const out = [];
  for (let d = diasIni; d <= diasFim + 0.01; d += passo) { const l = lmsEm(tab, sexo, d); if (l) out.push({ x: d / 365.25, y: valorNoZ(l, z) }); }
  return out;
}

/* ---------------- gestação: curvas brasileiras (Kac et al., 2021) ---------------- */
// Faixa recomendada de ganho de peso acumulado (kg) por semana, por IMC pré-gestacional.
// Totais em 40 semanas conforme a publicação; pontos intermediários lidos das curvas oficiais
// (Am J Clin Nutr 2021;113:1351-60, adotadas na Caderneta da Gestante 2022). Precisão de leitura ≈ 0,3 kg.
const GESTACAO = {
  semanas: [10, 13, 20, 27, 34, 40],
  baixo:     { nome: 'Baixo peso (IMC < 18,5)', total: '9,7 a 12,2 kg', percentis: 'P18–P34', min: [-0.8, 0.2, 2.5, 5.6, 8.3, 9.7], max: [0.3, 1.2, 3.8, 7.4, 10.1, 12.2] },
  eutrofia:  { nome: 'Eutrofia (IMC 18,5 a 24,9)', total: '8 a 12 kg', percentis: 'P10–P34', min: [-2.6, -1.9, 0.2, 3.0, 5.5, 8.0], max: [0.0, 0.5, 3.0, 6.2, 9.2, 12.0] },
  sobrepeso: { nome: 'Sobrepeso (IMC 25 a 29,9)', total: '7 a 9 kg', percentis: 'P18–P27', min: [-2.4, -2.0, 0.1, 2.3, 4.7, 7.0], max: [-1.4, -0.8, 1.4, 3.7, 6.4, 9.0] },
  obesidade: { nome: 'Obesidade (IMC ≥ 30)', total: '5 a 7,2 kg', percentis: 'P27–P38', min: [-2.0, -1.9, -1.0, 1.0, 3.2, 5.0], max: [-0.9, -0.6, 0.5, 2.6, 5.0, 7.2] }
};
const categoriaGestacional = (imc) => imc == null ? null : imc < 18.5 ? 'baixo' : imc < 25 ? 'eutrofia' : imc < 30 ? 'sobrepeso' : 'obesidade';
function faixaGestacional(cat, semana) {
  const g = GESTACAO[cat], s = GESTACAO.semanas;
  if (!g || semana == null || semana < s[0]) return null;
  const w = Math.min(semana, 40);
  let i = s.findIndex(x => x >= w); if (i <= 0) i = 1;
  const f = (w - s[i - 1]) / (s[i] - s[i - 1]);
  return { min: g.min[i - 1] + (g.min[i] - g.min[i - 1]) * f, max: g.max[i - 1] + (g.max[i] - g.max[i - 1]) * f };
}
function idadeGestacional(dataIso, dum, dpp) {
  const dia = (iso) => new Date(iso + 'T12:00:00').getTime() / 86400000;
  if (!dataIso) return null;
  let dias = null;
  if (dum) dias = dia(dataIso) - dia(dum);
  else if (dpp) dias = 280 - (dia(dpp) - dia(dataIso));
  if (dias == null || dias < 0 || dias > 300) return null;
  return { dias: Math.round(dias), semanas: Math.floor(Math.round(dias) / 7), resto: Math.round(dias) % 7, decimal: dias / 7 };
}
const trimestre = (sem) => sem == null ? null : sem < 14 ? 1 : sem < 28 ? 2 : 3;
// energia adicional na gestação (DRI/IOM 2005): 1º tri +0, 2º +340, 3º +452 kcal/dia
const ADICIONAL_GESTACAO = { 1: 0, 2: 340, 3: 452 };
