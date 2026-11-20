// ëat · funções de IA (Supabase Edge Function, Deno)
// Ações: ler_exame (PDF de laudo → valores), avaliacao_integrada (até 5 materiais), estimativa_foto (fotos → estimativa visual)
// A chave da Anthropic fica no segredo ANTHROPIC_API_KEY do Supabase, nunca no site.
import Anthropic from "npm:@anthropic-ai/sdk@1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const MODELO = "claude-opus-5-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class ErroUsuario extends Error {}

function paraBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// chamada ao Claude com saída em JSON validada por schema e fallback automático em caso de recusa
async function perguntaClaude(
  client: Anthropic,
  sistema: string,
  conteudo: Anthropic.Beta.BetaContentBlockParam[],
  schema: Record<string, unknown>,
  esforco: "low" | "medium" | "high",
) {
  const resposta = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: sistema,
    output_config: { effort: esforco, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: conteudo }],
  });
  if (resposta.stop_reason === "refusal") throw new ErroUsuario("A IA não pôde analisar este material.");
  if (resposta.stop_reason === "max_tokens") throw new ErroUsuario("A resposta da IA ficou longa demais. Tente com menos material.");
  const texto = resposta.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  if (!texto) throw new ErroUsuario("A IA não devolveu resultado.");
  return { dados: JSON.parse(texto), uso: resposta.usage };
}

const AVISO = "Você apoia nutricionistas brasileiras. Seu papel é apoiar a decisão clínica, não diagnosticar nem prescrever medicamentos. " +
  "Escreva em português do Brasil, com linguagem técnica e objetiva. Não invente dados: se algo não estiver no material, diga que não consta.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  try {
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) return json({ erro: "A chave da Anthropic ainda não foi cadastrada no Supabase (segredo ANTHROPIC_API_KEY)." }, 503);

    // cliente do Supabase COM o login da nutri: as regras de segurança valem aqui também
    const auth = req.headers.get("Authorization") ?? "";
    // chave pública: a antiga anon, a nova publishable (variável do projeto) ou a que o próprio site envia no cabeçalho apikey
    let chavePublica = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!chavePublica) { try { chavePublica = Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}"))[0] as string ?? ""; } catch { /* sem variável */ } }
    if (!chavePublica) chavePublica = req.headers.get("apikey") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: u, error: eu } = await supa.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (eu || !u?.user) return json({ erro: "Faça login de novo." }, 401);

    const corpo = await req.json();
    const client = new Anthropic({ apiKey: chave });

    /* ---------- 1. ler PDF de exame ---------- */
    if (corpo.acao === "ler_exame") {
      const { data: reg } = await supa.from("registros").select("id, arquivo, tipo").eq("id", corpo.registroId).maybeSingle();
      if (!reg?.arquivo || reg.tipo !== "exame") throw new ErroUsuario("Esse lançamento não tem PDF anexado.");
      const { data: arq, error: ea } = await supa.storage.from("arquivos").download(reg.arquivo);
      if (ea || !arq) throw new ErroUsuario("Não consegui abrir o PDF.");
      const catalogo: { id: string; nome: string; unidade: string }[] = (corpo.catalogo ?? []).slice(0, 80);
      const ids = catalogo.map((c) => c.id).concat(["outro"]);
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["data_coleta", "laboratorio", "resultados", "pontos_revisao"],
        properties: {
          data_coleta: { type: "string", description: "AAAA-MM-DD, ou vazio se não constar" },
          laboratorio: { type: "string" },
          resultados: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "nome_no_laudo", "valor", "unidade", "ref_min", "ref_max"],
              properties: {
                id: { type: "string", enum: ids },
                nome_no_laudo: { type: "string" },
                valor: { type: "number" },
                unidade: { type: "string" },
                ref_min: { type: ["number", "null"] },
                ref_max: { type: ["number", "null"] },
              },
            },
          },
          pontos_revisao: { type: "array", items: { type: "string" } },
        },
      };
      const { dados, uso } = await perguntaClaude(client, AVISO, [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: paraBase64(await arq.arrayBuffer()) } },
        {
          type: "text",
          text:
            "Extraia os resultados deste laudo laboratorial.\n" +
            "Associe cada exame a um id do catálogo abaixo quando for o mesmo exame; caso contrário use id \"outro\".\n" +
            "Converta o valor para a unidade do catálogo quando a unidade do laudo for diferente; se não for possível converter com segurança, use \"outro\".\n" +
            "Use ponto como separador decimal. ref_min/ref_max são a faixa de referência do laudo (null se não houver).\n" +
            "Em pontos_revisao, liste de 2 a 6 observações curtas para a nutricionista revisar (valores fora da faixa, combinações relevantes, itens ilegíveis).\n\n" +
            "Catálogo (id · nome · unidade):\n" + catalogo.map((c) => `${c.id} · ${c.nome} · ${c.unidade}`).join("\n"),
        },
      ], schema, "medium");
      return json({ ok: true, resultado: dados, uso });
    }

    /* ---------- 2. avaliação integrada ---------- */
    if (corpo.acao === "avaliacao_integrada") {
      const materiais: { tipo: string; id: string }[] = (corpo.materiais ?? []).slice(0, 5);
      if (!materiais.length) throw new ErroUsuario("Selecione pelo menos um material.");
      const { data: pac } = await supa.from("pacientes").select("id, nome, nascimento, sexo, observacoes").eq("id", corpo.pacienteId).maybeSingle();
      if (!pac) throw new ErroUsuario("Paciente não encontrada.");
      const blocos: string[] = [];
      for (const m of materiais) {
        if (m.tipo === "anamnese") {
          const { data } = await supa.from("anamneses").select("criado_em, respostas").eq("id", m.id).eq("paciente_id", pac.id).maybeSingle();
          if (data) blocos.push(`### Anamnese (${data.criado_em.slice(0, 10)})\n${JSON.stringify(data.respostas)}`);
        } else {
          const { data } = await supa.from("registros").select("tipo, data, dados").eq("id", m.id).eq("paciente_id", pac.id).maybeSingle();
          if (data && data.tipo !== "foto") blocos.push(`### ${data.tipo} (${data.data})\n${JSON.stringify(data.dados)}`);
        }
      }
      if (!blocos.length) throw new ErroUsuario("Nenhum material encontrado para esta paciente.");
      // resumos calculados no navegador (IMC, %G, escores-z, status de exames) ajudam a IA a não recalcular errado
      const resumos = typeof corpo.resumos === "string" ? corpo.resumos.slice(0, 20000) : "";
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["sintese", "achados", "relacoes", "condutas", "investigar", "limitacoes"],
        properties: {
          sintese: { type: "string", description: "3 a 5 frases" },
          achados: { type: "array", items: { type: "string" } },
          relacoes: { type: "array", items: { type: "string" }, description: "relações entre os materiais (ex.: sintomas da anamnese x exames)" },
          condutas: { type: "array", items: { type: "string" }, description: "sugestões de conduta nutricional" },
          investigar: { type: "array", items: { type: "string" }, description: "o que perguntar, medir ou pedir" },
          limitacoes: { type: "string" },
        },
      };
      const idade = pac.nascimento ? Math.floor((Date.now() - new Date(pac.nascimento).getTime()) / 31557600000) : null;
      const { dados, uso } = await perguntaClaude(client, AVISO, [{
        type: "text",
        text:
          `Paciente: sexo ${pac.sexo === "M" ? "masculino" : "feminino"}, ${idade != null ? idade + " anos" : "idade não informada"}.` +
          (pac.observacoes ? `\nObservações da nutricionista: ${pac.observacoes}` : "") +
          "\n\nCruze os materiais abaixo e produza uma análise de apoio à conduta nutricional. " +
          "Seja específica: cite os dados que sustentam cada ponto. Não repita dados sem interpretá-los. " +
          "Sinalize quando algo exigir encaminhamento a outro profissional.\n\n" +
          (resumos ? `## Indicadores já calculados pelo sistema\n${resumos}\n\n` : "") +
          `## Materiais\n${blocos.join("\n\n")}`,
      }], schema, "high");
      const { data: salvo, error: es } = await supa.from("registros").insert({
        nutri_id: u.user.id, paciente_id: pac.id, tipo: "ia",
        dados: { acao: "avaliacao_integrada", materiais, resultado: dados, modelo: MODELO },
      }).select().single();
      if (es) throw es;
      return json({ ok: true, registro: salvo, uso });
    }

    /* ---------- 3. estimativa corporal por foto ---------- */
    if (corpo.acao === "estimativa_foto") {
      const ids: string[] = (corpo.fotoIds ?? []).slice(0, 3);
      const { data: regs } = await supa.from("registros").select("id, arquivo, dados, data, paciente_id").in("id", ids).eq("tipo", "foto");
      if (!regs?.length) throw new ErroUsuario("Selecione de 1 a 3 fotos.");
      const imagens: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const r of regs) {
        const { data: arq } = await supa.storage.from("arquivos").download(r.arquivo);
        if (arq) {
          imagens.push({ type: "text", text: `Foto: posição ${r.dados?.pose ?? "não informada"}, ${r.data}` });
          imagens.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: paraBase64(await arq.arrayBuffer()) } });
        }
      }
      if (!imagens.length) throw new ErroUsuario("Não consegui abrir as fotos.");
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["gordura_min", "gordura_max", "confianca", "observacoes", "limitacoes"],
        properties: {
          gordura_min: { type: ["number", "null"], description: "% de gordura corporal, limite inferior da estimativa" },
          gordura_max: { type: ["number", "null"] },
          confianca: { type: "string", enum: ["baixa", "media"] },
          observacoes: { type: "array", items: { type: "string" }, description: "distribuição de gordura, postura, pontos visuais relevantes" },
          limitacoes: { type: "string" },
        },
      };
      const contexto = typeof corpo.contexto === "string" ? corpo.contexto.slice(0, 2000) : "";
      const { dados, uso } = await perguntaClaude(client, AVISO + " Sobre composição corporal por imagem: é uma estimativa visual de baixa precisão; " +
        "dê uma faixa larga (ao menos 6 pontos percentuais), nunca um número único, e use null se as fotos não permitirem estimar.", [
        ...imagens,
        { type: "text", text: `Estime a faixa de % de gordura corporal e descreva a distribuição visível.${contexto ? "\nDados da paciente: " + contexto : ""}` },
      ], schema, "medium");
      const pacienteId = regs[0].paciente_id;
      const { data: salvo, error: es } = await supa.from("registros").insert({
        nutri_id: u.user.id, paciente_id: pacienteId, tipo: "ia",
        dados: { acao: "estimativa_foto", fotos: regs.map((r) => r.id), resultado: dados, modelo: MODELO },
      }).select().single();
      if (es) throw es;
      return json({ ok: true, registro: salvo, uso });
    }

    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    if (e instanceof ErroUsuario) return json({ erro: e.message }, 400);
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: "A chave da Anthropic é inválida. Confira o segredo ANTHROPIC_API_KEY." }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ erro: "Muitas análises seguidas. Espere um minuto e tente de novo." }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ erro: "A IA não aceitou o material: " + e.message }, 400);
    if (e instanceof Anthropic.APIError) return json({ erro: `Falha na IA (${e.status}). Tente de novo.` }, 502);
    console.error(e);
    return json({ erro: "Erro inesperado: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
