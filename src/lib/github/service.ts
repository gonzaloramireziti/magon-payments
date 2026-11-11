import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/auth";
import { notify } from "@/lib/env";
import { githubTokenFor } from "@/lib/integrations/service";
import { splitRepo } from "@/lib/integrations/repos";
import { updateTicket } from "@/lib/tickets/service";
import { storeTriage } from "@/lib/triage/service";
import type { Decision, TriageResult } from "@/lib/triage/message";
import { github, GithubError } from "@/lib/github/api";
import {
  answersComment,
  branchPrefix,
  issueBody,
  issueTitle,
  latestQuestions,
  type GithubIssueLink,
  type IssueComment,
} from "@/lib/github/issue";

/**
 * Etapa 2 del agente: el ticket se manda como issue al repo del cliente, donde lo trabaja
 * Claude Code (GitHub Action, con la suscripción de quien lo dispara). El panel sigue el issue:
 * comentarios, preguntas (pasan al análisis del ticket), ramas y PRs.
 */

const AGENT_NAME = "Claude (GitHub)";

type TicketForGithub = {
  id: string;
  number: number;
  type: "bug" | "feature";
  title: string;
  status: string;
  assignee_id: string | null;
  github_issue: GithubIssueLink | null;
  triage: TriageResult | null;
  decisions: Decision[] | null;
  clients: { name: string; repos: string[] | null } | null;
};

function requireUser(actor: AdminSession): string {
  if (!actor.userId) {
    throw new GithubError("NEEDS_USER", 403, "El acceso de emergencia no puede usar GitHub: entrá con tu usuario.");
  }
  return actor.userId;
}

async function loadTicket(ticketId: string): Promise<TicketForGithub> {
  const { data, error } = await getSupabaseAdmin()
    .from("tickets")
    .select("id,number,type,title,status,assignee_id,github_issue,triage,decisions,clients(name,repos)")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new GithubError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");
  return data as unknown as TicketForGithub;
}

function requireAssignee(ticket: TicketForGithub, userId: string) {
  if (ticket.assignee_id !== userId) {
    throw new GithubError("NOT_ASSIGNEE", 403, "Solo el responsable del ticket puede mandarlo a GitHub. Tomalo primero.");
  }
}

async function recordGithub(ticketId: string, actor: Pick<AdminSession, "userId" | "name">, body: string, meta: Record<string, unknown>) {
  const { error } = await getSupabaseAdmin().from("ticket_activity").insert({
    ticket_id: ticketId,
    author_id: actor.userId,
    author_name: actor.name,
    kind: "github",
    body,
    meta,
  });
  if (error) console.error("[github] no se pudo registrar la actividad", error);
}

async function saveLink(ticketId: string, link: GithubIssueLink) {
  const { error } = await getSupabaseAdmin().from("tickets").update({ github_issue: link }).eq("id", ticketId);
  if (error) throw error;
}

/** Crea el issue en el repo del cliente con el prompt armado en el panel. */
export async function sendToGithub(
  ticketId: string,
  rawPrompt: unknown,
  rawRepo: unknown,
  actor: AdminSession
): Promise<GithubIssueLink> {
  const userId = requireUser(actor);
  const ticket = await loadTicket(ticketId);
  requireAssignee(ticket, userId);
  if (ticket.github_issue) throw new GithubError("ALREADY_SENT", 409, "Este ticket ya tiene su issue en GitHub");
  const repos = ticket.clients?.repos ?? [];
  if (!repos.length) {
    throw new GithubError("NO_REPO", 400, `${ticket.clients?.name ?? "El cliente"} no tiene repos cargados (Clientes → Editar).`);
  }
  const entry = typeof rawRepo === "string" && repos.includes(rawRepo) ? rawRepo : repos[0];
  const { repo, base } = splitRepo(entry);
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim().slice(0, 60_000) : "";
  if (!prompt) throw new GithubError("EMPTY_PROMPT", 400, "Falta el prompt del ticket");

  const token = await githubTokenFor(userId);
  const issue = await github<{ number: number; html_url: string }>(token, `/repos/${repo}/issues`, {
    method: "POST",
    body: {
      title: issueTitle(ticket),
      body: issueBody(prompt, notify.panelUrl ? `${notify.panelUrl.replace(/\/$/, "")}/admin` : null, base),
    },
  });
  const link: GithubIssueLink = {
    repo,
    base,
    number: issue.number,
    url: issue.html_url,
    createdAt: new Date().toISOString(),
    createdBy: actor.name,
    lastQuestionsCommentId: null,
  };
  await saveLink(ticketId, link);
  await recordGithub(ticketId, actor, `Mandó el ticket a GitHub: ${repo}#${issue.number}`, { url: issue.html_url });
  if (["new", "analysis", "ready"].includes(ticket.status)) {
    await updateTicket(ticketId, { status: "in_progress" }, actor);
  }
  return link;
}

type GhComment = { id: number; body: string | null; html_url: string; created_at: string; updated_at: string; user: { login: string; type: string } | null };
type GhPull = { number: number; html_url: string; title: string; state: string; draft?: boolean; merged_at: string | null; head: { ref: string } };

export type GithubStatus = {
  issue: { repo: string; number: number; url: string; state: string; title: string };
  comments: Array<{ id: number; user: string; bot: boolean; body: string; url: string; createdAt: string }>;
  branches: Array<{ name: string; url: string; pull: { number: number; url: string; state: string; merged: boolean; draft: boolean } | null }>;
  triage: TriageResult | null;
  decisions: Decision[];
};

/** Lee el estado del issue y pasa al ticket las preguntas nuevas que haya dejado Claude. */
export async function syncGithub(ticketId: string, actor: AdminSession): Promise<GithubStatus | null> {
  const userId = requireUser(actor);
  const ticket = await loadTicket(ticketId);
  const link = ticket.github_issue;
  if (!link) return null;
  const token = await githubTokenFor(userId);
  const base = `/repos/${link.repo}`;

  const [issue, comments, refs] = await Promise.all([
    github<{ state: string; title: string }>(token, `${base}/issues/${link.number}`),
    github<GhComment[]>(token, `${base}/issues/${link.number}/comments?per_page=100`),
    github<Array<{ ref: string }>>(token, `${base}/git/matching-refs/heads/${branchPrefix(link.number)}`).catch(() => []),
  ]);

  const branchNames = refs.map((r) => r.ref.replace(/^refs\/heads\//, "")).slice(-5);
  const owner = link.repo.split("/")[0];
  const branches = await Promise.all(
    branchNames.map(async (name) => {
      const pulls = await github<GhPull[]>(token, `${base}/pulls?state=all&head=${encodeURIComponent(`${owner}:${name}`)}`).catch(() => []);
      const pull = pulls[0];
      return {
        name,
        url: `https://github.com/${link.repo}/tree/${name}`,
        pull: pull
          ? { number: pull.number, url: pull.html_url, state: pull.state, merged: Boolean(pull.merged_at), draft: Boolean(pull.draft) }
          : null,
      };
    })
  );

  const mapped: IssueComment[] = comments.map((c) => ({
    id: c.id,
    body: c.body ?? "",
    user: c.user?.login ?? "?",
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
  const bots = new Set(comments.filter((c) => c.user?.type === "Bot").map((c) => c.user!.login));

  // Preguntas nuevas de Claude: reemplazan el análisis del ticket (las decisiones quedan).
  let triage = ticket.triage;
  const found = latestQuestions(mapped, (user) => bots.has(user));
  if (found && found.commentId !== link.lastQuestionsCommentId) {
    triage = await storeTriage(ticketId, { userId: null, name: AGENT_NAME }, {
      verdict: found.verdict,
      summary: found.summary,
      questions: found.questions,
      model: "github",
    });
    await saveLink(ticketId, { ...link, lastQuestionsCommentId: found.commentId });
  }

  return {
    issue: { repo: link.repo, number: link.number, url: link.url, state: issue.state, title: issue.title },
    comments: comments.slice(-8).map((c) => ({
      id: c.id,
      user: c.user?.login ?? "?",
      bot: c.user?.type === "Bot",
      body: (c.body ?? "").slice(0, 3000),
      url: c.html_url,
      createdAt: c.created_at,
    })),
    branches,
    triage,
    decisions: ticket.decisions ?? [],
  };
}

/** Crea el PR desde la rama que pusheó Claude, contra la rama por defecto del repo. */
export async function createPull(ticketId: string, rawBranch: unknown, actor: AdminSession): Promise<{ url: string; number: number }> {
  const userId = requireUser(actor);
  const ticket = await loadTicket(ticketId);
  requireAssignee(ticket, userId);
  const link = ticket.github_issue;
  if (!link) throw new GithubError("NOT_SENT", 400, "Este ticket no tiene issue en GitHub");
  const branch = typeof rawBranch === "string" ? rawBranch : "";
  if (!branch.startsWith(branchPrefix(link.number))) throw new GithubError("BAD_BRANCH", 400, "Esa rama no es de este ticket");

  const token = await githubTokenFor(userId);
  const base = link.base ?? (await github<{ default_branch: string }>(token, `/repos/${link.repo}`)).default_branch;
  const pull = await github<{ number: number; html_url: string }>(token, `/repos/${link.repo}/pulls`, {
    method: "POST",
    body: {
      title: issueTitle(ticket),
      head: branch,
      base,
      body: `Closes #${link.number}\n\nTicket #${ticket.number} del panel de Magon.`,
    },
  });
  await recordGithub(ticketId, actor, `Creó el PR ${link.repo}#${pull.number}`, { url: pull.html_url });
  return { url: pull.html_url, number: pull.number };
}

/** Si el ticket está en GitHub, las respuestas nuevas se comentan en el issue para que Claude siga. */
export async function forwardAnswers(
  ticketId: string,
  added: Decision[],
  actor: AdminSession
): Promise<{ posted: boolean; error: string | null }> {
  if (!added.length || !actor.userId) return { posted: false, error: null };
  const ticket = await loadTicket(ticketId);
  const link = ticket.github_issue;
  if (!link) return { posted: false, error: null };
  try {
    const token = await githubTokenFor(actor.userId);
    await github(token, `/repos/${link.repo}/issues/${link.number}/comments`, {
      method: "POST",
      body: { body: answersComment(added) },
    });
    await recordGithub(ticketId, actor, `Respondió las preguntas en ${link.repo}#${link.number}`, { url: link.url });
    return { posted: true, error: null };
  } catch (error) {
    return { posted: false, error: error instanceof Error ? error.message : "No se pudo comentar en GitHub" };
  }
}
