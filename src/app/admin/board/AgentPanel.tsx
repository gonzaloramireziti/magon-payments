"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, CopyButton, Group, Menu, Modal, Paper, Stack, Text, Textarea } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconChevronDown, IconCircleCheck, IconCopy, IconSparkles } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { relative } from "../lib/format";
import type { Activity, Decision, Me, Ticket, TriageQuestion, TriageResult } from "../lib/tickets";
import { buildManualTriagePrompt } from "../../../lib/triage/message";
import { GithubSection } from "./GithubSection";

const KIND_LABEL: Record<TriageQuestion["kind"], { label: string; color: string }> = {
  negocio: { label: "Negocio", color: "grape" },
  tecnica: { label: "Técnica", color: "blue" },
  cliente: { label: "Para el cliente", color: "orange" },
};

export const VERDICT = {
  direct: { label: "Directo", color: "teal", hint: "Se puede pasar al agente tal cual." },
  needs_decision: { label: "Necesita decisión", color: "yellow", hint: "Antes de pasarlo al agente hay que definir algunas cosas." },
} as const;

/**
 * Análisis del ticket con Claude: si se puede resolver directo o qué hay que decidir antes.
 * Solo el responsable lo usa (con su API key); los demás ven el resultado.
 */
export function AgentPanel({
  ticket,
  me,
  activity,
  clientContext,
  repos,
  onUpdated,
}: {
  ticket: Ticket;
  me: Me;
  activity: Activity[];
  clientContext: string | null;
  repos: string[];
  onUpdated: (changes: Partial<Ticket>) => void;
}) {
  const [triage, setTriage] = useState<TriageResult | null>(ticket.triage ?? null);
  const [decisions, setDecisions] = useState<Decision[]>(ticket.decisions ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"analyze" | "save" | "manual" | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPrompt, setManualPrompt] = useState("");
  const [reply, setReply] = useState("");
  const mine = me.id !== null && ticket.assignee_id === me.id;

  useEffect(() => {
    setTriage(ticket.triage ?? null);
    setDecisions(ticket.decisions ?? []);
  }, [ticket.id, ticket.triage, ticket.decisions]);

  useEffect(() => setAnswers({}), [ticket.id]);

  async function analyze() {
    setBusy("analyze");
    try {
      const data = await api<{ triage: TriageResult; decisions: Decision[] }>("/api/admin/tickets/triage", {
        method: "POST",
        json: { ticketId: ticket.id },
      });
      setTriage(data.triage);
      setAnswers({});
      onUpdated(data);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  }

  // Análisis con el plan de Claude de cada uno: se copia el prompt, se pega la respuesta.
  function openManual() {
    setManualPrompt(
      buildManualTriagePrompt({
        number: ticket.number,
        type: ticket.type,
        title: ticket.title,
        description: ticket.description,
        expected: ticket.expected,
        actual: ticket.actual,
        clientName: ticket.client_name,
        clientContext,
        comments: activity.filter((a) => a.kind === "comment" && a.body).map((a) => ({ author: a.authorName, body: a.body! })),
        decisions,
      })
    );
    setReply("");
    setManualOpen(true);
  }

  async function saveManual() {
    setBusy("manual");
    try {
      const data = await api<{ triage: TriageResult; decisions: Decision[] }>("/api/admin/tickets/triage", {
        method: "POST",
        json: { ticketId: ticket.id, reply },
      });
      setTriage(data.triage);
      setAnswers({});
      setManualOpen(false);
      onUpdated(data);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      const data = await api<{ decisions: Decision[]; github: { posted: boolean; error: string | null } }>("/api/admin/tickets/triage", {
        method: "PUT",
        json: {
          ticketId: ticket.id,
          answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        },
      });
      setDecisions(data.decisions);
      setAnswers({});
      onUpdated({ decisions: data.decisions });
      if (data.github.error) notifyError(new Error(`Se guardaron, pero no se pudieron comentar en GitHub: ${data.github.error}`));
      else notifyOk(data.github.posted ? "Respuestas enviadas al issue: Claude sigue desde ahí" : "Decisiones guardadas: van a ir en el prompt");
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  }

  const answered = new Map(decisions.filter((d) => d.questionId).map((d) => [d.questionId!, d]));
  const pending = triage?.questions.filter((q) => !answered.has(q.id)) ?? [];
  const typed = Object.values(answers).some((a) => a.trim());
  const verdict = triage ? (pending.length === 0 ? VERDICT.direct : VERDICT[triage.verdict]) : null;

  return (
    <Stack gap="md">
      {!mine && (
        <Alert color="gray" variant="light" icon={<IconAlertTriangle size={16} />}>
          Solo el responsable del ticket puede analizarlo y responder las preguntas{me.id ? ": tomalo primero." : "."}
        </Alert>
      )}

      <Group justify="space-between">
        {verdict ? (
          <Group gap={8}>
            <Badge color={verdict.color} size="lg" variant="light">
              {verdict.label}
            </Badge>
            <Text size="xs" c="dimmed">
              {triage!.analyzedBy} · {relative(triage!.analyzedAt)}
            </Text>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            Todavía no se analizó.
          </Text>
        )}
        <Group gap={0} wrap="nowrap">
          <Button
            size="xs"
            variant={triage ? "default" : "filled"}
            leftSection={<IconSparkles size={14} />}
            onClick={openManual}
            disabled={!mine || busy !== null}
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          >
            {triage ? "Volver a analizar" : "Analizar con Claude"}
          </Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                variant={triage ? "default" : "filled"}
                px={6}
                disabled={!mine || busy !== null}
                loading={busy === "analyze"}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "1px solid rgba(255,255,255,.3)" }}
                aria-label="Otras formas de analizar"
              >
                <IconChevronDown size={14} />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={openManual}>Con tu plan (copiar y pegar)</Menu.Item>
              <Menu.Item onClick={analyze}>Con tu API key (automático)</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {triage && (
        <Paper p="sm" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
          <Text size="sm">{triage.summary}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {verdict!.hint}
          </Text>
        </Paper>
      )}

      {pending.length > 0 && (
        <Stack gap="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Preguntas abiertas
          </Text>
          {pending.map((q) => (
            <Paper key={q.id} withBorder p="sm">
              <Group gap={6} mb={4} wrap="nowrap" align="flex-start">
                <Badge size="xs" variant="light" color={KIND_LABEL[q.kind].color} style={{ flexShrink: 0 }}>
                  {KIND_LABEL[q.kind].label}
                </Badge>
                <Text size="sm" fw={500}>
                  {q.question}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mb={6}>
                {q.why}
              </Text>
              <Textarea
                size="xs"
                autosize
                minRows={1}
                maxRows={5}
                placeholder={q.kind === "cliente" ? "Lo que respondió el cliente…" : "La decisión…"}
                value={answers[q.id] ?? ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setAnswers((a) => ({ ...a, [q.id]: value }));
                }}
                disabled={!mine}
              />
            </Paper>
          ))}
          <Group justify="flex-end">
            <Button size="xs" onClick={save} loading={busy === "save"} disabled={!mine || !typed || busy !== null}>
              Guardar respuestas
            </Button>
          </Group>
        </Stack>
      )}

      {decisions.length > 0 && (
        <Stack gap={6}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Decisiones tomadas
          </Text>
          {decisions.map((d, i) => (
            <Paper key={`${d.questionId}-${i}`} withBorder p="xs">
              <Group gap={6} wrap="nowrap" align="flex-start">
                <IconCircleCheck size={16} color="var(--mantine-color-teal-6)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <Text size="xs" c="dimmed">
                    {d.question}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    {d.answer}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {d.by} · {relative(d.at)}
                  </Text>
                </div>
              </Group>
            </Paper>
          ))}
          <Text size="xs" c="dimmed">
            {ticket.github_issue
              ? "Van en el prompt y se comentan en el issue de GitHub para que Claude siga."
              : "Van en el prompt como «Decisiones tomadas». Si te queda algo nuevo, volvé a analizar."}
          </Text>
        </Stack>
      )}

      <GithubSection
        ticket={ticket}
        me={me}
        repos={repos}
        clientContext={clientContext}
        activity={activity}
        onUpdated={onUpdated}
      />

      <Modal opened={manualOpen} onClose={() => setManualOpen(false)} title={`Analizar el ticket #${ticket.number} con tu plan`} size="xl">
        <Stack gap="sm">
          <Text size="sm">
            <b>1.</b> Copiá este prompt y pegalo en Claude (claude.ai o Claude Code).
          </Text>
          <Textarea
            value={manualPrompt}
            readOnly
            autosize
            minRows={6}
            maxRows={10}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
          />
          <Group justify="flex-end">
            <CopyButton value={manualPrompt}>
              {({ copied, copy }) => (
                <Button
                  size="xs"
                  variant="light"
                  onClick={copy}
                  color={copied ? "teal" : undefined}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                >
                  {copied ? "Copiado" : "Copiar prompt"}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Text size="sm">
            <b>2.</b> Pegá acá la respuesta completa de Claude.
          </Text>
          <Textarea
            placeholder={'```json\n{ "verdict": "needs_decision", "summary": "…", "questions": [ … ] }\n```'}
            autosize
            minRows={4}
            maxRows={10}
            value={reply}
            onChange={(e) => setReply(e.currentTarget.value)}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setManualOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveManual} loading={busy === "manual"} disabled={!reply.trim()}>
              Guardar análisis
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
