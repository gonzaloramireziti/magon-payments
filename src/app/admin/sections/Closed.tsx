"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import { IconSearch, IconX } from "@tabler/icons-react";
import { TicketList } from "../board/Board";
import { matchesSearch, sortTickets, type SortKey } from "../board/filter";
import { closedStats, inPeriod, type ClosedKind, type Period } from "../board/closed";
import type { Me, Ticket } from "../lib/tickets";
import { StatCard } from "./StatCard";

export function Closed({
  tickets,
  state,
  me,
  onOpen,
}: {
  tickets: Ticket[];
  state: "loading" | "ready" | "unavailable";
  me: Me;
  onOpen: (id: string) => void;
}) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [kind, setKind] = useState<ClosedKind>("all");
  const [period, setPeriod] = useState<Period>("30");
  const [clientId, setClientId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [searchRaw, setSearch] = useState("");
  const [search] = useDebouncedValue(searchRaw, 150);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "updated", desc: true });

  const closed = useMemo(
    () => tickets.filter((t) => t.status === "done" || t.status === "discarded"),
    [tickets]
  );
  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of closed) map.set(t.client_id, t.client_name);
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [closed]);

  const visible = useMemo(() => {
    const filtered = closed.filter(
      (t) =>
        (kind === "all" || (kind === "done" ? t.status === "done" : t.status === "discarded")) &&
        inPeriod(t, period) &&
        (!clientId || t.client_id === clientId) &&
        (!type || t.type === type) &&
        matchesSearch(t, search)
    );
    return sortTickets(filtered, sort.key, sort.desc);
  }, [closed, kind, period, clientId, type, search, sort]);

  const stats = useMemo(() => closedStats(closed.filter((t) => inPeriod(t, period))), [closed, period]);

  if (state === "loading") {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={1}>Terminados</Title>
        <Text size="sm" c="dimmed">
          Tickets resueltos y descartados. Abrí uno para ver su historial o reabrirlo.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard label="Resueltos" value={String(stats.done)} color="teal" />
        <StatCard label="Descartados" value={String(stats.discarded)} />
        <StatCard
          label="Tiempo medio de resolución"
          value={stats.avgDays === null ? "—" : stats.avgDays < 1 ? "menos de 1 día" : `${stats.avgDays.toFixed(1)} días`}
          hint="Desde que el cliente lo cargó hasta que se resolvió"
        />
        <StatCard label="Problemas / funcionalidades" value={`${stats.bugs} / ${stats.features}`} hint="Resueltos" />
      </SimpleGrid>

      <Group gap="xs" align="flex-end">
        <TextInput
          size="xs"
          placeholder="Buscar por título, #número, cliente…"
          leftSection={<IconSearch size={14} />}
          value={searchRaw}
          onChange={(e) => setSearch(e.currentTarget.value)}
          rightSection={
            searchRaw ? (
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSearch("")}>
                <IconX size={12} />
              </ActionIcon>
            ) : null
          }
          w={mobile ? "100%" : 260}
        />
        <SegmentedControl
          size="xs"
          value={kind}
          onChange={(v) => setKind(v as ClosedKind)}
          data={[
            { value: "all", label: "Todos" },
            { value: "done", label: "Resueltos" },
            { value: "discarded", label: "Descartados" },
          ]}
        />
        <Select
          size="xs"
          value={period}
          allowDeselect={false}
          onChange={(v) => v && setPeriod(v as Period)}
          data={[
            { value: "7", label: "Últimos 7 días" },
            { value: "30", label: "Últimos 30 días" },
            { value: "90", label: "Últimos 90 días" },
            { value: "all", label: "Todo" },
          ]}
          w={mobile ? "100%" : 160}
        />
        <Select
          size="xs"
          placeholder="Cliente"
          clearable
          searchable
          data={clients}
          value={clientId}
          onChange={setClientId}
          w={mobile ? "100%" : 180}
        />
        <Select
          size="xs"
          placeholder="Tipo"
          clearable
          data={[
            { value: "bug", label: "Problemas" },
            { value: "feature", label: "Funcionalidades" },
          ]}
          value={type}
          onChange={setType}
          w={mobile ? "100%" : 150}
        />
      </Group>

      <TicketList tickets={visible} sort={sort} setSort={setSort} mobile={Boolean(mobile)} me={me} onOpen={onOpen} />
    </Stack>
  );
}
