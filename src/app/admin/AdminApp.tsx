"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Kbd,
  Menu,
  NavLink,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { Spotlight, spotlight, type SpotlightActionData } from "@mantine/spotlight";
import {
  IconBug,
  IconBulb,
  IconBuildingStore,
  IconCash,
  IconChartPie,
  IconLayoutKanban,
  IconLogout,
  IconMoon,
  IconReceipt2,
  IconSearch,
  IconSun,
  IconUsers,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { Brand } from "./Brand";
import { Board } from "./board/Board";
import { Overview } from "./sections/Overview";
import { Clients } from "./sections/Clients";
import { Payments } from "./sections/Payments";
import { Costs } from "./sections/Costs";
import { Users } from "./sections/Users";
import { api, notifyError } from "./lib/api";
import { initials } from "./lib/format";
import { isClosed, type Me, type PanelUser, type Ticket } from "./lib/tickets";

const SECTIONS = [
  { id: "tablero", label: "Tablero", icon: IconLayoutKanban },
  { id: "resumen", label: "Resumen", icon: IconChartPie },
  { id: "clientes", label: "Clientes", icon: IconBuildingStore },
  { id: "cobros", label: "Cobros", icon: IconCash },
  { id: "costos", label: "Costos", icon: IconReceipt2 },
  { id: "usuarios", label: "Usuarios", icon: IconUsers },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function sectionFromHash(): SectionId {
  if (typeof window === "undefined") return "tablero";
  const hash = window.location.hash.replace("#", "");
  return SECTIONS.some((s) => s.id === hash) ? (hash as SectionId) : "tablero";
}

export function AdminApp({ me }: { me: Me }) {
  const [section, setSection] = useState<SectionId>("tablero");
  const [navOpen, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsState, setTicketsState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string; notes: string | null }>>([]);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [clientFocus, setClientFocus] = useState<string | null>(null);
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");

  useEffect(() => {
    setSection(sectionFromHash());
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback(
    (id: SectionId) => {
      if (window.location.hash !== `#${id}`) window.location.hash = id;
      setSection(id);
      closeNav();
    },
    [closeNav]
  );

  // Descartados incluidos: el tablero los oculta, pero el buscador y la lista los necesitan.
  const loadTickets = useCallback(async () => {
    try {
      const data = await api<{ tickets: Ticket[] }>("/api/admin/tickets?discarded=1");
      setTickets(data.tickets);
      setTicketsState("ready");
    } catch (error) {
      if ((error as { code?: string }).code === "TICKETS_UNAVAILABLE") {
        setTicketsState("unavailable");
      } else {
        setTicketsState("ready");
        notifyError(error);
      }
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api<{ users: PanelUser[] }>("/api/admin/users");
      setUsers(data.users);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    void loadUsers();
    api<{ clients: Array<{ id: string; name: string; notes: string | null }> }>("/api/admin/clients")
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
    // El tablero se refresca solo cada minuto para ver lo que carga otro.
    const id = window.setInterval(() => void loadTickets(), 60_000);
    return () => window.clearInterval(id);
  }, [loadTickets, loadUsers]);

  useHotkeys([["mod+K", () => spotlight.open()]]);

  const clientContexts = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.notes ?? null])) as Record<string, string | null>,
    [clients]
  );

  const newCount = tickets.filter((t) => t.status === "new").length;
  const mineCount = tickets.filter((t) => me.id && t.assignee_id === me.id && !isClosed(t.status)).length;

  const actions: SpotlightActionData[] = useMemo(
    () => [
      ...SECTIONS.map((s) => ({
        id: `section-${s.id}`,
        label: s.label,
        description: "Ir a la sección",
        group: "Secciones",
        leftSection: <s.icon size={18} stroke={1.6} />,
        onClick: () => go(s.id),
      })),
      ...tickets.map((t) => ({
        id: `ticket-${t.id}`,
        label: `#${t.number} ${t.title}`,
        description: `${t.client_name} · ${t.labels.join(", ")}`,
        keywords: [String(t.number), t.client_name, t.reporter_name ?? "", ...t.labels],
        group: "Tickets",
        leftSection: t.type === "bug" ? <IconBug size={18} stroke={1.6} /> : <IconBulb size={18} stroke={1.6} />,
        onClick: () => {
          go("tablero");
          setOpenTicketId(t.id);
        },
      })),
      ...clients.map((c) => ({
        id: `client-${c.id}`,
        label: c.name,
        description: "Cliente",
        group: "Clientes",
        leftSection: <IconBuildingStore size={18} stroke={1.6} />,
        onClick: () => {
          setClientFocus(c.name);
          go("clientes");
        },
      })),
    ],
    [tickets, clients, go]
  );

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 224, breakpoint: "sm", collapsed: { mobile: !navOpen } }}
      padding="md"
    >
      <Spotlight
        actions={actions}
        limit={12}
        nothingFound="No hay resultados"
        highlightQuery
        shortcut={null}
        searchProps={{ leftSection: <IconSearch size={18} />, placeholder: "Buscar tickets, clientes o secciones…" }}
      />

      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpen} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Menú" />
            <Brand />
          </Group>

          <UnstyledButton
            onClick={() => spotlight.open()}
            visibleFrom="xs"
            style={{
              flex: "0 1 420px",
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: "var(--mantine-radius-md)",
              padding: "6px 10px",
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap={8} wrap="nowrap">
                <IconSearch size={16} color="var(--mantine-color-dimmed)" />
                <Text size="sm" c="dimmed">
                  Buscar…
                </Text>
              </Group>
              <Kbd size="xs">Ctrl K</Kbd>
            </Group>
          </UnstyledButton>

          <Group gap="xs" wrap="nowrap">
            <ActionIcon variant="default" size="lg" hiddenFrom="xs" onClick={() => spotlight.open()} aria-label="Buscar">
              <IconSearch size={18} />
            </ActionIcon>
            <Tooltip label={scheme === "dark" ? "Modo claro" : "Modo oscuro"}>
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}
                aria-label="Cambiar tema"
              >
                {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Menu position="bottom-end" width={220}>
              <Menu.Target>
                <UnstyledButton aria-label="Usuario">
                  <Avatar color="brand" radius="xl" size={34}>
                    {initials(me.name)}
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="sm" fw={600} c="var(--mantine-color-text)">
                    {me.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {me.email ?? "Acceso de emergencia"}
                  </Text>
                </Menu.Label>
                <Menu.Divider />
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={logout}>
                  Cerrar sesión
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.id}
            label={s.label}
            leftSection={<s.icon size={18} stroke={1.6} />}
            active={section === s.id}
            onClick={() => go(s.id)}
            rightSection={
              s.id === "tablero" && newCount > 0 ? (
                <Badge size="sm" variant="filled" circle={newCount < 10}>
                  {newCount}
                </Badge>
              ) : null
            }
            style={{ borderRadius: "var(--mantine-radius-md)" }}
          />
        ))}
        {me.id && mineCount > 0 && (
          <Text size="xs" c="dimmed" mt="md" px="sm">
            Tenés {mineCount} ticket(s) asignado(s)
          </Text>
        )}
      </AppShell.Navbar>

      <AppShell.Main>
        {me.emergency && (
          <Alert color="yellow" icon={<IconAlertTriangle size={18} />} mb="md" title="Acceso de emergencia">
            Entraste con el usuario de las variables de entorno. Creá los usuarios del equipo en{" "}
            <UnstyledButton onClick={() => go("usuarios")} c="brand" fw={600} fz="sm">
              Usuarios
            </UnstyledButton>{" "}
            para que cada uno entre con el suyo y quede registrado quién toma cada ticket.
          </Alert>
        )}

        {section === "tablero" && (
          <Board
            me={me}
            tickets={tickets}
            state={ticketsState}
            users={users}
            setTickets={setTickets}
            reload={loadTickets}
            openTicketId={openTicketId}
            setOpenTicketId={setOpenTicketId}
            clientContexts={clientContexts}
          />
        )}
        {section === "resumen" && <Overview onOpenBoard={() => go("tablero")} />}
        {section === "clientes" && (
          <Clients initialSearch={clientFocus} onSearchConsumed={() => setClientFocus(null)} />
        )}
        {section === "cobros" && <Payments />}
        {section === "costos" && <Costs />}
        {section === "usuarios" && <Users me={me} users={users} reload={loadUsers} />}
      </AppShell.Main>
    </AppShell>
  );
}
