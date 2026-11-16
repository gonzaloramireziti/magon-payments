"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus, IconUserPlus } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { relative, shortDate } from "../lib/format";
import type { PanelUser } from "../lib/tickets";
import { StatCard } from "./StatCard";

export type LeadStage = "new" | "contacted" | "proposal" | "negotiation" | "won" | "lost";
export type Lead = {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: LeadStage;
  quote_amount: number | null;
  monthly_amount: number | null;
  currency: "ARS" | "USD";
  next_step: string | null;
  next_step_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  client_id: string | null;
  lost_reason: string | null;
  notes: string | null;
  stage_since: string;
  created_at: string;
};

export const STAGES: Array<{ value: LeadStage; label: string; color: string }> = [
  { value: "new", label: "Nuevo", color: "blue" },
  { value: "contacted", label: "Contactado", color: "cyan" },
  { value: "proposal", label: "Propuesta enviada", color: "grape" },
  { value: "negotiation", label: "Negociando", color: "orange" },
  { value: "won", label: "Ganado", color: "teal" },
  { value: "lost", label: "Perdido", color: "gray" },
];
const OPEN: LeadStage[] = ["new", "contacted", "proposal", "negotiation"];
const SOURCES = ["Referido", "Instagram", "LinkedIn", "Web", "Prospector", "Cliente actual", "Otro"];

function money(amount: number, currency: string) {
  return `${currency === "USD" ? "US$" : "$"} ${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function sumBy(leads: Lead[], key: "quote_amount" | "monthly_amount"): string {
  const totals: Record<string, number> = {};
  for (const lead of leads) if (lead[key]) totals[lead.currency] = (totals[lead.currency] ?? 0) + (lead[key] ?? 0);
  const parts = Object.entries(totals).map(([currency, amount]) => money(amount, currency));
  return parts.length ? parts.join(" + ") : "—";
}

export function SalesSection({ users, onClientCreated }: { users: PanelUser[]; onClientCreated: () => void }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Partial<Lead> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ leads: Lead[] }>("/api/admin/sales");
      setLeads(data.leads);
    } catch (error) {
      if ((error as { code?: string }).code === "MIGRATION_MISSING") setUnavailable(true);
      else notifyError(error);
      setLeads([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(lead: Lead, stage: LeadStage) {
    try {
      await api("/api/admin/sales", { method: "POST", json: { id: lead.id, stage } });
      void load();
    } catch (error) {
      notifyError(error);
    }
  }

  const all = leads ?? [];
  const open = all.filter((l) => OPEN.includes(l.stage));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const wonThisMonth = all.filter((l) => l.stage === "won" && l.stage_since >= monthStart);
  const closed = all.filter((l) => l.stage === "won" || l.stage === "lost");
  const winRate = closed.length ? Math.round((closed.filter((l) => l.stage === "won").length / closed.length) * 100) : null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Ventas</Title>
          <Text size="sm" c="dimmed">
            Prospectos, presupuestos y próximo paso. Al ganar uno, se convierte en cliente con un clic.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ stage: "new", currency: "USD" })}>
          Nuevo prospecto
        </Button>
      </Group>

      {unavailable && <Alert color="yellow">Falta correr la migración 015 (supabase/migrations/015_projects_sales_agenda.sql).</Alert>}

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard label="Abiertos" value={String(open.length)} />
        <StatCard label="Presupuestado" value={sumBy(open, "quote_amount")} hint="Desarrollo, en prospectos abiertos" />
        <StatCard label="Abono en juego" value={sumBy(open, "monthly_amount")} hint="Mensual, si se ganan todos" />
        <StatCard
          label="Ganados este mes"
          value={String(wonThisMonth.length)}
          hint={winRate !== null ? `${winRate}% de cierre histórico` : undefined}
          color={wonThisMonth.length ? "teal" : undefined}
        />
      </SimpleGrid>

      <ScrollArea type="auto" offsetScrollbars>
        <Group align="flex-start" wrap="nowrap" gap="sm">
          {STAGES.filter((s) => OPEN.includes(s.value)).map((stage) => {
            const column = open.filter((l) => l.stage === stage.value);
            return (
              <Paper key={stage.value} p="xs" w={270} style={{ flexShrink: 0 }} bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                <Group justify="space-between" px={4} mb="xs">
                  <Badge color={stage.color} variant="light">
                    {stage.label}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {column.length}
                  </Text>
                </Group>
                <Stack gap={6}>
                  {column.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} onOpen={() => setEditing(lead)} onMove={(s) => void move(lead, s)} />
                  ))}
                  {column.length === 0 && (
                    <Text size="xs" c="dimmed" px={4} pb={4}>
                      Vacío
                    </Text>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Group>
      </ScrollArea>

      {closed.length > 0 && (
        <Paper p="md">
          <Text fw={600} mb="xs">
            Cerrados
          </Text>
          <Stack gap={4}>
            {closed.slice(0, 20).map((lead) => (
              <UnstyledButton key={lead.id} onClick={() => setEditing(lead)}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" truncate>
                    {lead.company}
                    {lead.stage === "lost" && lead.lost_reason ? (
                      <Text span size="xs" c="dimmed">
                        {" "}
                        · {lead.lost_reason}
                      </Text>
                    ) : null}
                  </Text>
                  <Group gap={6} wrap="nowrap">
                    {lead.client_id && (
                      <Badge size="xs" color="teal" variant="dot">
                        Cliente
                      </Badge>
                    )}
                    <Badge size="xs" color={lead.stage === "won" ? "teal" : "gray"} variant="light">
                      {lead.stage === "won" ? "Ganado" : "Perdido"} {relative(lead.stage_since)}
                    </Badge>
                  </Group>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </Paper>
      )}

      {editing && (
        <LeadModal
          lead={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onConverted={() => {
            setEditing(null);
            void load();
            onClientCreated();
          }}
        />
      )}
    </Stack>
  );
}

function LeadCard({ lead, onOpen, onMove }: { lead: Lead; onOpen: () => void; onMove: (stage: LeadStage) => void }) {
  const overdue = lead.next_step_date && lead.next_step_date < new Date().toISOString().slice(0, 10);
  const index = OPEN.indexOf(lead.stage);
  return (
    <Paper p="xs" withBorder>
      <UnstyledButton onClick={onOpen} w="100%">
        <Text size="sm" fw={600} truncate>
          {lead.company}
        </Text>
        {lead.contact_name && (
          <Text size="xs" c="dimmed" truncate>
            {lead.contact_name}
          </Text>
        )}
        {(lead.quote_amount || lead.monthly_amount) && (
          <Text size="xs" mt={2}>
            {lead.quote_amount ? money(lead.quote_amount, lead.currency) : ""}
            {lead.quote_amount && lead.monthly_amount ? " + " : ""}
            {lead.monthly_amount ? `${money(lead.monthly_amount, lead.currency)}/mes` : ""}
          </Text>
        )}
        {lead.next_step && (
          <Text size="xs" mt={2} c={overdue ? "red" : "dimmed"} lineClamp={2}>
            → {lead.next_step}
            {lead.next_step_date ? ` (${shortDate(lead.next_step_date)})` : ""}
          </Text>
        )}
      </UnstyledButton>
      <Group gap={4} mt={6} justify="flex-end">
        {index > 0 && (
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onMove(OPEN[index - 1])}>
            ←
          </Button>
        )}
        {index < OPEN.length - 1 && (
          <Button size="compact-xs" variant="subtle" onClick={() => onMove(OPEN[index + 1])}>
            {STAGES.find((s) => s.value === OPEN[index + 1])?.label} →
          </Button>
        )}
      </Group>
    </Paper>
  );
}

function LeadModal({
  lead,
  users,
  onClose,
  onSaved,
  onConverted,
}: {
  lead: Partial<Lead>;
  users: PanelUser[];
  onClose: () => void;
  onSaved: () => void;
  onConverted: () => void;
}) {
  const [form, setForm] = useState({
    company: lead.company ?? "",
    contactName: lead.contact_name ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    source: lead.source ?? null,
    stage: lead.stage ?? "new",
    quoteAmount: lead.quote_amount ?? "",
    monthlyAmount: lead.monthly_amount ?? "",
    currency: lead.currency ?? "USD",
    nextStep: lead.next_step ?? "",
    nextStepDate: lead.next_step_date ?? "",
    ownerId: lead.owner_id ?? null,
    lostReason: lead.lost_reason ?? "",
    notes: lead.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/admin/sales", {
        method: "POST",
        json: {
          ...(lead.id ? { id: lead.id } : {}),
          ...form,
          quoteAmount: form.quoteAmount === "" ? null : form.quoteAmount,
          monthlyAmount: form.monthlyAmount === "" ? null : form.monthlyAmount,
        },
      });
      onSaved();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!lead.id || !window.confirm(`¿Borrar el prospecto «${lead.company}»?`)) return;
    try {
      await api(`/api/admin/sales?id=${encodeURIComponent(lead.id)}`, { method: "DELETE" });
      onSaved();
    } catch (error) {
      notifyError(error);
    }
  }

  async function convert() {
    if (!lead.id) return;
    const ok = window.confirm(
      `¿Pasar «${form.company}» a cliente? Se crea con su KEY y ${form.monthlyAmount ? `abono de ${form.currency} ${form.monthlyAmount}` : "abono 0 (editalo en Clientes)"}, facturando desde el mes que viene.`
    );
    if (!ok) return;
    setConverting(true);
    try {
      await save();
      await api("/api/admin/sales", { method: "POST", json: { convert: lead.id } });
      notifyOk(`${form.company} ya es cliente. Completá sus datos en Clientes.`);
      onConverted();
    } catch (error) {
      notifyError(error);
    } finally {
      setConverting(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={lead.id ? lead.company : "Nuevo prospecto"} size="lg">
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Empresa o persona" value={form.company} onChange={(e) => setForm({ ...form, company: e.currentTarget.value })} />
          <TextInput label="Contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.currentTarget.value })} />
        </Group>
        <Group grow>
          <TextInput label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} />
          <TextInput label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })} />
          <Select label="Origen" data={SOURCES} value={form.source} onChange={(v) => setForm({ ...form, source: v })} clearable searchable />
        </Group>
        <Group grow>
          <Select
            label="Etapa"
            data={STAGES.map((s) => ({ value: s.value, label: s.label }))}
            value={form.stage}
            onChange={(v) => v && setForm({ ...form, stage: v as LeadStage })}
            allowDeselect={false}
          />
          <Select
            label="Responsable"
            data={users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))}
            value={form.ownerId}
            onChange={(v) => setForm({ ...form, ownerId: v })}
            clearable
          />
        </Group>
        <Group grow>
          <NumberInput label="Presupuesto (desarrollo)" min={0} value={form.quoteAmount} onChange={(v) => setForm({ ...form, quoteAmount: v === "" ? "" : Number(v) })} />
          <NumberInput label="Abono mensual" min={0} value={form.monthlyAmount} onChange={(v) => setForm({ ...form, monthlyAmount: v === "" ? "" : Number(v) })} />
          <Select label="Moneda" data={["USD", "ARS"]} value={form.currency} onChange={(v) => v && setForm({ ...form, currency: v as "USD" | "ARS" })} allowDeselect={false} />
        </Group>
        <Group grow>
          <TextInput label="Próximo paso" placeholder="Mandar propuesta, llamar…" value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.currentTarget.value })} />
          <TextInput label="Para cuándo" type="date" value={form.nextStepDate} onChange={(e) => setForm({ ...form, nextStepDate: e.currentTarget.value })} />
        </Group>
        {form.stage === "lost" && (
          <TextInput label="Por qué se perdió" value={form.lostReason} onChange={(e) => setForm({ ...form, lostReason: e.currentTarget.value })} />
        )}
        <Textarea label="Notas" autosize minRows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
        <Group justify="space-between">
          <Group gap="xs">
            {lead.id && !lead.client_id && (
              <Button variant="light" color="teal" leftSection={<IconUserPlus size={16} />} onClick={convert} loading={converting}>
                Ganado: pasar a cliente
              </Button>
            )}
            {lead.id && (
              <Button variant="subtle" color="red" onClick={remove}>
                Borrar
              </Button>
            )}
          </Group>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.company.trim()}>
              Guardar
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
