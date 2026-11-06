"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBrandDiscord, IconBrandWhatsapp, IconMail, IconSend } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";

type Channel = "whatsapp" | "discord" | "email";
type Channels = {
  whatsapp: { enabled: boolean; number: string | null };
  discord: { enabled: boolean; webhook: string | null };
  email: { enabled: boolean; address: string | null };
};
type Prefs = { channels: Channels; events: string[] };

const EVENTS = [
  { value: "new_ticket", label: "Entró un ticket nuevo", hint: "De cualquier cliente" },
  { value: "assigned", label: "Me asignaron un ticket", hint: "Cuando otro te lo asigna" },
  { value: "comment", label: "Comentaron en un ticket mío", hint: "En los tickets que tenés asignados" },
];

const CHANNELS: Array<{
  id: Channel;
  label: string;
  icon: typeof IconMail;
  color: string;
  field: "number" | "webhook" | "address";
  placeholder: string;
  help: React.ReactNode;
}> = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: IconBrandWhatsapp,
    color: "teal",
    field: "number",
    placeholder: "5491122334455",
    help: "Con código de país y área, sin + ni espacios.",
  },
  {
    id: "discord",
    label: "Discord",
    icon: IconBrandDiscord,
    color: "indigo",
    field: "webhook",
    placeholder: "https://discord.com/api/webhooks/…",
    help: (
      <>
        En tu servidor de Discord: Configuración del canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.{" "}
        <Anchor href="https://support.discord.com/hc/es/articles/228383668" target="_blank" size="xs">
          Ayuda
        </Anchor>
      </>
    ),
  },
  {
    id: "email",
    label: "Correo",
    icon: IconMail,
    color: "blue",
    field: "address",
    placeholder: "vos@magonsoftware.com",
    help: "La dirección donde querés recibir los avisos.",
  },
];

export function MyAlerts({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [available, setAvailable] = useState<Record<Channel, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setError(null);
    api<{ prefs: Prefs; available: Record<Channel, boolean> }>("/api/admin/me/notifications")
      .then((data) => {
        setPrefs(data.prefs);
        setAvailable(data.available);
      })
      .catch((err) => setError((err as Error).message));
  }, [opened]);

  function setChannel(id: Channel, patch: Record<string, unknown>) {
    setPrefs((current) =>
      current ? { ...current, channels: { ...current.channels, [id]: { ...current.channels[id], ...patch } } } : current
    );
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      const data = await api<{ prefs: Prefs }>("/api/admin/me/notifications", { method: "PUT", json: prefs });
      setPrefs(data.prefs);
      notifyOk("Avisos guardados");
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  async function test(id: Channel) {
    if (!prefs) return;
    setTesting(id);
    try {
      await api("/api/admin/me/notifications", { method: "POST", json: { channel: id, channels: prefs.channels } });
      notifyOk(`Mandamos un mensaje de prueba por ${CHANNELS.find((c) => c.id === id)?.label}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setTesting(null);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Mis avisos" size="lg">
      {error ? (
        <Alert color="yellow">{error}</Alert>
      ) : !prefs || !available ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Elegí por dónde querés enterarte cuando el panel está cerrado. Los avisos dentro del panel (campanita) funcionan
            siempre.
          </Text>

          {CHANNELS.map((channel) => {
            const value = prefs.channels[channel.id];
            const fieldValue = (value as Record<string, unknown>)[channel.field] as string | null;
            const ready = available[channel.id];
            return (
              <Paper key={channel.id} p="sm">
                <Group justify="space-between" wrap="nowrap" mb={value.enabled ? "xs" : 0}>
                  <Group gap="xs" wrap="nowrap">
                    <channel.icon size={20} color={`var(--mantine-color-${channel.color}-6)`} />
                    <Text fw={600} size="sm">
                      {channel.label}
                    </Text>
                    {!ready && (
                      <Badge size="xs" color="gray">
                        Falta configurar en el servidor
                      </Badge>
                    )}
                  </Group>
                  <Switch
                    checked={value.enabled}
                    disabled={!ready}
                    onChange={(e) => setChannel(channel.id, { enabled: e.currentTarget.checked })}
                    aria-label={`Avisar por ${channel.label}`}
                  />
                </Group>
                {value.enabled && (
                  <Group align="flex-end" gap="xs" wrap="nowrap">
                    <TextInput
                      style={{ flex: 1 }}
                      size="xs"
                      placeholder={channel.placeholder}
                      description={channel.help}
                      value={fieldValue ?? ""}
                      onChange={(e) => setChannel(channel.id, { [channel.field]: e.currentTarget.value })}
                    />
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconSend size={14} />}
                      loading={testing === channel.id}
                      disabled={!fieldValue}
                      onClick={() => test(channel.id)}
                    >
                      Probar
                    </Button>
                  </Group>
                )}
              </Paper>
            );
          })}

          <div>
            <Text size="sm" fw={600} mb={6}>
              Avisarme cuando…
            </Text>
            <Checkbox.Group value={prefs.events} onChange={(events) => setPrefs({ ...prefs, events })}>
              <Stack gap={8}>
                {EVENTS.map((event) => (
                  <Checkbox key={event.value} value={event.value} label={event.label} description={event.hint} />
                ))}
              </Stack>
            </Checkbox.Group>
          </div>

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
