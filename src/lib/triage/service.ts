import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/auth";
import { anthropicKeyFor } from "@/lib/integrations/service";
import { analyzeTicket, TriageError } from "@/lib/triage/analyze";
import { mergeDecisions, parseTriageReply, type Decision, type TriageResult } from "@/lib/triage/message";

/**
 * Análisis del agente y decisiones del equipo. Solo el responsable del ticket los usa: se
 * paga con su API key y las respuestas quedan a su nombre. El acceso de emergencia no puede.
 */
async function ticketForAgent(ticketId: string, actor: AdminSession) {
  if (!actor.userId) {
    throw new TriageError("NEEDS_USER", 403, "El acceso de emergencia no puede usar el agente: entrá con tu usuario.");
  }
  const { data, error } = await getSupabaseAdmin()
    .from("tickets")
    .select("id,number,type,title,description,expected,actual,assignee_id,triage,decisions,clients(name,notes)")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TriageError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");
  if (data.assignee_id !== actor.userId) {
    throw new TriageError("NOT_ASSIGNEE", 403, "Solo el responsable del ticket puede usar el agente. Tomalo primero.");
  }
  return data;
}

async function record(ticketId: string, actor: Pick<AdminSession, "userId" | "name">, kind: "triage" | "decision", body: string, meta: Record<string, unknown>) {
  const { error } = await getSupabaseAdmin().from("ticket_activity").insert({
    ticket_id: ticketId,
    author_id: actor.userId,
    author_name: actor.name,
    kind,
    body,
    meta,
  });
  if (error) console.error("[triage] no se pudo registrar la actividad", error);
}

export async function runTriage(ticketId: string, actor: AdminSession): Promise<{ triage: TriageResult; decisions: Decision[] }> {
  const ticket = await ticketForAgent(ticketId, actor);
  const apiKey = await anthropicKeyFor(actor.userId!);
  const client = ticket.clients as unknown as { name: string; notes: string | null } | null;
  const decisions = (ticket.decisions as Decision[] | null) ?? [];

  const { data: comments } = await getSupabaseAdmin()
    .from("ticket_activity")
    .select("author_name,body")
    .eq("ticket_id", ticketId)
    .eq("kind", "comment")
    .order("created_at", { ascending: true })
    .limit(50);

  const result = await analyzeTicket(apiKey, {
    number: Number(ticket.number),
    type: ticket.type as "bug" | "feature",
    title: ticket.title as string,
    description: ticket.description as string,
    expected: (ticket.expected as string | null) ?? null,
    actual: (ticket.actual as string | null) ?? null,
    clientName: client?.name ?? "-",
    clientContext: client?.notes ?? null,
    comments: (comments ?? []).map((c) => ({ author: (c.author_name as string | null) ?? null, body: (c.body as string) ?? "" })),
    decisions,
  });

  return { triage: await storeTriage(ticketId, actor, result), decisions };
}

/** Guarda un análisis nuevo. Las decisiones ya tomadas se conservan. */
export async function storeTriage(
  ticketId: string,
  actor: Pick<AdminSession, "userId" | "name">,
  result: Omit<TriageResult, "analyzedAt" | "analyzedBy">
): Promise<TriageResult> {
  const triage: TriageResult = { ...result, analyzedAt: new Date().toISOString(), analyzedBy: actor.name };
  const { error } = await getSupabaseAdmin().from("tickets").update({ triage }).eq("id", ticketId);
  if (error) throw error;
  await record(ticketId, actor, "triage", result.summary, { verdict: result.verdict, questions: result.questions.length, model: result.model });
  return triage;
}

/** Análisis hecho a mano con el plan de Claude: se pega la respuesta y se valida. */
export async function saveManualTriage(
  ticketId: string,
  reply: unknown,
  actor: AdminSession
): Promise<{ triage: TriageResult; decisions: Decision[] }> {
  const ticket = await ticketForAgent(ticketId, actor);
  const parsed = parseTriageReply(typeof reply === "string" ? reply.slice(0, 50_000) : "", `m${Date.now().toString(36)}-`);
  if (!parsed.ok) throw new TriageError("BAD_REPLY", 400, parsed.error);
  const triage = await storeTriage(ticketId, actor, { ...parsed.value, model: "manual" });
  return { triage, decisions: (ticket.decisions as Decision[] | null) ?? [] };
}

export async function saveDecisions(
  ticketId: string,
  rawAnswers: unknown,
  actor: AdminSession
): Promise<{ decisions: Decision[]; added: Decision[] }> {
  const ticket = await ticketForAgent(ticketId, actor);
  const triage = ticket.triage as TriageResult | null;
  if (!triage) throw new TriageError("NO_TRIAGE", 400, "Primero analizá el ticket con el agente");
  const answers = Array.isArray(rawAnswers)
    ? rawAnswers
        .filter((a): a is { questionId: string; answer: string } =>
          Boolean(a) && typeof a.questionId === "string" && typeof a.answer === "string"
        )
        .slice(0, 20)
    : [];
  const current = (ticket.decisions as Decision[] | null) ?? [];
  const decisions = mergeDecisions(current, triage.questions, answers, actor.name, new Date().toISOString());
  const added = decisions.filter((d) => !current.includes(d));
  if (!added.length) return { decisions: current, added };

  const { error } = await getSupabaseAdmin().from("tickets").update({ decisions }).eq("id", ticketId);
  if (error) throw error;
  await record(
    ticketId,
    actor,
    "decision",
    added.map((d) => `${d.question} → ${d.answer}`).join("\n"),
    { count: added.length }
  );
  return { decisions, added };
}
