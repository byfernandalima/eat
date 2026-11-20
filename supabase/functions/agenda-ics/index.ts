// ëat · agenda em formato iCalendar (.ics) para assinar no Google Agenda, Apple ou Outlook.
// GET /functions/v1/agenda-ics?t=<ics_token da nutri>  (sem login: o token secreto identifica a nutri)
// Não usa chave de servidor: chama a função do banco agenda_ics, que só devolve a agenda dona do token.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// chave pública (a mesma do site; pode ficar no código). Variáveis do projeto têm prioridade.
const CHAVE_PUBLICA_SITE = "sb_publishable_EzDzmLzDH03YFM950PCLtQ_xjjs3Awg";
function chavePublica(): string {
  const anon = Deno.env.get("SUPABASE_ANON_KEY"); if (anon) return anon;
  try { const v = Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}"))[0]; if (v) return v as string; } catch { /* sem variável */ }
  return CHAVE_PUBLICA_SITE;
}
const escapa = (t: string) => (t || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
const dataIcs = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// linhas do .ics têm no máximo 75 caracteres; as seguintes começam com espaço
const dobra = (l: string) => l.length <= 74 ? l : l.match(/.{1,73}/g)!.join("\r\n ");

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("token inválido", { status: 400 });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica(), { auth: { persistSession: false } });
  const { data, error } = await supa.rpc("agenda_ics", { p_token: token });
  if (error) { console.error("agenda-ics:", error.message); return new Response("erro ao ler a agenda", { status: 500 }); }
  if (!data?.length) return new Response("agenda não encontrada", { status: 404 });
  const agora = dataIcs(new Date().toISOString());
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//eat intelligence//agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapa("ëat · " + data[0].nutri)}`, "X-WR-TIMEZONE:America/Sao_Paulo", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of data) {
    if (!e.id) continue; // nutri sem eventos no período
    const bloqueio = e.categoria === "bloqueio";
    const titulo = bloqueio ? `Bloqueado${e.observacao ? " · " + e.observacao : ""}` : `${e.tipo || "Consulta"} · ${e.paciente_nome}${e.status === "confirmada" ? " ✓" : ""}`;
    const desc = [bloqueio ? "" : `Status: ${e.status}`, e.encaixe ? "Encaixe" : "", e.sala ? `Teleconsulta: ${e.sala}` : "", e.observacao && !bloqueio ? e.observacao : ""].filter(Boolean).join("\n");
    linhas.push("BEGIN:VEVENT", `UID:${e.id}@eat-intelligence`, `DTSTAMP:${agora}`, `DTSTART:${dataIcs(e.inicio)}`, `DTEND:${dataIcs(e.fim)}`,
      `SUMMARY:${escapa(titulo)}`, desc ? `DESCRIPTION:${escapa(desc)}` : "",
      `LOCATION:${escapa(e.modalidade === "online" ? e.sala : (e.endereco || ""))}`,
      `STATUS:${e.status === "confirmada" || e.status === "realizada" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return new Response(linhas.filter(Boolean).map(dobra).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" },
  });
});
