/* ëat · cálculos clínicos (antropometria, gasto energético, exames)
   Funções puras: recebem números e devolvem números. Nada de tela aqui. */

const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
const arred = (v, c = 1) => v == null || !isFinite(v) ? null : Math.round(v * 10 ** c) / 10 ** c;
const fmtN = (v, c = 1) => v == null ? '—' : arred(v, c).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });

/* ---------------- medidas ---------------- */
const CIRCUNFERENCIAS = [
  ['pescoco', 'Pescoço'], ['bracoRelaxado', 'Braço relaxado'], ['bracoContraido', 'Braço contraído'], ['antebraco', 'Antebraço'],
  ['torax', 'Tórax'], ['cintura', 'Cintura'], ['abdomen', 'Abdômen'], ['quadril', 'Quadril'],
  ['coxaProximal', 'Coxa proximal'], ['coxaMedial', 'Coxa medial'], ['panturrilha', 'Panturrilha']
];
const DOBRAS = [
  ['triceps', 'Tricipital'], ['biceps', 'Bicipital'], ['subescapular', 'Subescapular'], ['peitoral', 'Peitoral'],
  ['axilarMedia', 'Axilar média'], ['suprailiaca', 'Suprailíaca'], ['abdominal', 'Abdominal'], ['coxa', 'Coxa'], ['panturrilhaDobra', 'Panturrilha medial']
];

/* ---------------- protocolos de % de gordura ---------------- */
// cada protocolo diz quais dobras usa (pode depender do sexo) e devolve a densidade corporal ou o %G direto
const PROTOCOLOS = {
  pollock3: {
    nome: 'Pollock 3 dobras (1978/80)',
    dobras: (s) => s === 'M' ? ['peitoral', 'abdominal', 'coxa'] : ['triceps', 'suprailiaca', 'coxa'],
    densidade: (d, s, idade) => {
      const S = d.reduce((a, b) => a + b, 0);
      return s === 'M' ? 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * idade
                       : 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * idade;
    }
  },
  pollock7: {
    nome: 'Pollock 7 dobras (1978/80)',
    dobras: () => ['peitoral', 'axilarMedia', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'],
    densidade: (d, s, idade) => {
      const S = d.reduce((a, b) => a + b, 0);
      return s === 'M' ? 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * idade
                       : 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * idade;
    }
  },
  durnin: {
    nome: 'Durnin & Womersley (1974)',
    dobras: () => ['biceps', 'triceps', 'subescapular', 'suprailiaca'],
    densidade: (d, s, idade) => {
      const S = d.reduce((a, b) => a + b, 0);
      const tab = s === 'M'
        ? [[19, 1.1620, 0.0630], [29, 1.1631, 0.0632], [39, 1.1422, 0.0544], [49, 1.1620, 0.0700], [200, 1.1715, 0.0779]]
        : [[19, 1.1549, 0.0678], [29, 1.1599, 0.0717], [39, 1.1423, 0.0632], [49, 1.1333, 0.0612], [200, 1.1339, 0.0645]];
      const [, c, m] = tab.find(([max]) => idade <= max);
      return c - m * Math.log10(S);
    }
  },
  guedes: {
    nome: 'Guedes (1985)',
    dobras: (s) => s === 'M' ? ['triceps', 'suprailiaca', 'abdominal'] : ['coxa', 'suprailiaca', 'subescapular'],
    densidade: (d, s) => {
      const S = d.reduce((a, b) => a + b, 0);
      return s === 'M' ? 1.17136 - 0.06706 * Math.log10(S) : 1.16650 - 0.07063 * Math.log10(S);
    }
  },
  faulkner: {
    nome: 'Faulkner (1968)',
    dobras: () => ['triceps', 'subescapular', 'suprailiaca', 'abdominal'],
    percentual: (d) => 0.153 * d.reduce((a, b) => a + b, 0) + 5.783
  }
};
const siri = (dc) => (4.95 / dc - 4.50) * 100;

function classificaImc(imc, idade) {
  if (imc == null) return '';
  if (idade != null && idade >= 60) return imc < 22 ? 'Baixo peso (idosa/o)' : imc <= 27 ? 'Eutrofia (idosa/o)' : 'Sobrepeso (idosa/o)';
  return imc < 18.5 ? 'Baixo peso' : imc < 25 ? 'Eutrofia' : imc < 30 ? 'Sobrepeso' : imc < 35 ? 'Obesidade grau I' : imc < 40 ? 'Obesidade grau II' : 'Obesidade grau III';
}

/** Recebe {peso, altura, circ:{}, dobras:{}, protocolo, bio:{}} + sexo/idade e devolve os indicadores. */
function calculaAntropometria(m, sexo, idade) {
  const peso = num(m.peso), altura = num(m.altura);
  const r = { avisos: [] };
  if (peso && altura) { r.imc = peso / (altura / 100) ** 2; r.imcClasse = classificaImc(r.imc, idade); }
  const c = (k) => num(m.circ?.[k]);
  const cintura = c('cintura'), quadril = c('quadril');
  if (cintura && quadril) {
    r.rcq = cintura / quadril;
    r.rcqRisco = r.rcq > (sexo === 'M' ? 0.90 : 0.85) ? 'Risco aumentado' : 'Adequada';
  }
  if (cintura) {
    const [alto, muito] = sexo === 'M' ? [94, 102] : [80, 88];
    r.cinturaRisco = cintura >= muito ? 'Risco muito aumentado' : cintura >= alto ? 'Risco aumentado' : 'Sem risco aumentado';
    if (altura) { r.rcest = cintura / altura; r.rcestRisco = r.rcest > 0.5 ? 'Acima de 0,5 (risco)' : 'Adequada'; }
  }
  if (c('bracoRelaxado') && num(m.dobras?.triceps)) {
    // circunferência muscular do braço (cm) = CB − π × DCT(mm)/10
    r.cmb = c('bracoRelaxado') - Math.PI * num(m.dobras.triceps) / 10;
  }
  const p = PROTOCOLOS[m.protocolo];
  if (p) {
    const nomes = p.dobras(sexo);
    const vals = nomes.map(k => num(m.dobras?.[k]));
    const faltam = nomes.filter((k, i) => !vals[i]);
    if (faltam.length) r.avisos.push('Para ' + p.nome + ' faltam: ' + faltam.map(k => DOBRAS.find(d => d[0] === k)[1].toLowerCase()).join(', ') + '.');
    else if (p.densidade && idade == null) r.avisos.push('Informe a data de nascimento da paciente para calcular o % de gordura.');
    else {
      r.somaDobras = vals.reduce((a, b) => a + b, 0);
      if (p.percentual) r.gordura = p.percentual(vals, sexo, idade);
      else { r.densidade = p.densidade(vals, sexo, idade); r.gordura = siri(r.densidade); }
      r.protocoloNome = p.nome;
    }
  }
  const bioG = num(m.bio?.gordura);
  if (r.gordura == null && bioG != null) { r.gordura = bioG; r.protocoloNome = 'Bioimpedância'; }
  if (r.gordura != null && peso) { r.massaGorda = peso * r.gordura / 100; r.massaMagra = peso - r.massaGorda; }
  return r;
}

/* ---------------- gasto energético ---------------- */
const EQUACOES_TMB = {
  mifflin: { nome: 'Mifflin-St Jeor (1990)', calc: ({ peso, altura, idade, sexo }) => 10 * peso + 6.25 * altura - 5 * idade + (sexo === 'M' ? 5 : -161) },
  harris: { nome: 'Harris-Benedict (1919)', calc: ({ peso, altura, idade, sexo }) => sexo === 'M'
    ? 66.5 + 13.75 * peso + 5.003 * altura - 6.755 * idade
    : 655.1 + 9.563 * peso + 1.850 * altura - 4.676 * idade },
  fao: { nome: 'FAO/OMS (Schofield)', calc: ({ peso, idade, sexo }) => {
    const t = sexo === 'M' ? [[18, 17.686, 658.2], [30, 15.057, 692.2], [60, 11.472, 873.1], [999, 11.711, 587.7]]
                           : [[18, 13.384, 692.6], [30, 14.818, 486.6], [60, 8.126, 845.6], [999, 9.082, 658.5]];
    const [, a, b] = t.find(([max]) => idade < max); return a * peso + b; } },
  cunningham: { nome: 'Cunningham (1980) · usa massa magra', precisaMagra: true, calc: ({ massaMagra }) => 500 + 22 * massaMagra },
  katch: { nome: 'Katch-McArdle · usa massa magra', precisaMagra: true, calc: ({ massaMagra }) => 370 + 21.6 * massaMagra }
};
const FATORES_ATIVIDADE = [
  [1.2, 'Sedentária (pouco ou nenhum exercício)'], [1.375, 'Levemente ativa (1–3x/semana)'], [1.55, 'Moderadamente ativa (3–5x/semana)'],
  [1.725, 'Muito ativa (6–7x/semana)'], [1.9, 'Extremamente ativa (2x/dia, trabalho braçal)']
];
function calculaEnergia({ equacao, peso, altura, idade, sexo, massaMagra, fa, ajuste, protG, gordPct }) {
  const e = EQUACOES_TMB[equacao]; if (!e) return null;
  if (e.precisaMagra && !massaMagra) return { erro: 'Essa equação precisa da massa magra. Registre uma avaliação com dobras ou bioimpedância.' };
  if (!e.precisaMagra && (!peso || !altura || idade == null)) return { erro: 'Faltam peso, altura ou idade.' };
  const tmb = e.calc({ peso, altura, idade, sexo, massaMagra });
  const get = tmb * fa;
  const vet = get + (ajuste || 0);
  const r = { tmb, get, vet };
  if (peso && protG) {
    r.proteinaG = protG * peso; r.gorduraG = vet * (gordPct || 0) / 100 / 9;
    r.carboG = Math.max(0, (vet - r.proteinaG * 4 - r.gorduraG * 9) / 4);
  }
  return r;
}

/* ---------------- exames laboratoriais ---------------- */
// Referências gerais para adultos. Cada laboratório tem as suas: a nutri pode ajustar no lançamento.
// [id, nome, unidade, min, max, grupo, {F:[min,max], M:[min,max]} opcional]
const EXAMES = [
  ['hemoglobina', 'Hemoglobina', 'g/dL', 12, 16, 'Hemograma e ferro', { M: [13.5, 17.5] }],
  ['hematocrito', 'Hematócrito', '%', 36, 46, 'Hemograma e ferro', { M: [41, 53] }],
  ['vcm', 'VCM', 'fL', 80, 100, 'Hemograma e ferro'],
  ['ferritina', 'Ferritina', 'ng/mL', 15, 150, 'Hemograma e ferro', { M: [30, 400] }],
  ['ferro', 'Ferro sérico', 'µg/dL', 60, 170, 'Hemograma e ferro'],
  ['transferrinaSat', 'Saturação de transferrina', '%', 20, 50, 'Hemograma e ferro'],
  ['glicemia', 'Glicemia de jejum', 'mg/dL', 70, 99, 'Glicose e insulina'],
  ['hba1c', 'Hemoglobina glicada (HbA1c)', '%', 4, 5.6, 'Glicose e insulina'],
  ['insulina', 'Insulina de jejum', 'µUI/mL', 2.6, 24.9, 'Glicose e insulina'],
  ['homa', 'HOMA-IR (calculado)', '', null, 2.7, 'Glicose e insulina'],
  ['colesterolTotal', 'Colesterol total', 'mg/dL', null, 190, 'Perfil lipídico'],
  ['ldl', 'LDL', 'mg/dL', null, 130, 'Perfil lipídico'],
  ['hdl', 'HDL', 'mg/dL', 40, null, 'Perfil lipídico'],
  ['naoHdl', 'Não-HDL', 'mg/dL', null, 160, 'Perfil lipídico'],
  ['triglicerideos', 'Triglicerídeos', 'mg/dL', null, 150, 'Perfil lipídico'],
  ['tsh', 'TSH', 'µUI/mL', 0.4, 4.5, 'Tireoide'],
  ['t4livre', 'T4 livre', 'ng/dL', 0.7, 1.8, 'Tireoide'],
  ['vitD', 'Vitamina D (25-OH)', 'ng/mL', 30, 100, 'Vitaminas e minerais'],
  ['b12', 'Vitamina B12', 'pg/mL', 200, 900, 'Vitaminas e minerais'],
  ['folato', 'Ácido fólico', 'ng/mL', 3.9, null, 'Vitaminas e minerais'],
  ['zinco', 'Zinco', 'µg/dL', 70, 120, 'Vitaminas e minerais'],
  ['magnesio', 'Magnésio', 'mg/dL', 1.6, 2.6, 'Vitaminas e minerais'],
  ['calcio', 'Cálcio total', 'mg/dL', 8.6, 10.3, 'Vitaminas e minerais'],
  ['sodio', 'Sódio', 'mEq/L', 135, 145, 'Vitaminas e minerais'],
  ['potassio', 'Potássio', 'mEq/L', 3.5, 5.1, 'Vitaminas e minerais'],
  ['ureia', 'Ureia', 'mg/dL', 15, 45, 'Rins e fígado'],
  ['creatinina', 'Creatinina', 'mg/dL', 0.5, 1.1, 'Rins e fígado', { M: [0.7, 1.3] }],
  ['acidoUrico', 'Ácido úrico', 'mg/dL', 2.4, 6.0, 'Rins e fígado', { M: [3.4, 7.0] }],
  ['tgo', 'TGO (AST)', 'U/L', null, 40, 'Rins e fígado'],
  ['tgp', 'TGP (ALT)', 'U/L', null, 41, 'Rins e fígado'],
  ['ggt', 'Gama-GT', 'U/L', null, 38, 'Rins e fígado', { M: [null, 55] }],
  ['albumina', 'Albumina', 'g/dL', 3.5, 5.2, 'Rins e fígado'],
  ['pcr', 'PCR ultrassensível', 'mg/L', null, 3, 'Inflamação']
];
const exame = (id) => EXAMES.find(e => e[0] === id);
function referencia(id, sexo, custom) {
  if (custom && (custom.min != null || custom.max != null)) return [custom.min ?? null, custom.max ?? null];
  const e = exame(id); if (!e) return [null, null];
  return (e[6] && e[6][sexo]) || [e[3], e[4]];
}
function statusExame(valor, [min, max]) {
  if (valor == null) return null;
  if (min != null && valor < min) return 'baixo';
  if (max != null && valor > max) return 'alto';
  return 'normal';
}
const textoRef = ([min, max], un) => min != null && max != null ? `${fmtN(min, min % 1 ? 1 : 0)}–${fmtN(max, max % 1 ? 1 : 0)} ${un}`
  : max != null ? `< ${fmtN(max, max % 1 ? 1 : 0)} ${un}` : min != null ? `> ${fmtN(min, min % 1 ? 1 : 0)} ${un}` : '—';
// HOMA-IR = glicemia (mg/dL) × insulina (µUI/mL) / 405
const homaIR = (glic, ins) => glic && ins ? glic * ins / 405 : null;
