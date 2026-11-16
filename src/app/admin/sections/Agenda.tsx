"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionIcon, Badge, Button, Checkbox, Group, Modal, Paper, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { IconCalendarPlus, IconTrash } from "@tabler/icons-react";
import { api, notifyError } from "../lib/api";
import { todayLocal } from "../lib/time";

export type Reminder = {
  id: string;
  title: string;
  kind: "reminder" | "meeting" | "call";
  due_at: string;
  client_id: string | null;
  client_name: string | null;
  lead_id: string | null;
  lead_name: string | null;
  ticket_id: string | null;
  ticket_number: number | null;
  notes: string | null;
  done_at: string | null;
};

const KIND: Record<Reminder["kind"], { label: string; icon: string }> = {
  reminder: { label: "Recordatorio", icon: "⏰" },
  meeting: { label: "Reunión", icon: "📅" },
  call: { label: "Llamada", icon: "📞" },
};

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function when(iso: string): string {
  const date = localDate(iso);
  const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  if (date === todayLocal()) return `Hoy ${time}`;
  if (date === todayLocal(1)) return `Mañana ${time}`;
  if (date === todayLocal(-1)) return `Ayer ${time}`;
  return `${new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "numeric" }).format(new Date(iso))} ${time}`;
}

/** Agenda en Mi día: lo vencido, lo de hoy y lo de los próximos 7 días. */
export function AgendaCard({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ reminders: Reminder[] }>("/api/admin/agenda");
      setReminders(data.reminders);
      setError(null);
    } catch (err) {
      setReminders([]);
      setError((err as { code?: string }).code === "MIGRATION_MISSING" ? "Falta correr la migración 015 para usar la agenda." : (err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(reminder: Reminder, done: boolean) {
    setReminders((list) => list?.map((r) => (r.id === reminder.id ? { ...r, done_at: done ? new Date().toISOString() : null } : r)) ?? null);
    try {
      await api("/api/admin/agenda", { method: "POST", json: { id: reminder.id, done } });
    } catch (err) {
      notifyError(err);
      void load();
    }
  }

  async function remove(reminder: Reminder) {
    try {
      await api(`/api/admin/agenda?id=${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
      void load();
    } catch (err) {
      notifyError(err);
    }
  }

  const limit = todayLocal(7);
  const visible = (reminders ?? []).filter((r) => (!r.done_at && localDate(r.due_at) <= limit) || (r.done_at && localDate(r.done_at) === todayLocal()));
  const later = (reminders ?? []).filter((r) => !r.done_at && localDate(r.due_at) > limit).length;

  return (
    <Paper p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Agenda</Text>
        <Button size="xs" variant="light" leftSection={<IconCalendarPlus size={14} />} onClick={() => setAdding(true)} disabled={Boolean(error)}>
          Agendar
        </Button>
      </Group>
      {error && (
        <Text size="sm" c="dimmed">
          {error}
        </Text>
      )}
      {!error && reminders !== null && visible.length === 0 && (
        <Text size="sm" c="dimmed">
          Nada para los próximos días. Agendá reuniones, llamadas o seguimientos y te aviso a la hora.
        </Text>
      )}
      <Stack gap={4}>
        {visible.map((reminder) => {
          const overdue = !reminder.done_at && new Date(reminder.due_at).getTime() < Date.now();
          const about = [reminder.client_name, reminder.lead_name, reminder.ticket_number ? `#${reminder.ticket_number}` : null].filter(Boolean).join(" · ");
          return (
            <Group key={reminder.id} justify="space-between" wrap="nowrap" gap="xs">
              <Checkbox
                size="xs"
                checked={Boolean(reminder.done_at)}
                onChange={(e) => void toggle(reminder, e.currentTarget.checked)}
                label={
                  <div>
                    <Text size="sm" td={reminder.done_at ? "line-through" : undefined} c={reminder.done_at ? "dimmed" : undefined}>
                      {KIND[reminder.kind].icon} {reminder.title}
                    </Text>
                    <Text size="xs" c={overdue ? "red" : "dimmed"}>
                      {when(reminder.due_at)}
                      {about ? ` · ${about}` : ""}
                    </Text>
                  </div>
                }
              />
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => void remove(reminder)} aria-label="Borrar">
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          );
        })}
      </Stack>
      {later > 0 && (
        <Badge mt="xs" variant="light" color="gray">
          +{later} más adelante
        </Badge>
      )}
      {adding && (
        <ReminderModal
          clients={clients}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </Paper>
  );
}

export function ReminderModal({
  clients,
  defaults,
  onClose,
  onSaved,
}: {
  clients: Array<{ id: string; name: string }>;
  defaults?: { title?: string; clientId?: string | null; leadId?: string | null; ticketId?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [kind, setKind] = useState<Reminder["kind"]>("reminder");
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState("10:00");
  const [clientId, setClientId] = useState<string | null>(defaults?.clientId ?? null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/admin/agenda", {
        method: "POST",
        json: {
          title,
          kind,
          // Fecha y hora locales del navegador → ISO con zona.
          dueAt: new Date(`${date}T${time}:00`).toISOString(),
          clientId,
          leadId: defaults?.leadId ?? null,
          ticketId: defaults?.ticketId ?? null,
          notes,
        },
      });
      onSaved();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title="Agendar">
      <Stack gap="sm">
        <TextInput label="Qué" placeholder="Reunión con…, llamar a…" value={title} onChange={(e) => setTitle(e.currentTarget.value)} data-autofocus />
        <Group grow>
          <Select
            label="Tipo"
            data={Object.entries(KIND).map(([value, k]) => ({ value, label: k.label }))}
            value={kind}
            onChange={(v) => v && setKind(v as Reminder["kind"])}
            allowDeselect={false}
          />
          <TextInput label="Día" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
          <TextInput label="Hora" type="time" value={time} onChange={(e) => setTime(e.currentTarget.value)} />
        </Group>
        <Select
          label="Cliente"
          placeholder="Opcional"
          data={clients.map((c) => ({ value: c.id, label: c.name }))}
          value={clientId}
          onChange={setClientId}
          searchable
          clearable
        />
        <Textarea label="Notas" autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">
          A la hora te llega el aviso por los canales de «Mis avisos» (se revisa cada 10 minutos).
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!title.trim() || !date || !time}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
