"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconClockPlay, IconPlayerPlay, IconPlayerStop, IconPlus, IconTrash } from "@tabler/icons-react";
import { notifyError, notifyOk } from "../lib/api";
import {
  addTime,
  deleteTime,
  duration,
  parseDuration,
  startTimer,
  stopTimer,
  todayLocal,
  useElapsed,
  useTimeEntries,
  useTimer,
  type TimeEntry,
} from "../lib/time";
import type { Me, Ticket } from "../lib/tickets";

export function entryLabel(entry: Pick<TimeEntry, "ticketNumber" | "ticketTitle" | "clientName">): string {
  if (entry.ticketNumber) return `#${entry.ticketNumber} ${entry.ticketTitle ?? ""}`.trim();
  return entry.clientName ?? "Interno";
}

/** Cronómetro en la cabecera: solo aparece mientras corre. */
export function HeaderTimer({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const { running } = useTimer();
  const elapsed = useElapsed(running?.runningSince);
  if (!running) return null;
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={`Trabajando en ${entryLabel(running)}`}>
        <Badge
          size="lg"
          variant="light"
          color="teal"
          leftSection={<IconClockPlay size={14} />}
          style={{ cursor: running.ticketId ? "pointer" : "default", textTransform: "none" }}
          onClick={() => running.ticketId && onOpenTicket(running.ticketId)}
        >
          {duration(elapsed)}
          <Text span size="xs" visibleFrom="md" ml={6} c="dimmed">
            {running.ticketNumber ? `#${running.ticketNumber}` : running.clientName ?? "Interno"}
          </Text>
        </Badge>
      </Tooltip>
      <Tooltip label="Frenar y guardar">
        <ActionIcon variant="light" color="red" size="lg" onClick={() => void stopTimer()} aria-label="Frenar cronómetro">
          <IconPlayerStop size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

type ClientOption = { id: string; name: string };

/** Carga a mano. Si viene `ticket`, las horas van a ese ticket; si no, se elige cliente (o interno). */
export function LogTimeModal({
  opened,
  onClose,
  ticket,
  clients,
}: {
  opened: boolean;
  onClose: () => void;
  ticket?: Pick<Ticket, "id" | "number" | "title"> | null;
  clients?: ClientOption[];
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [clientId, setClientId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const minutes = parseDuration(amount);

  function reset() {
    setAmount("");
    setDate(todayLocal());
    setClientId(null);
    setNote("");
  }

  async function save() {
    if (!minutes) return;
    setSaving(true);
    try {
      await addTime({
        minutes,
        date,
        note: note.trim() || undefined,
        ...(ticket ? { ticketId: ticket.id } : clientId ? { clientId } : {}),
      });
      notifyOk(`Cargaste ${duration(minutes)}`);
      reset();
      onClose();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={ticket ? `Cargar horas en #${ticket.number}` : "Cargar horas"}>
      <Stack gap="sm">
        {ticket && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {ticket.title}
          </Text>
        )}
        <Group grow align="flex-start">
          <TextInput
            label="Tiempo"
            placeholder="1:30, 2h, 45m"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            description={minutes ? duration(minutes) : "Un número solo hasta 12 son horas"}
            error={amount && !minutes ? "No lo entiendo: probá 1:30, 2h o 45m" : undefined}
            data-autofocus
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
          <TextInput label="Fecha" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.currentTarget.value)} />
        </Group>
        {!ticket && (
          <Select
            label="Cliente"
            placeholder="Interno (sin cliente)"
            data={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={clientId}
            onChange={setClientId}
            searchable
            clearable
          />
        )}
        <TextInput label="Qué hiciste" placeholder="Opcional" value={note} maxLength={500} onChange={(e) => setNote(e.currentTarget.value)} />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!minutes || !date}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Pestaña «Horas» del ticket: cronómetro, carga a mano y lo que lleva cada uno. */
export function TicketTime({ ticket, me }: { ticket: Ticket; me: Me }) {
  const { running, available } = useTimer();
  const elapsed = useElapsed(running?.runningSince);
  const [logOpen, setLogOpen] = useState(false);
  // Todo el historial del ticket: desde la fecha de alta.
  const { entries, error } = useTimeEntries(
    me.id ? `ticketId=${ticket.id}&from=${ticket.created_at.slice(0, 10)}&to=${todayLocal(1)}` : null
  );
  const onThis = running?.ticketId === ticket.id;

  if (!me.id) {
    return (
      <Alert color="gray" py="xs">
        El acceso de emergencia no carga horas: entrá con tu usuario.
      </Alert>
    );
  }
  if (!available || error) {
    return (
      <Alert color="yellow" py="xs">
        {error ?? "Falta correr la migración 012 para cargar horas."}
      </Alert>
    );
  }

  const closed = (entries ?? []).filter((e) => e.minutes);
  const total = closed.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  const byUser = new Map<string, number>();
  for (const e of closed) byUser.set(e.userName ?? "?", (byUser.get(e.userName ?? "?") ?? 0) + (e.minutes ?? 0));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text size="xs" c="dimmed">
            {me.permissions.includes("time.all") ? "Total del ticket" : "Tus horas en este ticket"}
          </Text>
          <Text size="xl" fw={700}>
            {duration(total)}
          </Text>
        </div>
        <Group gap="xs">
          {onThis ? (
            <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={() => void stopTimer()}>
              Frenar ({duration(elapsed)})
            </Button>
          ) : (
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => void startTimer({ ticketId: ticket.id })}>
              {running ? "Pasar el cronómetro acá" : "Arrancar cronómetro"}
            </Button>
          )}
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setLogOpen(true)}>
            Cargar a mano
          </Button>
        </Group>
      </Group>

      {byUser.size > 1 && (
        <Group gap="xs">
          {[...byUser].map(([name, minutes]) => (
            <Badge key={name} variant="light" color="gray" style={{ textTransform: "none" }}>
              {name}: {duration(minutes)}
            </Badge>
          ))}
        </Group>
      )}

      <Paper>
        {entries === null && (
          <Text size="sm" c="dimmed" p="md">
            Cargando…
          </Text>
        )}
        {entries?.length === 0 && (
          <Text size="sm" c="dimmed" p="md">
            Todavía no hay horas cargadas en este ticket.
          </Text>
        )}
        {entries?.map((entry, index) => (
          <EntryRow key={entry.id} entry={entry} me={me} first={index === 0} showTarget={false} />
        ))}
      </Paper>

      <LogTimeModal opened={logOpen} onClose={() => setLogOpen(false)} ticket={ticket} />
    </Stack>
  );
}

export function EntryRow({
  entry,
  me,
  first,
  showTarget = true,
  showUser = true,
}: {
  entry: TimeEntry;
  me: Me;
  first: boolean;
  showTarget?: boolean;
  showUser?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const canEdit = entry.userId === me.id || me.permissions.includes("time.all");
  const [, m, d] = entry.workDate.split("-");

  async function remove() {
    if (!window.confirm(`¿Borrar ${entry.minutes ? duration(entry.minutes) : "esta carga"} del ${d}/${m}?`)) return;
    setBusy(true);
    try {
      await deleteTime(entry.id);
    } catch (error) {
      notifyError(error);
      setBusy(false);
    }
  }

  return (
    <Group
      justify="space-between"
      px="md"
      py={8}
      wrap="nowrap"
      style={first ? undefined : { borderTop: "1px solid var(--mantine-color-default-border)" }}
    >
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={500} truncate>
          {showTarget ? entryLabel(entry) : entry.note ?? "Sin detalle"}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {d}/{m}
          {showUser && entry.userName ? ` · ${entry.userName}` : ""}
          {showTarget && entry.ticketNumber && entry.clientName ? ` · ${entry.clientName}` : ""}
          {showTarget && entry.note ? ` · ${entry.note}` : ""}
        </Text>
      </div>
      <Group gap={6} wrap="nowrap">
        {entry.runningSince ? (
          <Badge color="teal" variant="light">
            Corriendo
          </Badge>
        ) : (
          <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>
            {duration(entry.minutes ?? 0)}
          </Text>
        )}
        {canEdit && !entry.runningSince && (
          <ActionIcon variant="subtle" color="gray" onClick={remove} loading={busy} aria-label="Borrar">
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Group>
    </Group>
  );
}
