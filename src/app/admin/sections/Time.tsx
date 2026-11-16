"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconClockPlus, IconDownload } from "@tabler/icons-react";
import { duration, todayLocal, useTimeEntries, weekStart, type TimeEntry } from "../lib/time";
import type { Me, PanelUser } from "../lib/tickets";
import { StatCard } from "./StatCard";
import { EntryRow, entryLabel, LogTimeModal } from "./TimeWidgets";

type Range = "semana" | "semana-pasada" | "mes" | "mes-pasado" | "otro";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthBounds(offset: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 12);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function bounds(range: Range, custom: { from: string; to: string }): { from: string; to: string } {
  const monday = weekStart();
  switch (range) {
    case "semana":
      return { from: monday, to: todayLocal() };
    case "semana-pasada":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "mes":
      return { from: monthBounds(0).from, to: todayLocal() };
    case "mes-pasado":
      return monthBounds(-1);
    default:
      return custom;
  }
}

function group(entries: TimeEntry[], key: (e: TimeEntry) => string): Array<{ name: string; minutes: number }> {
  const map = new Map<string, number>();
  for (const e of entries) map.set(key(e), (map.get(key(e)) ?? 0) + (e.minutes ?? 0));
  return [...map].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
}

function downloadCsv(entries: TimeEntry[], from: string, to: string) {
  const escape = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Fecha", "Persona", "Cliente", "Ticket", "Título", "Minutos", "Horas", "Detalle"],
    ...entries
      .filter((e) => e.minutes)
      .map((e) => [
        e.workDate,
        e.userName,
        e.clientName ?? "Interno",
        e.ticketNumber,
        e.ticketTitle,
        e.minutes,
        ((e.minutes ?? 0) / 60).toFixed(2).replace(".", ","),
        e.note,
      ]),
  ];
  // BOM + punto y coma: Excel en español lo abre bien sin tocar nada.
  const csv = "﻿" + rows.map((row) => row.map(escape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `horas_${from}_${to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function TimeSection({
  me,
  users,
  clients,
}: {
  me: Me;
  users: PanelUser[];
  clients: Array<{ id: string; name: string }>;
}) {
  const all = me.permissions.includes("time.all");
  const [range, setRange] = useState<Range>("semana");
  const [custom, setCustom] = useState({ from: weekStart(), to: todayLocal() });
  const [userId, setUserId] = useState<string | null>(all ? null : me.id);
  const [clientId, setClientId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const { from, to } = bounds(range, custom);

  const query = useMemo(() => {
    if (!me.id && !all) return null;
    const params = new URLSearchParams({ from, to });
    if (userId) params.set("userId", userId);
    if (clientId) params.set("clientId", clientId);
    return params.toString();
  }, [from, to, userId, clientId, me.id, all]);
  const { entries, error } = useTimeEntries(query);

  const closed = (entries ?? []).filter((e) => e.minutes);
  const total = closed.reduce((s, e) => s + (e.minutes ?? 0), 0);
  const byClient = group(closed, (e) => e.clientName ?? "Interno");
  const byUser = group(closed, (e) => e.userName ?? "?");
  const days = new Set(closed.map((e) => e.workDate)).size;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Horas</Title>
          <Text size="sm" c="dimmed">
            {all ? "Lo que trabajó el equipo, por cliente y por persona." : "Lo que trabajaste, por cliente y por ticket."}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            disabled={!closed.length}
            onClick={() => downloadCsv(closed, from, to)}
          >
            Exportar
          </Button>
          {me.id && (
            <Button leftSection={<IconClockPlus size={16} />} onClick={() => setLogOpen(true)}>
              Cargar horas
            </Button>
          )}
        </Group>
      </Group>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <SegmentedControl
          value={range}
          onChange={(value) => setRange(value as Range)}
          data={[
            { value: "semana", label: "Esta semana" },
            { value: "semana-pasada", label: "Semana pasada" },
            { value: "mes", label: "Este mes" },
            { value: "mes-pasado", label: "Mes pasado" },
            { value: "otro", label: "Otro" },
          ]}
        />
        {range === "otro" && (
          <>
            <TextInput type="date" label="Desde" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.currentTarget.value })} />
            <TextInput type="date" label="Hasta" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.currentTarget.value })} />
          </>
        )}
        {all && (
          <Select
            placeholder="Todo el equipo"
            data={users.map((u) => ({ value: u.id, label: u.id === me.id ? `${u.name} (vos)` : u.name }))}
            value={userId}
            onChange={setUserId}
            clearable
            searchable
            w={200}
          />
        )}
        <Select
          placeholder="Todos los clientes"
          data={clients.map((c) => ({ value: c.id, label: c.name }))}
          value={clientId}
          onChange={setClientId}
          clearable
          searchable
          w={220}
        />
      </Group>

      {error && <Alert color="yellow">{error}</Alert>}
      {!me.id && !all && <Alert color="yellow">Entrá con tu usuario para ver tus horas.</Alert>}

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard label="Total" value={duration(total)} hint={`${from.split("-").reverse().join("/")} al ${to.split("-").reverse().join("/")}`} />
        <StatCard label="Días con carga" value={String(days)} hint={days ? `${duration(Math.round(total / days))} por día` : undefined} />
        <StatCard label="Clientes" value={String(byClient.filter((c) => c.name !== "Interno").length)} />
        <StatCard
          label="Interno"
          value={duration(byClient.find((c) => c.name === "Interno")?.minutes ?? 0)}
          hint="Sin cliente"
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: all && !userId ? 3 : 2 }} spacing="md">
        <Breakdown title="Por cliente" rows={byClient} total={total} />
        {all && !userId && <Breakdown title="Por persona" rows={byUser} total={total} />}
        <Breakdown title="Por ticket" rows={group(closed.filter((e) => e.ticketNumber), (e) => entryLabel(e)).slice(0, 10)} total={total} />
      </SimpleGrid>

      <Paper>
        <Text fw={600} px="md" pt="sm" pb={6}>
          Detalle
        </Text>
        {entries === null && (
          <Text size="sm" c="dimmed" px="md" pb="md">
            Cargando…
          </Text>
        )}
        {entries?.length === 0 && (
          <Text size="sm" c="dimmed" px="md" pb="md">
            No hay horas en este período.
          </Text>
        )}
        {entries?.map((entry, index) => (
          <EntryRow key={entry.id} entry={entry} me={me} first={index === 0} showUser={all} />
        ))}
      </Paper>

      <LogTimeModal opened={logOpen} onClose={() => setLogOpen(false)} clients={clients} />
    </Stack>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: Array<{ name: string; minutes: number }>; total: number }) {
  return (
    <Paper p="md">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      {rows.length === 0 && (
        <Text size="sm" c="dimmed">
          Sin datos.
        </Text>
      )}
      <Stack gap={6}>
        {rows.map((row) => (
          <div key={row.name}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" truncate>
                {row.name}
              </Text>
              <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>
                {duration(row.minutes)}
              </Text>
            </Group>
            <div style={{ height: 4, borderRadius: 2, background: "var(--mantine-color-default-border)" }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: `${total ? Math.max(2, (row.minutes / total) * 100) : 0}%`,
                  background: "var(--mantine-color-brand-filled)",
                }}
              />
            </div>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}
