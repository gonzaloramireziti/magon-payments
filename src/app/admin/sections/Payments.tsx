"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { api, notifyError } from "../lib/api";
import { bothCurrencies, dateTime, money } from "../lib/format";

type Payment = {
  id: string;
  clientId: string;
  clientName: string;
  provider: string;
  status: string;
  method: string | null;
  amount: number;
  netAmount: number | null;
  currency: string;
  period: string | null;
  note: string | null;
  createdAt: string;
};

const STATUS: Record<string, { label: string; color: string }> = {
  approved: { label: "Acreditado", color: "teal" },
  pending: { label: "Pendiente", color: "yellow" },
  rejected: { label: "Rechazado", color: "red" },
  cancelled: { label: "Cancelado", color: "gray" },
  canceled: { label: "Cancelado", color: "gray" },
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function medium(payment: Payment): string {
  return payment.provider === "manual"
    ? `${payment.method ?? "Manual"} (manual)`
    : `GalioPay${payment.method ? ` · ${payment.method}` : ""}`;
}

export function Payments() {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Array<{ value: string; label: string }>>([]);
  const [month, setMonth] = useState(currentMonth());
  const [clientId, setClientId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>("approved");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ clients: Array<{ id: string; name: string }> }>("/api/admin/clients")
      .then((data) => setClients(data.clients.map((c) => ({ value: c.id, label: c.name }))))
      .catch(() => setClients([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (clientId) params.set("clientId", clientId);
    if (status) params.set("status", status);
    try {
      const data = await api<{ payments: Payment[] }>(`/api/admin/payments?${params}`);
      setPayments(data.payments);
    } catch (error) {
      notifyError(error);
    } finally {
      setLoading(false);
    }
  }, [month, clientId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(() => {
    const amounts = { ARS: 0, USD: 0 };
    for (const p of payments) if (p.status === "approved") amounts[p.currency === "USD" ? "USD" : "ARS"] += p.amount;
    return amounts;
  }, [payments]);

  return (
    <Stack gap="md">
      <div>
        <Title order={1}>Cobros</Title>
        <Text size="sm" c="dimmed">
          {payments.length} movimiento(s) · acreditado {bothCurrencies(total)}
        </Text>
      </div>

      <Group gap="xs" align="flex-end">
        <TextInput
          size="xs"
          type="month"
          label="Mes"
          value={month}
          onChange={(e) => setMonth(e.currentTarget.value)}
          w={mobile ? "100%" : 170}
        />
        <Select
          size="xs"
          label="Cliente"
          placeholder="Todos"
          clearable
          searchable
          data={clients}
          value={clientId}
          onChange={setClientId}
          w={mobile ? "100%" : 200}
        />
        <Select
          size="xs"
          label="Estado"
          placeholder="Todos"
          clearable
          data={[
            { value: "approved", label: "Acreditados" },
            { value: "pending", label: "Pendientes" },
          ]}
          value={status}
          onChange={setStatus}
          w={mobile ? "100%" : 150}
        />
        <Button size="xs" variant="default" onClick={() => setMonth("")} disabled={!month}>
          Todos los meses
        </Button>
      </Group>

      {mobile ? (
        <Stack gap="xs">
          {payments.map((p) => (
            <Paper key={p.id} p="sm">
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" fw={600} truncate>
                  {p.clientName}
                </Text>
                <Text size="sm" fw={700}>
                  {money(p.amount, p.currency)}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {dateTime(p.createdAt)} · {medium(p)} · {p.period ?? "sin período"}
              </Text>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Paper>
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Período</Table.Th>
                  <Table.Th>Medio</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th ta="right">Monto</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {payments.map((p) => {
                  const badge = STATUS[p.status] ?? { label: p.status, color: "gray" };
                  return (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Text size="sm">{dateTime(p.createdAt)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {p.clientName}
                        </Text>
                        {p.note && (
                          <Text size="xs" c="dimmed">
                            {p.note}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{p.period ?? "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{medium(p)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={badge.color} variant="dot">
                          {badge.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={700}>
                          {money(p.amount, p.currency)}
                        </Text>
                        {p.netAmount !== null && p.netAmount !== p.amount && (
                          <Text size="xs" c="dimmed">
                            neto {money(p.netAmount, p.currency)}
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      {!loading && payments.length === 0 && (
        <Text size="sm" c="dimmed" ta="center">
          No hay movimientos con estos filtros.
        </Text>
      )}
    </Stack>
  );
}
