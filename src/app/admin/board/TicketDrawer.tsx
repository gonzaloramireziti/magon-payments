"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  CopyButton,
  Divider,
  Drawer,
  Group,
  Image,
  Modal,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  TagsInput,
  Text,
  Textarea,
  Timeline,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowBackUp,
  IconBrandGithub,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconTrashX,
  IconCopy,
  IconExternalLink,
  IconSparkles,
  IconFlag,
  IconHandGrab,
  IconHandOff,
  IconMessage,
  IconPencilPlus,
  IconRobot,
  IconTag,
  IconUser,
} from "@tabler/icons-react";
import { api, notifyError } from "../lib/api";
import { dateTime, initials, relative } from "../lib/format";
import {
  COLUMNS,
  LABEL_SUGGESTIONS,
  STATUS_LABEL,
  TYPE,
  URGENCY,
  sourceLabel,
  type Activity,
  type Me,
  type PanelUser,
  type Ticket,
  type TicketStatus,
  type TicketUrgency,
} from "../lib/tickets";
import type { TicketChanges } from "./Board";
import { buildTicketPrompt } from "./prompt";
import { AgentPanel } from "./AgentPanel";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
        {label}
      </Text>
      {children}
    </div>
  );
}

function Prose({ value }: { value: string }) {
  return (
    <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {value}
    </Text>
  );
}

function activityText(item: Activity): React.ReactNode {
  const meta = item.meta as { from?: string | null; to?: unknown };
  if (item.kind === "status") {
    return (
      <>
        movió el ticket de <b>{STATUS_LABEL[meta.from as TicketStatus] ?? meta.from}</b> a{" "}
        <b>{STATUS_LABEL[meta.to as TicketStatus] ?? String(meta.to)}</b>
      </>
    );
  }
  if (item.kind === "assignee") {
    if (!meta.to) return <>dejó el ticket sin responsable</>;
    return (
      <>
        asignó el ticket a <b>{String(meta.to)}</b>
      </>
    );
  }
  if (item.kind === "urgency") {
    return (
      <>
        cambió la urgencia a <b>{URGENCY[meta.to as TicketUrgency]?.label ?? String(meta.to)}</b>
      </>
    );
  }
  if (item.kind === "created") {
    const channel = typeof (item.meta as { channel?: unknown }).channel === "string" ? String(item.meta.channel) : null;
    return channel ? (
      <>
        cargó el ticket a mano (llegó por <b>{sourceLabel(channel)}</b>)
      </>
    ) : (
      <>cargó el ticket a mano</>
    );
  }
  if (item.kind === "triage") {
    const verdict = (item.meta as { verdict?: string }).verdict;
    return (
      <>
        analizó el ticket con Claude: <b>{verdict === "direct" ? "directo" : "necesita decisión"}</b>
      </>
    );
  }
  if (item.kind === "decision") return <>respondió preguntas del análisis</>;
  if (item.kind === "github") {
    const url = typeof item.meta.url === "string" ? item.meta.url : null;
    return url ? (
      <>
        actualizó GitHub:{" "}
        <Anchor href={url} target="_blank" rel="noreferrer" size="sm">
          {url.replace("https://github.com/", "")}
        </Anchor>
      </>
    ) : (
      <>actualizó GitHub</>
    );
  }
  if (item.kind === "labels") {
    const labels = (meta.to as string[]) ?? [];
    return labels.length ? (
      <>
        etiquetó como <b>{labels.join(", ")}</b>
      </>
    ) : (
      <>quitó las etiquetas</>
    );
  }
  return null;
}

const ACTIVITY_ICON = {
  comment: IconMessage,
  status: IconArrowRight,
  assignee: IconUser,
  urgency: IconFlag,
  labels: IconTag,
  created: IconPencilPlus,
  triage: IconRobot,
  decision: IconCircleCheck,
  github: IconBrandGithub,
};

export function TicketDrawer({
  ticket,
  me,
  users,
  labelOptions,
  clientContext,
  clientRepos,
  onClose,
  onChange,
  onLocalUpdate,
}: {
  ticket: Ticket | null;
  me: Me;
  users: PanelUser[];
  labelOptions: string[];
  clientContext: string | null;
  clientRepos: string[];
  onClose: () => void;
  onChange: (id: string, changes: TicketChanges) => Promise<void>;
  onLocalUpdate: (id: string, changes: Partial<Ticket>) => void;
}) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [tab, setTab] = useState<string | null>("detalle");
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [includeComments, setIncludeComments] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [discardShare, setDiscardShare] = useState(true);
  const [discarding, setDiscarding] = useState(false);
  const ticketId = ticket?.id ?? null;

  const loadActivity = useCallback(async () => {
    if (!ticketId) return;
    try {
      const data = await api<{ activity: Activity[] }>(`/api/admin/tickets/activity?ticketId=${ticketId}`);
      setActivity(data.activity);
    } catch {
      setActivity([]);
    }
  }, [ticketId]);

  useEffect(() => {
    setActivity(null);
    setComment("");
    setTab("detalle");
    setPromptOpen(false);
    setDiscardOpen(false);
    setDiscardReason("");
    setDiscardShare(true);
    void loadActivity();
  }, [loadActivity]);

  if (!ticket) return <Drawer opened={false} onClose={onClose} />;

  const type = TYPE[ticket.type];
  const mine = me.id !== null && ticket.assignee_id === me.id;
  const userOptions = users
    .filter((user) => user.active || user.id === ticket.assignee_id)
    .map((user) => ({ value: user.id, label: user.id === me.id ? `${user.name} (vos)` : user.name }));

  async function change(changes: TicketChanges) {
    await onChange(ticket!.id, changes);
    void loadActivity();
  }

  async function sendComment() {
    if (!comment.trim()) return;
    setSending(true);
    try {
      const data = await api<{ activity: Activity[] }>("/api/admin/tickets/activity", {
        method: "POST",
        json: { ticketId: ticket!.id, body: comment },
      });
      setActivity(data.activity);
      setComment("");
    } catch (error) {
      notifyError(error);
    } finally {
      setSending(false);
    }
  }

  const reporter = [ticket.reporter_name, ticket.reporter_email, ticket.reporter_ref ? `ID ${ticket.reporter_ref}` : null]
    .filter(Boolean)
    .join(" · ");
  const comments = activity?.filter((item) => item.kind === "comment").length ?? 0;

  // El motivo queda como comentario (así se sabe por qué no se hizo) y, si se elige, como mensaje
  // para el cliente: lo ve en «Mis reportes» y va en el correo del cambio de estado.
  async function discard() {
    setDiscarding(true);
    try {
      const reason = discardReason.trim();
      if (reason) {
        await api("/api/admin/tickets/activity", {
          method: "POST",
          json: { ticketId: ticket!.id, body: `Descartado: ${reason}${discardShare ? " (se le mostró al cliente)" : ""}` },
        });
      }
      await change({ status: "discarded", clientNote: reason && discardShare ? reason : null });
      setDiscardOpen(false);
      setDiscardReason("");
    } catch (error) {
      notifyError(error);
    } finally {
      setDiscarding(false);
    }
  }

  const closed = ticket.status === "done" || ticket.status === "discarded";
  const openQuestions =
    ticket.triage?.questions.filter((q) => !(ticket.decisions ?? []).some((d) => d.questionId === q.id)).length ?? 0;

  function openPrompt(withComments = includeComments) {
    setPrompt(
      buildTicketPrompt(ticket!, { clientContext, comments: activity ?? [], includeComments: withComments })
    );
    setPromptOpen(true);
  }

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size={mobile ? "100%" : 640}
      padding={0}
      withCloseButton={false}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Box p="md" pb={0}>
        <Group justify="space-between" wrap="nowrap" mb="xs">
          <Group gap={6}>
            <Badge color={type.color}>{type.label}</Badge>
            <Text size="sm" c="dimmed">
              #{ticket.number} · {ticket.client_name}
              {ticket.channel !== "default" ? ` (${sourceLabel(ticket.channel)})` : ""}
            </Text>
          </Group>
          <Drawer.CloseButton />
        </Group>
        <Title order={2} mb={4} style={{ wordBreak: "break-word" }}>
          {ticket.title}
        </Title>
        <Group justify="space-between" mb="md" gap="xs">
          <Text size="xs" c="dimmed">
            Cargado {relative(ticket.created_at)} ({dateTime(ticket.created_at)})
            {ticket.resolved_at ? ` · cerrado ${relative(ticket.resolved_at)}` : ""}
          </Text>
          <Group gap={6}>
            {closed ? (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconArrowBackUp size={14} />}
                onClick={() => void change({ status: "analysis" })}
              >
                Reabrir
              </Button>
            ) : (
              <>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconCircleCheck size={14} />}
                  onClick={() => void change({ status: "done" })}
                >
                  Resolver
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<IconTrashX size={14} />}
                  onClick={() => setDiscardOpen(true)}
                >
                  Descartar
                </Button>
              </>
            )}
            <Button
              size="xs"
              variant="light"
              leftSection={<IconSparkles size={14} />}
              onClick={() => openPrompt()}
              loading={activity === null}
            >
              Generar prompt
            </Button>
          </Group>
        </Group>

        <Modal opened={discardOpen} onClose={() => setDiscardOpen(false)} title={`Descartar el ticket #${ticket.number}`}>
          <Stack gap="sm">
            <Text size="sm">
              Sale del tablero y pasa a Terminados. Se puede reabrir cuando quieras.
            </Text>
            <Textarea
              label="Motivo (opcional)"
              description="Queda como comentario en la actividad del ticket"
              placeholder="Duplicado del #12, no es un error, fuera de alcance…"
              autosize
              minRows={2}
              value={discardReason}
              onChange={(e) => setDiscardReason(e.currentTarget.value)}
            />
            <Switch
              size="sm"
              label="Mostrarle el motivo al cliente"
              description="Lo ve en «Mis reportes» del botón de reportes y va en el correo. Escribilo para el cliente."
              checked={discardShare}
              disabled={!discardReason.trim()}
              onChange={(e) => setDiscardShare(e.currentTarget.checked)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDiscardOpen(false)}>
                Cancelar
              </Button>
              <Button color="red" onClick={discard} loading={discarding}>
                Descartar
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal opened={promptOpen} onClose={() => setPromptOpen(false)} title={`Prompt para el ticket #${ticket.number}`} size="xl">
          <Stack gap="sm">
            {!clientContext && (
              <Text size="xs" c="yellow.8">
                {ticket.client_name} no tiene contexto técnico cargado. Agregalo en Clientes → Editar → «Contexto para
                prompts» (proyecto, carpeta, stack, agente) y el prompt lo va a incluir.
              </Text>
            )}
            {openQuestions > 0 && (
              <Text size="xs" c="yellow.8">
                El análisis dejó {openQuestions} pregunta(s) sin responder. Respondelas en la pestaña Agente para que
                vayan en el prompt.
              </Text>
            )}
            <Switch
              size="xs"
              label="Incluir los comentarios internos del equipo"
              checked={includeComments}
              onChange={(event) => {
                setIncludeComments(event.currentTarget.checked);
                openPrompt(event.currentTarget.checked);
              }}
            />
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              autosize
              minRows={12}
              maxRows={22}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Lo podés editar antes de copiarlo. Las capturas van como links que vencen en 1 hora.
              </Text>
              <CopyButton value={prompt}>
                {({ copied, copy }) => (
                  <Button
                    onClick={copy}
                    color={copied ? "teal" : undefined}
                    leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  >
                    {copied ? "Copiado" : "Copiar prompt"}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>
        </Modal>

        <Paper p="sm" mb="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Select
              label="Estado"
              size="xs"
              value={ticket.status}
              allowDeselect={false}
              data={[...COLUMNS.map((c) => ({ value: c.status, label: c.label })), { value: "discarded", label: "Descartado" }]}
              onChange={(value) => value && void change({ status: value as TicketStatus })}
            />
            <Select
              label="Urgencia"
              size="xs"
              value={ticket.urgency}
              allowDeselect={false}
              data={(Object.keys(URGENCY) as TicketUrgency[]).map((key) => ({ value: key, label: URGENCY[key].label }))}
              onChange={(value) => value && void change({ urgency: value as TicketUrgency })}
            />
            <Select
              label="Responsable"
              size="xs"
              placeholder="Sin asignar"
              clearable
              searchable
              value={ticket.assignee_id}
              data={userOptions}
              onChange={(value) => void change({ assigneeId: value })}
            />
            <Box>
              <Text size="xs" fw={500} mb={4}>
                &nbsp;
              </Text>
              {mine ? (
                <Button
                  size="xs"
                  variant="default"
                  fullWidth
                  leftSection={<IconHandOff size={14} />}
                  onClick={() => void change({ assigneeId: null })}
                >
                  Soltar
                </Button>
              ) : (
                <Tooltip label="Entrá con tu usuario para tomar tickets" disabled={Boolean(me.id)}>
                  <Button
                    size="xs"
                    fullWidth
                    leftSection={<IconHandGrab size={14} />}
                    disabled={!me.id}
                    onClick={() =>
                      void change({
                        assigneeId: me.id,
                        ...(ticket.status === "new" ? { status: "analysis" as TicketStatus } : {}),
                      })
                    }
                  >
                    Tomar
                  </Button>
                </Tooltip>
              )}
            </Box>
          </SimpleGrid>
          <TagsInput
            mt="sm"
            size="xs"
            label="Etiquetas"
            placeholder="Agregá y apretá Enter"
            data={Array.from(new Set([...LABEL_SUGGESTIONS, ...labelOptions]))}
            value={ticket.labels}
            maxTags={10}
            clearable
            onChange={(value) => void change({ labels: value.map((v) => v.trim().toLowerCase()) })}
          />
        </Paper>
      </Box>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List px="md">
          <Tabs.Tab value="detalle">Detalle</Tabs.Tab>
          <Tabs.Tab value="agente" leftSection={<IconRobot size={14} />}>
            Agente
          </Tabs.Tab>
          <Tabs.Tab value="actividad" rightSection={comments ? <Badge size="xs" circle>{comments}</Badge> : null}>
            Actividad
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="detalle" p="md">
          <Stack gap="md">
            <Field label={ticket.type === "bug" ? "Qué estaba haciendo" : "Qué necesita y para qué"}>
              <Prose value={ticket.description} />
            </Field>
            {ticket.expected && (
              <Field label="Qué esperaba">
                <Prose value={ticket.expected} />
              </Field>
            )}
            {ticket.actual && (
              <Field label="Qué pasó en cambio">
                <Prose value={ticket.actual} />
              </Field>
            )}
            {ticket.attachment_urls.length > 0 && (
              <Field label="Capturas">
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                  {ticket.attachment_urls.map((attachment) =>
                    attachment.url ? (
                      <Anchor key={attachment.path} href={attachment.url} target="_blank" rel="noreferrer">
                        <Image src={attachment.url} alt={attachment.name} h={110} radius="sm" fit="cover" />
                      </Anchor>
                    ) : (
                      <Text key={attachment.path} size="xs" c="dimmed">
                        {attachment.name} (no disponible)
                      </Text>
                    )
                  )}
                </SimpleGrid>
              </Field>
            )}
            <Divider />
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
              <Field label="Reportado por">
                <Text size="sm">{reporter || "—"}</Text>
              </Field>
              <Field label="Versión">
                <Text size="sm">{ticket.app_version ?? "—"}</Text>
              </Field>
            </SimpleGrid>
            {ticket.page_url && (
              <Field label="Pantalla">
                <Anchor href={ticket.page_url} target="_blank" rel="noreferrer" size="sm" style={{ wordBreak: "break-all" }}>
                  {ticket.page_url} <IconExternalLink size={12} />
                </Anchor>
              </Field>
            )}
            {ticket.user_agent && (
              <Field label="Navegador">
                <Text size="xs" c="dimmed">
                  {ticket.user_agent}
                </Text>
              </Field>
            )}
            {ticket.client_note && (
              <Field label="Mensaje al cliente">
                <Prose value={ticket.client_note} />
              </Field>
            )}
            {ticket.internal_notes && (
              <Field label="Notas internas (anteriores)">
                <Prose value={ticket.internal_notes} />
              </Field>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="agente" p="md">
          <AgentPanel
            ticket={ticket}
            me={me}
            activity={activity ?? []}
            clientContext={clientContext}
            repos={clientRepos}
            onUpdated={(changes) => {
              onLocalUpdate(ticket.id, changes);
              void loadActivity();
            }}
          />
        </Tabs.Panel>

        <Tabs.Panel value="actividad" p="md">
          <Stack gap="md">
            <Paper p="sm">
              <Textarea
                placeholder="Escribí un comentario interno (el cliente no lo ve)…"
                autosize
                minRows={2}
                maxRows={8}
                value={comment}
                onChange={(e) => setComment(e.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendComment();
                }}
              />
              <Group justify="space-between" mt="xs">
                <Text size="xs" c="dimmed">
                  Ctrl + Enter para enviar
                </Text>
                <Button size="xs" onClick={sendComment} loading={sending} disabled={!comment.trim()}>
                  Comentar
                </Button>
              </Group>
            </Paper>

            {activity === null && (
              <Text size="sm" c="dimmed">
                Cargando…
              </Text>
            )}
            {activity?.length === 0 && (
              <Text size="sm" c="dimmed">
                Todavía no hay actividad en este ticket.
              </Text>
            )}
            {activity && activity.length > 0 && (
              <Timeline bulletSize={26} lineWidth={2}>
                {[...activity].reverse().map((item) => {
                  const Icon = ACTIVITY_ICON[item.kind];
                  return (
                    <Timeline.Item
                      key={item.id}
                      bullet={
                        item.kind === "comment" ? (
                          <Avatar size={24} radius="xl" color="brand">
                            <Text fz={10} fw={700}>
                              {initials(item.authorName)}
                            </Text>
                          </Avatar>
                        ) : (
                          <Icon size={13} />
                        )
                      }
                    >
                      <Text size="sm">
                        <b>{item.authorName ?? "Alguien"}</b>{" "}
                        {item.kind === "comment" ? "comentó" : activityText(item)}
                      </Text>
                      {(item.kind === "comment" || item.kind === "triage" || item.kind === "decision" || item.kind === "github") && item.body && (
                        <Paper p="xs" mt={4} bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                          <Prose value={item.body} />
                        </Paper>
                      )}
                      <Text size="xs" c="dimmed" mt={2}>
                        {relative(item.createdAt)}
                      </Text>
                    </Timeline.Item>
                  );
                })}
              </Timeline>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}
