/* ëat · núcleo compartilhado entre o questionário da paciente e o painel da nutri */
/* ============ utilidades ============ */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const primeiro = (n) => (n || '').trim().split(/\s+/)[0] || '';
function idade(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00'); if (isNaN(d)) return null;
  const n = new Date(); let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
const dataBR = (iso) => iso ? iso.split('-').reverse().join('/') : '';
const litros = (copos) => (copos * 0.2).toFixed(1).replace('.', ',');
const faixaAgua = (c) => c < 5 ? 'menos de 1 L' : c < 10 ? 'entre 1 e 2 L' : c < 15 ? 'entre 2 e 3 L' : 'mais de 3 L';

/* ============ roteiro da anamnese ============ */
const FREQ_NIVEIS = ['Nunca', 'Às vezes', 'Semanal', 'Diário'];
const SIMNAO = [['sim', 'Sim', '👍'], ['nao', 'Não', '👎']];
const temOutro = id => a => Array.isArray(a[id]) ? a[id].includes('outro') : a[id] === 'outro';
function duracaoSono(a) {
  if (!a.acorda || !a.dorme) return null;
  const [ha, ma] = a.acorda.split(':').map(Number), [hd, md] = a.dorme.split(':').map(Number);
  let min = (ha * 60 + ma) - (hd * 60 + md); if (min <= 0) min += 1440;
  return min / 60;
}
const fmtHoras = h => { const H = Math.floor(h), M = Math.round((h - H) * 60); return M ? `${H}h${String(M).padStart(2, '0')}` : `${H}h`; };
const ETAPAS = [
  { id: 'voce', titulo: 'Prazer, você.', sub: 'Primeiro o básico. Leva menos de um minuto.', tema: 't-lima',
    fig: { tipo: 'retang', cor: 't-coral', g: 'boa!', s: '{nome}', rot: -5 }, // {nome} = primeiro nome da paciente
    perguntas: [
      { id: 'nome', tipo: 'texto', t: 'Qual é o seu nome completo?', ph: 'Seu nome completo', auto: 'name',
        reage: v => `Anotado, ${primeiro(v)}. Prazer! A partir de agora é papo reto.` },
      { id: 'nascimento', tipo: 'data', t: a => `Quando você nasceu${primeiro(a.nome) ? ', ' + primeiro(a.nome) : ''}?`,
        reage: v => { const i = idade(v); return i ? `${i} anos. Bagagem boa pra gente conversar.` : ''; } },
      { id: 'email', tipo: 'texto', input: 'email', auto: 'email', t: 'Qual é o seu e-mail?', ph: 'voce@email.com' },
      { id: 'telefone', tipo: 'texto', input: 'tel', auto: 'tel', t: 'E um número pra contato?', ph: '(11) 99999-9999' },
      { id: 'peso', tipo: 'numero', t: 'Seu peso atual', unid: 'kg', min: 30, max: 300, passo: 0.5, padrao: 65,
        ajuda: 'Sem julgamento. É só um ponto de partida, não uma nota.' },
      { id: 'pesoUsual', tipo: 'numero', t: 'E seu peso usual (ou pré-gestacional)?', unid: 'kg', min: 30, max: 300, passo: 0.5, padrao: a => a.peso || 65,
        ajuda: 'Aquele peso em que você costuma ficar. Se estiver gestante, o de antes da gestação.' },
      { id: 'altura', tipo: 'numero', t: 'Qual é a sua altura?', unid: 'cm', min: 120, max: 220, passo: 1, padrao: 163 }
    ]},
  { id: 'porque', titulo: 'Seu porquê.', sub: 'Não é dieta. É critério. Então bora entender o seu.', tema: 't-coral',
    fig: { tipo: 'redonda', cor: 't-lima', g: 'não é dieta.', s: 'é critério.', rot: 6 },
    perguntas: [
      { id: 'motivos', tipo: 'multi', t: 'O que te fez procurar uma nutri?', ajuda: 'Pode marcar mais de uma.', ops: [
        ['emagrecimento', 'Emagrecimento', '⚖️'], ['manutencao', 'Manutenção do peso', '🎯'], ['reeducacao', 'Reeducação alimentar', '🥗'],
        ['hipertrofia', 'Ganho de peso / hipertrofia', '💪'], ['tpm', 'Controle da TPM', '🌙'],
        ['estetica', 'Nutrição estética (celulite, acne, flacidez…)', '✨'], ['envelhecimento', 'Envelhecimento saudável', '🌿'],
        ['pressaoDiabetes', 'Controle de hipertensão / diabetes', '🩺'], ['outro', 'Outro', '✍️']],
        reage: v => v.length > 2 ? 'Bastante coisa. A gente organiza por prioridade.' : 'Anotado. Objetivo claro, caminho mais claro ainda.' },
      { id: 'motivosOutro', tipo: 'texto', t: 'Qual outro motivo?', ph: 'Conta pra gente', se: temOutro('motivos') },
      { id: 'nutriAntes', tipo: 'escolha', t: 'Já se consultou com uma nutri antes?', ops: [['sim', 'Sim, já', '🔁'], ['nao', 'É a primeira vez', '🌱']],
        reage: v => v === 'nao' ? 'Primeira vez! Prometo que vai ser leve.' : 'Bem-vinda de volta ao processo.' },
    ]},
  { id: 'rotina', titulo: 'Seu dia a dia.', sub: 'Café com contexto: como é a sua rotina de verdade.', tema: 't-musgo',
    fig: { tipo: 'redonda', cor: 't-musgo', g: '☕', s: 'café com', c: 'contexto', rot: -7 },
    perguntas: [
      { id: 'trabalha', tipo: 'escolha', t: 'Você trabalha atualmente?', ops: SIMNAO },
      { id: 'profissao', tipo: 'texto', t: 'Qual é a sua profissão?', ph: 'Ex.: professora, designer…', se: a => a.trabalha === 'sim',
        reage: () => 'Rotina de trabalho muda muito o prato. Bom saber.' },
      { id: 'horasTrabalho', tipo: 'escolha', t: 'Quantas horas você trabalha por dia?', se: a => a.trabalha === 'sim', ops: [
        ['12+', '12 horas ou mais', '🥵'], ['8', '8 horas', '🕗'], ['6', '6 horas', '🕕'], ['4', '4 horas', '🕓'], ['outro', 'Outro', '✍️']] },
      { id: 'horasTrabalhoOutro', tipo: 'texto', t: 'Quantas horas, então?', ph: 'Ex.: varia entre 5 e 10h', se: a => a.trabalha === 'sim' && a.horasTrabalho === 'outro' },
      { id: 'posturaTrabalho', tipo: 'escolha', t: 'No trabalho, você passa a maior parte do tempo…', se: a => a.trabalha === 'sim', ops: [
        ['sentada', 'Sentada', '💻'], ['caminhando', 'Caminhando', '🚶‍♀️'], ['empe', 'Em pé', '🧍‍♀️'],
        ['escadas', 'Subindo e descendo escadas', '🪜'], ['pesos', 'Carregando pesos', '📦'], ['outro', 'Outro', '✍️']] },
      { id: 'posturaTrabalhoOutro', tipo: 'texto', t: 'Como é, então?', ph: 'Descreve rapidinho', se: a => a.trabalha === 'sim' && a.posturaTrabalho === 'outro' },
      { id: 'estruturaTrabalho', tipo: 'escolha', t: 'No trabalho tem geladeira, micro-ondas ou lugar pra guardar/preparar comida?', se: a => a.trabalha === 'sim',
        ops: [['sim', 'Tem sim', '🧊'], ['nao', 'Não tem', '🚫']],
        reage: v => v === 'nao' ? 'Anotado. O plano vai levar isso em conta (marmita que aguenta o dia existe!).' : 'Ótimo, isso abre muitas opções.' },
      { id: 'quemPrepara', tipo: 'escolha', t: 'Quem vai preparar as refeições do plano?', ops: [['eu', 'Eu mesma', '👩‍🍳'], ['outra', 'Outra pessoa', '🧑‍🍳']] },
      { id: 'disposicao', tipo: 'escala', t: 'Como está sua disposição pras atividades do dia a dia?', ops: [
        [1, '🪫', 'Indisposta'], [2, '😮‍💨', 'Baixa'], [3, '😐', 'Ok'], [4, '🙂', 'Boa'], [5, '⚡', 'Muito disposta']] },
      { id: 'sintomasIndisposicao', tipo: 'multi', t: 'Quando bate a indisposição, o que você sente?', nenhum: 'nenhum', ops: [
        ['sonolencia', 'Sonolência durante o dia', '😴'], ['cansaco', 'Cansaço generalizado', '🔋'], ['concentracao', 'Dificuldade de concentração', '🌀'],
        ['irritabilidade', 'Irritabilidade', '😤'], ['fraqueza', 'Fraqueza', '🥀'], ['tonturas', 'Tonturas', '💫'], ['nenhum', 'Nenhum desses', '✅']] },
      { id: 'estresse', tipo: 'escolha', t: 'Você tem se sentido nervosa ou estressada com frequência?', ops: [['sim', 'Sim, bastante', '😵‍💫'], ['nao', 'Não muito', '😌']],
        reage: v => v === 'sim' ? 'Obrigada por contar. Estresse mexe com fome, sono e intestino. Vamos olhar isso.' : '' }
    ]},
  { id: 'descanso', titulo: 'Modo descanso.', sub: 'Sono e memória contam (e muito) na alimentação.', tema: 't-bordo',
    fig: { tipo: 'oval', cor: 't-creme', g: 'modo', s: 'descanso', c: 'sono em pauta', rot: 4 },
    perguntas: [
      { id: 'acorda', tipo: 'hora', t: 'Que horas você costuma acordar?' },
      { id: 'dorme', tipo: 'hora', t: 'E que horas vai dormir?',
        reage: (v, a) => { const d = duracaoSono(a); if (!d) return ''; return d < 6 ? `Dá umas ${fmtHoras(d)} de sono. Pouco sono bagunça fome e saciedade.` : `Umas ${fmtHoras(d)} de sono. Anotado!`; } },
      { id: 'sonoQualidade', tipo: 'escolha', t: 'Como está a qualidade do seu sono?', ops: [
        ['insonia', 'Tenho insônia (demoro +30 min pra dormir)', '🌚'], ['despertares', 'Acordo durante a noite', '⏰'],
        ['leve', 'Sono leve / agitado', '🌊'], ['celular', 'Levo o celular pra cama e fico até tarde', '📱'],
        ['cansada', 'Acordo quase sempre cansada', '🥱'], ['boa', 'Durmo bem', '😴']],
        reage: v => v === 'boa' ? 'Sono bom é meio caminho andado.' : v === 'celular' ? 'Clássico. O que vai pra cabeça também conta.' : 'Anotado. Tem estratégia alimentar que ajuda nisso.' },
      { id: 'memoria', tipo: 'escolha', t: 'E como anda sua memória?', ops: [
        ['ruim', 'Ruim', '🫥', 'Esqueço palavras, nomes, onde guardei as coisas'], ['regular', 'Regular', '🤔', 'Lembro bem, mas às vezes falha'],
        ['excelente', 'Excelente', '🧠', 'Não tenho problemas de memória']] }
    ]},
  { id: 'movimento', titulo: 'Corpo em movimento.', sub: 'Treino, frequência e como você se sente nele.', tema: 't-lima',
    fig: { tipo: 'redonda', cor: 't-coral', g: 'corpo', s: 'em movimento', rot: -8 },
    perguntas: [
      { id: 'atividade', tipo: 'escolha', t: 'Você pratica alguma atividade física?', ops: [['sim', 'Sim', '🏃‍♀️'], ['nao', 'No momento, não', '🛋️']],
        reage: v => v === 'nao' ? 'Sem culpa. A gente parte de onde você está.' : 'Boa! Isso entra no cálculo.' },
      { id: 'modalidades', tipo: 'multi', t: 'Quais atividades?', se: a => a.atividade === 'sim', ops: [
        ['corrida', 'Corrida', '🏃‍♀️'], ['caminhada', 'Caminhada', '🚶‍♀️'], ['ciclismo', 'Ciclismo', '🚴‍♀️'], ['musculacao', 'Musculação', '🏋️‍♀️'],
        ['crossfit', 'Crossfit', '🔥'], ['funcional', 'Funcional', '🤸‍♀️'], ['danca', 'Dança', '💃'], ['futebol', 'Futebol', '⚽'],
        ['lutas', 'Lutas', '🥊'], ['natacao', 'Natação', '🏊‍♀️'], ['pilates', 'Pilates', '🧘‍♀️'], ['outro', 'Outra', '➕']] },
      { id: 'modalidadesOutro', tipo: 'texto', t: 'Qual outra atividade?', ph: 'Ex.: beach tennis, yoga…', se: a => a.atividade === 'sim' && temOutro('modalidades')(a) },
      { id: 'frequenciaTreino', tipo: 'texto-longo', t: 'Com que frequência e em que horário você treina?', ph: 'Ex.: musculação seg/qua/sex às 7h, corrida sábado de manhã', se: a => a.atividade === 'sim' },
      { id: 'horasTreino', tipo: 'texto', t: 'Quanto tempo dura cada treino?', ph: 'Ex.: 1h, 40 min…', se: a => a.atividade === 'sim' },
      { id: 'desempenho', tipo: 'escolha', t: 'Como está seu desempenho nos treinos?', se: a => a.atividade === 'sim', ops: [
        ['ruim', 'Ruim', '🪫', 'Cansada, sem força pra treinar'], ['boa', 'Boa', '👌', 'Treino normal, mas poderia render mais'], ['excelente', 'Excelente', '🚀']] },
      { id: 'motivoSemAtividade', tipo: 'escolha', t: 'O que te impede de se exercitar?', se: a => a.atividade === 'nao', ops: [
        ['tempo', 'Não tenho tempo', '⏳'], ['naoGosto', 'Não gosto de me exercitar', '🙅‍♀️'], ['preguica', 'Sinto preguiça', '🦥'],
        ['naoAchei', 'Ainda não achei um esporte que combine comigo', '🔍'], ['frustrei', 'Já tentei, me frustrei e desisti', '💔']],
        reage: () => 'Sincera. Gostei. Isso ajuda a pensar em algo que caiba na sua vida.' }
    ]},
  { id: 'prato', titulo: 'No prato.', sub: 'O que vai pra dentro do corpo. Sem filtro, sem julgamento.', tema: 't-coral',
    fig: { tipo: 'retang', cor: 't-creme', g: 'NO PRATO. NO FEED.', s: 'pergunta antes de engolir.', rot: 3 },
    perguntas: [
      { id: 'habito', tipo: 'escolha', t: 'Como você considera seu hábito alimentar?', ops: [
        ['pouco', 'Pouco saudável', '🍕', 'Muito pronto/industrializado, massas e pães refinados, bebida açucarada, quase nada de fruta e verdura'],
        ['moderado', 'Moderadamente saudável', '🥪', 'Come fruta e verdura na maior parte da semana, mas exagera nos lanches, à noite ou no fim de semana'],
        ['saudavel', 'Saudável', '🥗', 'Carnes magras, integrais, fruta e verdura com frequência; o resto, de vez em quando']],
        reage: () => 'Valeu pela sinceridade. Esse é o ponto de partida, não um veredito.' },
      { id: 'fomeHorario', tipo: 'escolha', t: 'Em que horário do dia a fome bate mais forte?', ops: [
        ['manha', 'Pela manhã', '🌅'], ['almoco', 'Na hora do almoço', '🍛'], ['tarde', 'À tarde', '☀️'], ['noite', 'À noite', '🌆'], ['antesDormir', 'Antes de dormir', '🌙']] },
      { id: 'agua', tipo: 'agua', t: 'Quanta água você bebe por dia?', ajuda: 'Toque nos copos. Cada um = 200 ml.',
        reage: v => v >= 10 ? 'Hidratação respeitável. 💧' : v >= 5 ? 'Tá no caminho. Dá pra subir um pouco.' : 'Anotado. Água vai virar assunto, prometo que sem chatice.' },
      { id: 'alergia', tipo: 'escolha', t: 'Tem alergia ou intolerância alimentar diagnosticada?', ops: SIMNAO },
      { id: 'alergiaQuais', tipo: 'texto', t: 'Qual (ou quais)?', ph: 'Ex.: lactose, glúten, camarão…', se: a => a.alergia === 'sim' },
      { id: 'ama', tipo: 'texto-longo', t: 'Tem algum alimento que você ama?', ph: 'Ex.: pão de queijo, açaí, lasanha…', opcional: true,
        reage: () => 'Anotado. Comida boa entra no plano, sim.' },
      { id: 'odeia', tipo: 'texto-longo', t: 'E algum que você não gosta?', ph: 'Ex.: quiabo, fígado…', opcional: true,
        reage: () => 'Combinado: isso não vai aparecer no seu plano.' },
      { id: 'suplementa', tipo: 'escolha', t: 'Você usa algum suplemento?', ops: SIMNAO },
      { id: 'suplementos', tipo: 'multi', t: 'Quais suplementos?', se: a => a.suplementa === 'sim', ops: [
        ['whey', 'Whey protein', '🥤'], ['creatina', 'Creatina', '💥'], ['bcaa', 'BCAA', '🔗'], ['glutamina', 'Glutamina', '🧪'],
        ['polivitaminico', 'Polivitamínico', '💊'], ['omega3', 'Ômega 3', '🐟'], ['probiotico', 'Probiótico', '🦠'],
        ['vitD', 'Vitamina D', '☀️'], ['melatonina', 'Melatonina', '🌙'], ['outro', 'Outro', '➕']] },
      { id: 'suplementosOutro', tipo: 'texto', t: 'Qual outro suplemento?', ph: 'Nome e dose, se souber', se: a => a.suplementa === 'sim' && temOutro('suplementos')(a) },
      { id: 'alcool', tipo: 'escolha', t: 'Bebida alcoólica: com que frequência?', ops: [
        ['nao', 'Não bebo', '🚫'], ['fds', 'Só no fim de semana', '🍻'], ['social', 'Só em eventos', '🥂'],
        ['semanaEfds', 'Durante a semana e no fim de semana', '🍷'], ['diario', 'Praticamente todo dia', '🍸']] },
      { id: 'fumante', tipo: 'escolha', t: 'Você fuma?', ops: [['sim', 'Sim', '🚬'], ['nao', 'Não', '🌬️']] }
    ]},
  { id: 'saude', titulo: 'Corpo em dia.', sub: 'Saúde, exames, intestino e os sinais que o corpo dá. Wellness sem neura.', tema: 't-bordo',
    fig: { tipo: 'retang', cor: 't-lima', g: 'wellness', s: 'sem neura.', rot: 5 },
    perguntas: [
      { id: 'historicoFamiliar', tipo: 'multi', t: 'Tem histórico na família de alguma doença crônica?', nenhum: 'nenhum', ops: [
        ['hipertensao', 'Hipertensão', '🫀'], ['diabetes', 'Diabetes', '🩸'], ['cancer', 'Câncer', '🎗️'], ['coronariana', 'Doenças coronarianas', '❤️‍🩹'],
        ['tireoide', 'Hipo/hipertireoidismo', '🦋'], ['neuro', 'Alzheimer / Parkinson / Esclerose múltipla', '🧠'],
        ['psicologicos', 'Distúrbios psicológicos', '🫂'], ['outro', 'Outro', '➕'], ['nenhum', 'Nenhum que eu saiba', '✅']] },
      { id: 'historicoFamiliarOutro', tipo: 'texto', t: 'Qual outra doença na família?', ph: 'Conta pra gente', se: temOutro('historicoFamiliar') },
      { id: 'doencas', tipo: 'multi', t: 'E você, tem alguma doença?', nenhum: 'nenhum', ops: [
        ['diabetes', 'Diabetes', '🩸'], ['hipertensao', 'Hipertensão', '🫀'], ['cardiaca', 'Doença cardíaca', '❤️‍🩹'], ['gastrite', 'Gastrite', '🔥'],
        ['hepatite', 'Hepatite', '🟡'], ['colite', 'Colite', '🌀'], ['colesterol', 'Colesterol elevado', '🧈'], ['refluxo', 'Refluxo', '↩️'],
        ['hipoglicemia', 'Hipoglicemia', '📉'], ['renal', 'Doença renal', '🫘'], ['hiper', 'Hipertireoidismo', '🦋'], ['hipo', 'Hipotireoidismo', '🐢'],
        ['depressao', 'Depressão', '🌧️'], ['ansiedade', 'Ansiedade', '🌪️'], ['outro', 'Outra', '➕'], ['nenhum', 'Nenhuma', '✅']] },
      { id: 'doencasOutro', tipo: 'texto', t: 'Qual outra doença?', ph: 'Conta pra gente', se: temOutro('doencas') },
      { id: 'medicamentos', tipo: 'texto-longo', t: 'Toma algum medicamento atualmente?', ph: 'Nome e dose, se souber. Se não toma, pode pular.', opcional: true },
      { id: 'exameRecente', tipo: 'escolha', t: 'Fez exame de sangue recentemente?', ops: SIMNAO },
      { id: 'exameQuando', tipo: 'escolha', t: 'Há quanto tempo foi o último?', se: a => a.exameRecente === 'sim', ops: [
        ['menos3', 'Menos de 3 meses', '🆕'], ['mais3', 'Mais de 3 meses', '📅']],
        reage: () => 'Se puder, leva os resultados na consulta.' },
      { id: 'intestino', tipo: 'escolha', t: 'Como está o funcionamento do seu intestino?', ajuda: 'Sim, a gente vai falar disso. É importante!', ops: [
        ['bem', 'Bem', '✅', 'Evacuo todos os dias, regular'], ['maisOuMenos', 'Mais ou menos', '🤷‍♀️', 'Normal quase sempre, às vezes prende ou solta'],
        ['constipacao', 'Ruim: costuma prender', '🧱'], ['diarreia', 'Ruim: costuma soltar', '💧'], ['alterna', 'Ruim: alterna entre os dois', '🎢']] },
      { id: 'esteticos', tipo: 'multi', t: 'Você tem algum desses sinais?', nenhum: 'nenhum', ops: [
        ['cabelo', 'Queda de cabelo / cabelo fraco', '💇‍♀️'], ['unhas', 'Unhas fracas', '💅'], ['peleSeca', 'Pele ressecada', '🏜️'],
        ['peleOleosa', 'Pele oleosa', '✨'], ['acne', 'Excesso de acne', '🔴'], ['estrias', 'Estrias / celulite', '〰️'],
        ['retencao', 'Retenção de líquido', '💦'], ['outro', 'Outro', '➕'], ['nenhum', 'Nenhum', '✅']] },
      { id: 'esteticosOutro', tipo: 'texto', t: 'Qual outro sinal?', ph: 'Conta pra gente', se: temOutro('esteticos') }
    ]},
  { id: 'ciclo', titulo: 'No ritmo do ciclo.', sub: 'Hormônio também senta à mesa.', tema: 't-coral',
    fig: { tipo: 'retang', cor: 't-musgo', g: 'no ritmo', s: 'do ciclo.', rot: -4 },
    perguntas: [
      { id: 'menstrua', tipo: 'escolha', t: 'Você menstrua atualmente?', ops: [
        ['sim', 'Sim', '🩸'], ['gestante', 'Não, estou gestante', '🤰'], ['amamentando', 'Não, estou amamentando', '🤱'],
        ['contraceptivo', 'Não, por anticoncepcional/DIU', '💊'], ['menopausa', 'Não, menopausa', '🌾'], ['nao', 'Não', '🙅‍♀️']] },
      { id: 'menstruaMotivo', tipo: 'texto-longo', t: 'Quer contar o motivo?', ph: 'Ex.: cirurgia, tratamento, estresse… só se quiser', opcional: true, se: a => a.menstrua === 'nao' },
      { id: 'dum', tipo: 'data', t: 'Data da última menstruação', ajuda: 'Se não lembrar o dia exato, chuta o mais próximo.', se: a => a.menstrua === 'sim' },
      { id: 'cicloRegular', tipo: 'escolha', t: 'Seu ciclo é regular?', se: a => a.menstrua === 'sim', ops: [['sim', 'Sim', '🌕'], ['nao', 'Não', '🌗']] },
      { id: 'fluxo', tipo: 'escolha', t: 'Como é seu fluxo?', se: a => a.menstrua === 'sim', ops: [['intenso', 'Intenso', '🌊'], ['regular', 'Regular', '💧'], ['pouco', 'Pouco', '💦']] },
      { id: 'colicas', tipo: 'escolha', t: 'Sente cólicas muito intensas?', se: a => a.menstrua === 'sim', ops: SIMNAO },
      { id: 'sopEndo', tipo: 'escolha', t: 'Tem SOP (ovários policísticos) ou endometriose?', ops: [...SIMNAO, ['naoSei', 'Não sei', '🤷‍♀️']] },
      { id: 'spm', tipo: 'multi', t: 'Sente sintomas de TPM? Marca os que aparecem.', se: a => a.menstrua === 'sim' || a.menstrua === 'contraceptivo', nenhum: 'nenhum', ops: [
        ['irritabilidade', 'Irritabilidade', '😤'], ['nervosismo', 'Nervosismo', '😬'], ['ansiedade', 'Ansiedade', '🌪️'], ['apetite', 'Mudança de apetite', '🍽️'],
        ['compulsaoCarbo', 'Compulsão por carboidrato/doce', '🍫'], ['fadiga', 'Fadiga', '🔋'], ['mamasSensiveis', 'Mamas maiores/sensíveis', '🎈'],
        ['dorMamas', 'Dor nas mamas', '⚡'], ['dores', 'Dores generalizadas', '🤕'], ['colicas', 'Cólicas', '🌀'],
        ['intestino', 'Intestino muda no período', '🚽'], ['retencao', 'Retenção de líquido', '💦'], ['dorCabeca', 'Dor de cabeça', '🧠'],
        ['acne', 'Acne', '🔴'], ['nenhum', 'Nenhum', '✅']],
        reage: v => v.includes('compulsaoCarbo') ? 'Vontade de doce na TPM tem explicação. E tem estratégia.' : '' }
    ]},
  { id: 'fim', titulo: 'Última dose.', sub: 'Quase lá. Só mais três perguntinhas.', tema: 't-creme',
    fig: { tipo: 'retang', cor: 't-coral', g: 'ëat', s: '', c: 'elligence', rot: -6, logo: true },
    perguntas: [
      { id: 'saudeGeral', tipo: 'escala', t: 'De modo geral, como você classifica sua saúde?', ops: [
        [1, '😣', 'Ruim'], [2, '😕', 'Regular'], [3, '😐', 'Ok'], [4, '🙂', 'Boa'], [5, '🌟', 'Ótima']] },
      { id: 'extra', tipo: 'texto-longo', t: 'Quer contar mais alguma coisa?', ph: 'Qualquer coisa que você ache importante a nutri saber…', opcional: true },
      { id: 'sensacao', tipo: 'escala', t: 'E aí, como foi responder?', ops: [
        [1, '😩', 'Cansativo'], [2, '😕', 'Ok'], [3, '🙂', 'Tranquilo'], [4, '😄', 'Divertido'], [5, '🤩', 'Amei']],
        reage: v => v >= 4 ? 'Ëba! 💛' : 'Valeu pela paciência. Prometo que vale a pena.' }
    ]}
];
const TODAS = ETAPAS.flatMap(e => e.perguntas.map(p => ({ ...p, etapa: e })));
const DICAS = ['Responde no seu ritmo. Salvo automático.', 'Sem resposta certa ou errada.', 'Quanto mais sincera, melhor fica o plano.',
  'Bora, tá indo bem.', 'Isso aqui é só entre você e sua nutri.', 'A gente leu o estudo pra você. Você só responde.'];

function vazia(v) { return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length); }

/* ============ formatação / exportação ============ */
function rotuloOp(p, val) { const o = (p.ops || []).find(x => x[0] === val); return o ? (p.tipo === 'escala' ? `${o[2]} (${val}/5)` : o[1]) : String(val); }
function formata(p, v) {
  if (vazia(v) && p.tipo !== 'agua') return '';
  switch (p.tipo) {
    case 'escolha': case 'escala': return rotuloOp(p, v);
    case 'multi': return v.map(x => rotuloOp(p, x)).join(', ');
    case 'numero': return `${String(v).replace('.', ',')} ${p.unid}`;
    case 'regua': return p.fmt ? p.fmt(v) : `${String(v).replace('.', ',')} ${typeof p.unid === 'string' ? p.unid : ''}`.trim();
    case 'agua': return `${v || 0} copos de 200 ml (≈ ${litros(v || 0)} L, ${faixaAgua(v || 0)})`;
    case 'data': { const i = idade(v); return dataBR(v) + (i != null ? ` (${i} anos)` : ''); }
    case 'freq': return p.itens.filter(([id]) => v[id] !== undefined).map(([id, rot]) => `${rot}: ${FREQ_NIVEIS[v[id]]}`).join('\n');
    default: return String(v).trim();
  }
}
const tituloP = (p, a) => typeof p.t === 'function' ? p.t({}).replace(/\?$/, '?') : p.t;
function resumoTexto(a) {
  const linhas = [];
  ETAPAS.forEach(e => {
    const itens = e.perguntas.filter(p => (!p.se || p.se(a)) && !vazia(a[p.id]));
    if (!itens.length) return;
    linhas.push(`\n*${e.titulo.replace('.', '').toUpperCase()}*`);
    itens.forEach(p => {
      const f = formata(p, a[p.id]);
      linhas.push(`▸ ${tituloP(p)}\n   ${f.split('\n').join('\n   ')}`);
    });
  });
  return linhas.join('\n');
}
async function codifica(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  if (window.CompressionStream) {
    try {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      return 'EAT2:' + b64(buf);
    } catch (e) {}
  }
  return 'EAT1:' + b64(bytes);
}
async function decodifica(texto) {
  const m = String(texto).match(/EAT([12]):([A-Za-z0-9+/=\s]+)/);
  if (!m) throw new Error('Código não encontrado');
  const bin = atob(m[2].replace(/\s/g, ''));
  let u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
  if (m[1] === '2') {
    const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    u8 = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(u8));
}

function baixar(nomeArq, conteudo, tipo) {
  const a = h('a', { href: URL.createObjectURL(new Blob([conteudo], { type: tipo })), download: nomeArq });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function slug(s) { return (s || 'paciente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase(); }
/* Visualizar sem baixar: o PDF é desenhado dentro do próprio sistema (pdf.js), então funciona igual
   no computador, no celular (inclusive Android, que não tem leitor de PDF no navegador) e em qualquer navegador. */
function abreJanelaPDF() { return { ver: true, close() {} }; } // marca "visualizar" em vez de baixar
function entregaPDF(doc, nome, modo) {
  if (modo?.ver) return mostraPDF(doc.output('blob'), nome);
  doc.save(nome);
}
let pdfjsPronto = null;
function carregaPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPronto) pdfjsPronto = new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjsPronto = null; erro(new Error('Sem conexão para abrir o visualizador')); };
    document.head.append(s);
  });
  return pdfjsPronto;
}
async function mostraPDF(blob, nome) {
  const paginas = h('div', { class: 'vis-paginas' }, h('p', { class: 'vis-aviso' }, 'abrindo…'));
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', teclas); document.body.style.overflow = ''; };
  const teclas = (e) => { if (e.key === 'Escape') fechar(); };
  const baixar = () => { const a = h('a', { href: URL.createObjectURL(blob), download: nome }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  const fecharBtn = h('button', { class: 'btn esc', type: 'button', onclick: fechar }, 'Fechar ×');
  const fundo = h('div', { class: 'visualizador', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visualizar ' + nome },
    h('div', { class: 'vis-barra' }, h('b', null, nome), h('button', { class: 'btn sec', type: 'button', onclick: baixar }, 'Baixar'), fecharBtn),
    paginas);
  fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target === paginas) fechar(); });
  document.body.append(fundo); document.body.style.overflow = 'hidden'; document.addEventListener('keydown', teclas); fecharBtn.focus();
  try {
    const lib = await carregaPdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    paginas.replaceChildren();
    const largura = Math.min(860, window.innerWidth - 24), dpr = window.devicePixelRatio || 1;
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const escala = largura / pg.getViewport({ scale: 1 }).width;
      const vp = pg.getViewport({ scale: escala * dpr });
      const c = h('canvas', { class: 'vis-pagina', role: 'img', 'aria-label': `Página ${i} de ${pdf.numPages}` });
      c.width = vp.width; c.height = vp.height; c.style.width = (vp.width / dpr) + 'px';
      paginas.append(c);
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) { paginas.replaceChildren(h('p', { class: 'vis-aviso' }, 'Não deu para mostrar o PDF aqui. Use "Baixar".')); }
}
let jsPDFpronto = null;
function carregaJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPDFpronto) jsPDFpronto = new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => ok(window.jspdf.jsPDF);
    s.onerror = () => { jsPDFpronto = null; erro(new Error('Sem conexão para gerar o PDF')); };
    document.head.append(s);
  });
  return jsPDFpronto;
}
// a fonte padrão do PDF não tem emoji nem alguns símbolos
const limpaPDF = (t) => String(t ?? '').replace(/\p{Extended_Pictographic}|[️‍⃣]/gu, '').replace(/≈/g, '~').replace(/[▸→]/g, '>').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();
async function gerarPDF(reg, botao, janela) {
  const rotuloOriginal = botao && botao.textContent;
  if (botao) { botao.disabled = true; botao.textContent = 'Gerando PDF…'; }
  try {
    const jsPDF = await carregaJsPDF();
    const a = reg.respostas || {};
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 18, larg = W - 2 * M;
    const COR = { bordo: [54, 1, 5], coral: [255, 94, 70], laranja: [255, 68, 22], lima: [192, 222, 90], creme: [232, 229, 202], suave: [120, 90, 90] };
    let y = 0;
    const cabecalho = () => {
      doc.setFillColor(...COR.bordo); doc.rect(0, 0, W, 30, 'F');
      doc.setTextColor(...COR.creme); doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.text('ëat', M, 21);
      const largEat = doc.getTextWidth('ëat');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('elligence', M + largEat + 0.8, 15.5);
      doc.setFontSize(10); doc.text('Pré-atendimento nutricional', W - M, 16, { align: 'right' });
      doc.setFontSize(9); doc.text(new Date(reg.enviadoEm || Date.now()).toLocaleDateString('pt-BR'), W - M, 22, { align: 'right' });
      doc.setFillColor(...COR.laranja); doc.rect(W - 9, 30, 2.4, H - 30, 'F'); doc.rect(W - 5, 30, 2.4, H - 30, 'F');
      y = 42;
    };
    const novaPagina = () => { doc.addPage(); cabecalho(); };
    const garante = (h) => { if (y + h > H - 18) novaPagina(); };
    cabecalho();
    // nome e resumo
    doc.setTextColor(...COR.bordo); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text(limpaPDF(a.nome || 'Paciente'), M, y); y += 8;
    const i = idade(a.nascimento), im = imc(a);
    const resumo = [i != null ? `${i} anos` : null, a.peso ? `${String(a.peso).replace('.', ',')} kg` : null, a.altura ? `${a.altura} cm` : null, im ? `IMC ${im.toFixed(1).replace('.', ',')}` : null].filter(Boolean).join('   ·   ');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...COR.suave); doc.text(resumo, M, y); y += 10;
    ETAPAS.forEach(e => {
      const itens = e.perguntas.filter(p => (!p.se || p.se(a)) && !vazia(a[p.id]));
      if (!itens.length) return;
      garante(22);
      doc.setFillColor(...COR.creme); doc.roundedRect(M, y - 6, larg, 10, 2, 2, 'F');
      doc.setFillColor(...COR.coral); doc.rect(M, y - 6, 2.2, 10, 'F');
      doc.setTextColor(...COR.bordo); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
      doc.text(limpaPDF(e.titulo.replace('.', '')), M + 6, y + 0.8); y += 11;
      itens.forEach(p => {
        const perg = doc.setFont('helvetica', 'bold').setFontSize(9.5).splitTextToSize(limpaPDF(tituloP(p)), larg);
        const resp = doc.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(limpaPDF(formata(p, a[p.id])) || '—', larg);
        garante(perg.length * 4.4 + resp.length * 5.2 + 4);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COR.suave); doc.text(perg, M, y); y += perg.length * 4.4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...COR.bordo); doc.text(resp, M, y + 0.6); y += resp.length * 5.2 + 3.6;
      });
      y += 3;
    });
    // código para importar no painel
    const cod = await codifica(reg);
    const linhas = doc.setFont('courier', 'normal').setFontSize(6.5).splitTextToSize(cod, larg);
    garante(12 + linhas.length * 2.6);
    doc.setDrawColor(...COR.suave); doc.setLineDashPattern([1, 1], 0); doc.line(M, y, W - M, y); doc.setLineDashPattern([], 0); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...COR.suave);
    doc.text('Código para importar no painel da nutri (copie e cole a partir de "EAT"):', M, y); y += 4;
    doc.setFont('courier', 'normal'); doc.setFontSize(6.5); doc.text(linhas, M, y);
    const total = doc.getNumberOfPages();
    for (let n = 1; n <= total; n++) {
      doc.setPage(n); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...COR.suave);
      doc.text('o jeito inteligente de consumir', M, H - 9);
      doc.text(`${n} / ${total}`, W - M - 6, H - 9, { align: 'right' });
    }
    entregaPDF(doc, `anamnese-${slug(a.nome)}.pdf`, janela);
    if (botao) botao.textContent = janela ? 'Aberto ✓' : 'PDF baixado ✓';
  } catch (e) {
    if (botao) botao.textContent = 'Não deu pra gerar o PDF. Verifique a internet e tente de novo.';
  } finally {
    if (botao) { botao.disabled = false; setTimeout(() => { botao.textContent = rotuloOriginal; }, 3500); }
  }
}

/* ============ painel da nutricionista ============ */
function imc(a) { if (!a.peso || !a.altura) return null; const m = a.altura / 100; return a.peso / (m * m); }
function classeImc(v) { return v < 18.5 ? 'Baixo peso' : v < 25 ? 'Eutrofia' : v < 30 ? 'Sobrepeso' : v < 35 ? 'Obesidade I' : v < 40 ? 'Obesidade II' : 'Obesidade III'; }
function alertas(a) {
  const out = [];
  const P = id => TODAS.find(p => p.id === id);
  const lista = (id, nada) => Array.isArray(a[id]) && a[id].length && !a[id].includes(nada || 'nenhum') ? formata(P(id), a[id]).replace(/(Outro|Outra)$|(Outro|Outra)(?=,)/, m => a[id + 'Outro'] ? `${m}: ${a[id + 'Outro']}` : m) : '';
  if (['gestante', 'amamentando'].includes(a.menstrua)) out.push(a.menstrua === 'gestante' ? 'Gestante' : 'Amamentando');
  if (a.menstrua === 'nao') out.push('Não menstrua' + (a.menstruaMotivo ? `: ${String(a.menstruaMotivo).trim()}` : ' (motivo não informado)'));
  if (a.peso && a.pesoUsual && Math.abs(a.peso - a.pesoUsual) >= 3) {
    const d = a.peso - a.pesoUsual;
    out.push(`Peso atual ${d > 0 ? 'acima' : 'abaixo'} do usual em ${Math.abs(d).toFixed(1).replace('.', ',')} kg (${(Math.abs(d) / a.pesoUsual * 100).toFixed(1).replace('.', ',')}%)`);
  }
  if (lista('doencas')) out.push('Doenças: ' + lista('doencas'));
  if (a.medicamentos && a.medicamentos.trim()) out.push('Medicamentos: ' + a.medicamentos.trim());
  if (a.alergia === 'sim') out.push('Alergia/intolerância: ' + (a.alergiaQuais || 'não especificada'));
  if (lista('historicoFamiliar')) out.push('Histórico familiar: ' + lista('historicoFamiliar'));
  if (a.exameRecente === 'nao' || a.exameQuando === 'mais3') out.push('Sem exames laboratoriais recentes — considerar solicitar');
  const d = duracaoSono(a);
  if (d != null && d < 6) out.push(`Dorme pouco: ≈ ${fmtHoras(d)} por noite`);
  if (a.sonoQualidade && a.sonoQualidade !== 'boa') out.push('Sono: ' + rotuloOp(P('sonoQualidade'), a.sonoQualidade));
  if (a.estresse === 'sim') out.push('Estresse/nervosismo frequente');
  if (a.disposicao && a.disposicao <= 2) out.push('Baixa disposição no dia a dia');
  if (lista('sintomasIndisposicao')) out.push('Quando indisposta: ' + lista('sintomasIndisposicao'));
  if (a.memoria === 'ruim') out.push('Relata memória ruim');
  if (a.atividade === 'nao') out.push('Sem atividade física' + (a.motivoSemAtividade ? ` — ${rotuloOp(P('motivoSemAtividade'), a.motivoSemAtividade).toLowerCase()}` : ''));
  if (a.desempenho === 'ruim') out.push('Desempenho ruim nos treinos (cansaço, falta de força)');
  if (a.habito === 'pouco') out.push('Considera o próprio hábito alimentar pouco saudável');
  if (a.agua != null && a.agua < 10) out.push(`Ingestão hídrica baixa: ${a.agua} copos de 200 ml (≈ ${litros(a.agua)} L)`);
  if (a.alcool === 'diario' || a.alcool === 'semanaEfds') out.push('Álcool: ' + rotuloOp(P('alcool'), a.alcool).toLowerCase());
  if (a.fumante === 'sim') out.push('Fumante');
  if (a.trabalha === 'sim' && a.estruturaTrabalho === 'nao') out.push('Sem estrutura para guardar/aquecer refeições no trabalho');
  if (a.quemPrepara === 'outra') out.push('Refeições preparadas por outra pessoa');
  if (a.intestino && a.intestino !== 'bem') out.push('Intestino: ' + rotuloOp(P('intestino'), a.intestino).toLowerCase());
  if (lista('esteticos')) out.push('Sinais: ' + lista('esteticos'));
  if (a.cicloRegular === 'nao') out.push('Ciclo menstrual irregular');
  if (a.colicas === 'sim') out.push('Cólicas intensas');
  if (a.sopEndo === 'sim') out.push('SOP ou endometriose');
  if (a.sopEndo === 'naoSei') out.push('Não sabe se tem SOP ou endometriose');
  if (lista('spm')) out.push('TPM: ' + lista('spm'));
  if (a.saudeGeral && a.saudeGeral <= 2) out.push('Avalia a própria saúde como ruim');
  return out;
}

/* ============ conexão com o Supabase ============ */
function criaSupabase() {
  const c = window.EAT_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseAnonKey || !window.supabase) return null;
  return window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}
const ehUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
function novoUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const x = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
