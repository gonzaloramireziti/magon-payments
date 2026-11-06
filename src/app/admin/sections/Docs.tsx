"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Center,
  Grid,
  Group,
  Loader,
  Modal,
  NavLink,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  TypographyStylesProvider,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconArrowLeft, IconBook, IconKey, IconPencil, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, notifyError, notifyOk } from "../lib/api";
import { normalizeText, relative } from "../lib/format";
import type { Me } from "../lib/tickets";
import { Vault } from "./Vault";

type Doc = {
  id: string;
  title: string;
  category: string;
  client_id: string | null;
  client_name: string | null;
  tags: string[];
  content: string;
  updated_by: string | null;
  updated_at: string;
};

export type ClientOption = { value: string; label: string };

const CATEGORY_SUGGESTIONS = ["infraestructura", "servidores", "deploy", "bases de datos", "integraciones", "procesos", "clientes"];

export function Markdown({ content }: { content: string }) {
  return (
    <TypographyStylesProvider fz="sm">
      {/* react-markdown no ejecuta HTML crudo: el contenido se renderiza seguro. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {content || "_Sin contenido todavía._"}
      </ReactMarkdown>
    </TypographyStylesProvider>
  );
}

export function DocsSection({ me }: { me: Me }) {
  const [tab, setTab] = useState<string | null>("paginas");
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    api<{ clients: Array<{ id: string; name: string }> }>("/api/admin/clients")
      .then((data) => setClients(data.clients.map((c) => ({ value: c.id, label: c.name }))))
      .catch(() => setClients([]));
  }, []);

  return (
    <Stack gap="md">
      <div>
        <Title order={1}>Documentación</Title>
        <Text size="sm" c="dimmed">
          Cómo está armado todo: servidores, deploys, integraciones y credenciales.
        </Text>
      </div>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="paginas" leftSection={<IconBook size={16} />}>
            Páginas
          </Tabs.Tab>
          <Tabs.Tab value="credenciales" leftSection={<IconKey size={16} />}>
            Credenciales
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="paginas" pt="md">
          <Pages clients={clients} />
        </Tabs.Panel>
        <Tabs.Panel value="credenciales" pt="md">
          <Vault me={me} clients={clients} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function Pages({ clients }: { clients: ClientOption[] }) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Doc | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ docs: Doc[] }>("/api/admin/docs");
      setDocs(data.docs);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => Array.from(new Set((docs ?? []).map((d) => d.category))).sort(), [docs]);
  const visible = useMemo(() => {
    const words = normalizeText(search.trim()).split(/\s+/).filter(Boolean);
    return (docs ?? []).filter((doc) => {
      if (category && doc.category !== category) return false;
      const text = normalizeText(`${doc.title} ${doc.category} ${doc.client_name ?? ""} ${doc.tags.join(" ")} ${doc.content}`);
      return words.every((w) => text.includes(w));
    });
  }, [docs, search, category]);
  const grouped = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const doc of visible) map.set(doc.category, [...(map.get(doc.category) ?? []), doc]);
    return Array.from(map);
  }, [visible]);

  const selected = docs?.find((d) => d.id === selectedId) ?? (mobile ? null : visible[0] ?? null);

  function remove(doc: Doc) {
    modals.openConfirmModal({
      title: "Borrar página",
      children: <Text size="sm">¿Borrar «{doc.title}»? No se puede deshacer.</Text>,
      labels: { confirm: "Borrar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`/api/admin/docs?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
          notifyOk("Página borrada");
          setSelectedId(null);
          void load();
        } catch (err) {
          notifyError(err);
        }
      },
    });
  }

  if (error) return <Alert color="yellow">{error}</Alert>;
  if (!docs) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  const list = (
    <Stack gap="xs">
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="xs"
          placeholder="Buscar en la documentación…"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <ActionIcon size="lg" onClick={() => setEditing("new")} aria-label="Nueva página">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      <Select
        size="xs"
        placeholder="Todas las categorías"
        clearable
        data={categories}
        value={category}
        onChange={setCategory}
      />
      <Paper p={4}>
        {grouped.map(([cat, items]) => (
          <Box key={cat} mb={4}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} px="sm" pt="xs" pb={2}>
              {cat}
            </Text>
            {items.map((doc) => (
              <NavLink
                key={doc.id}
                label={doc.title}
                description={doc.client_name ?? undefined}
                active={selected?.id === doc.id}
                onClick={() => setSelectedId(doc.id)}
                style={{ borderRadius: "var(--mantine-radius-sm)" }}
              />
            ))}
          </Box>
        ))}
        {grouped.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            {docs.length ? "No hay páginas que coincidan." : "Todavía no hay páginas."}
          </Text>
        )}
      </Paper>
    </Stack>
  );

  const viewer = selected ? (
    <Paper p={{ base: "md", sm: "lg" }}>
      {mobile && (
        <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} mb="sm" onClick={() => setSelectedId(null)}>
          Volver
        </Button>
      )}
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <Title order={2} style={{ wordBreak: "break-word" }}>
          {selected.title}
        </Title>
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(selected)} aria-label="Editar">
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => remove(selected)} aria-label="Borrar">
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>
      <Group gap={6} mb="md">
        <Badge>{selected.category}</Badge>
        {selected.client_name && <Badge color="gray">{selected.client_name}</Badge>}
        {selected.tags.map((tag) => (
          <Badge key={tag} variant="outline" color="gray" tt="none">
            {tag}
          </Badge>
        ))}
        <Text size="xs" c="dimmed">
          Editada {relative(selected.updated_at)}
          {selected.updated_by ? ` por ${selected.updated_by}` : ""}
        </Text>
      </Group>
      <Markdown content={selected.content} />
    </Paper>
  ) : (
    <Paper p="xl">
      <Text c="dimmed" ta="center" size="sm">
        Elegí una página o creá una nueva.
      </Text>
    </Paper>
  );

  return (
    <>
      {mobile ? (
        selectedId && selected ? viewer : list
      ) : (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
            <ScrollArea.Autosize mah="calc(100dvh - 220px)">{list}</ScrollArea.Autosize>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>{viewer}</Grid.Col>
        </Grid>
      )}
      {editing && (
        <DocEditor
          doc={editing === "new" ? null : editing}
          categories={Array.from(new Set([...CATEGORY_SUGGESTIONS, ...categories]))}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setSelectedId(id);
            void load();
          }}
        />
      )}
    </>
  );
}

function DocEditor({
  doc,
  categories,
  clients,
  onClose,
  onSaved,
}: {
  doc: Doc | null;
  categories: string[];
  clients: ClientOption[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const mobile = useMediaQuery("(max-width: 48em)");
  const [form, setForm] = useState({
    title: doc?.title ?? "",
    category: doc?.category ?? "infraestructura",
    clientId: doc?.client_id ?? null,
    tags: doc?.tags ?? [],
    content: doc?.content ?? "",
  });
  const [tab, setTab] = useState<string | null>("editar");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ id: string }>("/api/admin/docs", { method: "POST", json: { id: doc?.id, ...form } });
      notifyOk("Página guardada");
      onSaved(data.id);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={doc ? "Editar página" : "Nueva página"} size="xl" fullScreen={Boolean(mobile)}>
      <Stack gap="sm">
        <TextInput label="Título" required value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} />
        <Group grow align="flex-start">
          <Autocomplete
            label="Categoría"
            data={categories}
            value={form.category}
            onChange={(category) => setForm({ ...form, category })}
          />
          <Select
            label="Cliente (opcional)"
            clearable
            searchable
            data={clients}
            value={form.clientId}
            onChange={(clientId) => setForm({ ...form, clientId })}
          />
        </Group>
        <TagsInput label="Etiquetas" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} clearable />
        <Alert color="yellow" py={6}>
          No pegues contraseñas acá: para eso está la pestaña Credenciales, que las guarda cifradas.
        </Alert>
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List>
            <Tabs.Tab value="editar">Editar (Markdown)</Tabs.Tab>
            <Tabs.Tab value="vista">Vista previa</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="editar" pt="xs">
            <Textarea
              autosize
              minRows={14}
              maxRows={28}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.currentTarget.value })}
              placeholder={"## Servidor de producción\n\n| Dato | Valor |\n|---|---|\n| IP | 0.0.0.0 |\n| Proveedor | … |"}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13 } }}
            />
          </Tabs.Panel>
          <Tabs.Panel value="vista" pt="xs">
            <Paper p="md" mih={200}>
              <Markdown content={form.content} />
            </Paper>
          </Tabs.Panel>
        </Tabs>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!form.title.trim()}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
