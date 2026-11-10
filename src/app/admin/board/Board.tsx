"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Drawer,
  Group,
  Indicator,
  Loader,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import {
  IconAdjustmentsHorizontal,
  IconArrowsSort,
  IconLayoutKanban,
  IconList,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { initials, relative } from "../lib/format";
import {
  COLUMNS,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE,
  URGENCY,
  isClosed,
  type Me,
  type PanelUser,
  type Ticket,
  type TicketStatus,
  type TicketUrgency,
} from "../lib/tickets";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  allLabels,
  applyFilters,
  positionBetween,
  recentlyResolved,
  sortTickets,
  type BoardFilters,
  type SortKey,
} from "./filter";
import { TicketCard } from "./TicketCard";
import { NewTicketModal, type ClientOption } from "./NewTicketModal";

export type TicketChanges = Partial<{
  status: TicketStatus;
  urgency: TicketUrgency;
  assigneeId: string | null;
  labels: string[];
  position: number;
}>;

const FILTERS_KEY = "magon.board.filters";
const VIEW_KEY = "magon.board.view";

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: se usan los valores por defecto */
  }
}

// Aplica los cambios al ticket en memoria antes de que responda el servidor.
export function applyLocal(ticket: Ticket, changes: TicketChanges, users: PanelUser[]): Ticket {
  const next = { ...ticket };
  if (changes.status) next.status = changes.status;
  if (changes.urgency) next.urgency = changes.urgency;
  if (changes.labels) next.labels = changes.labels;
  if (changes.position !== undefined) next.position = changes.position;
  if (changes.assigneeId !== undefined) {
    next.assignee_id = changes.assigneeId;
    next.assignee_name = users.find((user) => user.id === changes.assigneeId)?.name ?? null;
  }
  if (changes.status) {
    next.resolved_at = isClosed(changes.status) ? ticket.resolved_at ?? new Date().toISOString() : null;
  }
  next.updated_at = new Date().toISOString();
  return next;
}

export function Board({
  me,
  tickets,
  state,
  users,
  clientOptions,
  onPatch,
  reload,
  onCreated,
  setOpenTicketId,
}: {
  me: Me;
  tickets: Ticket[];
  state: "loading" | "ready" | "unavailable";
  users: PanelUser[];
  clientOptions: ClientOption[];
  onCreated: (id: string) => Promise<void>;
  onPatch: (id: string, changes: TicketChanges) => Promise<void>;
  reload: () => Promise<void>;
  setOpenTicketId: (id: string | null) => void;
}) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [filters, setFiltersState] = useState<BoardFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"board" | "list">("board");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TicketStatus | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "urgency", desc: false });
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search] = useDebouncedValue(filters.search, 150);

  useEffect(() => {
    setFiltersState(readStored(FILTERS_KEY, EMPTY_FILTERS));
    setView(readStored<{ view: "board" | "list" }>(VIEW_KEY, { view: "board" }).view);
  }, []);

  function setFilters(update: Partial<BoardFilters>) {
    setFiltersState((current) => {
      const next = { ...current, ...update };
      writeStored(FILTERS_KEY, next);
      return next;
    });
  }

  function changeView(value: "board" | "list") {
    setView(value);
    writeStored(VIEW_KEY, { view: value });
  }

  const patch = onPatch;


  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const ticket of tickets) map.set(ticket.client_id, ticket.client_name);
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [tickets]);
  const labels = useMemo(() => allLabels(tickets), [tickets]);
  const visible = useMemo(
    () => applyFilters(tickets, { ...filters, search }, me.id),
    [tickets, filters, search, me.id]
  );
  const filterCount = activeFilterCount(filters);
  const openCount = visible.filter((ticket) => !isClosed(ticket.status)).length;

  const columns = filters.showClosed
    ? [...COLUMNS, { status: "discarded" as TicketStatus, label: "Descartado", color: "gray" }]
    : COLUMNS;

  function columnTickets(status: TicketStatus): Ticket[] {
    return visible
      .filter((ticket) => ticket.status === status)
      .filter((ticket) => status !== "done" || filters.showClosed || recentlyResolved(ticket))
      .sort((a, b) => a.position - b.position);
  }

  function drop(event: DragEvent, status: TicketStatus, beforeId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setOverColumn(null);
    const id = dragId ?? event.dataTransfer.getData("text/plain");
    setDragId(null);
    if (!id || id === beforeId) return;
    const target = columnTickets(status).filter((ticket) => ticket.id !== id);
    const index = beforeId ? target.findIndex((ticket) => ticket.id === beforeId) : target.length;
    void patch(id, { status, position: positionBetween(target[index - 1], target[index]) });
  }

  const userOptions = users
    .filter((user) => user.active)
    .map((user) => ({ value: `user:${user.id}`, label: user.name }));

  const filterControls = (
    <>
      <SegmentedControl
        size="xs"
        value={filters.scope.startsWith("user:") ? "all" : filters.scope}
        onChange={(value) => setFilters({ scope: value as BoardFilters["scope"] })}
        data={[
          { value: "all", label: "Todos" },
          { value: "mine", label: "Míos", disabled: !me.id },
          { value: "unassigned", label: "Sin asignar" },
        ]}
      />
      <Select
        size="xs"
        placeholder="Responsable"
        clearable
        data={userOptions}
        value={filters.scope.startsWith("user:") ? filters.scope : null}
        onChange={(value) => setFilters({ scope: (value as BoardFilters["scope"]) ?? "all" })}
        w={mobile ? "100%" : 150}
      />
      <Select
        size="xs"
        placeholder="Cliente"
        clearable
        searchable
        data={clients}
        value={filters.clientId}
        onChange={(value) => setFilters({ clientId: value })}
        w={mobile ? "100%" : 170}
      />
      <Select
        size="xs"
        placeholder="Tipo"
        clearable
        data={[
          { value: "bug", label: "Problemas" },
          { value: "feature", label: "Funcionalidades" },
        ]}
        value={filters.type}
        onChange={(value) => setFilters({ type: value as BoardFilters["type"] })}
        w={mobile ? "100%" : 150}
      />
      <Select
        size="xs"
        placeholder="Urgencia"
        clearable
        data={(Object.keys(URGENCY) as TicketUrgency[]).map((key) => ({ value: key, label: URGENCY[key].label }))}
        value={filters.urgency}
        onChange={(value) => setFilters({ urgency: value as TicketUrgency | null })}
        w={mobile ? "100%" : 120}
      />
      <MultiSelect
        size="xs"
        placeholder={filters.labels.length ? undefined : "Etiquetas"}
        clearable
        searchable
        data={labels}
        value={filters.labels}
        onChange={(value) => setFilters({ labels: value })}
        w={mobile ? "100%" : 170}
        nothingFoundMessage="Sin etiquetas"
      />
      <Switch
        size="xs"
        label="Ver cerrados"
        checked={filters.showClosed}
        onChange={(event) => setFilters({ showClosed: event.currentTarget.checked })}
      />
      {(filterCount > 0 || filters.search) && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconX size={12} />}
          onClick={() => setFilters(EMPTY_FILTERS)}
        >
          Limpiar
        </Button>
      )}
    </>
  );

  if (state === "unavailable") {
    return (
      <Alert color="yellow" title="La ticketera no está habilitada">
        Falta correr las migraciones de tickets en Supabase.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <div>
          <Title order={1}>Tablero</Title>
          <Text size="sm" c="dimmed">
            {openCount} abierto(s){filterCount || filters.search ? " con estos filtros" : ""} · arrastrá las tarjetas o
            usá el menú de cada una
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label="Para pedidos que llegan por WhatsApp, correo o llamada" disabled={Boolean(mobile)}>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
              {mobile ? "Nuevo" : "Nuevo ticket"}
            </Button>
          </Tooltip>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(value) => changeView(value as "board" | "list")}
            data={[
              {
                value: "board",
                label: (
                  <Center style={{ gap: 6 }}>
                    <IconLayoutKanban size={14} />
                    {!mobile && <span>Tablero</span>}
                  </Center>
                ),
              },
              {
                value: "list",
                label: (
                  <Center style={{ gap: 6 }}>
                    <IconList size={14} />
                    {!mobile && <span>Lista</span>}
                  </Center>
                ),
              },
            ]}
          />
          <Tooltip label="Actualizar">
            <ActionIcon
              variant="default"
              size="md"
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await reload();
                setRefreshing(false);
              }}
              aria-label="Actualizar"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Group gap="xs" wrap={mobile ? "nowrap" : "wrap"}>
        <TextInput
          size="xs"
          placeholder="Buscar por título, #número, cliente, etiqueta…"
          leftSection={<IconSearch size={14} />}
          value={filters.search}
          onChange={(event) => setFilters({ search: event.currentTarget.value })}
          rightSection={
            filters.search ? (
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setFilters({ search: "" })}>
                <IconX size={12} />
              </ActionIcon>
            ) : null
          }
          style={{ flex: mobile ? 1 : "0 1 280px" }}
        />
        {mobile ? (
          <Indicator label={filterCount} size={16} disabled={!filterCount}>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconAdjustmentsHorizontal size={14} />}
              onClick={() => setFiltersOpen(true)}
            >
              Filtros
            </Button>
          </Indicator>
        ) : (
          filterControls
        )}
      </Group>

      <NewTicketModal
        opened={creating}
        onClose={() => setCreating(false)}
        me={me}
        clients={clientOptions}
        users={users}
        labelOptions={labels}
        onCreated={onCreated}
      />

      <Drawer opened={filtersOpen} onClose={() => setFiltersOpen(false)} position="bottom" title="Filtros" size="auto">
        <Stack gap="sm" pb="md">
          {filterControls}
          <Button onClick={() => setFiltersOpen(false)}>Ver {visible.length} ticket(s)</Button>
        </Stack>
      </Drawer>

      {state === "loading" ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : view === "board" ? (
        <div className="mg-board">
          {columns.map((column) => {
            const items = columnTickets(column.status);
            return (
              <div
                key={column.status}
                className="mg-column"
                data-over={overColumn === column.status}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverColumn(column.status);
                }}
                onDragLeave={() => setOverColumn((current) => (current === column.status ? null : current))}
                onDrop={(event) => drop(event, column.status, null)}
              >
                <Group justify="space-between" px="sm" pt="sm" pb={4}>
                  <Group gap={8}>
                    <Box w={8} h={8} style={{ borderRadius: 99, background: `var(--mantine-color-${column.color}-6)` }} />
                    <Text size="sm" fw={600}>
                      {column.label}
                    </Text>
                  </Group>
                  <Badge size="sm" variant="default">
                    {items.length}
                  </Badge>
                </Group>
                <div className="mg-column-body">
                  {items.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      me={me}
                      dragging={dragId === ticket.id}
                      onOpen={() => setOpenTicketId(ticket.id)}
                      onTake={() =>
                        void patch(ticket.id, {
                          assigneeId: me.id,
                          ...(ticket.status === "new" ? { status: "analysis" as TicketStatus } : {}),
                        })
                      }
                      onMove={(status) => void patch(ticket.id, { status })}
                      onDragStart={(event) => {
                        setDragId(ticket.id);
                        event.dataTransfer.setData("text/plain", ticket.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverColumn(null);
                      }}
                      onDrop={(event) => drop(event, column.status, ticket.id)}
                    />
                  ))}
                  {items.length === 0 && (
                    <Text size="xs" c="dimmed" ta="center" py="md">
                      {column.status === "done" && !filters.showClosed ? "Nada resuelto en 2 semanas" : "Sin tickets"}
                    </Text>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <TicketList
          tickets={sortTickets(
            visible.filter((ticket) => filters.showClosed || !isClosed(ticket.status)),
            sort.key,
            sort.desc
          )}
          sort={sort}
          setSort={setSort}
          mobile={Boolean(mobile)}
          me={me}
          onOpen={setOpenTicketId}
        />
      )}

    </Stack>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  setSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; desc: boolean };
  setSort: (value: { key: SortKey; desc: boolean }) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <UnstyledButton
      onClick={() => setSort({ key: sortKey, desc: active ? !sort.desc : sortKey !== "urgency" })}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <Text size="xs" fw={600} c={active ? undefined : "dimmed"} tt="uppercase">
        {label}
      </Text>
      <IconArrowsSort size={12} opacity={active ? 1 : 0.4} />
    </UnstyledButton>
  );
}

export function TicketList({
  tickets,
  sort,
  setSort,
  mobile,
  me,
  onOpen,
}: {
  tickets: Ticket[];
  sort: { key: SortKey; desc: boolean };
  setSort: (value: { key: SortKey; desc: boolean }) => void;
  mobile: boolean;
  me: Me;
  onOpen: (id: string) => void;
}) {
  if (tickets.length === 0) {
    return (
      <Paper p="xl">
        <Text ta="center" c="dimmed" size="sm">
          No hay tickets con estos filtros.
        </Text>
      </Paper>
    );
  }

  if (mobile) {
    return (
      <Stack gap="xs">
        {tickets.map((ticket) => (
          <Paper key={ticket.id} p="sm" className="mg-row" onClick={() => onOpen(ticket.id)}>
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Group gap={6}>
                <Text size="xs" c="dimmed">
                  #{ticket.number}
                </Text>
                <Badge size="xs" color={URGENCY[ticket.urgency].color}>
                  {URGENCY[ticket.urgency].label}
                </Badge>
                <Badge size="xs" color={STATUS_COLOR[ticket.status]} variant="dot">
                  {STATUS_LABEL[ticket.status]}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {relative(ticket.created_at)}
              </Text>
            </Group>
            <Text size="sm" fw={600} lineClamp={2}>
              {ticket.title}
            </Text>
            <Text size="xs" c="dimmed">
              {ticket.client_name} · {ticket.assignee_name ?? "Sin asignar"}
            </Text>
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <Paper>
      <Table.ScrollContainer minWidth={900}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={70}>
                <SortHeader label="#" sortKey="number" sort={sort} setSort={setSort} />
              </Table.Th>
              <Table.Th>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Título
                </Text>
              </Table.Th>
              <Table.Th>
                <SortHeader label="Cliente" sortKey="client" sort={sort} setSort={setSort} />
              </Table.Th>
              <Table.Th>
                <SortHeader label="Urgencia" sortKey="urgency" sort={sort} setSort={setSort} />
              </Table.Th>
              <Table.Th miw={150}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Estado
                </Text>
              </Table.Th>
              <Table.Th>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Responsable
                </Text>
              </Table.Th>
              <Table.Th>
                <SortHeader label="Creado" sortKey="created" sort={sort} setSort={setSort} />
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tickets.map((ticket) => (
              <Table.Tr key={ticket.id} className="mg-row" onClick={() => onOpen(ticket.id)}>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    #{ticket.number}
                  </Text>
                </Table.Td>
                <Table.Td maw={380}>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" color={TYPE[ticket.type].color}>
                      {TYPE[ticket.type].label}
                    </Badge>
                    <Text size="sm" fw={500} truncate>
                      {ticket.title}
                    </Text>
                  </Group>
                  {ticket.labels.length > 0 && (
                    <Group gap={4} mt={4}>
                      {ticket.labels.map((label) => (
                        <Badge key={label} size="xs" variant="outline" color="gray" tt="none">
                          {label}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{ticket.client_name}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={URGENCY[ticket.urgency].color}>{URGENCY[ticket.urgency].label}</Badge>
                </Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>
                  <Badge color={STATUS_COLOR[ticket.status]} variant="dot" style={{ overflow: "visible" }}>
                    {STATUS_LABEL[ticket.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {ticket.assignee_name ? (
                    <Group gap={6} wrap="nowrap">
                      <Avatar size={22} radius="xl" color={ticket.assignee_id === me.id ? "brand" : "gray"}>
                        <Text fz={10} fw={700}>
                          {initials(ticket.assignee_name)}
                        </Text>
                      </Avatar>
                      <Text size="sm">{ticket.assignee_name}</Text>
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Sin asignar
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {relative(ticket.created_at)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
