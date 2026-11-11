// Textos y parseo del issue de GitHub donde trabaja Claude Code. Sin dependencias: se prueba suelto.
import { parseTriageReply, QUESTIONS_MARKER, type Decision, type TriageQuestion } from "../triage/message";

export type GithubIssueLink = {
  repo: string;
  // Rama de la que parte Claude y contra la que va el PR (null = la rama por defecto del repo).
  base?: string | null;
  number: number;
  url: string;
  createdAt: string;
  createdBy: string;
  // Último comentario con preguntas que ya se pasó al análisis del ticket.
  lastQuestionsCommentId?: number | null;
};

export const TRIGGER = "@claude";

// El workflow lee esta marca del cuerpo del issue para usar la rama base (input base_branch).
export const BASE_MARKER = "magon:base=";

export function issueTitle(ticket: { number: number; title: string; type: "bug" | "feature" }): string {
  return `[Ticket #${ticket.number}] ${ticket.type === "bug" ? "Problema" : "Pedido"}: ${ticket.title}`.slice(0, 250);
}

/** El issue arranca mencionando a Claude: eso dispara la Action en el repo. */
export function issueBody(prompt: string, panelUrl: string | null, base: string | null = null): string {
  return [
    `${TRIGGER} trabajá este ticket siguiendo las instrucciones de abajo.`,
    ...(base ? ["", `**Rama base: \`${base}\`.** Partí de esa rama y no de la rama por defecto. <!-- ${BASE_MARKER}${base} -->`] : []),
    "",
    prompt.trim(),
    "",
    "---",
    `_Creado desde el panel de tickets de Magon${panelUrl ? ` (${panelUrl})` : ""}. Las respuestas a las preguntas se cargan desde ahí o comentando acá con ${TRIGGER}._`,
  ].join("\n");
}

/** Comentario con las decisiones del equipo: menciona a Claude para que siga. */
export function answersComment(decisions: Decision[]): string {
  return [
    `${TRIGGER} el equipo respondió tus preguntas:`,
    "",
    ...decisions.flatMap((d) => [`- **${d.question}**`, `  ${d.answer.replace(/\n+/g, " ")}`]),
    "",
    "Con esto, seguí con el ticket. Si aparece otra decisión que no está resuelta, volvé a preguntar con el mismo formato.",
  ].join("\n");
}

/** Prefijo de las ramas que pushea la Action para un issue. */
export function branchPrefix(issueNumber: number): string {
  return `claude/issue-${issueNumber}-`;
}

export type IssueComment = { id: number; body: string; user: string; createdAt: string; updatedAt: string };

/**
 * Las últimas preguntas que dejó Claude en el issue (comentario con la marca y el bloque JSON).
 * Solo se toman comentarios de bots (la Action) para que nadie las cargue a mano por error.
 */
export function latestQuestions(
  comments: IssueComment[],
  isBot: (user: string) => boolean
): { commentId: number; verdict: "direct" | "needs_decision"; summary: string; questions: TriageQuestion[] } | null {
  for (const comment of [...comments].reverse()) {
    if (!isBot(comment.user) || !comment.body.includes(QUESTIONS_MARKER)) continue;
    const parsed = parseTriageReply(comment.body.slice(comment.body.indexOf(QUESTIONS_MARKER)), `g${comment.id}-`);
    if (parsed.ok) return { commentId: comment.id, ...parsed.value };
  }
  return null;
}
