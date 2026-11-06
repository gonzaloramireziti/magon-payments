"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useInterval, useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconLock,
  IconLockOpen,
  IconPencil,
  IconPlus,
  IconSearch,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { normalizeText, relative } from "../lib/format";
import type { Me } from "../lib/tickets";
import type { ClientOption } from "./Docs";

type Item = {
  id: string;
  name: string;
  kind: string;
  client_id: string | null;
  client_name: string | null;
  host: string | null;
  username: string | null;
  has_secret: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};
type LogEntry = { item_name: string | null; user_name: string | null; action: string; created_at: string };
type VaultState = { configured: boolean; canUse: boolean; unlocked: boolean; items: Item[]; log: LogEntry[] };

const KINDS = [
  { value: "server", label: "Servidor (SSH / panel)" },
  { value: "database", label: "Base de datos" },
  { value: "api", label: "API key / token" },
  { value: "panel", label: "Panel web / cuenta" },
  { value: "email", label: "Correo" },
  { value: "other", label: "Otro" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label.split(" (")[0]]));
const ACTION_LABEL: Record<string, string> = {
  reveal: "vio",
  create: "creó",
  update: "editó",
  delete: "borró",
  unlock: "desbloqueó la bóveda",
  unlock_failed: "falló al desbloquear",
};
const REVEAL_MS = 30_000;

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notifyOk(`${label} copiado`);
  } catch {
    notifyError(new Error("El navegador no permitió copiar"));
  }
}

export function Vault({ me, clients }: { me: Me; clients: ClientOption[] }) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<VaultState>("/api/admin/vault"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cada minuto revisa si el desbloqueo venció, para no dejar la pantalla "abierta" de más.
  const ticker = useInterval(() => void load(), 60_000);
  useEffect(() => {
    ticker.start();
    return ticker.stop;
  }, [ticker]);

  // Al bloquearse, se olvidan los secretos que estaban a la vista.
  useEffect(() => {
    if (state && !state.unlocked) setRevealed({});
  }, [state]);

  const visible = useMemo(() => {
    const words = normalizeText(search.trim()).split(/\s+/).filter(Boolean);
    return (state?.items ?? []).filter((item) => {
      const text = normalizeText(`${item.name} ${item.host ?? ""} ${item.username ?? ""} ${item.client_name ?? ""} ${item.notes ?? ""}`);
      return words.every((w) => text.includes(w));
    });
  }, [state, search]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setUnlocking(true);
    try {
      await api("/api/admin/vault/unlock", { method: "POST", json: { password } });
      setPassword("");
      await load();
    } catch (err) {
      notifyError(err);
    } finally {
      setUnlocking(false);
    }
  }

  async function lock() {
    await api("/api/admin/vault/unlock", { method: "DELETE" }).catch(() => undefined);
    setRevealed({});
    await load();
  }

  async function getSecret(item: Item): Promise<string | null> {
    if (revealed[item.id]) return revealed[item.id];
    try {
      const data = await api<{ secret: string }>("/api/admin/vault/reveal", { method: "POST", json: { id: item.id } });
      return data.secret;
    } catch (err) {
      notifyError(err);
      if ((err as { code?: string }).code === "VAULT_LOCKED") void load();
      return null;
    }
  }

  async function toggleReveal(item: Item) {
    if (revealed[item.id]) {
      setRevealed(({ [item.id]: _hidden, ...rest }) => rest);
      return;
    }
    const secret = await getSecret(item);
    if (secret === null) return;
    setRevealed((current) => ({ ...current, [item.id]: secret }));
    window.setTimeout(() => setRevealed(({ [item.id]: _hidden, ...rest }) => rest), REVEAL_MS);
  }

  async function copySecret(item: Item) {
    const secret = await getSecret(item);
    if (secret !== null) await copy(secret, "Secreto");
  }

  function remove(item: Item) {
    modals.openConfirmModal({
      title: "Borrar credencial",
      children: <Text size="sm">¿Borrar «{item.name}»? El secreto no se puede recuperar.</Text>,
      labels: { confirm: "Borrar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`/api/admin/vault?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
          notifyOk("Credencial borrada");
          void load();
        } catch (err) {
          notifyError(err);
        }
      },
    });
  }

  function secretControls(item: Item) {
    if (!state) return null;
    return item.has_secret ? (
      <Group gap={4} wrap="nowrap">
        <Code style={{ wordBreak: "break-all" }}>{revealed[item.id] ?? "••••••••••"}</Code>
        <Tooltip label={state.unlocked ? (revealed[item.id] ? "Ocultar" : "Ver 30 segundos") : "Desbloqueá la bóveda"}>
          <ActionIcon size="sm" variant="subtle" color="gray" disabled={!state.unlocked} onClick={() => toggleReveal(item)} aria-label="Ver secreto">
            {revealed[item.id] ? <IconEyeOff size={12} /> : <IconEye size={12} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={state.unlocked ? "Copiar" : "Desbloqueá la bóveda"}>
          <ActionIcon size="sm" variant="subtle" color="gray" disabled={!state.unlocked} onClick={() => copySecret(item)} aria-label="Copiar secreto">
            <IconCopy size={12} />
          </ActionIcon>
        </Tooltip>
      </Group>
    ) : (
      <Text size="sm" c="dimmed">
        Sin secreto
      </Text>
    );
  }

  function copyable(value: string | null, label: string) {
    return value ? (
      <Group gap={4} wrap="nowrap">
        <Code style={{ wordBreak: "break-all" }}>{value}</Code>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => copy(value, label)} aria-label={`Copiar ${label.toLowerCase()}`}>
          <IconCopy size={12} />
        </ActionIcon>
      </Group>
    ) : (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  function itemActions(item: Item) {
    if (!state) return null;
    return (
      <Group gap={2} wrap="nowrap">
        <ActionIcon variant="subtle" color="gray" disabled={!state.unlocked} onClick={() => setEditing(item)} aria-label="Editar">
          <IconPencil size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" disabled={!state.unlocked} onClick={() => remove(item)} aria-label="Borrar">
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    );
  }

  if (error) return <Alert color="yellow">{error}</Alert>;
  if (!state) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (!state.configured) {
    return (
      <Alert color="yellow" icon={<IconShieldLock size={18} />} title="La bóveda no está configurada">
        Falta la variable <Code>VAULT_KEY</Code> en el servidor. Generala con <Code>openssl rand -base64 32</Code> y cargala en
        Vercel. Guardala también en un lugar seguro: si se pierde, las credenciales no se pueden recuperar.
      </Alert>
    );
  }
  if (!state.canUse || !me.id) {
    return (
      <Alert color="yellow" icon={<IconShieldLock size={18} />}>
        Entrá con tu usuario para usar la bóveda: con el acceso de emergencia no se pueden ver credenciales.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {state.unlocked ? (
        <Alert color="teal" icon={<IconLockOpen size={18} />} py="xs">
          <Group justify="space-between" wrap={mobile ? "wrap" : "nowrap"} gap="xs">
            <Text size="sm">Bóveda desbloqueada. Se bloquea sola a los 15 minutos; cada secreto que ves queda registrado.</Text>
            <Button size="xs" variant="white" color="teal" leftSection={<IconLock size={14} />} onClick={lock}>
              Bloquear
            </Button>
          </Group>
        </Alert>
      ) : (
        <Paper p="md">
          <form onSubmit={unlock}>
            <Group align="flex-end" wrap={mobile ? "wrap" : "nowrap"}>
              <PasswordInput
                label="Desbloquear la bóveda"
                description="Confirmá tu contraseña del panel para ver, copiar o editar credenciales"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                autoComplete="current-password"
                style={{ flex: 1 }}
              />
              <Button type="submit" loading={unlocking} leftSection={<IconLockOpen size={16} />} disabled={!password}>
                Desbloquear
              </Button>
            </Group>
          </form>
        </Paper>
      )}

      <Group justify="space-between" gap="xs">
        <TextInput
          size="xs"
          placeholder="Buscar por nombre, host, usuario o cliente…"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={mobile ? "100%" : 320}
        />
        <Group gap="xs">
          {state.unlocked && (
            <Switch size="xs" label="Ver registro de accesos" checked={showLog} onChange={(e) => setShowLog(e.currentTarget.checked)} />
          )}
          <Button size="xs" leftSection={<IconPlus size={14} />} disabled={!state.unlocked} onClick={() => setEditing("new")}>
            Nueva credencial
          </Button>
        </Group>
      </Group>

      {mobile ? (
        <Stack gap="xs">
          {visible.map((item) => (
            <Paper key={item.id} p="sm">
              <Group justify="space-between" wrap="nowrap" mb={6}>
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    {item.name}
                  </Text>
                  <Group gap={4}>
                    <Badge size="xs" color="gray">
                      {KIND_LABEL[item.kind] ?? item.kind}
                    </Badge>
                    {item.client_name && (
                      <Badge size="xs" variant="outline" color="gray" tt="none">
                        {item.client_name}
                      </Badge>
                    )}
                  </Group>
                </div>
                {itemActions(item)}
              </Group>
              <Stack gap={4}>
                {item.host && copyable(item.host, "Host")}
                {item.username && copyable(item.username, "Usuario")}
                {secretControls(item)}
                {item.notes && (
                  <Text size="xs" c="dimmed">
                    {item.notes}
                  </Text>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Paper>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Host / URL</Table.Th>
                <Table.Th>Usuario</Table.Th>
                <Table.Th>Secreto</Table.Th>
                <Table.Th w={80} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {item.name}
                    </Text>
                    <Group gap={4}>
                      <Badge size="xs" color="gray">
                        {KIND_LABEL[item.kind] ?? item.kind}
                      </Badge>
                      {item.client_name && (
                        <Badge size="xs" variant="outline" color="gray" tt="none">
                          {item.client_name}
                        </Badge>
                      )}
                    </Group>
                    {item.notes && (
                      <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                        {item.notes}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{copyable(item.host, "Host")}</Table.Td>
                  <Table.Td>{copyable(item.username, "Usuario")}</Table.Td>
                  <Table.Td>{secretControls(item)}</Table.Td>
                  <Table.Td>{itemActions(item)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      {visible.length === 0 && (
        <Text size="sm" c="dimmed">
          {state.items.length ? "No hay credenciales que coincidan." : "Todavía no hay credenciales guardadas."}
        </Text>
      )}

      {showLog && state.unlocked && (
        <Paper p="md">
          <Text size="sm" fw={600} mb="xs">
            Últimos accesos
          </Text>
          <Stack gap={4}>
            {state.log.map((entry, index) => (
              <Text key={index} size="xs" c={entry.action === "unlock_failed" ? "red" : undefined}>
                <b>{entry.user_name ?? "?"}</b> {ACTION_LABEL[entry.action] ?? entry.action}
                {entry.item_name ? ` «${entry.item_name}»` : ""} · {relative(entry.created_at)}
              </Text>
            ))}
            {state.log.length === 0 && (
              <Text size="xs" c="dimmed">
                Sin registros.
              </Text>
            )}
          </Stack>
        </Paper>
      )}

      {editing && (
        <ItemEditor
          item={editing === "new" ? null : editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRevealed({});
            void load();
          }}
        />
      )}
    </Stack>
  );
}

function ItemEditor({
  item,
  clients,
  onClose,
  onSaved,
}: {
  item: Item | null;
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    kind: item?.kind ?? "server",
    clientId: item?.client_id ?? null,
    host: item?.host ?? "",
    username: item?.username ?? "",
    notes: item?.notes ?? "",
  });
  // Al editar, el secreto solo se reemplaza si se escribe uno nuevo.
  const [secret, setSecret] = useState("");
  const [replaceSecret, setReplaceSecret] = useState(!item);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/admin/vault", {
        method: "POST",
        json: { id: item?.id, ...form, ...(replaceSecret ? { secret } : {}) },
      });
      notifyOk("Credencial guardada cifrada");
      onSaved();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={item ? "Editar credencial" : "Nueva credencial"} size="lg">
      <Stack gap="sm">
        <TextInput label="Nombre" required placeholder="Servidor de producción (Hetzner)" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        <Group grow align="flex-start">
          <Select label="Tipo" data={KINDS} value={form.kind} allowDeselect={false} onChange={(kind) => kind && setForm({ ...form, kind })} />
          <Select label="Cliente (opcional)" clearable searchable data={clients} value={form.clientId} onChange={(clientId) => setForm({ ...form, clientId })} />
        </Group>
        <TextInput label="Host / URL" placeholder="ssh root@1.2.3.4 · https://panel…" value={form.host} onChange={(e) => setForm({ ...form, host: e.currentTarget.value })} />
        <TextInput label="Usuario" value={form.username} onChange={(e) => setForm({ ...form, username: e.currentTarget.value })} autoComplete="off" />
        {item?.has_secret && (
          <Switch label="Reemplazar el secreto guardado" checked={replaceSecret} onChange={(e) => setReplaceSecret(e.currentTarget.checked)} />
        )}
        {replaceSecret && (
          <PasswordInput
            label="Contraseña / token"
            description="Se guarda cifrado (AES-256-GCM). Dejalo vacío para no guardar secreto."
            value={secret}
            onChange={(e) => setSecret(e.currentTarget.value)}
            autoComplete="new-password"
          />
        )}
        <Textarea label="Notas" autosize minRows={2} maxRows={6} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
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
