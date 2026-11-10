"use client";

import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  CloseButton,
  FileButton,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconBrandWhatsapp, IconPaperclip, IconPhoto, IconSparkles, IconX } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import {
  COLUMNS,
  LABEL_SUGGESTIONS,
  MANUAL_SOURCES,
  TYPE,
  URGENCY,
  type Me,
  type PanelUser,
  type TicketStatus,
  type TicketType,
  type TicketUrgency,
} from "../lib/tickets";
import { cleanWhatsApp, suggestTitle } from "./whatsapp";

// Mismos límites que valida el servidor (src/lib/tickets/policy.ts).
const TITLE_MAX = 140;
const TEXT_MAX = 20000;
const MAX_FILES = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const INITIAL_STATUSES: TicketStatus[] = ["new", "analysis", "ready", "in_progress"];

export type ClientOption = { id: string; name: string; active?: boolean };

type Draft = {
  clientId: string | null;
  type: TicketType;
  channel: string;
  title: string;
  description: string;
  expected: string;
  actual: string;
  urgency: TicketUrgency;
  status: TicketStatus;
  assigneeId: string | null;
  labels: string[];
  reporterName: string;
  reporterRef: string;
};

const EMPTY: Draft = {
  clientId: null,
  type: "feature",
  channel: "whatsapp",
  title: "",
  description: "",
  expected: "",
  actual: "",
  urgency: "medium",
  status: "new",
  assigneeId: null,
  labels: [],
  reporterName: "",
  reporterRef: "",
};

const DRAFT_KEY = "magon.board.newTicketDraft";

function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* sin almacenamiento: el borrador vive mientras el panel esté abierto */
  }
}

function looksLikePhone(value: string): boolean {
  return /^\+?[\d\s()-]{8,}$/.test(value.trim());
}

export function NewTicketModal({
  opened,
  onClose,
  me,
  clients,
  users,
  labelOptions,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  me: Me;
  clients: ClientOption[];
  users: PanelUser[];
  labelOptions: string[];
  onCreated: (id: string) => void | Promise<void>;
}) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // El borrador sobrevive a cerrar el modal o recargar: los textos de WhatsApp suelen ser largos.
  useEffect(() => {
    setDraft(readDraft());
  }, []);

  function update(changes: Partial<Draft>) {
    setDraft((current) => {
      const next = { ...current, ...changes };
      writeDraft(next);
      return next;
    });
  }

  const clientOptions = useMemo(
    () =>
      clients
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((client) => ({
          value: client.id,
          label: client.active === false ? `${client.name} (inactivo)` : client.name,
        })),
    [clients]
  );

  const userOptions = users
    .filter((user) => user.active)
    .map((user) => ({ value: user.id, label: user.id === me.id ? `${user.name} (vos)` : user.name }));

  function addFiles(incoming: File[]) {
    setError(null);
    const images = incoming.filter((file) => IMAGE_TYPES.includes(file.type));
    if (images.length < incoming.length) setError("Solo se aceptan imágenes PNG, JPG, WEBP o GIF");
    const next = [...files, ...images];
    if (next.length > MAX_FILES) setError(`Se pueden adjuntar hasta ${MAX_FILES} capturas`);
    setFiles(next.slice(0, MAX_FILES));
  }

  // Pegar una captura (Ctrl+V) en cualquier parte del formulario la adjunta.
  function onPaste(event: ClipboardEvent) {
    const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (pasted.length === 0) return;
    event.preventDefault();
    addFiles(pasted.map((file, index) => (file.name ? file : new File([file], `captura-${index + 1}.png`, { type: file.type }))));
  }

  function cleanDescription() {
    const result = cleanWhatsApp(draft.description);
    if (result.messages === 0) {
      setHint("No encontré el formato de WhatsApp (fecha, hora y nombre en cada mensaje). El texto queda como está.");
      return;
    }
    const sender = result.senders.find((name) => name.toLowerCase() !== me.name.toLowerCase()) ?? result.senders[0];
    const changes: Partial<Draft> = { description: result.text, channel: "whatsapp" };
    if (sender && looksLikePhone(sender) && !draft.reporterRef) changes.reporterRef = sender;
    else if (sender && !draft.reporterName) changes.reporterName = sender;
    if (!draft.title) changes.title = suggestTitle(result.text).slice(0, TITLE_MAX);
    update(changes);
    setHint(
      `Limpié ${result.messages} mensaje(s)` +
        (result.media ? `. Había ${result.media} adjunto(s) que no viajan en el texto: pegá las capturas abajo.` : ".")
    );
  }

  const totalBytes = files.reduce((acc, file) => acc + file.size, 0);
  const tooBig = totalBytes > MAX_BYTES;
  const tooLong = draft.description.length > TEXT_MAX;
  const canSave = Boolean(draft.clientId && draft.title.trim() && draft.description.trim()) && !tooBig && !tooLong;

  function reset() {
    setDraft(EMPTY);
    writeDraft(null);
    setFiles([]);
    setError(null);
    setHint(null);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("clientId", draft.clientId ?? "");
      form.set("type", draft.type);
      form.set("channel", draft.channel);
      form.set("title", draft.title);
      form.set("description", draft.description);
      if (draft.type === "bug") {
        form.set("expected", draft.expected);
        form.set("actual", draft.actual);
      }
      form.set("urgency", draft.urgency);
      form.set("status", draft.status);
      form.set("assigneeId", draft.assigneeId ?? "");
      form.set("labels", JSON.stringify(draft.labels));
      form.set("reporterName", draft.reporterName);
      if (draft.reporterRef.includes("@")) form.set("reporterEmail", draft.reporterRef);
      else form.set("reporterRef", draft.reporterRef);
      for (const file of files) form.append("attachments", file);

      const data = await api<{ ticket: { id: string; number: number } }>("/api/admin/tickets", {
        method: "POST",
        body: form,
      });
      notifyOk(`Ticket #${data.ticket.number} cargado`);
      reset();
      onClose();
      await onCreated(data.ticket.id);
    } catch (err) {
      setError((err as Error).message);
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(EMPTY) || files.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700}>Cargar ticket a mano</Text>}
      size="xl"
      fullScreen={Boolean(mobile)}
      closeOnClickOutside={false}
    >
      <Stack gap="sm" onPaste={onPaste}>
        <Text size="sm" c="dimmed">
          Para pedidos que llegan por WhatsApp, correo o en una llamada. Pegá el texto completo: si viene copiado de
          WhatsApp, «Limpiar formato» saca fechas y nombres de cada mensaje.
        </Text>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Cliente"
            placeholder="Elegí el cliente"
            required
            searchable
            data={clientOptions}
            value={draft.clientId}
            onChange={(value) => update({ clientId: value })}
            nothingFoundMessage="No hay clientes con ese nombre"
          />
          <Select
            label="Llegó por"
            allowDeselect={false}
            data={MANUAL_SOURCES}
            value={draft.channel}
            onChange={(value) => value && update({ channel: value })}
          />
        </SimpleGrid>

        <div>
          <Text size="sm" fw={500} mb={4}>
            Tipo
          </Text>
          <SegmentedControl
            fullWidth
            value={draft.type}
            onChange={(value) => update({ type: value as TicketType })}
            data={[
              { value: "feature", label: TYPE.feature.label },
              { value: "bug", label: TYPE.bug.label },
            ]}
          />
        </div>

        <TextInput
          label="Título"
          placeholder={draft.type === "feature" ? "Exportar facturas a Excel" : "No se puede descargar el PDF del recibo"}
          required
          maxLength={TITLE_MAX}
          value={draft.title}
          onChange={(event) => update({ title: event.currentTarget.value })}
          rightSection={
            draft.description.trim() && !draft.title.trim() ? (
              <Tooltip label="Sugerir a partir de la descripción">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => update({ title: suggestTitle(draft.description).slice(0, TITLE_MAX) })}
                  aria-label="Sugerir título"
                >
                  <IconSparkles size={14} />
                </ActionIcon>
              </Tooltip>
            ) : null
          }
        />

        <div>
          <Group justify="space-between" mb={4} wrap="nowrap">
            <Text size="sm" fw={500}>
              {draft.type === "bug" ? "Qué estaba haciendo" : "Qué necesita y para qué"}{" "}
              <Text span c="red">
                *
              </Text>
            </Text>
            <Button
              size="compact-xs"
              variant="light"
              color="green"
              leftSection={<IconBrandWhatsapp size={14} />}
              disabled={!draft.description.trim()}
              onClick={cleanDescription}
            >
              Limpiar formato de WhatsApp
            </Button>
          </Group>
          <Textarea
            placeholder="Pegá acá el mensaje o la conversación completa…"
            autosize
            minRows={8}
            maxRows={18}
            error={tooLong ? `Supera los ${TEXT_MAX.toLocaleString("es-AR")} caracteres: recortá lo que no haga falta` : undefined}
            value={draft.description}
            onChange={(event) => {
              update({ description: event.currentTarget.value });
              setHint(null);
            }}
          />
          <Group justify="space-between" mt={4} gap="xs" wrap="nowrap">
            <Text size="xs" c={hint ? "teal" : "dimmed"}>
              {hint ?? "Podés pegar capturas con Ctrl + V en cualquier parte del formulario."}
            </Text>
            <Text size="xs" c={tooLong ? "red" : draft.description.length > TEXT_MAX * 0.9 ? "orange" : "dimmed"} style={{ whiteSpace: "nowrap" }}>
              {draft.description.length.toLocaleString("es-AR")} / {TEXT_MAX.toLocaleString("es-AR")}
            </Text>
          </Group>
        </div>

        {draft.type === "bug" && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Textarea
              label="Qué esperaba"
              autosize
              minRows={2}
              value={draft.expected}
              onChange={(event) => update({ expected: event.currentTarget.value })}
            />
            <Textarea
              label="Qué pasó en cambio"
              autosize
              minRows={2}
              value={draft.actual}
              onChange={(event) => update({ actual: event.currentTarget.value })}
            />
          </SimpleGrid>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="Quién lo pidió"
            placeholder="Nombre de la persona"
            value={draft.reporterName}
            onChange={(event) => update({ reporterName: event.currentTarget.value })}
          />
          <TextInput
            label="Contacto"
            placeholder="Teléfono o correo"
            value={draft.reporterRef}
            onChange={(event) => update({ reporterRef: event.currentTarget.value })}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Select
            label="Urgencia"
            allowDeselect={false}
            data={(Object.keys(URGENCY) as TicketUrgency[]).map((key) => ({ value: key, label: URGENCY[key].label }))}
            value={draft.urgency}
            onChange={(value) => value && update({ urgency: value as TicketUrgency })}
          />
          <Select
            label="Columna"
            allowDeselect={false}
            data={COLUMNS.filter((column) => INITIAL_STATUSES.includes(column.status)).map((column) => ({
              value: column.status,
              label: column.label,
            }))}
            value={draft.status}
            onChange={(value) => value && update({ status: value as TicketStatus })}
          />
          <Select
            label="Responsable"
            placeholder="Sin asignar"
            clearable
            searchable
            data={userOptions}
            value={draft.assigneeId}
            onChange={(value) => update({ assigneeId: value })}
          />
        </SimpleGrid>

        <TagsInput
          label="Etiquetas"
          placeholder="Agregá y apretá Enter"
          data={Array.from(new Set([...LABEL_SUGGESTIONS, ...labelOptions]))}
          value={draft.labels}
          maxTags={10}
          clearable
          onChange={(value) => update({ labels: value.map((label) => label.trim().toLowerCase()) })}
        />

        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={500}>
              Capturas{" "}
              <Text span size="xs" c="dimmed">
                (hasta {MAX_FILES}, 4 MB en total)
              </Text>
            </Text>
            <FileButton onChange={addFiles} accept={IMAGE_TYPES.join(",")} multiple>
              {(props) => (
                <Button
                  {...props}
                  size="compact-xs"
                  variant="default"
                  leftSection={<IconPaperclip size={14} />}
                  disabled={files.length >= MAX_FILES}
                >
                  Adjuntar
                </Button>
              )}
            </FileButton>
          </Group>
          {files.length > 0 ? (
            <Stack gap={4}>
              {files.map((file, index) => (
                <Group key={`${file.name}-${index}`} justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <IconPhoto size={14} />
                    <Text size="xs" truncate>
                      {file.name}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </Text>
                  </Group>
                  <CloseButton
                    size="sm"
                    aria-label="Quitar captura"
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  />
                </Group>
              ))}
              {tooBig && (
                <Text size="xs" c="red">
                  Las capturas superan los 4 MB en total
                </Text>
              )}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              Sin capturas.
            </Text>
          )}
        </div>

        {error && (
          <Alert color="red" icon={<IconX size={16} />} p="xs">
            {error}
          </Alert>
        )}

        <Group justify="space-between" mt="xs">
          <Button variant="subtle" color="gray" onClick={reset} disabled={!dirty || saving}>
            Vaciar formulario
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {dirty ? "Seguir después" : "Cancelar"}
            </Button>
            <Button onClick={save} loading={saving} disabled={!canSave}>
              Cargar ticket
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
