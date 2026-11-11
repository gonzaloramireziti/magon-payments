"use client";

import { useEffect, useState } from "react";
import { Alert, Anchor, Badge, Button, Group, Loader, Modal, Paper, PasswordInput, Stack, Text } from "@mantine/core";
import { IconBrandGithub, IconSparkles } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";

type Kind = "github" | "anthropic";
type Status = {
  vaultConfigured: boolean;
  github: { connected: boolean; login: string | null };
  anthropic: { connected: boolean };
};

const INFO: Record<Kind, { title: string; icon: typeof IconSparkles; help: React.ReactNode; placeholder: string }> = {
  anthropic: {
    title: "Claude (API de Anthropic)",
    icon: IconSparkles,
    placeholder: "sk-ant-…",
    help: (
      <>
        Con tu key se analizan los tickets que tomás: se cobran en tu cuenta. Creala en{" "}
        <Anchor href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" size="xs">
          console.anthropic.com
        </Anchor>
        .
      </>
    ),
  },
  github: {
    title: "GitHub",
    icon: IconBrandGithub,
    placeholder: "github_pat_…",
    help: (
      <>
        Token fine-grained con acceso a los repos de los clientes (Issues y Pull requests: lectura y escritura). Crealo en{" "}
        <Anchor href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" size="xs">
          github.com/settings
        </Anchor>
        .
      </>
    ),
  },
};

function IntegrationCard({ kind, status, onChange }: { kind: Kind; status: Status; onChange: (s: Status) => void }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const info = INFO[kind];
  const connected = kind === "github" ? status.github.connected : status.anthropic.connected;

  async function save() {
    setBusy(true);
    try {
      const data = await api<{ integrations: Status }>("/api/admin/me/integrations", {
        method: "PUT",
        json: { kind, secret },
      });
      setSecret("");
      onChange(data.integrations);
      notifyOk(`${info.title}: conectado`);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const data = await api<{ integrations: Status }>(`/api/admin/me/integrations?kind=${kind}`, { method: "DELETE" });
      onChange(data.integrations);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" mb={6}>
        <Group gap={8}>
          <info.icon size={18} />
          <Text fw={600} size="sm">
            {info.title}
          </Text>
        </Group>
        {connected ? (
          <Badge color="teal" variant="light">
            {kind === "github" && status.github.login ? `Conectado como ${status.github.login}` : "Conectado"}
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            Sin conectar
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        {info.help}
      </Text>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <PasswordInput
          size="xs"
          style={{ flex: 1 }}
          placeholder={connected ? "Pegá uno nuevo para reemplazarlo" : info.placeholder}
          value={secret}
          onChange={(e) => setSecret(e.currentTarget.value)}
          autoComplete="off"
          disabled={!status.vaultConfigured}
        />
        <Button size="xs" onClick={save} loading={busy} disabled={!secret.trim()}>
          {connected ? "Reemplazar" : "Conectar"}
        </Button>
        {connected && (
          <Button size="xs" variant="subtle" color="red" onClick={remove} disabled={busy}>
            Quitar
          </Button>
        )}
      </Group>
    </Paper>
  );
}

export function MyIntegrations({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!opened) return;
    setStatus(null);
    api<{ integrations: Status }>("/api/admin/me/integrations")
      .then((data) => setStatus(data.integrations))
      .catch((error) => {
        notifyError(error);
        onClose();
      });
  }, [opened, onClose]);

  return (
    <Modal opened={opened} onClose={onClose} title="Mis integraciones" size="lg">
      {!status ? (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap="sm">
          {!status.vaultConfigured && (
            <Alert color="yellow" variant="light">
              Falta configurar VAULT_KEY en el servidor: sin esa clave no se pueden guardar credenciales.
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            Se guardan cifradas y nunca se vuelven a mostrar. Las usa el agente solo en los tickets que tenés asignados.
          </Text>
          <IntegrationCard kind="anthropic" status={status} onChange={setStatus} />
          <IntegrationCard kind="github" status={status} onChange={setStatus} />
        </Stack>
      )}
    </Modal>
  );
}
