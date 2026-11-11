"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Anchor, Badge, Button, Group, Modal, Paper, Select, Stack, Text, Textarea } from "@mantine/core";
import { IconBrandGithub, IconGitPullRequest, IconRefresh } from "@tabler/icons-react";
import { api, notifyError, notifyOk, type ApiError } from "../lib/api";
import { relative } from "../lib/format";
import { Markdown } from "../sections/Docs";
import type { Activity, Decision, GithubIssueLink, Me, Ticket, TriageResult } from "../lib/tickets";
import { buildTicketPrompt } from "./prompt";

type Status = {
  issue: { repo: string; number: number; url: string; state: string; title: string };
  comments: Array<{ id: number; user: string; bot: boolean; body: string; url: string; createdAt: string }>;
  branches: Array<{
    name: string;
    url: string;
    pull: { number: number; url: string; state: string; merged: boolean; draft: boolean } | null;
  }>;
  triage: TriageResult | null;
  decisions: Decision[];
};

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

  useEffect(() => {
    setStatus(null);
    setError(null);
    void refresh();
  }, [refresh]);

  useEffect(() => setRepo(repos[0] ?? null), [repos]);

  function openSend() {
    setPrompt(buildTicketPrompt(ticket, { clientContext, comments: activity, includeComments: true, mode: "github" }));
    setSendOpen(true);
  }

  async function send() {
    setBusy("send");
    try {
      const data = await api<{ issue: GithubIssueLink }>("/api/admin/tickets/github", {
        method: "POST",
        json: { ticketId: ticket.id, prompt, repo },
      });
      onUpdated({ github_issue: data.issue });
      setSendOpen(false);
      notifyOk(`Issue creado: ${data.issue.repo}#${data.issue.number}. Claude arranca en unos segundos.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(null);
    }
  }

  async function createPull(branch: string) {
    setBusy(branch);
    try {
      const data = await api<{ pull: { url: string; number: number } }>("/api/admin/tickets/github", {
        method: "PUT",
        json: { ticketId: ticket.id, branch },
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
          Crea un issue en el repo del cliente con el prompt del ticket. Claude Code lo trabaja ahí con tu suscripción: si
          tiene dudas, las deja como preguntas (aparecen arriba para responder); si no, pushea una rama y desde acá creás el PR.
        </Text>
        {repos.length === 0 ? (
          <Text size="xs" c="yellow.8">
            {ticket.client_name} no tiene repos de GitHub cargados. Agregalos en Clientes → Editar.
          </Text>
        ) : (
          <Group gap="xs">
            {repos.length > 1 && (
              <Select size="xs" data={repos} value={repo} onChange={setRepo} allowDeselect={false} w={240} />
            )}
            <Button size="xs" leftSection={<IconBrandGithub size={14} />} onClick={openSend} disabled={!mine}>
              Mandar a GitHub{repos.length === 1 ? ` (${repos[0]})` : ""}
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
              <Button leftSection={<IconBrandGithub size={16} />} onClick={send} loading={busy === "send"}>
                Crear issue
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

      {status && (
        <Stack gap="sm">
          {status.branches.length === 0 ? (
            <Text size="xs" c="dimmed">
              Claude todavía no pusheó ninguna rama.
            </Text>
          ) : (
            status.branches.map((branch) => (
              <Group key={branch.name} justify="space-between" gap="xs" wrap="nowrap">
                <Anchor href={branch.url} target="_blank" rel="noreferrer" size="xs" ff="monospace" truncate>
                  {branch.name}
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
                    onClick={() => createPull(branch.name)}
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
                Últimos comentarios del issue
              </Text>
              {status.comments.map((comment) => (
                <Paper key={comment.id} p="xs" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                  <Group justify="space-between" mb={2}>
                    <Text size="xs" fw={600}>
                      {comment.bot ? "Claude" : comment.user}
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
