/* ëat · agenda: dia / semana / mês, tipos de consulta, encaixes, bloqueios, status,
   confirmação pela paciente, lembretes por WhatsApp, teleconsulta (Google Meet) e Google Agenda */

const STATUS = {
  agendada: { rot: 'Agendada', ic: '○' }, confirmada: { rot: 'Confirmada', ic: '✓' }, realizada: { rot: 'Realizada', ic: '●' },
  faltou: { rot: 'Faltou', ic: '✕' }, cancelada: { rot: 'Cancelada', ic: '—' }
};
const TIPOS_PADRAO = [
  { titulo: 'Primeira consulta', dados: { duracao: 60, valor: 0 } },
  { titulo: 'Retorno', dados: { duracao: 45, valor: 0 } },
  { titulo: 'Teleconsulta', dados: { duracao: 45, valor: 0, online: true } }
];
const HORA_INI = 7, HORA_FIM = 21;
let agendaVista = 'semana', agendaDia = new Date(), agendaEventos = [], agendaPacientes = null;

const doisD = (n) => String(n).padStart(2, '0');
const isoDia = (d) => `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`;
const horaTxt = (d) => `${doisD(d.getHours())}:${doisD(d.getMinutes())}`;
const inicioSemana = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mesmoDia = (a, b) => isoDia(a) === isoDia(b);
const DIAS_SEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const tiposConsulta = () => { const t = bibTipo('tipo_consulta'); return t.length ? t : TIPOS_PADRAO; };
const telefoneWa = (t) => { const d = (t || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : ''; };
const linkConfirmacao = (ev) => new URL(`confirmar.html?c=${ev.id}&t=${ev.token}`, location.href.split('#')[0].split('?')[0]).toString();
// teleconsulta pelo Google Meet: link fixo do perfil ou um link próprio colado na consulta
const linkMeetPadrao = () => (perfil?.meet_link || '').trim();
const ehMeet = (u) => /meet\.google\.com/i.test(u || '');

function intervaloVista() {
  if (agendaVista === 'dia') { const i = new Date(agendaDia); i.setHours(0, 0, 0, 0); return [i, somaDias(i, 1)]; }
  if (agendaVista === 'semana') { const i = inicioSemana(agendaDia); return [i, somaDias(i, 7)]; }
  const i = new Date(agendaDia.getFullYear(), agendaDia.getMonth(), 1); const ini = inicioSemana(i);
  return [ini, somaDias(ini, 42)];
}
async function carregaAgenda() {
  const [ini, fim] = intervaloVista();
  const { data, error } = await supa.from('agenda').select('*').gte('inicio', ini.toISOString()).lt('inicio', fim.toISOString()).order('inicio');
  if (error) throw error;
  agendaEventos = data || [];
  if (!agendaPacientes) agendaPacientes = (await supa.from('pacientes').select('id, nome, telefone, cpf').order('nome')).data || [];
}

/* ============ tela ============ */
async function telaAgenda(palco) {
  const wrap = h('div', { class: 'painel agenda' }, h('p', { class: 'carregando' }, 'abrindo agenda…'));
  palco.append(wrap);
  try { await carregaBiblioteca(); await carregaAgenda(); } catch (e) { wrap.replaceChildren(h('p', { class: 'form-msg erro' }, traduzErro(e))); return; }
  const [ini, fim] = intervaloVista();
  const titulo = agendaVista === 'mes' ? agendaDia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : agendaVista === 'dia' ? agendaDia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${ini.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${somaDias(fim, -1).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const mover = (n) => { if (agendaVista === 'mes') agendaDia = new Date(agendaDia.getFullYear(), agendaDia.getMonth() + n, 1); else agendaDia = somaDias(agendaDia, n * (agendaVista === 'dia' ? 1 : 7)); render(); };
  const vistaBtn = (v, rot) => h('button', { type: 'button', class: agendaVista === v ? 'on' : '', onclick: () => { agendaVista = v; render(); } }, rot);
  const corpo = agendaVista === 'mes' ? vistaMes() : vistaGrade(agendaVista === 'dia' ? [new Date(agendaDia)] : [...Array(7)].map((_, i) => somaDias(ini, i)));
  wrap.replaceChildren(
    h('div', { style: 'margin-top:6px' }, h('a', { href: '#', class: 'link' }, '← pacientes')),
    h('div', { class: 'cabeca-lista', style: 'margin:8px 0 12px' }, h('h1', { style: 'margin:0' }, 'Agenda'),
      h('div', { class: 'linha-btn', style: 'margin:0 0 0 auto' },
        h('button', { class: 'btn pri', type: 'button', onclick: () => formEvento({ categoria: 'consulta' }) }, '+ Consulta'),
        h('button', { class: 'btn sec', type: 'button', onclick: () => formEvento({ categoria: 'bloqueio' }) }, 'Bloquear horário'))),
    h('div', { class: 'agenda-barra' },
      h('div', { class: 'agenda-nav' }, h('button', { type: 'button', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'),
        h('button', { type: 'button', onclick: () => { agendaDia = new Date(); render(); } }, 'Hoje'),
        h('button', { type: 'button', 'aria-label': 'Próximo', onclick: () => mover(1) }, '›')),
      h('b', { class: 'agenda-titulo' }, titulo),
      h('div', { class: 'abas agenda-vistas', role: 'tablist' }, vistaBtn('dia', 'Dia'), vistaBtn('semana', 'Semana'), vistaBtn('mes', 'Mês'))),
    corpo,
    h('div', { class: 'legenda-status' }, Object.entries(STATUS).map(([k, s]) => h('span', { class: 'ev-' + k }, `${s.ic} ${s.rot}`)), h('span', { class: 'ev-bloqueio' }, '▨ Bloqueio')),
    blocoLembretes(), blocoTiposConsulta(), blocoGoogleAgenda());
}

function rotuloEvento(ev) {
  if (ev.categoria === 'bloqueio') return `▨ ${ev.observacao || 'Bloqueado'}`;
  return `${STATUS[ev.status].ic} ${ev.paciente_nome || 'Sem nome'}${ev.encaixe ? ' · encaixe' : ''}${ev.modalidade === 'online' ? ' · online' : ''}`;
}
function vistaGrade(dias) {
  const altHora = 52;
  const colunas = dias.map(d => {
    const evs = agendaEventos.filter(e => mesmoDia(new Date(e.inicio), d));
    const col = h('div', { class: 'ag-col' + (mesmoDia(d, new Date()) ? ' hoje' : ''), style: `height:${(HORA_FIM - HORA_INI) * altHora}px`,
      onclick: (e) => { if (e.target !== col) return; const y = e.offsetY; const min = Math.floor(y / altHora * 60 / 15) * 15; const ini = new Date(d); ini.setHours(HORA_INI, min, 0, 0); formEvento({ categoria: 'consulta', inicio: ini.toISOString() }); } });
    // eventos sobrepostos ficam lado a lado
    const grupos = []; evs.forEach(ev => { const g = grupos.find(g => g.some(x => new Date(x.inicio) < new Date(ev.fim) && new Date(ev.inicio) < new Date(x.fim))); g ? g.push(ev) : grupos.push([ev]); });
    grupos.forEach(g => g.forEach((ev, k) => {
      const i = new Date(ev.inicio), f = new Date(ev.fim);
      const top = ((i.getHours() - HORA_INI) * 60 + i.getMinutes()) / 60 * altHora, alt = Math.max(22, (f - i) / 3600000 * altHora - 2);
      col.append(h('button', { type: 'button', class: `ag-ev ev-${ev.categoria === 'bloqueio' ? 'bloqueio' : ev.status}`, title: `${horaTxt(i)}–${horaTxt(f)} ${rotuloEvento(ev)}`,
        style: `top:${top}px;height:${alt}px;left:${k / g.length * 100}%;width:${100 / g.length}%`, onclick: () => detalheEvento(ev) },
        h('b', null, horaTxt(i)), ' ', rotuloEvento(ev), ev.tipo ? h('small', null, ev.tipo) : null));
    }));
    return h('div', { class: 'ag-dia' }, h('div', { class: 'ag-cab' + (mesmoDia(d, new Date()) ? ' hoje' : '') }, `${DIAS_SEM[(d.getDay() + 6) % 7]} ${d.getDate()}`), col);
  });
  const horas = h('div', { class: 'ag-horas' }, h('div', { class: 'ag-cab' }), ...[...Array(HORA_FIM - HORA_INI)].map((_, i) => h('div', { style: `height:${altHora}px` }, `${doisD(HORA_INI + i)}h`)));
  return h('div', { class: 'ag-grade-wrap' }, h('div', { class: 'ag-grade', style: `grid-template-columns:44px repeat(${dias.length}, minmax(${dias.length > 1 ? 110 : 200}px, 1fr))` }, horas, ...colunas),
    h('p', { class: 'nota' }, 'Toque num horário vazio para agendar.'));
}
function vistaMes() {
  const [ini] = intervaloVista(); const mes = agendaDia.getMonth();
  return h('div', { class: 'ag-mes' }, DIAS_SEM.map(d => h('div', { class: 'ag-mes-cab' }, d)),
    [...Array(42)].map((_, i) => {
      const d = somaDias(ini, i); const evs = agendaEventos.filter(e => mesmoDia(new Date(e.inicio), d));
      return h('div', { class: 'ag-mes-dia' + (d.getMonth() !== mes ? ' fora' : '') + (mesmoDia(d, new Date()) ? ' hoje' : '') },
        h('button', { class: 'ag-mes-num', type: 'button', onclick: () => { agendaDia = d; agendaVista = 'dia'; render(); } }, d.getDate()),
        evs.slice(0, 3).map(ev => h('button', { type: 'button', class: `ag-chip ev-${ev.categoria === 'bloqueio' ? 'bloqueio' : ev.status}`, onclick: () => detalheEvento(ev) }, `${horaTxt(new Date(ev.inicio))} ${rotuloEvento(ev)}`)),
        evs.length > 3 ? h('button', { class: 'link', type: 'button', style: 'font-size:12px', onclick: () => { agendaDia = d; agendaVista = 'dia'; render(); } }, `+${evs.length - 3}`) : null);
    }));
}

/* ============ formulário ============ */
function modal(titulo, ...conteudo) {
  const fechar = () => { m.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('div', { class: 'modal-caixa bloco' }, h('div', { class: 'cabeca-lista' }, h('h2', null, titulo), h('button', { class: 'link', type: 'button', style: 'margin-left:auto', 'aria-label': 'Fechar', onclick: () => fechar() }, '×')), ...conteudo));
  m.addEventListener('click', (e) => { if (e.target === m) fechar(); });
  document.addEventListener('keydown', esc);
  document.body.append(m);
  return fechar;
}
function formEvento(ev) {
  const bloqueio = ev.categoria === 'bloqueio';
  const ini = ev.inicio ? new Date(ev.inicio) : (() => { const d = new Date(agendaDia); d.setHours(9, 0, 0, 0); return d; })();
  const durAtual = ev.fim ? Math.round((new Date(ev.fim) - ini) / 60000) : null;
  const tipos = tiposConsulta();
  const selPac = h('select', { class: 'campo mini' }, h('option', { value: '' }, '— outra pessoa (digite o nome) —'),
    (agendaPacientes || []).map(p => h('option', { value: p.id, selected: p.id === ev.paciente_id ? true : null }, p.nome)));
  const iNome = h('input', { class: 'campo mini', value: ev.paciente_id ? '' : (ev.paciente_nome || ''), placeholder: 'Nome' });
  const selTipo = h('select', { class: 'campo mini' }, tipos.map(t => h('option', { value: t.titulo, selected: t.titulo === ev.tipo ? true : null }, t.titulo)));
  const iData = h('input', { class: 'campo mini', type: 'date', value: isoDia(ini) });
  const iHora = h('input', { class: 'campo mini', type: 'time', value: horaTxt(ini), step: 300 });
  const iDur = h('input', { class: 'campo mini', inputmode: 'numeric', value: durAtual ?? (bloqueio ? 60 : tipos[0].dados.duracao) });
  const iValor = h('input', { class: 'campo mini', inputmode: 'decimal', value: ev.valor ?? tipos[0].dados.valor ?? '' });
  const selMod = h('select', { class: 'campo mini' }, h('option', { value: 'presencial' }, 'Presencial'), h('option', { value: 'online', selected: ev.modalidade === 'online' ? true : null }, 'Online (teleconsulta)'));
  const cEnc = h('input', { type: 'checkbox', checked: ev.encaixe ? true : null });
  const iSala = h('input', { class: 'campo mini', type: 'url', value: ev.sala || linkMeetPadrao(), placeholder: 'https://meet.google.com/abc-defg-hij' });
  const blocoSala = h('div', { class: 'bloco-sala' },
    h('label', { class: 'mini-rot' }, 'Link do Google Meet'), iSala,
    h('div', { class: 'linha-btn', style: 'margin-top:6px;align-items:center' },
      h('a', { class: 'btn sec', href: 'https://meet.google.com/new', target: '_blank', rel: 'noopener' }, 'Criar reunião no Google Meet ↗'),
      h('span', { class: 'nota' }, linkMeetPadrao() ? 'Já vem com o seu link fixo do Perfil. Troque se quiser uma sala só para esta consulta.' : 'Crie a reunião, copie o link e cole aqui. Dica: salve um link fixo no Perfil.')));
  const mostraSala = () => { blocoSala.hidden = selMod.value !== 'online'; };
  selMod.addEventListener('change', mostraSala);
  const iObs = h('textarea', { class: 'campo', style: 'min-height:60px;font-size:15px', placeholder: bloqueio ? 'Motivo (ex.: almoço, curso, férias)' : 'Observação' }, ev.observacao || '');
  const msg = msgEl();
  const aplicaTipo = () => { const t = tipos.find(x => x.titulo === selTipo.value); if (!t || ev.id) return; iDur.value = t.dados.duracao; if (num(t.dados.valor)) iValor.value = t.dados.valor; if (t.dados.online) selMod.value = 'online'; };
  selTipo.addEventListener('change', () => { aplicaTipo(); mostraSala(); }); if (!ev.id && !bloqueio) aplicaTipo(); mostraSala();
  selPac.addEventListener('change', () => { iNome.hidden = !!selPac.value; }); iNome.hidden = !!selPac.value;
  const salvar = h('button', { class: 'btn pri', type: 'button', onclick: async () => {
    const i = new Date(`${iData.value}T${iHora.value || '09:00'}`), dur = num(iDur.value) || 30, f = new Date(i.getTime() + dur * 60000);
    if (isNaN(i)) return avisa(msg, 'erro', 'Data ou hora inválida.');
    const pac = agendaPacientes.find(p => p.id === selPac.value);
    if (!bloqueio && !pac && !iNome.value.trim()) return avisa(msg, 'erro', 'Escolha a paciente ou digite o nome.');
    // conflito com outro horário (encaixe permite)
    const { data: choques } = await supa.from('agenda').select('id, paciente_nome, categoria, inicio').lt('inicio', f.toISOString()).gt('fim', i.toISOString()).neq('status', 'cancelada');
    const outros = (choques || []).filter(c => c.id !== ev.id);
    if (outros.length && !cEnc.checked) return avisa(msg, 'erro', `Conflita com ${outros.map(c => c.categoria === 'bloqueio' ? 'um bloqueio' : c.paciente_nome).join(', ')} às ${horaTxt(new Date(outros[0].inicio))}. Marque "encaixe" para agendar mesmo assim.`);
    const linha = { nutri_id: sessao.user.id, categoria: ev.categoria, inicio: i.toISOString(), fim: f.toISOString(), observacao: iObs.value.trim(), encaixe: cEnc.checked };
    if (!bloqueio) Object.assign(linha, { paciente_id: pac?.id || null, paciente_nome: pac?.nome || iNome.value.trim(), tipo: selTipo.value, modalidade: selMod.value, valor: num(iValor.value) || 0 });
    if (linha.modalidade === 'online') {
      const sala = iSala.value.trim();
      if (sala && !/^https?:\/\//i.test(sala)) return avisa(msg, 'erro', 'O link do Meet precisa começar com https://');
      linha.sala = sala;
    } else linha.sala = '';
    salvar.disabled = true;
    const q = ev.id ? supa.from('agenda').update(linha).eq('id', ev.id) : supa.from('agenda').insert(linha);
    const { error } = await q;
    if (error) { salvar.disabled = false; return avisa(msg, 'erro', traduzErro(error)); }
    fechar(); render();
  } }, ev.id ? 'Salvar alterações' : bloqueio ? 'Bloquear' : 'Agendar');
  const campo = (rot, el, largo) => h('div', { class: 'mini-campo' + (largo ? ' largo' : '') }, h('label', { class: 'mini-rot' }, rot), el);
  const fechar = modal(bloqueio ? 'Bloquear horário' : ev.id ? 'Editar consulta' : 'Nova consulta',
    h('div', { class: 'grade-medidas' },
      bloqueio ? null : campo('Paciente', selPac, true), bloqueio ? null : campo(' ', iNome, true),
      bloqueio ? null : campo('Tipo', selTipo, true),
      campo('Data', iData), campo('Início', iHora), campo('Duração (min)', iDur),
      bloqueio ? null : campo('Modalidade', selMod, true), bloqueio ? null : campo('Valor (R$)', iValor)),
    bloqueio ? null : blocoSala,
    bloqueio ? null : h('label', { class: 'check' }, cEnc, 'Encaixe (permite horário ocupado)'),
    iObs, h('div', { class: 'linha-btn' }, salvar), msg);
}

/* ============ detalhe ============ */
function mensagemWa(ev, tipo) {
  const i = new Date(ev.inicio), quando = `${i.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} às ${horaTxt(i)}`;
  const nome = primeiro(ev.paciente_nome);
  const local = ev.modalidade === 'online' ? (ev.sala ? `\nÉ online, pelo Google Meet. Na hora, é só entrar neste link: ${ev.sala}` : '\nÉ online: te mando o link da chamada antes da consulta.') : (perfil?.endereco ? `\nEndereço: ${perfil.endereco}` : '');
  if (tipo === 'confirmar') return `Oi, ${nome}! Sua consulta de nutrição com ${perfil?.nome || 'a nutri'} está marcada para ${quando}.${local}\n\nPode confirmar por aqui? ${linkConfirmacao(ev)}`;
  return `Oi, ${nome}! Passando para lembrar da sua consulta amanhã, ${quando}.${local}\nQualquer imprevisto, me avisa por aqui. Até lá!`;
}
function linkGoogleEvento(ev) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.categoria === 'bloqueio' ? `Bloqueio · ${ev.observacao || ''}` : `${ev.tipo || 'Consulta'} · ${ev.paciente_nome}`,
    dates: `${f(ev.inicio)}/${f(ev.fim)}`, details: [ev.sala ? 'Teleconsulta: ' + ev.sala : '', ev.observacao].filter(Boolean).join('\n'), location: ev.modalidade === 'online' ? ev.sala : (perfil?.endereco || '') });
  return 'https://calendar.google.com/calendar/render?' + p;
}
function detalheEvento(ev) {
  const i = new Date(ev.inicio), f = new Date(ev.fim);
  const pac = (agendaPacientes || []).find(p => p.id === ev.paciente_id);
  const fone = telefoneWa(pac?.telefone);
  const msg = msgEl();
  const muda = async (status) => {
    const { error } = await supa.from('agenda').update({ status }).eq('id', ev.id);
    if (error) return avisa(msg, 'erro', traduzErro(error));
    ev.status = status;
    if (status === 'realizada' && num(ev.valor) && confirm(`Lançar R$ ${fmtN(num(ev.valor), 2)} no financeiro como receita desta consulta?`)) {
      const { error: e2 } = await supa.from('financeiro').insert({ nutri_id: sessao.user.id, tipo: 'receita', descricao: `${ev.tipo || 'Consulta'} · ${ev.paciente_nome}`, categoria: 'Consultas', valor: num(ev.valor), data: isoDia(i), pago: true, paciente_id: ev.paciente_id, consulta_id: ev.id });
      if (e2) return avisa(msg, 'erro', traduzErro(e2));
    }
    fechar(); render();
  };
  const wa = (tipo) => fone ? h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}?text=${encodeURIComponent(mensagemWa(ev, tipo))}` }, tipo === 'confirmar' ? 'Pedir confirmação' : 'Lembrete') : null;
  const fechar = modal(ev.categoria === 'bloqueio' ? 'Horário bloqueado' : ev.paciente_nome || 'Consulta',
    h('p', { style: 'margin:0 0 4px' }, h('b', null, i.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })), ` · ${horaTxt(i)}–${horaTxt(f)}`),
    ev.categoria === 'consulta' ? h('p', { class: 'nota', style: 'margin:0' }, [ev.tipo, ev.modalidade === 'online' ? 'online' : 'presencial', ev.encaixe ? 'encaixe' : null, num(ev.valor) ? `R$ ${fmtN(num(ev.valor), 2)}` : null,
      ev.confirmado_em ? `confirmada pela paciente em ${new Date(ev.confirmado_em).toLocaleString('pt-BR')}` : null].filter(Boolean).join(' · ')) : null,
    ev.observacao ? h('p', { style: 'white-space:pre-wrap' }, ev.observacao) : null,
    ev.categoria === 'consulta' ? h('div', null,
      h('h3', { class: 'sub' }, 'Status'),
      h('div', { class: 'chips' }, Object.entries(STATUS).map(([k, s]) => h('button', { type: 'button', class: 'chip' + (ev.status === k ? ' on' : ''), onclick: () => muda(k) }, `${s.ic} ${s.rot}`))),
      ev.modalidade === 'online' && !ev.sala ? h('p', { class: 'form-msg erro' }, 'Consulta online sem link do Google Meet. Clique em Editar para adicionar.') : null,
      ev.modalidade === 'online' && ev.sala ? h('div', { class: 'linha-btn' }, h('a', { class: 'btn pri', target: '_blank', rel: 'noopener', href: ev.sala }, ehMeet(ev.sala) ? '▶ Entrar no Google Meet' : '▶ Entrar na teleconsulta'),
        h('button', { class: 'btn sec', type: 'button', onclick: async (e) => { try { await navigator.clipboard.writeText(ev.sala); e.currentTarget.textContent = 'Copiado ✓'; } catch (_) { prompt('Link da sala:', ev.sala); } } }, 'Copiar link da sala')) : null,
      h('div', { class: 'linha-btn' }, wa('confirmar'), wa('lembrete'),
        !fone ? h('span', { class: 'nota' }, ev.paciente_id ? 'Cadastre o telefone da paciente para enviar pelo WhatsApp.' : 'Vincule a uma paciente com telefone para usar o WhatsApp.') : null)) : null,
    h('div', { class: 'linha-btn' },
      h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: linkGoogleEvento(ev) }, '+ Google Agenda'),
      ev.paciente_id ? h('a', { class: 'btn sec', href: `#pac/${ev.paciente_id}/resumo`, onclick: () => fechar() }, 'Abrir ficha') : null,
      h('button', { class: 'btn sec', type: 'button', onclick: () => { fechar(); formEvento(ev); } }, 'Editar'),
      h('button', { class: 'link', type: 'button', onclick: async () => { if (!confirm('Excluir este horário da agenda?')) return; const { error } = await supa.from('agenda').delete().eq('id', ev.id); if (error) return avisa(msg, 'erro', traduzErro(error)); fechar(); render(); } }, 'excluir')),
    msg);
}

/* ============ lembretes, tipos e Google ============ */
function blocoLembretes() {
  const box = h('div', { class: 'bloco' }, h('h2', null, 'Lembretes de amanhã'), h('p', { class: 'carregando' }, 'carregando…'));
  (async () => {
    const a = new Date(); a.setHours(0, 0, 0, 0); const ini = somaDias(a, 1), fim = somaDias(a, 2);
    const { data } = await supa.from('agenda').select('*').eq('categoria', 'consulta').gte('inicio', ini.toISOString()).lt('inicio', fim.toISOString()).in('status', ['agendada', 'confirmada']).order('inicio');
    box.replaceChildren(h('h2', null, `Lembretes de amanhã (${(data || []).length})`),
      (data || []).length ? data.map(ev => { const pac = (agendaPacientes || []).find(p => p.id === ev.paciente_id); const fone = telefoneWa(pac?.telefone);
        return h('div', { class: 'linha-exame' }, h('div', null, h('b', null, `${horaTxt(new Date(ev.inicio))} · ${ev.paciente_nome}`), h('div', { class: 'nota', style: 'margin:0' }, `${STATUS[ev.status].ic} ${STATUS[ev.status].rot}${ev.modalidade === 'online' ? ' · online' : ''}`)),
          fone ? h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}?text=${encodeURIComponent(mensagemWa(ev, ev.status === 'confirmada' ? 'lembrete' : 'confirmar'))}` }, ev.status === 'confirmada' ? 'Enviar lembrete' : 'Pedir confirmação') : h('span', { class: 'nota' }, 'sem telefone'));
      }) : h('p', { class: 'vazio' }, 'Nenhuma consulta amanhã.'));
  })();
  return box;
}
function blocoTiposConsulta() {
  const lista = bibTipo('tipo_consulta');
  const iT = h('input', { class: 'campo mini', placeholder: 'Ex.: Avaliação de bioimpedância' }), iD = h('input', { class: 'campo mini', inputmode: 'numeric', placeholder: '60' }), iV = h('input', { class: 'campo mini', inputmode: 'decimal', placeholder: '0,00' });
  const cO = h('input', { type: 'checkbox' }); const msg = msgEl();
  return h('details', { class: 'bloco' }, h('summary', { style: 'cursor:pointer;font-family:var(--titulo);font-weight:800;font-size:18px' }, `Tipos de consulta (${lista.length || 'padrão'})`),
    h('p', { class: 'nota' }, lista.length ? '' : 'Enquanto você não cadastra os seus, a agenda usa: Primeira consulta (60 min), Retorno (45 min) e Teleconsulta (45 min).'),
    lista.map(t => h('div', { class: 'linha-exame' }, h('div', null, h('b', null, t.titulo), h('div', { class: 'nota', style: 'margin:0' }, `${t.dados.duracao} min${num(t.dados.valor) ? ' · R$ ' + fmtN(num(t.dados.valor), 2) : ''}${t.dados.online ? ' · online' : ''}`)),
      h('button', { class: 'link', type: 'button', onclick: async () => { await apagaBib(t); render(); } }, 'excluir'))),
    h('div', { class: 'grade-medidas' }, h('div', { class: 'mini-campo largo' }, h('label', { class: 'mini-rot' }, 'Nome'), iT), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Duração (min)'), iD), h('div', { class: 'mini-campo' }, h('label', { class: 'mini-rot' }, 'Valor (R$)'), iV)),
    h('label', { class: 'check' }, cO, 'É online (cria sala de teleconsulta)'),
    h('div', { class: 'linha-btn' }, h('button', { class: 'btn pri', type: 'button', onclick: async () => {
      if (!iT.value.trim() || !num(iD.value)) return avisa(msg, 'erro', 'Preencha nome e duração.');
      try { await salvaBib('tipo_consulta', iT.value.trim(), { duracao: num(iD.value), valor: num(iV.value) || 0, online: cO.checked }); render(); } catch (e) { avisa(msg, 'erro', traduzErro(e)); }
    } }, 'Adicionar tipo')), msg);
}
function blocoGoogleAgenda() {
  const url = perfil?.ics_token ? `${EAT_CONFIG.supabaseUrl}/functions/v1/agenda-ics?t=${perfil.ics_token}` : '';
  return h('details', { class: 'bloco' }, h('summary', { style: 'cursor:pointer;font-family:var(--titulo);font-weight:800;font-size:18px' }, 'Sincronizar com o Google Agenda'),
    url ? h('div', null,
      h('ol', { style: 'line-height:1.6;padding-left:20px' },
        h('li', null, 'Copie o link abaixo.'),
        h('li', null, 'No Google Agenda (computador): Outras agendas → "+" → ', h('b', null, 'Do URL'), ' → cole o link → Adicionar agenda.'),
        h('li', null, 'Pronto: suas consultas aparecem no Google e no celular. O Google atualiza sozinho a cada algumas horas.')),
      h('div', { class: 'linkbox' }, url),
      h('div', { class: 'linha-btn' }, h('button', { class: 'btn esc', type: 'button', onclick: async (e) => { try { await navigator.clipboard.writeText(url); e.currentTarget.textContent = 'Copiado ✓'; } catch (_) { prompt('Link da agenda:', url); } } }, 'Copiar link')),
      h('p', { class: 'nota' }, 'O link é secreto: quem tiver ele vê os horários e nomes da agenda. Não compartilhe. Para consultas pontuais, use o botão "+ Google Agenda" dentro de cada consulta.'))
      : h('p', { class: 'nota' }, 'Disponível depois que o banco for atualizado (fase5.sql).'));
}
