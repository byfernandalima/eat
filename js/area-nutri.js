/* ëat · do lado da nutri: convite de acesso e o que aparece na área da paciente
   Avaliações, exames e orientações aparecem como dados na tela dela.
   Planos, prescrições e documentos vão como o mesmo PDF que a nutri já gera (com timbrado e assinatura). */

const urlAreaPaciente = () => new URL('minha-area.html', location.href.split('#')[0].split('?')[0]).toString();

async function marcaRegistro(reg, campos) {
  const { data, error } = await supa.from('registros').update(campos).eq('id', reg.id).select().single();
  if (error) throw error;
  Object.assign(reg, data);
  F.registros = F.registros.map(x => x.id === data.id ? data : x);
  return data;
}
async function publicaPDF(reg, blob) {
  const caminho = `${sessao.user.id}/${F.paciente.id}/area/${reg.id}-${Date.now()}.pdf`;
  const { error } = await supa.storage.from('arquivos').upload(caminho, blob, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  const antigo = reg.pdf_paciente;
  await marcaRegistro(reg, { compartilhado: true, compartilhado_em: new Date().toISOString(), pdf_paciente: caminho });
  if (antigo) supa.storage.from('arquivos').remove([antigo]);
}
async function tiraDaArea(reg) {
  const antigo = reg.pdf_paciente;
  await marcaRegistro(reg, { compartilhado: false, pdf_paciente: null });
  if (antigo) supa.storage.from('arquivos').remove([antigo]);
}

// controle que vai em cada linha: "mostrar para a paciente" / "✓ na área dela · atualizar · tirar"
// gerarPDF (opcional): async () => Blob. Sem ele, a paciente vê os dados direto na tela.
function controleArea(reg, gerarPDF) {
  const box = h('span', { class: 'area-ctrl' });
  const acao = (fn) => async (ev) => {
    const b = ev.currentTarget, rot = b.textContent; b.disabled = true; b.textContent = 'enviando…';
    try { await fn(); desenha(); }
    catch (e) { if (e?.message !== 'cancelado') alert(traduzErro(e)); b.disabled = false; b.textContent = rot; }
  };
  const mostrar = async () => {
    if (gerarPDF) await publicaPDF(reg, await gerarPDF());
    else await marcaRegistro(reg, { compartilhado: true, compartilhado_em: new Date().toISOString() });
  };
  const tirar = async () => { if (confirm('Tirar da área da paciente? Ela deixa de ver isto.')) await tiraDaArea(reg); };
  const desenha = () => {
    if (!reg.compartilhado) {
      box.replaceChildren(h('button', { class: 'link area', type: 'button', title: 'A paciente passa a ver isto na área dela', onclick: acao(mostrar) }, 'mostrar para a paciente'));
      return;
    }
    const semAcesso = !F.paciente.usuario_id;
    box.replaceChildren(
      h('span', { class: 'selo-area', title: semAcesso ? 'Ela vai ver quando ativar o acesso (aba Dados)' : 'Ela já vê isto na área dela' }, semAcesso ? '✓ liberado' : '✓ na área dela'),
      gerarPDF ? h('button', { class: 'link', type: 'button', title: 'Gera o PDF de novo com o conteúdo atual', onclick: acao(mostrar) }, 'atualizar') : null,
      h('button', { class: 'link', type: 'button', onclick: acao(tirar) }, 'tirar'));
  };
  desenha();
  return box;
}

/* ---------- convite: aba Dados da ficha ---------- */
function blocoAcessoPaciente() {
  const p = F.paciente;
  const box = h('div', { class: 'bloco acesso-paciente' });
  const msg = msgEl();
  const link = () => { const u = new URL(urlAreaPaciente()); u.searchParams.set('convite', `${p.id}.${p.convite_token}`); return u.toString(); };
  const conviteValido = () => p.convite_token && p.convite_em && (Date.now() - new Date(p.convite_em)) < 30 * 864e5;
  const salva = async (campos) => {
    const { data, error } = await supa.from('pacientes').update(campos).eq('id', p.id).select().single();
    if (error) throw error;
    Object.assign(F.paciente, data); listaPacientes = null;
  };
  const gerar = async (ev) => {
    ev.currentTarget.disabled = true;
    try { await salva({ convite_token: novoUUID(), convite_em: new Date().toISOString() }); desenha(); }
    catch (e) { avisa(msg, 'erro', traduzErro(e)); ev.currentTarget.disabled = false; }
  };
  const desenha = () => {
    box.replaceChildren(h('h2', null, 'Área da paciente'));
    if (p.usuario_id) {
      box.append(
        h('p', { style: 'margin-top:0' }, h('span', { class: 'selo-area' }, '✓ acesso ativo'), p.acesso_desde ? ` desde ${new Date(p.acesso_desde).toLocaleDateString('pt-BR')}` : ''),
        h('p', { class: 'nota' }, 'Ela vê as consultas, as anamneses e o que você marcar como "mostrar para a paciente" nas abas Antropometria, Exames, Plano alimentar, Prescrições e Documentos.'),
        h('div', { class: 'linha-btn' },
          h('a', { class: 'btn sec', href: urlAreaPaciente(), target: '_blank', rel: 'noopener' }, 'Abrir a página de entrada'),
          h('button', { class: 'btn sec', type: 'button', onclick: async (ev) => {
            if (!confirm(`Remover o acesso de ${primeiro(p.nome) || 'da paciente'}? Ela não consegue mais ver nada desta ficha. Dá para convidar de novo depois.`)) return;
            ev.currentTarget.disabled = true;
            try { await salva({ usuario_id: null, convite_token: null, acesso_desde: null }); desenha(); }
            catch (e) { avisa(msg, 'erro', traduzErro(e)); ev.currentTarget.disabled = false; }
          } }, 'Remover acesso')), msg);
      return;
    }
    box.append(h('p', { class: 'nota', style: 'margin-top:0' }, 'Libere o acesso para ela acompanhar consultas, anamnese, avaliações e planos pelo celular. Ela só vê o que você marcar como "mostrar para a paciente".'));
    if (!conviteValido()) {
      box.append(h('button', { class: 'btn pri', type: 'button', onclick: gerar }, 'Liberar acesso'), msg);
      return;
    }
    const fone = (p.telefone || '').replace(/\D/g, '');
    const texto = `Oi, ${primeiro(p.nome) || 'tudo bem'}! Liberei sua área no ëatelligence: lá você acompanha suas consultas, sua anamnese, avaliações e planos. Crie sua senha por este link (vale 30 dias):\n${link()}`;
    const copiar = h('button', { class: 'btn esc', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(link()); copiar.textContent = 'Copiado ✓'; setTimeout(() => copiar.textContent = 'Copiar link', 2000); }
      catch (_) { prompt('Copie o link:', link()); }
    } }, 'Copiar link');
    box.append(
      h('p', { class: 'nota' }, `Convite gerado em ${new Date(p.convite_em).toLocaleDateString('pt-BR')}. Vale 30 dias e só funciona uma vez.`),
      h('div', { class: 'linkbox' }, link()),
      h('div', { class: 'linha-btn' }, copiar,
        h('a', { class: 'btn sec', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone ? (fone.length <= 11 ? '55' + fone : fone) : ''}?text=${encodeURIComponent(texto)}` }, 'Mandar no WhatsApp'),
        h('button', { class: 'link', type: 'button', onclick: (ev) => { if (confirm('Gerar um link novo? O anterior para de funcionar.')) gerar(ev); } }, 'gerar link novo')),
      msg);
  };
  desenha();
  return box;
}
