"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Box, Button, Center, Loader, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { Brand } from "../Brand";

function InviteForm() {
  const token = useSearchParams().get("token") ?? "";
  const [invite, setInvite] = useState<{ name: string; email: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/invite?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => (data.ok ? setInvite(data.invite) : setLoadError(data.error)))
      .catch(() => setLoadError("No se pudo validar la invitación"));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setSaving(true);
    setError(null);
    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) {
      window.location.href = "/admin";
      return;
    }
    setError(data.error ?? "No se pudo guardar la contraseña");
    setSaving(false);
  }

  if (!invite && !loadError) return <Loader />;

  return (
    <Paper p="xl" shadow="sm">
      {loadError ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Invitación no válida">
          {loadError}
        </Alert>
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            <div>
              <Title order={2}>Hola, {invite?.name}</Title>
              <Text size="sm" c="dimmed">
                Elegí tu contraseña para entrar al panel con {invite?.email}.
              </Text>
            </div>
            <PasswordInput
              label="Contraseña"
              description="Al menos 10 caracteres, con letras y números"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="new-password"
              required
              autoFocus
            />
            <PasswordInput
              label="Repetila"
              value={repeat}
              onChange={(e) => setRepeat(e.currentTarget.value)}
              autoComplete="new-password"
              required
            />
            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} py="xs">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={saving} fullWidth>
              Guardar y entrar
            </Button>
          </Stack>
        </form>
      )}
    </Paper>
  );
}

export default function InvitePage() {
  return (
    <Center mih="100dvh" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
      <Box w="100%" maw={400}>
        <Center mb="lg">
          <Brand size="lg" />
        </Center>
        <Suspense fallback={<Loader />}>
          <InviteForm />
        </Suspense>
      </Box>
    </Center>
  );
}
