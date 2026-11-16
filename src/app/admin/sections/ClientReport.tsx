"use client";

import { useEffect, useState } from "react";
import { Alert, Button, CopyButton, Group, Modal, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { IconCheck, IconCopy, IconSend } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";

type Report = { period: string; periodLabel: string; client: { email: string | null }; text: string };

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Reporte mensual del cliente: se revisa, se puede editar y se copia o se manda por correo. */
export function ClientReportModal({ client, onClose }: { client: { id: string; name: string }; onClose: () => void }) {
  const [period, setPeriod] = useState(lastMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setReport(null);
    setError(null);
    api<{ report: Report }>(`/api/admin/reports?clientId=${encodeURIComponent(client.id)}&period=${period}`)
      .then((data) => {
        setReport(data.report);
        setText(data.report.text);
        setTo((current) => current || data.report.client.email || "");
      })
      .catch((err: Error) => setError(err.message));
  }, [client.id, period]);

  async function send() {
    if (!window.confirm(`¿Mandar el resumen de ${report?.periodLabel ?? period} a ${to}?`)) return;
    setSending(true);
    try {
      const data = await api<{ sentTo: string }>("/api/admin/reports", {
        method: "POST",
        json: { clientId: client.id, period, to, text },
      });
      notifyOk(`Resumen enviado a ${data.sentTo}`);
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={`Resumen mensual · ${client.name}`} size="lg">
      <Stack gap="sm">
        <TextInput label="Mes" type="month" value={period} onChange={(e) => e.currentTarget.value && setPeriod(e.currentTarget.value)} w={200} />
        {error && <Alert color="red">{error}</Alert>}
        {!report && !error && (
          <Text size="sm" c="dimmed">
            Armando el resumen…
          </Text>
        )}
        {report && (
          <>
            <Textarea
              label="Texto (lo podés editar antes de mandarlo)"
              autosize
              minRows={10}
              maxRows={22}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
            />
            <TextInput label="Mandar a" placeholder="email del cliente" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
            <Group justify="space-between">
              <CopyButton value={text}>
                {({ copied, copy }) => (
                  <Button variant="default" onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>
                    {copied ? "Copiado" : "Copiar (para WhatsApp)"}
                  </Button>
                )}
              </CopyButton>
              <Button leftSection={<IconSend size={16} />} onClick={send} loading={sending} disabled={!to.includes("@") || !text.trim()}>
                Mandar por correo
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
