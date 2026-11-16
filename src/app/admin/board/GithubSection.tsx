"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Anchor, Badge, Button, Group, Modal, Paper, Select, Stack, Text, Textarea } from "@mantine/core";
import { IconBrandGithub, IconGitPullRequest, IconPencil, IconRefresh, IconSparkles } from "@tabler/icons-react";
import { api, notifyError, notifyOk, type ApiError } from "../lib/api";
import { relative } from "../lib/format";
import { Markdown } from "../sections/Docs";
import type { Activity, Decision, GithubIssueLink, Me, Ticket, TriageResult } from "../lib/tickets";
import { buildTicketPrompt } from "./prompt";

type Status = {
  issue: { repo: string; number: number; url: string; state: string; title: string };
  plan: { summary: string; contract: string; repos: Array<{ repo: string; tasks: string[] }> } | null;
  tasks: Array<{ repo: string; number: number; url: string; state: string }>;
  comments: Array<{ id: number; repo: string; user: string; bot: boolean; body: string; url: string; createdAt: string }>;
  branches: Array<{
    repo: string;
    name: string;
    url: string;
    pull: { number: number; url: string; state: string; merged: boolean; draft: boolean } | null;
  }>;
  triage: TriageResult | null;
  decisions: Decision[];
  dispatchError: string | null;
};

// Mientras el agente trabaja, el panel consulta GitHub solo (las preguntas y el plan aparecen sin tocar nada).
const POLL_MS = 30_000;

function pullBadge(pull: NonNullable<Status["branches"][number]["pull"]>) {
  if (pull.merged) return { label: "Mergeado", color: "grape" };
  if (pull.state === "closed") return { label: "Cerrado", color: "gray" };
  if (pull.draft) return { label: "Borrador", color: "gray" };
  return { label: "Abierto", color: "teal" };
}

/**
 * El ticket en GitHub: se crea el issue en el repo del cliente y ahí lo trabaja Claude Code
 * (GitHub Action con la suscripción de quien lo dispara). Acá se sigue: comentarios, ramas y PR.
 */
export function GithubSection({
  ticket,
  me,
  repos,
  clientContext,
  activity,
  onUpdated,
}: {
  ticket: Ticket;
  me: Me;
  repos: string[];
  clientContext: string | null;
  activity: Activity[];
  onUpdated: (changes: Partial<Ticket>) => void;
}) {
  const mine = me.id !== null && ticket.assignee_id === me.id;
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [repo, setRepo] = useState<string | null>(repos[0] ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const link = ticket.github_issue ?? null;

  const refresh = useCallback(async () => {
    if (!link) return;
    setLoading(true);
    try {
      const data = await api<{ github: Status | null }>(`/api/admin/tickets/github?ticketId=${ticket.id}`);
      setStatus(data.github);
      setError(null);
      if (data.github) onUpdated({ triage: data.github.triage, decisions: data.github.decisions });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
    // onUpdated cambia en cada render del drawer: no debe disparar otra lectura.
  }, [ticket.id, link?.number]);

  const hasIssue = Boolean(link);
  useEffect(() => {
    setStatus(null);
    setError(null);
    void refresh();
    if (!hasIssue) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // Depende de que haya issue, no del objeto: la lista de tickets se recarga cada 20 s con objetos nuevos.
  }, [refresh, hasIssue]);

  useEffect(() => setRepo(repos[0] ?? null), [repos]);

  function promptFor(primary: string | null) {
    return buildTicketPrompt(ticket, {
      clientContext,
      comments: activity,
      includeComments: true,
      mode: "github",
      primaryRepo: primary,
      otherRepos: repos.filter((r) => r !== primary),
    });
  }

  function openSend() {
    setPrompt(promptFor(repo));
    setSendOpen(true);
  }

  // Un solo botón: arma el prompt y abre el issue. El agente devuelve preguntas antes de tocar código.
  async function send(customPrompt?: string) {
    setBusy("send");
    try {
      const data = await api<{ issue: GithubIssueLink }>("/api/admin/tickets/github", {
        method: "POST",
        json: { ticketId: ticket.id, prompt: customPrompt ?? promptFor(repo), repo },
      });
      // El servidor pasa el ticket a «En desarrollo» si estaba antes en el flujo.
      const moves = ["new", "analysis", "ready"].includes(ticket.status);
      onUpdated({ github_issue: data.issue, ...(moves ? { status: "in_progress" as const, status_since: new Date().toISOString() } : {}) });
      setSendOpen(false);
      notifyOk(`Claude arrancó en ${data.issue.repo}#${data.issue.number}. Si tiene preguntas, aparecen acá.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(null);
    }
  }

  async function createPull(repoName: string, branch: string) {
    setBusy(branch);
    try {
      const data = await api<{ pull: { url: string; number: number } }>("/api/admin/tickets/github", {
        method: "PUT",
        json: { ticketId: ticket.id, repo: repoName, branch },
      });
      notifyOk(`PR #${data.pull.number} creado`);
      void refresh();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(null);
    }
  }

  if (!link) {
    return (
      <Paper withBorder p="sm">
        <Group gap={8} mb={4}>
          <IconBrandGithub size={18} />
          <Text fw={600} size="sm">
            Resolver en GitHub
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          Claude lo trabaja en GitHub con tu plan{repos.length > 1 ? `, mirando los ${repos.length} repos del cliente (back y front)` : ""}.
          Si tiene dudas, las devuelve acá antes de tocar código; si no, arma el plan, implementa cada parte en su repo y desde
          acá creás los PR.
        </Text>
        {repos.length === 0 ? (
          <Text size="xs" c="yellow.8">
            {ticket.client_name} no tiene repos de GitHub cargados. Agregalos en Clientes → Editar.
          </Text>
        ) : (
          <Group gap="xs">
            {repos.length > 1 && (
              <Select
                size="xs"
                data={repos.map((r) => ({ value: r, label: `Principal: ${r}` }))}
                value={repo}
                onChange={setRepo}
                allowDeselect={false}
                w={280}
              />
            )}
            <Button
              size="xs"
              leftSection={<IconSparkles size={14} />}
              onClick={() => send()}
              loading={busy === "send"}
              disabled={!mine}
            >
              Resolver con Claude
            </Button>
            <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={openSend} disabled={!mine}>
              Editar el prompt antes
            </Button>
          </Group>
        )}

        <Modal opened={sendOpen} onClose={() => setSendOpen(false)} title={`Issue para ${repo}`} size="xl">
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Este es el cuerpo del issue (sin los datos de contacto del cliente). Lo podés editar antes de crearlo. Las
              capturas van como links que vencen en 1 hora.
            </Text>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              autosize
              minRows={12}
              maxRows={22}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setSendOpen(false)}>
                Cancelar
              </Button>
              <Button leftSection={<IconSparkles size={16} />} onClick={() => send(prompt)} loading={busy === "send"}>
                Resolver con Claude
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconBrandGithub size={18} style={{ flexShrink: 0 }} />
          <Anchor href={link.url} target="_blank" rel="noreferrer" size="sm" fw={600} truncate>
            {link.repo}#{link.number}
          </Anchor>
          {status && (
            <Badge size="xs" variant="light" color={status.issue.state === "open" ? "teal" : "gray"} style={{ flexShrink: 0 }}>
              {status.issue.state === "open" ? "Abierto" : "Cerrado"}
            </Badge>
          )}
        </Group>
        <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={refresh} loading={loading}>
          Actualizar
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Creado por {link.createdBy} {relative(link.createdAt)}
      </Text>

      {error && (
        <Alert color="yellow" variant="light" mb="xs">
          <Text size="xs">{error}</Text>
        </Alert>
      )}

      {status?.dispatchError && (
        <Alert color="yellow" variant="light" mb="xs">
          <Text size="xs">No se pudieron abrir todos los issues de los otros repos: {status.dispatchError}. Se reintenta solo.</Text>
        </Alert>
      )}

      {status && (
        <Stack gap="sm">
          {status.plan ? (
            <Paper p="xs" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                Plan del agente
              </Text>
              <Text size="sm" mb={6}>
                {status.plan.summary}
              </Text>
              <Stack gap={4}>
                {status.plan.repos.map((part) => {
                  const task = status.tasks.find((t) => t.repo === part.repo);
                  return (
                    <div key={part.repo}>
                      <Group gap={6}>
                        <Text size="xs" fw={600} ff="monospace">
                          {part.repo}
                        </Text>
                        {part.repo === status.issue.repo ? (
                          <Badge size="xs" variant="light">
                            Principal
                          </Badge>
                        ) : task ? (
                          <Anchor href={task.url} target="_blank" rel="noreferrer" size="xs">
                            #{task.number}
                          </Anchor>
                        ) : (
                          <Badge size="xs" variant="light" color="gray">
                            Por repartir
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {part.tasks.join(" · ")}
                      </Text>
                    </div>
                  );
                })}
              </Stack>
              {status.plan.contract && (
                <Text size="xs" mt={6} style={{ whiteSpace: "pre-wrap" }}>
                  <b>Contrato:</b> {status.plan.contract}
                </Text>
              )}
            </Paper>
          ) : (
            !status.triage?.questions.length && (
              <Text size="xs" c="dimmed">
                Claude está analizando el ticket. Las preguntas o el plan aparecen acá solos.
              </Text>
            )
          )}

          {status.branches.length === 0 ? (
            <Text size="xs" c="dimmed">
              Todavía no hay ramas con cambios.
            </Text>
          ) : (
            status.branches.map((branch) => (
              <Group key={`${branch.repo}:${branch.name}`} justify="space-between" gap="xs" wrap="nowrap">
                <Anchor href={branch.url} target="_blank" rel="noreferrer" size="xs" ff="monospace" truncate>
                  {branch.repo.split("/")[1]} · {branch.name}
                </Anchor>
                {branch.pull ? (
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant="light" color={pullBadge(branch.pull).color}>
                      {pullBadge(branch.pull).label}
                    </Badge>
                    <Anchor href={branch.pull.url} target="_blank" rel="noreferrer" size="xs">
                      PR #{branch.pull.number}
                    </Anchor>
                  </Group>
                ) : (
                  <Button
                    size="compact-xs"
                    leftSection={<IconGitPullRequest size={12} />}
                    onClick={() => createPull(branch.repo, branch.name)}
                    loading={busy === branch.name}
                    disabled={!mine}
                  >
                    Crear PR
                  </Button>
                )}
              </Group>
            ))
          )}

          {status.comments.length > 0 && (
            <Stack gap={6}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Últimos comentarios
              </Text>
              {status.comments.map((comment) => (
                <Paper key={comment.id} p="xs" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                  <Group justify="space-between" mb={2}>
                    <Text size="xs" fw={600}>
                      {comment.bot ? "Claude" : comment.user}
                      {status.tasks.length > 0 && (
                        <Text span size="xs" c="dimmed" fw={400}>
                          {" "}
                          · {comment.repo.split("/")[1]}
                        </Text>
                      )}
                    </Text>
                    <Anchor href={comment.url} target="_blank" rel="noreferrer" size="xs" c="dimmed">
                      {relative(comment.createdAt)}
                    </Anchor>
                  </Group>
                  <div style={{ maxHeight: 260, overflow: "auto" }}>
                    <Markdown content={comment.body} />
                  </div>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Paper>
  );
}
