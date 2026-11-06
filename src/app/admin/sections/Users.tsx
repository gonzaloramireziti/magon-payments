"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  CopyButton,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCheck, IconCopy, IconDots, IconLink, IconPlus, IconUserCheck, IconUserOff } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { initials, relative } from "../lib/format";
import type { Me, PanelUser } from "../lib/tickets";

export function Users({ me, users, reload }: { me: Me; users: PanelUser[]; reload: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<{ name: string; url: string } | null>(null);

  async function regenerate(user: PanelUser) {
    try {
      const data = await api<{ inviteUrl: string }>("/api/admin/users", {
        method: "PATCH",
        json: { id: user.id, resetInvite: true },
      });
      setInvite({ name: user.name, url: data.inviteUrl });
      void reload();
    } catch (error) {
      notifyError(error);
    }
  }

  async function toggle(user: PanelUser) {
    try {
      await api("/api/admin/users", { method: "PATCH", json: { id: user.id, active: !user.active } });
      notifyOk(user.active ? `${user.name} ya no puede entrar` : `${user.name} vuelve a tener acceso`);
      void reload();
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Usuarios</Title>
          <Text size="sm" c="dimmed">
            Quiénes entran al panel. Cada uno elige su contraseña desde el link de invitación.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          Nuevo usuario
        </Button>
      </Group>

      <Paper>
        {users.map((user, index) => (
          <Group
            key={user.id}
            justify="space-between"
            px="md"
            py="sm"
            wrap="nowrap"
            style={index ? { borderTop: "1px solid var(--mantine-color-default-border)" } : undefined}
          >
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar radius="xl" color={user.active ? "brand" : "gray"}>
                {initials(user.name)}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <Group gap={6}>
                  <Text size="sm" fw={600}>
                    {user.name}
                    {user.id === me.id ? " (vos)" : ""}
                  </Text>
                  {!user.active ? (
                    <Badge size="xs" color="gray">
                      Inactivo
                    </Badge>
                  ) : user.pending ? (
                    <Badge size="xs" color="yellow">
                      Invitación pendiente
                    </Badge>
                  ) : null}
                </Group>
                <Text size="xs" c="dimmed" truncate>
                  {user.email} · {user.lastLoginAt ? `último ingreso ${relative(user.lastLoginAt)}` : "nunca entró"}
                </Text>
              </div>
            </Group>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label="Acciones">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconLink size={14} />} onClick={() => regenerate(user)} disabled={!user.active}>
                  {user.pending ? "Generar link de invitación" : "Blanquear contraseña (nuevo link)"}
                </Menu.Item>
                <Menu.Item
                  color={user.active ? "red" : undefined}
                  leftSection={user.active ? <IconUserOff size={14} /> : <IconUserCheck size={14} />}
                  onClick={() => toggle(user)}
                  disabled={user.id === me.id}
                >
                  {user.active ? "Desactivar" : "Reactivar"}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        ))}
        {users.length === 0 && (
          <Text size="sm" c="dimmed" p="md">
            Todavía no hay usuarios. Creá el tuyo y el de tu socio.
          </Text>
        )}
      </Paper>

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(name, url) => {
            setCreating(false);
            setInvite({ name, url });
            void reload();
          }}
        />
      )}

      <Modal opened={invite !== null} onClose={() => setInvite(null)} title={`Invitación para ${invite?.name ?? ""}`}>
        <Stack gap="sm">
          <Text size="sm">
            Mandale este link por un canal privado. Con él elige su contraseña. Vence en 7 días y sirve una sola vez.
          </Text>
          <TextInput value={invite?.url ?? ""} readOnly onFocus={(e) => e.currentTarget.select()} />
          <CopyButton value={invite?.url ?? ""}>
            {({ copied, copy }) => (
              <Button
                onClick={copy}
                color={copied ? "teal" : undefined}
                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              >
                {copied ? "Copiado" : "Copiar link"}
              </Button>
            )}
          </CopyButton>
          <Alert color="gray" py="xs">
            Este link no se vuelve a mostrar. Si se pierde, generá uno nuevo desde el menú del usuario.
          </Alert>
        </Stack>
      </Modal>
    </Stack>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, url: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ inviteUrl: string }>("/api/admin/users", { method: "POST", json: { name, email } });
      onCreated(name.trim(), data.inviteUrl);
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title="Nuevo usuario">
      <Stack gap="sm">
        <TextInput label="Nombre" placeholder="Gonzalo" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <TextInput
          label="Email"
          placeholder="gonzalo@magonsoftware.com"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!name.trim() || !email.includes("@")}>
            Crear e invitar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
