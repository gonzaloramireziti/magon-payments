"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconCash, IconClockPlus, IconHandGrab, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { api } from "../lib/api";
import { relative } from "../lib/format";
import { isClosed, STATUS_COLOR, STATUS_LABEL, URGENCY, type Me, type Ticket } from "../lib/tickets";
import { duration, startTimer, stopTimer, todayLocal, useElapsed, useTimeEntries, useTimer, weekStart } from "../lib/time";
import type { TicketChanges } from "../board/Board";
import { StatCard } from "./StatCard";
import { EntryRow, LogTimeModal } from "./TimeWidgets";

// Orden de lo que tengo para hacer: lo que espera que pruebe, después lo que estoy haciendo y lo listo.
const STATUS_ORDER: Record<string, number> = { testing: 0, in_progress: 1, ready: 2, analysis: 3, new: 4 };

/** Preguntas del análisis que todavía no tienen respuesta en las decisiones. */
export function pendingQuestions(ticket: Ticket): number {
  if (ticket.triage?.verdict !== "needs_decision") return 0;
  const answered = new Set((ticket.decisions ?? []).map((d) => d.questionId).filter(Boolean));
  return ticket.triage.questions.filter((q) => !answered.has(q.id)).length;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 13) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

type Collection = { clientId: string; name: string; state: string; daysOverdue: number | null };
type OverviewLite = { daysUntilDue: number; dueDate: string; collection: Collection[] };

export function Today({
  me,
  tickets,
  clients,
  onOpenTicket,
  onPatch,
  go,
}: {
  me: Me;
  tickets: Ticket[];
  clients: Array<{ id: string; name: string }>;
  onOpenTicket: (id: string) => void;
  onPatch: (id: string, changes: TicketChanges) => Promise<void>;
  go: (section: "tablero" | "horas" | "resumen") => void;
}) {
  const { running, available } = useTimer();
  const elapsed = useElapsed(running?.runningSince);
  const [logOpen, setLogOpen] = useState(false);
  const [overview, setOverview] = useState<OverviewLite | null>(null);
  const finance = me.permissions.includes("finance");
  const week = useTimeEntries(me.id ? `from=${weekStart()}&to=${todayLocal()}&userId=${me.id}` : null);

  useEffect(() => {
    if (!finance) return;
    api<{ overview: OverviewLite }>("/api/admin/overview")
      .then((data) => setOverview(data.overview))
      .catch(() => setOverview(null));
  }, [finance]);

  const open = useMemo(() => tickets.filter((t) => !isClosed(t.status)), [tickets]);
  const mine = useMemo(
    () =>
      open
        .filter((t) => me.id && t.assignee_id === me.id)
        .sort(
          (a, b) =>
            (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
            URGENCY[a.urgency].rank - URGENCY[b.urgency].rank ||
            a.updated_at.localeCompare(b.updated_at)
        ),
    [open, me.id]
  );
  const waiting = useMemo(() => mine.filter((t) => pendingQuestions(t) > 0), [mine]);
  const unassigned = useMemo(
    () => open.filter((t) => !t.assignee_id).sort((a, b) => URGENCY[a.urgency].rank - URGENCY[b.urgency].rank),
    [open]
  );
  const critical = open.filter((t) => t.urgency === "critical").length;

  const today = todayLocal();
  const weekEntries = (week.entries ?? []).filter((e) => e.userId === me.id && e.minutes);
  const todayMinutes = weekEntries.filter((e) => e.workDate === today).reduce((s, e) => s + (e.minutes ?? 0), 0);
  const weekMinutes = weekEntries.reduce((s, e) => s + (e.minutes ?? 0), 0);
  const todayEntries = (week.entries ?? []).filter((e) => e.workDate === today && e.userId === me.id);

  const debtors = (overview?.collection ?? []).filter((c) => c.state === "blocked" || c.state === "due");

  return (
    <Stack gap="md">
      <div>
        <Title order={1}>
          {greeting()}, {me.name.split(" ")[0]}
        </Title>
        <Text size="sm" c="dimmed">
          {new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
          {" · "}
          {mine.length ? `tenés ${mine.length} ticket(s) abiertos` : "no tenés tickets asignados"}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard label="Mis tickets" value={String(mine.length)} hint={`${mine.filter((t) => t.status === "testing").length} para probar`} />
        <StatCard
          label="Esperan tu respuesta"
          value={String(waiting.length)}
          color={waiting.length ? "orange" : undefined}
          hint="Preguntas del agente sin responder"
        />
        <StatCard
          label="Sin responsable"
          value={String(unassigned.length)}
          color={critical ? "red" : undefined}
          hint={critical ? `${critical} crítico(s) abiertos` : "Abiertos sin tomar"}
        />
        <StatCard
          label="Horas"
          value={me.id && available ? duration(todayMinutes) : "—"}
          hint={me.id && available ? `hoy · ${duration(weekMinutes)} esta semana` : "Entrá con tu usuario"}
        />
      </SimpleGrid>

      {me.id && available && (
        <Paper p="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <div>
              <Text fw={600}>{running ? `Trabajando hace ${duration(elapsed)}` : "Cronómetro parado"}</Text>
              <Text size="sm" c="dimmed">
                {running
                  ? running.ticketNumber
                    ? `#${running.ticketNumber} ${running.ticketTitle ?? ""}`
                    : running.clientName ?? "Tarea interna"
                  : "Arrancalo desde un ticket (▶) o cargá las horas a mano."}
              </Text>
            </div>
            <Group gap="xs">
              {running ? (
                <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={() => void stopTimer()}>
                  Frenar y guardar
                </Button>
              ) : (
                <Button variant="light" leftSection={<IconPlayerPlay size={16} />} onClick={() => void startTimer({})}>
                  Tarea interna
                </Button>
              )}
              <Button variant="default" leftSection={<IconClockPlus size={16} />} onClick={() => setLogOpen(true)}>
                Cargar horas
              </Button>
              <Button variant="subtle" onClick={() => go("horas")}>
                Ver mis horas
              </Button>
            </Group>
          </Group>
          {todayEntries.length > 0 && (
            <Paper withBorder mt="sm">
              {todayEntries.map((entry, index) => (
                <EntryRow key={entry.id} entry={entry} me={me} first={index === 0} showUser={false} />
              ))}
            </Paper>
          )}
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <TicketList
          title="Para hacer"
          empty="No tenés tickets abiertos. Tomá uno de los que no tienen responsable."
          tickets={mine}
          onOpen={onOpenTicket}
          timer={me.id && available ? running?.ticketId ?? "" : null}
        />
        <Stack gap="md">
          {waiting.length > 0 && (
            <TicketList
              title="Esperan tu respuesta"
              tickets={waiting}
              onOpen={onOpenTicket}
              timer={null}
              extra={(t) => (
                <Badge color="orange" variant="light">
                  {pendingQuestions(t)} pregunta(s)
                </Badge>
              )}
            />
          )}
          <TicketList
            title="Sin responsable"
            empty="Todo tiene responsable."
            tickets={unassigned.slice(0, 8)}
            onOpen={onOpenTicket}
            timer={null}
            extra={(t) =>
              me.id ? (
                <Tooltip label="Tomarlo">
                  <ActionIcon variant="light" onClick={() => void onPatch(t.id, { assigneeId: me.id })} aria-label="Tomar ticket">
                    <IconHandGrab size={16} />
                  </ActionIcon>
                </Tooltip>
              ) : null
            }
            footer={
              unassigned.length > 8 ? (
                <Button variant="subtle" size="xs" onClick={() => go("tablero")}>
                  Ver los {unassigned.length} en el tablero
                </Button>
              ) : null
            }
          />
          {finance && overview && (
            <Paper p="md">
              <Group justify="space-between" mb={debtors.length ? "xs" : 0}>
                <Group gap="xs">
                  <IconCash size={18} />
                  <Text fw={600}>Cobros</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  {overview.daysUntilDue > 0
                    ? `Vence en ${overview.daysUntilDue} día(s)`
                    : overview.daysUntilDue === 0
                      ? "Vence hoy"
                      : "Vencido"}
                </Text>
              </Group>
              {debtors.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Nadie debe nada.
                </Text>
              ) : (
                <Text size="sm">
                  {debtors.filter((d) => d.state === "blocked").length} bloqueado(s) y{" "}
                  {debtors.filter((d) => d.state === "due").length} con factura pendiente:{" "}
                  {debtors
                    .slice(0, 5)
                    .map((d) => d.name)
                    .join(", ")}
                  {debtors.length > 5 ? "…" : ""}
                </Text>
              )}
              <Button variant="subtle" size="xs" mt="xs" px={0} onClick={() => go("resumen")}>
                Ver el resumen
              </Button>
            </Paper>
          )}
        </Stack>
      </SimpleGrid>

      <LogTimeModal opened={logOpen} onClose={() => setLogOpen(false)} clients={clients} />
    </Stack>
  );
}

function TicketList({
  title,
  tickets,
  empty,
  onOpen,
  timer,
  extra,
  footer,
}: {
  title: string;
  tickets: Ticket[];
  empty?: string;
  onOpen: (id: string) => void;
  // null = sin botón de cronómetro; string = id del ticket con el cronómetro corriendo ("" = ninguno).
  timer: string | null;
  extra?: (ticket: Ticket) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Paper>
      <Text fw={600} px="md" pt="sm" pb={6}>
        {title}
      </Text>
      {tickets.length === 0 && (
        <Text size="sm" c="dimmed" px="md" pb="md">
          {empty}
        </Text>
      )}
      {tickets.map((ticket) => (
        <Group
          key={ticket.id}
          px="md"
          py={8}
          gap="sm"
          wrap="nowrap"
          justify="space-between"
          style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
        >
          <UnstyledButton onClick={() => onOpen(ticket.id)} style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={500} truncate>
              #{ticket.number} {ticket.title}
            </Text>
            <Group gap={6} wrap="nowrap">
              <Badge size="xs" color={STATUS_COLOR[ticket.status]} variant="light">
                {STATUS_LABEL[ticket.status]}
              </Badge>
              <Badge size="xs" color={URGENCY[ticket.urgency].color} variant="dot">
                {URGENCY[ticket.urgency].label}
              </Badge>
              <Text size="xs" c="dimmed" truncate>
                {ticket.client_name} · {relative(ticket.updated_at)}
              </Text>
            </Group>
          </UnstyledButton>
          <Group gap={4} wrap="nowrap">
            {extra?.(ticket)}
            {timer !== null &&
              (timer === ticket.id ? (
                <Tooltip label="Frenar cronómetro">
                  <ActionIcon variant="light" color="red" onClick={() => void stopTimer()} aria-label="Frenar">
                    <IconPlayerStop size={16} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Tooltip label="Arrancar cronómetro">
                  <ActionIcon variant="light" color="teal" onClick={() => void startTimer({ ticketId: ticket.id })} aria-label="Arrancar">
                    <IconPlayerPlay size={16} />
                  </ActionIcon>
                </Tooltip>
              ))}
          </Group>
        </Group>
      ))}
      {footer && (
        <Group px="md" pb="xs">
          {footer}
        </Group>
      )}
    </Paper>
  );
}
