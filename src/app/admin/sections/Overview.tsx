"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconBrandWhatsapp, IconFileDownload, IconRefresh } from "@tabler/icons-react";
import { api } from "../lib/api";
import { bothCurrencies, money, shortDate } from "../lib/format";
import { StatCard } from "./StatCard";

type Amounts = { ARS: number; USD: number };
type Totals = { totalArs: number; totalUsd: number };
type CollectionRow = {
  clientId: string;
  name: string;
  phone: string | null;
  currency: string;
  state: string;
  amountDue: number;
  unpaidCount: number;
  daysOverdue: number | null;
};
type Overview = {
  period: string;
  periodLabel: string;
  dueDate: string;
  daysUntilDue: number;
  rate: { usd: number; available: boolean };
  summary: {
    billed: Amounts;
    paid: Amounts;
    pending: Amounts;
    overdue: Amounts;
    invoices: number;
    paidInvoices: number;
    totals: { billed: Totals; paid: Totals; overdue: Totals };
  };
  collected: { amounts: Amounts; count: number };
  collection: CollectionRow[];
  tickets: { new: number; open: number; bugs: number; features: number } | null;
};
type Stats = {
  rate: { usd: number; available: boolean };
  earnings: Totals & { ars: number; usd: number };
  costs: Totals;
  net: Totals;
  clientsCount: number;
  costsCount: number;
};

function whatsappUrl(row: CollectionRow, periodLabel: string): string {
  const text =
    `¡Hola ${row.name}! 👋 Somos el equipo de Magon. ` +
    `Te escribimos para recordarte que tu suscripción de ${periodLabel} está lista para abonar: ${money(row.amountDue, row.currency)}. ` +
    `Tenés tiempo hasta el 10 para hacerlo, sin apuro. ¡Gracias por confiar en nosotros! 🙌`;
  return `https://wa.me/${(row.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

function dueText(row: CollectionRow, periodLabel: string): string {
  if (row.state === "active") return `${periodLabel} pagado`;
  if (row.daysOverdue === null) return "—";
  if (row.daysOverdue > 0) return `${row.daysOverdue} día(s) de atraso · ${row.unpaidCount} factura(s)`;
  if (row.daysOverdue === 0) return "Vence hoy";
  return `Vence en ${-row.daysOverdue} día(s)`;
}

const STATE_BADGE: Record<string, { label: string; color: string }> = {
  blocked: { label: "Vencido", color: "red" },
  due: { label: "Por vencer", color: "yellow" },
  active: { label: "Al día", color: "teal" },
};

export function Overview({ onOpenBoard }: { onOpenBoard: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaid, setShowPaid] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, dashboard] = await Promise.all([
        api<{ overview: Overview }>("/api/admin/overview"),
        api<Stats>("/api/admin/dashboard"),
      ]);
      setData(overview.overview);
      setStats(dashboard);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return error ? (
      <Alert color="red">{error}</Alert>
    ) : (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  const summary = data.summary;
  const progress =
    summary.totals.billed.totalArs > 0
      ? Math.min(100, Math.round((summary.totals.paid.totalArs / summary.totals.billed.totalArs) * 100))
      : 0;
  const rows = data.collection.filter((row) => showPaid || row.state !== "active");
  const fmt = (t: Totals) => (currency === "USD" ? money(t.totalUsd, "USD") : money(t.totalArs, "ARS"));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Cobranza de {data.periodLabel}</Title>
          <Text size="sm" c="dimmed">
            Vence el {shortDate(data.dueDate)} ·{" "}
            {data.daysUntilDue > 0
              ? `faltan ${data.daysUntilDue} día(s)`
              : data.daysUntilDue === 0
                ? "vence hoy"
                : `venció hace ${-data.daysUntilDue} día(s)`}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            component="a"
            href={`/api/admin/billing/notice?all=1&period=${data.period}`}
            variant="default"
            leftSection={<IconFileDownload size={16} />}
          >
            Avisos de cobro (PDF)
          </Button>
          <Tooltip label="Actualizar">
            <ActionIcon variant="default" size="lg" loading={loading} onClick={() => void load()} aria-label="Actualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Paper p="md">
        <Group justify="space-between" mb={8}>
          <Text size="sm">
            <b>{summary.paidInvoices}</b> de <b>{summary.invoices}</b> clientes pagaron
          </Text>
          <Text size="sm" c="dimmed">
            {progress}% cobrado
          </Text>
        </Group>
        <Progress value={progress} color="teal" size="lg" radius="xl" />
      </Paper>

      <SimpleGrid cols={{ base: 1, xs: 2, md: 5 }} spacing="sm">
        <StatCard label="Facturado del período" value={bothCurrencies(summary.billed)} hint={`${summary.invoices} factura(s)`} />
        <StatCard label="Cobrado del período" value={bothCurrencies(summary.paid)} color="teal" />
        <StatCard label="Falta cobrar" value={bothCurrencies(summary.pending)} color="yellow" />
        <StatCard
          label="Vencido"
          value={bothCurrencies(summary.overdue)}
          color={summary.totals.overdue.totalArs > 0 ? "red" : undefined}
          hint="Impago con el vencimiento pasado"
        />
        <StatCard
          label="Entró este mes"
          value={bothCurrencies(data.collected.amounts)}
          hint={`${data.collected.count} pago(s) de cualquier período`}
        />
      </SimpleGrid>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper>
            <Group justify="space-between" p="md" pb="xs">
              <div>
                <Title order={2}>A quién cobrarle</Title>
                <Text size="xs" c="dimmed">
                  {data.collection.filter((r) => r.state !== "active").length} cliente(s) con saldo
                </Text>
              </div>
              <Button size="xs" variant="default" onClick={() => setShowPaid((v) => !v)}>
                {showPaid ? "Ocultar al día" : "Ver al día"}
              </Button>
            </Group>
            <Stack gap={0}>
              {rows.map((row) => {
                const badge = STATE_BADGE[row.state] ?? { label: "Sin datos", color: "gray" };
                return (
                  <Group
                    key={row.clientId}
                    px="md"
                    py="sm"
                    justify="space-between"
                    wrap="nowrap"
                    style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Group gap={8} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                          {row.name}
                        </Text>
                        <Badge size="xs" color={badge.color}>
                          {badge.label}
                        </Badge>
                      </Group>
                      <Text size="xs" c={row.state === "blocked" ? "red" : "dimmed"}>
                        {dueText(row, data.periodLabel)}
                      </Text>
                    </div>
                    <Group gap="sm" wrap="nowrap">
                      <Text size="sm" fw={700}>
                        {money(row.amountDue, row.currency)}
                      </Text>
                      <Tooltip label={`Aviso de cobro de ${data.periodLabel}`}>
                        <ActionIcon
                          component="a"
                          href={`/api/admin/billing/notice?clientId=${row.clientId}&period=${data.period}`}
                          variant="light"
                          color="gray"
                          aria-label="Descargar aviso de cobro"
                        >
                          <IconFileDownload size={16} />
                        </ActionIcon>
                      </Tooltip>
                      {row.amountDue > 0 && (
                        <Tooltip label={row.phone ? "Mandar recordatorio" : "Sin WhatsApp cargado"}>
                          <ActionIcon
                            component="a"
                            href={row.phone ? whatsappUrl(row, data.periodLabel) : undefined}
                            target="_blank"
                            rel="noreferrer"
                            variant="light"
                            color="teal"
                            disabled={!row.phone}
                            aria-label="WhatsApp"
                          >
                            <IconBrandWhatsapp size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                );
              })}
              {rows.length === 0 && (
                <Text size="sm" c="dimmed" p="md">
                  No hay saldos pendientes.
                </Text>
              )}
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            {data.tickets && (
              <Paper p="md">
                <Title order={2} mb="xs">
                  Tickets
                </Title>
                <Group align="baseline" gap={6}>
                  <Text fz={30} fw={800} c={data.tickets.new ? "yellow.7" : undefined}>
                    {data.tickets.new}
                  </Text>
                  <Text size="sm">nuevo(s) sin revisar</Text>
                </Group>
                <Text size="xs" c="dimmed" mb="sm">
                  {data.tickets.open} abierto(s) · {data.tickets.bugs} problema(s) · {data.tickets.features} funcionalidad(es)
                </Text>
                <Button size="xs" variant="light" onClick={onOpenBoard} fullWidth>
                  Abrir tablero
                </Button>
              </Paper>
            )}
            {stats && (
              <Paper p="md">
                <Group justify="space-between" mb="sm">
                  <Title order={2}>Rentabilidad mensual</Title>
                  <SegmentedControl
                    size="xs"
                    value={currency}
                    onChange={(v) => setCurrency(v as "USD" | "ARS")}
                    data={["USD", "ARS"]}
                  />
                </Group>
                <Stack gap={8}>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Abonos ({stats.clientsCount} clientes)
                    </Text>
                    <Text size="sm" fw={600}>
                      {fmt(stats.earnings)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Costos fijos ({stats.costsCount})
                    </Text>
                    <Text size="sm" fw={600}>
                      − {fmt(stats.costs)}
                    </Text>
                  </Group>
                  <Group justify="space-between" pt={8} style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
                    <Text size="sm" fw={600}>
                      Ganancia
                    </Text>
                    <Text size="lg" fw={800} c={stats.net.totalUsd >= 0 ? "teal" : "red"}>
                      {fmt(stats.net)}
                    </Text>
                  </Group>
                  {stats.rate.available && (
                    <Text size="xs" c="dimmed">
                      Dólar oficial ${stats.rate.usd.toFixed(2)}
                    </Text>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
