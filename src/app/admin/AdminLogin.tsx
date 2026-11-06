"use client";

import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { Brand } from "./Brand";

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No autorizado");
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Center mih="100dvh" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
      <Box w="100%" maw={380}>
        <Center mb="lg">
          <Brand size="lg" />
        </Center>
        <Paper p="xl" shadow="sm">
          <form onSubmit={submit}>
            <Stack gap="md">
              <div>
                <Title order={2}>Ingresar</Title>
                <Text size="sm" c="dimmed">
                  Panel de cobros y tickets de Magon
                </Text>
              </div>
              <TextInput
                label="Email"
                placeholder="vos@magonsoftware.com"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                autoComplete="username"
                required
                autoFocus
              />
              <PasswordInput
                label="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                autoComplete="current-password"
                required
              />
              {error && (
                <Alert color="red" icon={<IconAlertCircle size={16} />} py="xs">
                  {error}
                </Alert>
              )}
              <Button type="submit" loading={loading} fullWidth>
                Ingresar
              </Button>
            </Stack>
          </form>
        </Paper>
      </Box>
    </Center>
  );
}
