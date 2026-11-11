"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconSparkles } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { relative } from "../lib/format";
import type { Decision, Me, Ticket, TriageQuestion, TriageResult } from "../lib/tickets";

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
  onUpdated,
}: {
  ticket: Ticket;
  me: Me;
  onUpdated: (changes: { triage?: TriageResult; decisions: Decision[] }) => void;
}) {
  const [triage, setTriage] = useState<TriageResult | null>(ticket.triage ?? null);
  const [decisions, setDecisions] = useState<Decision[]>(ticket.decisions ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"analyze" | "save" | null>(null);
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

  async function save() {
    setBusy("save");
    try {
      const data = await api<{ decisions: Decision[] }>("/api/admin/tickets/triage", {
        method: "PUT",
        json: {
          ticketId: ticket.id,
          answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        },
      });
      setDecisions(data.decisions);
      setAnswers({});
      onUpdated({ decisions: data.decisions });
      notifyOk("Decisiones guardadas: van a ir en el prompt");
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
        <Button
          size="xs"
          variant={triage ? "default" : "filled"}
          leftSection={<IconSparkles size={14} />}
          onClick={analyze}
          loading={busy === "analyze"}
          disabled={!mine || busy !== null}
        >
          {triage ? "Volver a analizar" : "Analizar con Claude"}
        </Button>
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
            Van en el prompt como «Decisiones tomadas». Si te queda algo nuevo, volvé a analizar.
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
