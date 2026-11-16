import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/auth";
import { notify } from "@/lib/env";
import { githubTokenFor } from "@/lib/integrations/service";
import { splitRepo } from "@/lib/integrations/repos";
import { updateTicket } from "@/lib/tickets/service";
import { storeTriage } from "@/lib/triage/service";
import { QUESTIONS_MARKER, TRIAGE_REPLY_FORMAT, type Decision, type TriageResult } from "@/lib/triage/message";
import { github, GithubError } from "@/lib/github/api";
import {
  answersComment,
  branchPrefix,
  issueBody,
  issueTitle,
  latestPlan,
  latestQuestions,
  taskIssueBody,
  type GithubIssueLink,
  type IssueComment,
  type TaskIssue,
} from "@/lib/github/issue";

/**
 * Etapa 2 del agente: el ticket se manda como issue al repo principal del cliente, donde lo trabaja
 * Claude Code (GitHub Action, con la suscripción de quien lo dispara). La Action clona en modo
 * lectura los otros repos del cliente: el agente analiza todo junto y, o devuelve preguntas, o
 * publica un plan por repo e implementa la parte del principal. Con el plan, el panel abre un issue
 * en cada uno de los otros repos (a nombre del responsable: paga quien resuelve), porque la Action
 * solo puede pushear al repo donde corre. El panel sigue todo: preguntas, ramas y PRs.
 */

const AGENT_NAME = "Claude (GitHub)";

type TicketForGithub = {
  id: string;
  number: number;
  type: "bug" | "feature";
  title: string;
  description: string;
  expected: string | null;
  actual: string | null;
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
    .select("id,number,type,title,description,expected,actual,status,assignee_id,github_issue,triage,decisions,clients(name,repos)")
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

/**
 * Toma el candado del reparto con una escritura condicional: solo gana una lectura a la vez.
 * Un candado de más de 5 minutos se considera colgado y se puede volver a tomar.
 */
async function takeDispatchLock(ticketId: string, link: GithubIssueLink): Promise<GithubIssueLink | null> {
  const now = new Date();
  const stale = new Date(now.getTime() - 5 * 60_000).toISOString();
  const locked = { ...link, dispatchLock: now.toISOString() };
  const { data, error } = await getSupabaseAdmin()
    .from("tickets")
    .update({ github_issue: locked })
    .eq("id", ticketId)
    .or(`github_issue->>dispatchLock.is.null,github_issue->>dispatchLock.lt.${stale}`)
    .select("id");
  if (error) throw error;
  return data && data.length ? locked : null;
}

async function saveLink(ticketId: string, link: GithubIssueLink) {
  const { error } = await getSupabaseAdmin().from("tickets").update({ github_issue: link }).eq("id", ticketId);
  if (error) throw error;
}

/** Crea el issue en el repo principal del cliente con el prompt armado en el panel. */
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
  const others = repos.filter((r) => splitRepo(r).repo !== repo);
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim().slice(0, 60_000) : "";
  if (!prompt) throw new GithubError("EMPTY_PROMPT", 400, "Falta el prompt del ticket");

  const token = await githubTokenFor(userId);
  const issue = await github<{ number: number; html_url: string }>(token, `/repos/${repo}/issues`, {
    method: "POST",
    body: {
      title: issueTitle(ticket),
      body: issueBody(prompt, notify.panelUrl ? `${notify.panelUrl.replace(/\/$/, "")}/admin` : null, base, others),
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
    plan: null,
    tasks: [],
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

type BranchStatus = {
  repo: string;
  name: string;
  url: string;
  pull: { number: number; url: string; state: string; merged: boolean; draft: boolean } | null;
};

export type GithubStatus = {
  issue: { repo: string; number: number; url: string; state: string; title: string };
  plan: GithubIssueLink["plan"];
  tasks: Array<TaskIssue & { state: string }>;
  comments: Array<{ id: number; repo: string; user: string; bot: boolean; body: string; url: string; createdAt: string }>;
  branches: BranchStatus[];
  triage: TriageResult | null;
  decisions: Decision[];
  dispatchError: string | null;
};

async function issueState(token: string, repo: string, number: number) {
  const [issue, comments, refs] = await Promise.all([
    github<{ state: string; title: string }>(token, `/repos/${repo}/issues/${number}`),
    github<GhComment[]>(token, `/repos/${repo}/issues/${number}/comments?per_page=100`),
    github<Array<{ ref: string }>>(token, `/repos/${repo}/git/matching-refs/heads/${branchPrefix(number)}`).catch(() => []),
  ]);
  const owner = repo.split("/")[0];
  const branches: BranchStatus[] = await Promise.all(
    refs
      .map((r) => r.ref.replace(/^refs\/heads\//, ""))
      .slice(-5)
      .map(async (name) => {
        const pulls = await github<GhPull[]>(token, `/repos/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${name}`)}`).catch(() => []);
        const pull = pulls[0];
        return {
          repo,
          name,
          url: `https://github.com/${repo}/tree/${name}`,
          pull: pull
            ? { number: pull.number, url: pull.html_url, state: pull.state, merged: Boolean(pull.merged_at), draft: Boolean(pull.draft) }
            : null,
        };
      })
  );
  return { issue, comments, branches };
}

/** Abre un issue en cada uno de los otros repos del plan, a nombre del responsable. */
async function dispatchTasks(
  ticket: TicketForGithub,
  link: GithubIssueLink,
  token: string,
  actor: AdminSession,
  tasks: TaskIssue[] = [...(link.tasks ?? [])]
): Promise<TaskIssue[]> {
  const plan = link.plan!;
  const clientRepos = ticket.clients?.repos ?? [];
  for (const part of plan.repos) {
    if (part.repo === link.repo || tasks.some((t) => t.repo === part.repo)) continue;
    const base = splitRepo(clientRepos.find((entry) => splitRepo(entry).repo === part.repo) ?? part.repo).base;
    const issue = await github<{ number: number; html_url: string }>(token, `/repos/${part.repo}/issues`, {
      method: "POST",
      body: {
        title: issueTitle(ticket),
        body: taskIssueBody({
          ticket: {
            number: ticket.number,
            type: ticket.type,
            title: ticket.title,
            description: ticket.description,
            expected: ticket.expected,
            actual: ticket.actual,
            clientName: ticket.clients?.name ?? "-",
          },
          plan,
          repo: part.repo,
          base,
          planUrl: link.url,
          decisions: ticket.decisions ?? [],
          questionsFormat: TRIAGE_REPLY_FORMAT,
          questionsMarker: QUESTIONS_MARKER,
        }),
      },
    });
    tasks.push({ repo: part.repo, base, number: issue.number, url: issue.html_url });
    await recordGithub(ticket.id, actor, `Repartió su parte a ${part.repo}#${issue.number}`, { url: issue.html_url });
  }
  return tasks;
}

/**
 * Lee el estado de todos los issues del ticket. Pasa al ticket las preguntas nuevas del agente y,
 * cuando aparece el plan y quien mira es el responsable, reparte las partes a los otros repos.
 */
export async function syncGithub(ticketId: string, actor: AdminSession): Promise<GithubStatus | null> {
  const userId = requireUser(actor);
  const ticket = await loadTicket(ticketId);
  let link = ticket.github_issue;
  if (!link) return null;
  const token = await githubTokenFor(userId);
  const clientRepos = ticket.clients?.repos ?? [];

  const main = await issueState(token, link.repo, link.number);
  const taskStates = await Promise.all(
    (link.tasks ?? []).map(async (task) => ({ task, state: await issueState(token, task.repo, task.number).catch(() => null) }))
  );

  const tag = (repo: string, number: number, list: GhComment[]): IssueComment[] =>
    list.map((c) => ({
      id: c.id,
      body: c.body ?? "",
      user: c.user?.login ?? "?",
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      source: { repo, number },
    }));
  const allRaw = [
    ...main.comments.map((c) => ({ c, repo: link!.repo })),
    ...taskStates.flatMap(({ task, state }) => (state?.comments ?? []).map((c) => ({ c, repo: task.repo }))),
  ];
  const all: IssueComment[] = [
    ...tag(link.repo, link.number, main.comments),
    ...taskStates.flatMap(({ task, state }) => tag(task.repo, task.number, state?.comments ?? [])),
  ];
  const bots = new Set(allRaw.filter(({ c }) => c.user?.type === "Bot").map(({ c }) => c.user!.login));
  const isBot = (user: string) => bots.has(user);

  // Preguntas nuevas de cualquier issue del ticket: reemplazan el análisis (las decisiones quedan).
  let triage = ticket.triage;
  const found = latestQuestions(all, isBot);
  if (found && found.commentId > (link.lastQuestionsCommentId ?? 0)) {
    triage = await storeTriage(ticketId, { userId: null, name: AGENT_NAME }, {
      verdict: found.verdict,
      summary: found.summary,
      questions: found.questions,
      model: "github",
      source: found.source ?? { repo: link.repo, number: link.number },
    });
    link = { ...link, lastQuestionsCommentId: found.commentId };
    await saveLink(ticketId, link);
  }

  // Plan nuevo en el issue principal.
  const plan = latestPlan(tag(link.repo, link.number, main.comments), isBot, clientRepos);
  if (plan && plan.commentId !== link.plan?.commentId) {
    link = { ...link, plan };
    await saveLink(ticketId, link);
    await recordGithub(ticketId, { userId: null, name: AGENT_NAME }, `Publicó el plan: ${plan.repos.map((r) => r.repo).join(", ")}`, { url: link.url });
  }

  // Reparto: solo lo hace el responsable (los issues salen a su nombre y corren con su plan de Claude).
  let dispatchError: string | null = null;
  const pending = link.plan?.repos.some((r) => r.repo !== link!.repo && !(link!.tasks ?? []).some((t) => t.repo === r.repo));
  if (pending && ticket.assignee_id === userId) {
    const locked = await takeDispatchLock(ticketId, link);
    if (locked) {
      link = locked;
      // La lista se llena a medida que se abren los issues: si un repo falla, los anteriores no se pierden.
      const tasks: TaskIssue[] = [...(link.tasks ?? [])];
      try {
        await dispatchTasks(ticket, link, token, actor, tasks);
      } catch (error) {
        dispatchError = error instanceof Error ? error.message : "No se pudieron abrir los issues de los otros repos";
      }
      // Lo repartido hasta acá queda guardado aunque haya fallado un repo; se reintenta en la próxima lectura.
      link = { ...link, tasks, dispatchLock: null };
      await saveLink(ticketId, link);
    }
  }

  // Estado de los issues recién repartidos (sin esperar a la próxima lectura).
  const known = new Map(taskStates.map(({ task, state }) => [`${task.repo}#${task.number}`, state]));
  const tasks = (link.tasks ?? []).map((task) => ({ ...task, state: known.get(`${task.repo}#${task.number}`)?.issue.state ?? "open" }));
  const branches = [...main.branches, ...taskStates.flatMap(({ state }) => state?.branches ?? [])];

  return {
    issue: { repo: link.repo, number: link.number, url: link.url, state: main.issue.state, title: main.issue.title },
    plan: link.plan ?? null,
    tasks,
    comments: allRaw
      .sort((a, b) => a.c.id - b.c.id)
      .slice(-8)
      .map(({ c, repo }) => ({
        id: c.id,
        repo,
        user: c.user?.login ?? "?",
        bot: c.user?.type === "Bot",
        body: (c.body ?? "").slice(0, 3000),
        url: c.html_url,
        createdAt: c.created_at,
      })),
    branches,
    triage,
    decisions: ticket.decisions ?? [],
    dispatchError,
  };
}

/** Crea el PR desde una rama que pusheó el agente, contra la rama base de ese repo. */
export async function createPull(
  ticketId: string,
  rawRepo: unknown,
  rawBranch: unknown,
  actor: AdminSession
): Promise<{ url: string; number: number }> {
  const userId = requireUser(actor);
  const ticket = await loadTicket(ticketId);
  requireAssignee(ticket, userId);
  const link = ticket.github_issue;
  if (!link) throw new GithubError("NOT_SENT", 400, "Este ticket no tiene issue en GitHub");
  const repo = typeof rawRepo === "string" && rawRepo ? rawRepo : link.repo;
  const target = repo === link.repo ? { number: link.number, base: link.base ?? null } : (link.tasks ?? []).find((t) => t.repo === repo);
  if (!target) throw new GithubError("BAD_REPO", 400, "Ese repo no es de este ticket");
  const branch = typeof rawBranch === "string" ? rawBranch : "";
  if (!branch.startsWith(branchPrefix(target.number))) throw new GithubError("BAD_BRANCH", 400, "Esa rama no es de este ticket");

  const token = await githubTokenFor(userId);
  const base = target.base ?? (await github<{ default_branch: string }>(token, `/repos/${repo}`)).default_branch;
  const pull = await github<{ number: number; html_url: string }>(token, `/repos/${repo}/pulls`, {
    method: "POST",
    body: {
      title: issueTitle(ticket),
      head: branch,
      base,
      body: `Closes #${target.number}\n\nTicket #${ticket.number} del panel de Magon.`,
    },
  });
  await recordGithub(ticketId, actor, `Creó el PR ${repo}#${pull.number}`, { url: pull.html_url });
  return { url: pull.html_url, number: pull.number };
}

/** Las respuestas nuevas se comentan en el issue de donde salieron las preguntas, para que el agente siga. */
export async function forwardAnswers(
  ticketId: string,
  added: Decision[],
  actor: AdminSession
): Promise<{ posted: boolean; error: string | null }> {
  if (!added.length || !actor.userId) return { posted: false, error: null };
  const ticket = await loadTicket(ticketId);
  const link = ticket.github_issue;
  if (!link) return { posted: false, error: null };
  const target = ticket.triage?.source ?? { repo: link.repo, number: link.number };
  try {
    const token = await githubTokenFor(actor.userId);
    await github(token, `/repos/${target.repo}/issues/${target.number}/comments`, {
      method: "POST",
      body: { body: answersComment(added) },
    });
    await recordGithub(ticketId, actor, `Respondió las preguntas en ${target.repo}#${target.number}`, {
      url: `https://github.com/${target.repo}/issues/${target.number}`,
    });
    return { posted: true, error: null };
  } catch (error) {
    return { posted: false, error: error instanceof Error ? error.message : "No se pudo comentar en GitHub" };
  }
}
