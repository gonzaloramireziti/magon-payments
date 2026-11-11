"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconBrandWhatsapp,
  IconCash,
  IconCheck,
  IconCopy,
  IconDots,
  IconFileDownload,
  IconFileInvoice,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { money, normalizeText, shortDate } from "../lib/format";

// Tipos de servicio (ver SERVICE_TYPES en lib/billing/config.ts). Por ahora solo cobro recurrente.
const SERVICE_TYPE_OPTIONS = [{ value: "recurring", label: "Cobro recurrente" }];

type Invoice = { id: string; period: string; amount: number; currency: string; dueDate: string; status: string };
type Status = { state: string; amountDue: number; periodLabel: string; dueDate: string; invoices: Invoice[] };
type Client = {
  id: string;
  client_key: string;
  name: string;
  email: string | null;
  phone: string | null;
  monthly_amount: number | string;
  currency: string;
  active: boolean;
  start_period: string | null;
  notes: string | null;
  service_type?: string | null;
  service_description?: string | null;
  support_policy?: Record<string, string[]> | null;
  repos?: string[] | null;
  status: Status | null;
};

const STATE: Record<string, { label: string; color: string }> = {
  active: { label: "Al día", color: "teal" },
  due: { label: "Por vencer", color: "yellow" },
  blocked: { label: "Vencido", color: "red" },
  inactive: { label: "Inactivo", color: "gray" },
};

const POLICY_PRESETS: Array<{ value: string; label: string; policy: Record<string, string[]> }> = [
  { value: "all", label: "Problemas y funcionalidades", policy: { default: ["bug", "feature"] } },
  { value: "bugs", label: "Solo problemas", policy: { default: ["bug"] } },
  {
    value: "bugs-admin",
    label: "Solo problemas (el admin también funcionalidades)",
    policy: { default: ["bug"], admin: ["bug", "feature"] },
  },
  { value: "none", label: "No puede reportar", policy: { default: [] } },
];

function samePolicy(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const norm = (p: Record<string, string[]>) =>
    JSON.stringify(Object.keys(p).sort().map((k) => [k, [...p[k]].sort()]));
  return norm(a) === norm(b);
}

function whatsappUrl(client: Client): string {
  const amount = money(client.status?.amountDue ?? 0, client.currency);
  const text =
    `¡Hola ${client.name}! 👋 Somos el equipo de Magon. ` +
    `Te escribimos para recordarte que tu suscripción de ${client.status?.periodLabel ?? ""} está lista para abonar: ${amount}. ` +
    `Tenés tiempo hasta el 10 para hacerlo, sin apuro. ¡Gracias por confiar en nosotros! 🙌`;
  return `https://wa.me/${(client.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function Clients({
  initialSearch,
  onSearchConsumed,
}: {
  initialSearch: string | null;
  onSearchConsumed: () => void;
}) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [paying, setPaying] = useState<Client | null>(null);

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
      onSearchConsumed();
    }
  }, [initialSearch, onSearchConsumed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ clients: Client[] }>("/api/admin/clients?withStatus=1");
      setClients(data.clients);
    } catch (error) {
      notifyError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = normalizeText(search.trim());
    return clients
      .filter((c) => !q || normalizeText(`${c.name} ${c.email ?? ""} ${c.client_key}`).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, search]);

  function remove(client: Client) {
    modals.openConfirmModal({
      title: `Borrar a ${client.name}`,
      children: (
        <Text size="sm">
          Se eliminan también sus facturas, pagos y tickets. No se puede deshacer.
        </Text>
      ),
      labels: { confirm: "Borrar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`/api/admin/clients?id=${encodeURIComponent(client.id)}`, { method: "DELETE" });
          notifyOk(`Cliente «${client.name}» eliminado`);
          void load();
        } catch (error) {
          notifyError(error);
        }
      },
    });
  }

  function actions(client: Client) {
    return (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Acciones" onClick={(e) => e.stopPropagation()}>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(client)}>
            Editar
          </Menu.Item>
          <Menu.Item leftSection={<IconCash size={14} />} onClick={() => setPaying(client)}>
            Confirmar pago
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileDownload size={14} />}
            component="a"
            href={`/api/admin/billing/notice?clientId=${client.id}`}
          >
            Aviso de cobro del mes (PDF)
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileInvoice size={14} />}
            component="a"
            href={`/api/admin/billing/invoice?clientId=${client.id}`}
          >
            Factura del mes (PDF)
          </Menu.Item>
          <Menu.Item
            leftSection={<IconBrandWhatsapp size={14} />}
            component="a"
            href={whatsappUrl(client)}
            target="_blank"
            disabled={!client.phone}
          >
            Recordatorio por WhatsApp
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => remove(client)}>
            Borrar
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Clientes</Title>
          <Text size="sm" c="dimmed">
            {clients.length} cliente(s) · {clients.filter((c) => c.active).length} activo(s)
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
          Nuevo cliente
        </Button>
      </Group>

      <TextInput
        size="xs"
        placeholder="Buscar por nombre, email o KEY…"
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        maw={mobile ? undefined : 320}
      />

      {mobile ? (
        <Stack gap="xs">
          {visible.map((client) => {
            const state = STATE[client.status?.state ?? ""] ?? { label: "Sin datos", color: "gray" };
            return (
              <Paper key={client.id} p="sm">
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Text size="sm" fw={600}>
                        {client.name}
                      </Text>
                      <Badge size="xs" color={state.color}>
                        {state.label}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {money(Number(client.monthly_amount), client.currency)} / mes · debe{" "}
                      {money(client.status?.amountDue ?? 0, client.currency)}
                    </Text>
                  </div>
                  {actions(client)}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Paper>
          <Table.ScrollContainer minWidth={880}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>KEY</Table.Th>
                  <Table.Th>Abono</Table.Th>
                  <Table.Th>Vence</Table.Th>
                  <Table.Th>Deuda</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((client) => {
                  const state = STATE[client.status?.state ?? ""] ?? { label: "Sin datos", color: "gray" };
                  const due = client.status?.amountDue ?? 0;
                  return (
                    <Table.Tr key={client.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {client.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {client.email ?? "sin email"}
                          {client.phone ? "" : " · sin WhatsApp"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <CopyButton value={client.client_key}>
                          {({ copied, copy }) => (
                            <Tooltip label={copied ? "Copiada" : "Copiar KEY"}>
                              <Code onClick={copy} style={{ cursor: "pointer" }}>
                                {client.client_key.slice(0, 14)}…{" "}
                                {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
                              </Code>
                            </Tooltip>
                          )}
                        </CopyButton>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{money(Number(client.monthly_amount), client.currency)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{client.status ? shortDate(client.status.dueDate) : "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={700} c={due > 0 ? "red" : "teal"}>
                          {money(due, client.currency)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={state.color} variant="dot">
                          {state.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{actions(client)}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      {!loading && visible.length === 0 && (
        <Text size="sm" c="dimmed" ta="center">
          No hay clientes que coincidan.
        </Text>
      )}

      {editing && (
        <ClientModal
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {paying && (
        <PaymentModal
          client={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            void load();
          }}
        />
      )}
    </Stack>
  );
}

function ClientModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const initialPolicy = client?.support_policy ?? POLICY_PRESETS[0].policy;
  const [form, setForm] = useState({
    name: client?.name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    monthlyAmount: client ? Number(client.monthly_amount) : 15000,
    currency: client?.currency ?? "ARS",
    startPeriod: client?.start_period ?? "",
    active: client?.active ?? true,
    clientKey: "",
    notes: client?.notes ?? "",
    serviceType: client?.service_type ?? "recurring",
    serviceDescription: client?.service_description ?? "",
    repos: client?.repos ?? [],
  });
  const [preset, setPreset] = useState(
    POLICY_PRESETS.find((p) => samePolicy(p.policy, initialPolicy))?.value ?? "custom"
  );
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const policy = POLICY_PRESETS.find((p) => p.value === preset)?.policy;
      if (client) {
        await api("/api/admin/clients", {
          method: "PATCH",
          json: {
            id: client.id,
            name: form.name,
            email: form.email || null,
            phone: form.phone || null,
            monthlyAmount: Number(form.monthlyAmount),
            currency: form.currency,
            startPeriod: form.startPeriod || null,
            active: form.active,
            notes: form.notes.trim() || null,
            serviceType: form.serviceType,
            serviceDescription: form.serviceDescription.trim() || null,
            ...(policy && !samePolicy(policy, initialPolicy) ? { supportPolicy: policy } : {}),
            ...(form.repos.join() !== (client.repos ?? []).join() ? { repos: form.repos } : {}),
          },
        });
        notifyOk("Cliente actualizado");
      } else {
        const data = await api<{ client: { client_key: string } }>("/api/admin/clients", {
          method: "POST",
          json: {
            name: form.name,
            email: form.email || null,
            phone: form.phone || null,
            monthlyAmount: Number(form.monthlyAmount),
            currency: form.currency,
            startPeriod: form.startPeriod || null,
            clientKey: form.clientKey || undefined,
            notes: form.notes.trim() || null,
            serviceType: form.serviceType,
            serviceDescription: form.serviceDescription.trim() || null,
            ...(form.repos.length ? { repos: form.repos } : {}),
          },
        });
        notifyOk(`Cliente creado. KEY: ${data.client.client_key}`);
      }
      onSaved();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={client ? `Editar ${client.name}` : "Nuevo cliente"} size="lg">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Nombre" required value={form.name} onChange={(e) => set({ name: e.currentTarget.value })} />
          <TextInput label="Email" value={form.email} onChange={(e) => set({ email: e.currentTarget.value })} />
          <TextInput
            label="WhatsApp"
            placeholder="5491122334455"
            value={form.phone}
            onChange={(e) => set({ phone: e.currentTarget.value })}
          />
          <TextInput
            label="Primer período"
            placeholder="2026-09"
            value={form.startPeriod}
            onChange={(e) => set({ startPeriod: e.currentTarget.value })}
          />
          <NumberInput
            label="Abono mensual"
            value={form.monthlyAmount}
            onChange={(v) => set({ monthlyAmount: Number(v) || 0 })}
            min={0}
            thousandSeparator="."
            decimalSeparator=","
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Moneda
            </Text>
            <SegmentedControl value={form.currency} onChange={(v) => set({ currency: v })} data={["ARS", "USD"]} />
          </Stack>
        </SimpleGrid>
        <Select
          label="Servicio"
          data={SERVICE_TYPE_OPTIONS}
          value={form.serviceType}
          allowDeselect={false}
          onChange={(v) => v && set({ serviceType: v })}
        />
        <Textarea
          label="Descripción en la factura"
          description="Concepto que figura en la factura mensual. Si queda vacía se usa una genérica."
          placeholder="Servicio mensual de mantenimiento, soporte técnico, actualizaciones y mejoras del sistema…"
          autosize
          minRows={2}
          maxRows={4}
          value={form.serviceDescription}
          onChange={(e) => set({ serviceDescription: e.currentTarget.value })}
        />
        <Textarea
          label="Contexto para prompts"
          description="Se agrega al prompt de cada ticket: proyecto, carpeta, repositorio, stack y agente."
          placeholder={"Proyecto X: carpeta X/Front (React + MUI) y X/Back (.NET 8).\nAgente de Herdr: x."}
          autosize
          minRows={2}
          maxRows={6}
          value={form.notes}
          onChange={(e) => set({ notes: e.currentTarget.value })}
        />
        <TagsInput
          label="Repositorios de GitHub"
          description="owner/nombre (o la URL). Si el cliente trabaja sobre una rama propia: owner/nombre@rama. Los issues se abren en el primero."
          placeholder={form.repos.length ? "" : "organizacion/repo-front"}
          value={form.repos}
          onChange={(repos) => set({ repos: repos.map((r) => r.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "")) })}
          splitChars={[",", " "]}
          clearable
        />
        {client ? (
          <>
            <Select
              label="Qué puede reportar"
              data={[
                ...POLICY_PRESETS.map((p) => ({ value: p.value, label: p.label })),
                ...(preset === "custom" ? [{ value: "custom", label: "Personalizado (sin cambios)" }] : []),
              ]}
              value={preset}
              allowDeselect={false}
              onChange={(v) => v && setPreset(v)}
            />
            <Switch label="Activo" checked={form.active} onChange={(e) => set({ active: e.currentTarget.checked })} />
          </>
        ) : (
          <TextInput
            label="KEY (opcional)"
            description="Si la dejás vacía se genera una"
            value={form.clientKey}
            onChange={(e) => set({ clientKey: e.currentTarget.value })}
          />
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!form.name.trim()}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PaymentModal({ client, onClose, onPaid }: { client: Client; onClose: () => void; onPaid: () => void }) {
  const unpaid = (client.status?.invoices ?? []).filter((i) => i.status === "pending" || i.status === "overdue");
  const [selected, setSelected] = useState<string[]>(unpaid.map((i) => i.id));
  const [method, setMethod] = useState<string | null>("Transferencia bancaria");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const total = unpaid.filter((i) => selected.includes(i.id)).reduce((acc, i) => acc + i.amount, 0);

  async function confirm() {
    setSaving(true);
    try {
      const data = await api<{ amount: number }>("/api/admin/payments", {
        method: "POST",
        json: { clientId: client.id, invoiceIds: selected, method, note },
      });
      notifyOk(`Pago confirmado: ${money(data.amount, client.currency)}`);
      onPaid();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={`Confirmar pago · ${client.name}`}>
      {unpaid.length === 0 ? (
        <Text size="sm" c="dimmed">
          No hay facturas pendientes.
        </Text>
      ) : (
        <Stack gap="sm">
          <Checkbox.Group value={selected} onChange={setSelected}>
            <Stack gap={6}>
              {unpaid.map((invoice) => (
                <Checkbox
                  key={invoice.id}
                  value={invoice.id}
                  label={`${invoice.period} · vence ${shortDate(invoice.dueDate)} · ${money(invoice.amount, invoice.currency)}${
                    invoice.status === "overdue" ? " (vencida)" : ""
                  }`}
                />
              ))}
            </Stack>
          </Checkbox.Group>
          <Select
            label="Medio de pago"
            data={["Transferencia bancaria", "Efectivo", "Mercado Pago", "Otro"]}
            value={method}
            onChange={setMethod}
            allowDeselect={false}
          />
          <TextInput label="Nota (opcional)" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          <Group justify="space-between" mt="sm">
            <div>
              <Text size="xs" c="dimmed">
                Total
              </Text>
              <Text fw={800}>{money(total, client.currency)}</Text>
            </div>
            <Button onClick={confirm} loading={saving} disabled={selected.length === 0}>
              Confirmar pago
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
