"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconActivityHeartbeat, IconCalendarDue, IconDots, IconPencil, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { relative, shortDate } from "../lib/format";

export type Asset = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  kind: "domain" | "hosting" | "ssl" | "database" | "email" | "license" | "other";
  name: string;
  provider: string | null;
  expires_on: string | null;
  auto_renew: boolean;
  cost: number | null;
  currency: "ARS" | "USD";
  notes: string | null;
  days_left: number | null;
};

export type UptimeCheck = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  name: string;
  url: string;
  active: boolean;
  status: "up" | "down" | null;
  fail_count: number;
  last_checked_at: string | null;
  last_change_at: string | null;
  last_ms: number | null;
  last_error: string | null;
  incident_ticket_id: string | null;
};

export const KIND_LABEL: Record<Asset["kind"], string> = {
  domain: "Dominio",
  hosting: "Hosting",
  ssl: "Certificado SSL",
  database: "Base de datos",
  email: "Correo",
  license: "Licencia",
  other: "Otro",
};

export function daysColor(days: number | null, autoRenew = false): string {
  if (days === null) return "gray";
  if (days < 0) return "red";
  if (days <= 7) return autoRenew ? "yellow" : "red";
  if (days <= 30) return "yellow";
  return "teal";
}

export function daysText(days: number | null): string {
  if (days === null) return "Sin fecha";
  if (days < 0) return `Venció hace ${-days} día(s)`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
}

type ClientOption = { id: string; name: string };

export function InfraSection({ clients, onOpenTicket }: { clients: ClientOption[]; onOpenTicket: (id: string) => void }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [checks, setChecks] = useState<UptimeCheck[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);
  const [editingCheck, setEditingCheck] = useState<Partial<UptimeCheck> | null>(null);
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<string | null>("vencimientos");

  const load = useCallback(async () => {
    try {
      const data = await api<{ assets: Asset[]; checks: UptimeCheck[] }>("/api/admin/infra");
      setAssets(data.assets);
      setChecks(data.checks);
    } catch (error) {
      if ((error as { code?: string }).code === "INFRA_UNAVAILABLE") setUnavailable(true);
      else notifyError(error);
      setAssets([]);
      setChecks([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(type: "asset" | "check", id: string, name: string) {
    if (!window.confirm(`¿Borrar «${name}»?`)) return;
    try {
      await api(`/api/admin/infra?type=${type}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      void load();
    } catch (error) {
      notifyError(error);
    }
  }

  async function checkNow() {
    setChecking(true);
    try {
      const data = await api<{ result: { checked: number; down: number }; checks: UptimeCheck[] }>("/api/admin/infra", {
        method: "POST",
        json: { action: "check-now" },
      });
      setChecks(data.checks);
      notifyOk(`Revisados ${data.result.checked}: ${data.result.down ? `${data.result.down} caído(s)` : "todos andan"}`);
    } catch (error) {
      notifyError(error);
    } finally {
      setChecking(false);
    }
  }

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const down = (checks ?? []).filter((c) => c.active && c.status === "down").length;
  const soon = (assets ?? []).filter((a) => a.days_left !== null && a.days_left <= 30).length;

  return (
    <Stack gap="md">
      <div>
        <Title order={1}>Infraestructura</Title>
        <Text size="sm" c="dimmed">
          Dominios, hosting y certificados de cada cliente con aviso antes de que venzan, y monitoreo de caídas.
        </Text>
      </div>

      {unavailable && <Alert color="yellow">Falta correr la migración 014 (supabase/migrations/014_infra.sql).</Alert>}

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab
            value="vencimientos"
            leftSection={<IconCalendarDue size={16} />}
            rightSection={soon ? <Badge size="xs" color="yellow" circle>{soon}</Badge> : null}
          >
            Vencimientos
          </Tabs.Tab>
          <Tabs.Tab
            value="monitoreo"
            leftSection={<IconActivityHeartbeat size={16} />}
            rightSection={down ? <Badge size="xs" color="red" circle>{down}</Badge> : null}
          >
            Monitoreo
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="vencimientos" pt="md">
          <Group justify="space-between" mb="sm">
            <Text size="sm" c="dimmed">
              Avisa a los administradores 30, 7 y 1 día antes y el mismo día (WhatsApp, Discord o correo, según «Mis avisos»).
            </Text>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ kind: "domain", currency: "USD", auto_renew: false })}>
              Agregar
            </Button>
          </Group>
          <Paper style={{ overflowX: "auto" }}>
            <Table verticalSpacing="xs" highlightOnHover miw={640}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Qué</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Vence</Table.Th>
                  <Table.Th>Costo</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {assets?.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text size="sm" c="dimmed" py="sm">
                        Todavía no cargaste vencimientos. Empezá por los dominios y el hosting de cada cliente.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {assets?.map((asset) => (
                  <Table.Tr key={asset.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {asset.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {KIND_LABEL[asset.kind]}
                        {asset.provider ? ` · ${asset.provider}` : ""}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{asset.client_name ?? "Magon"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={daysColor(asset.days_left, asset.auto_renew)} variant="light">
                        {daysText(asset.days_left)}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {asset.expires_on ? shortDate(asset.expires_on) : "—"}
                        {asset.auto_renew ? " · renovación automática" : ""}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{asset.cost !== null ? `${asset.currency} ${asset.cost}` : "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label="Acciones">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(asset)}>
                            Editar / renovar
                          </Menu.Item>
                          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => void remove("asset", asset.id, asset.name)}>
                            Borrar
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="monitoreo" pt="md">
          <Group justify="space-between" mb="sm">
            <Text size="sm" c="dimmed">
              Se revisa cada 10 minutos (workflow «Monitoreo» de GitHub). Con 2 fallas seguidas abre un ticket crítico y avisa.
            </Text>
            <Group gap="xs">
              <Button variant="default" leftSection={<IconRefresh size={16} />} loading={checking} onClick={checkNow}>
                Revisar ahora
              </Button>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setEditingCheck({ active: true })}>
                Agregar
              </Button>
            </Group>
          </Group>
          <Paper>
            {checks?.length === 0 && (
              <Text size="sm" c="dimmed" p="md">
                Agregá la URL de cada sistema en producción (la pantalla de login alcanza).
              </Text>
            )}
            {checks?.map((check, index) => (
              <Group
                key={check.id}
                justify="space-between"
                px="md"
                py="sm"
                wrap="nowrap"
                style={index ? { borderTop: "1px solid var(--mantine-color-default-border)" } : undefined}
              >
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Badge
                    color={!check.active ? "gray" : check.status === "down" ? "red" : check.status === "up" ? "teal" : "gray"}
                    variant="filled"
                    w={84}
                  >
                    {!check.active ? "Pausado" : check.status === "down" ? "Caído" : check.status === "up" ? "Anda" : "Sin datos"}
                  </Badge>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {check.name}
                      {check.client_name ? ` · ${check.client_name}` : ""}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {check.url}
                      {check.last_checked_at ? ` · revisado ${relative(check.last_checked_at)}` : ""}
                      {check.last_ms !== null && check.status === "up" ? ` · ${check.last_ms} ms` : ""}
                      {check.status === "down" && check.last_error ? ` · ${check.last_error}` : ""}
                    </Text>
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap">
                  {check.incident_ticket_id && (
                    <Tooltip label="Ver el ticket de la caída">
                      <Button size="xs" variant="light" color="red" onClick={() => onOpenTicket(check.incident_ticket_id!)}>
                        Ticket
                      </Button>
                    </Tooltip>
                  )}
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label="Acciones">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditingCheck(check)}>
                        Editar
                      </Menu.Item>
                      <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => void remove("check", check.id, check.name)}>
                        Borrar
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Group>
            ))}
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {editing && (
        <AssetModal
          asset={editing}
          clients={clientOptions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {editingCheck && (
        <CheckModal
          check={editingCheck}
          clients={clientOptions}
          onClose={() => setEditingCheck(null)}
          onSaved={() => {
            setEditingCheck(null);
            void load();
          }}
        />
      )}
    </Stack>
  );
}

function AssetModal({
  asset,
  clients,
  onClose,
  onSaved,
}: {
  asset: Partial<Asset>;
  clients: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    kind: asset.kind ?? "domain",
    name: asset.name ?? "",
    clientId: asset.client_id ?? null,
    provider: asset.provider ?? "",
    expiresOn: asset.expires_on ?? "",
    autoRenew: asset.auto_renew ?? false,
    cost: asset.cost ?? "",
    currency: asset.currency ?? "USD",
    notes: asset.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/admin/infra", {
        method: "POST",
        json: { type: "asset", ...(asset.id ? { id: asset.id } : {}), ...form, cost: form.cost === "" ? null : form.cost },
      });
      notifyOk(asset.id ? "Guardado" : "Agregado");
      onSaved();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={asset.id ? `Editar ${asset.name}` : "Nuevo vencimiento"}>
      <Stack gap="sm">
        <Group grow>
          <Select
            label="Tipo"
            data={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
            value={form.kind}
            onChange={(v) => v && setForm({ ...form, kind: v as Asset["kind"] })}
            allowDeselect={false}
          />
          <Select
            label="Cliente"
            placeholder="Magon (interno)"
            data={clients}
            value={form.clientId}
            onChange={(v) => setForm({ ...form, clientId: v })}
            searchable
            clearable
          />
        </Group>
        <TextInput label="Nombre" placeholder="cliente.com.ar" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        <Group grow>
          <TextInput label="Proveedor" placeholder="NIC.ar, Hostinger, Vercel…" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.currentTarget.value })} />
          <TextInput label="Vence el" type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.currentTarget.value })} />
        </Group>
        <Group grow align="flex-end">
          <NumberInput label="Costo" min={0} decimalScale={2} value={form.cost} onChange={(v) => setForm({ ...form, cost: v === "" ? "" : Number(v) })} />
          <Select label="Moneda" data={["USD", "ARS"]} value={form.currency} onChange={(v) => v && setForm({ ...form, currency: v as "ARS" | "USD" })} allowDeselect={false} />
        </Group>
        <Checkbox
          label="Se renueva solo (igual avisa, para controlar el cobro)"
          checked={form.autoRenew}
          onChange={(e) => setForm({ ...form, autoRenew: e.currentTarget.checked })}
        />
        <Textarea label="Notas" placeholder="Cuenta, quién lo paga…" autosize minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
        <Text size="xs" c="dimmed">
          Las claves de acceso van en Documentación → Credenciales, no acá.
        </Text>
        <Group justify="flex-end">
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

function CheckModal({
  check,
  clients,
  onClose,
  onSaved,
}: {
  check: Partial<UptimeCheck>;
  clients: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(check.name ?? "");
  const [url, setUrl] = useState(check.url ?? "https://");
  const [clientId, setClientId] = useState<string | null>(check.client_id ?? null);
  const [active, setActive] = useState(check.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/admin/infra", {
        method: "POST",
        json: { type: "check", ...(check.id ? { id: check.id } : {}), name, url, clientId, active },
      });
      onSaved();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={check.id ? `Editar ${check.name}` : "Nuevo monitor"}>
      <Stack gap="sm">
        <TextInput label="Nombre" placeholder="Sistema de Carpoint" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <TextInput label="URL" placeholder="https://app.cliente.com/login" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
        <Select
          label="Cliente"
          description="Con cliente, una caída abre un ticket crítico a su nombre"
          placeholder="Interno"
          data={clients}
          value={clientId}
          onChange={setClientId}
          searchable
          clearable
        />
        <Checkbox label="Activo" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!name.trim() || !url.trim()}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
