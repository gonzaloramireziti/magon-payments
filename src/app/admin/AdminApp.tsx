"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Indicator,
  Kbd,
  Menu,
  NavLink,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useDocumentTitle, useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
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
  IconArchive,
  IconBell,
} from "@tabler/icons-react";
import { Brand } from "./Brand";
import { Board, applyLocal, type TicketChanges } from "./board/Board";
import { TicketDrawer } from "./board/TicketDrawer";
import { Closed } from "./sections/Closed";
import { diffSummaries, snapshot, titleWithCount, type Summary } from "./lib/watch";
import {
  desktopEnabled,
  desktopSupported,
  disableDesktop,
  enableDesktop,
  playChime,
  setSoundEnabled,
  showDesktop,
  soundEnabled,
} from "./lib/alerts";
import { Overview } from "./sections/Overview";
import { Clients } from "./sections/Clients";
import { Payments } from "./sections/Payments";
import { Costs } from "./sections/Costs";
import { Users } from "./sections/Users";
import { api, notifyError } from "./lib/api";
import { initials, relative } from "./lib/format";
import { isClosed, type Me, type PanelUser, type Ticket } from "./lib/tickets";

const SECTIONS = [
  { id: "tablero", label: "Tablero", icon: IconLayoutKanban },
  { id: "terminados", label: "Terminados", icon: IconArchive },
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
  const [unseen, setUnseen] = useState<Summary[]>([]);
  const [desktopOn, setDesktopOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const lastSnapshot = useRef<Map<string, string> | null>(null);
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
  }, [loadTickets, loadUsers]);

  useEffect(() => {
    setDesktopOn(desktopEnabled());
    setSoundOn(soundEnabled());
  }, []);

  // Cada 20 segundos (y al volver a la pestaña) consulta un resumen liviano. Si algo cambió,
  // recarga los tickets completos; si hay tickets nuevos, avisa.
  const poll = useCallback(async () => {
    try {
      const data = await api<{ tickets: Summary[] }>("/api/admin/tickets?summary=1");
      const { changed, added } = diffSummaries(lastSnapshot.current, data.tickets);
      lastSnapshot.current = snapshot(data.tickets);
      if (changed) void loadTickets();
      if (added.length === 0) return;
      setUnseen((current) => [...added, ...current].slice(0, 20));
      playChime();
      for (const ticket of added.slice(0, 3)) {
        notifications.show({
          color: "brand",
          title: `Nuevo ticket #${ticket.number} · ${ticket.client_name}`,
          message: ticket.title,
          autoClose: 8000,
        });
        showDesktop(`Nuevo ticket #${ticket.number} · ${ticket.client_name}`, ticket.title, () => {
          go("tablero");
          setOpenTicketId(ticket.id);
        });
      }
    } catch {
      /* sin conexión o sesión vencida: se reintenta en el próximo ciclo */
    }
  }, [loadTickets, go]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useDocumentTitle(titleWithCount("Magon · Panel", unseen.length));

  // Aplica el cambio en pantalla al instante y lo revierte si el servidor lo rechaza.
  const patchTicket = useCallback(
    async (id: string, changes: TicketChanges) => {
      let previous: Ticket[] = [];
      setTickets((current) => {
        previous = current;
        return current.map((ticket) => (ticket.id === id ? applyLocal(ticket, changes, users) : ticket));
      });
      try {
        await api("/api/admin/tickets", { method: "PATCH", json: { id, ...changes } });
      } catch (error) {
        setTickets(previous);
        notifyError(error);
      }
    },
    [users]
  );

  useHotkeys([["mod+K", () => spotlight.open()]]);

  const openedTicket = tickets.find((ticket) => ticket.id === openTicketId) ?? null;
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
            <Menu position="bottom-end" width={320} withinPortal>
              <Menu.Target>
                <Indicator label={unseen.length} size={16} disabled={unseen.length === 0} offset={4}>
                  <ActionIcon variant="default" size="lg" aria-label="Avisos">
                    <IconBell size={18} />
                  </ActionIcon>
                </Indicator>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Tickets nuevos</Menu.Label>
                {unseen.length === 0 && (
                  <Text size="sm" c="dimmed" px="sm" py={6}>
                    No hay tickets nuevos desde que abriste el panel.
                  </Text>
                )}
                {unseen.slice(0, 8).map((ticket) => (
                  <Menu.Item
                    key={ticket.id}
                    onClick={() => {
                      go("tablero");
                      setOpenTicketId(ticket.id);
                      setUnseen((current) => current.filter((t) => t.id !== ticket.id));
                    }}
                  >
                    <Text size="sm" fw={600} lineClamp={1}>
                      #{ticket.number} {ticket.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {ticket.client_name} · {relative(ticket.updated_at)}
                    </Text>
                  </Menu.Item>
                ))}
                {unseen.length > 0 && (
                  <Menu.Item c="dimmed" onClick={() => setUnseen([])}>
                    Marcar todos como vistos
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Label>Avisos</Menu.Label>
                <Group px="sm" py={6} justify="space-between" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                  <Text size="sm">Notificación del sistema</Text>
                  <Switch
                    size="sm"
                    checked={desktopOn}
                    disabled={!desktopSupported()}
                    onChange={async (event) => {
                      if (event.currentTarget.checked) {
                        const ok = await enableDesktop();
                        setDesktopOn(ok);
                        if (!ok) notifyError(new Error("El navegador no dio permiso para notificaciones. Habilitalo en la configuración del sitio."));
                      } else {
                        disableDesktop();
                        setDesktopOn(false);
                      }
                    }}
                  />
                </Group>
                <Group px="sm" py={6} justify="space-between" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                  <Text size="sm">Sonido</Text>
                  <Switch
                    size="sm"
                    checked={soundOn}
                    onChange={(event) => {
                      const value = event.currentTarget.checked;
                      setSoundEnabled(value);
                      setSoundOn(value);
                      if (value) playChime();
                    }}
                  />
                </Group>
              </Menu.Dropdown>
            </Menu>
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
            onPatch={patchTicket}
            reload={loadTickets}
            setOpenTicketId={(id) => {
              setOpenTicketId(id);
              if (id) setUnseen((current) => current.filter((t) => t.id !== id));
            }}
          />
        )}
        {section === "terminados" && (
          <Closed tickets={tickets} state={ticketsState} me={me} onOpen={setOpenTicketId} />
        )}
        {section === "resumen" && <Overview onOpenBoard={() => go("tablero")} />}
        {section === "clientes" && (
          <Clients initialSearch={clientFocus} onSearchConsumed={() => setClientFocus(null)} />
        )}
        {section === "cobros" && <Payments />}
        {section === "costos" && <Costs />}
        {section === "usuarios" && <Users me={me} users={users} reload={loadUsers} />}

        <TicketDrawer
          ticket={openedTicket}
          me={me}
          users={users}
          labelOptions={Array.from(new Set(tickets.flatMap((t) => t.labels))).sort()}
          clientContext={openedTicket ? clientContexts[openedTicket.client_id] ?? null : null}
          onClose={() => setOpenTicketId(null)}
          onChange={patchTicket}
        />
      </AppShell.Main>
    </AppShell>
  );
}
