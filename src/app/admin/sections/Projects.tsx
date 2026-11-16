"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconDots, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { api, notifyError } from "../lib/api";
import { shortDate } from "../lib/format";
import { duration } from "../lib/time";
import type { Me, PanelUser } from "../lib/tickets";

export type ProjectStatus = "planning" | "in_progress" | "paused" | "delivered" | "cancelled";
export type Milestone = { id: string; title: string; due_date: string | null; done_at: string | null; position: number };
export type Project = {
  id: string;
  client_id: string;
  client_name: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string | null;
  owner_name: string | null;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  budget: number | null;
  currency: "ARS" | "USD";
  milestones: Milestone[];
  tickets: { total: number; closed: number };
  minutes: number;
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; color: string }> = {
  planning: { label: "Planificando", color: "gray" },
  in_progress: { label: "En curso", color: "brand" },
  paused: { label: "En pausa", color: "yellow" },
  delivered: { label: "Entregado", color: "teal" },
  cancelled: { label: "Cancelado", color: "red" },
};

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86_400_000);
}

export function ProjectsSection({
  me,
  projects,
  state,
  clients,
  users,
  onChange,
}: {
  me: Me;
  projects: Project[];
  state: "loading" | "ready" | "unavailable";
  clients: Array<{ id: string; name: string }>;
  users: PanelUser[];
  onChange: (projects: Project[]) => void;
}) {
  const manage = me.permissions.includes("manage");
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const visible = projects.filter((p) => filter === "all" || ["planning", "in_progress", "paused"].includes(p.status));

  async function post(json: Record<string, unknown>) {
    try {
      const data = await api<{ projects: Project[] }>("/api/admin/projects", { method: "POST", json });
      onChange(data.projects);
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    }
  }

  async function remove(project: Project) {
    if (!window.confirm(`¿Borrar el proyecto «${project.name}»? Los tickets quedan, sin proyecto.`)) return;
    try {
      await api(`/api/admin/projects?id=${encodeURIComponent(project.id)}`, { method: "DELETE" });
      onChange(projects.filter((p) => p.id !== project.id));
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Proyectos</Title>
          <Text size="sm" c="dimmed">
            Desarrollos grandes con etapas y fecha de entrega. Los tickets del proyecto suman avance y horas.
          </Text>
        </div>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={(v) => setFilter(v as "active" | "all")}
            data={[
              { value: "active", label: "Activos" },
              { value: "all", label: "Todos" },
            ]}
          />
          {manage && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ status: "planning", currency: "USD" })}>
              Nuevo proyecto
            </Button>
          )}
        </Group>
      </Group>

      {state === "unavailable" && <Alert color="yellow">Falta correr la migración 015 (supabase/migrations/015_projects_sales_agenda.sql).</Alert>}
      {state === "ready" && visible.length === 0 && (
        <Paper p="md">
          <Text size="sm" c="dimmed">
            {filter === "active" ? "No hay proyectos activos." : "Todavía no hay proyectos."}
            {manage ? " Creá uno para un desarrollo grande (un cliente nuevo, un módulo completo)." : ""}
          </Text>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {visible.map((project) => {
          const done = project.milestones.filter((m) => m.done_at).length;
          const total = project.milestones.length;
          const progress = total ? (done / total) * 100 : project.tickets.total ? (project.tickets.closed / project.tickets.total) * 100 : 0;
          const hours = project.minutes / 60;
          const over = project.estimated_hours ? hours > project.estimated_hours : false;
          const due = project.due_date ? daysUntil(project.due_date) : null;
          const late = due !== null && due < 0 && !["delivered", "cancelled"].includes(project.status);
          return (
            <Paper key={project.id} p="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Text fw={700} truncate>
                    {project.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {project.client_name}
                    {project.owner_name ? ` · ${project.owner_name}` : ""}
                  </Text>
                </div>
                <Group gap={4} wrap="nowrap">
                  <Badge color={PROJECT_STATUS[project.status].color} variant="light">
                    {PROJECT_STATUS[project.status].label}
                  </Badge>
                  {manage && (
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="Acciones">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(project)}>
                          Editar
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => void remove(project)}>
                          Borrar
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              </Group>

              <Progress value={progress} mt="sm" size="sm" color={late ? "red" : "brand"} />
              <Group justify="space-between" mt={6} gap="xs">
                <Text size="xs" c="dimmed">
                  {total ? `${done}/${total} etapas` : `${project.tickets.closed}/${project.tickets.total} tickets`}
                  {total && project.tickets.total ? ` · ${project.tickets.closed}/${project.tickets.total} tickets` : ""}
                </Text>
                <Text size="xs" c={late ? "red" : "dimmed"}>
                  {project.due_date
                    ? late
                      ? `Atrasado ${-due!} día(s) (${shortDate(project.due_date)})`
                      : `Entrega ${shortDate(project.due_date)}${due !== null && due <= 14 && due >= 0 ? ` · faltan ${due} días` : ""}`
                    : "Sin fecha de entrega"}
                </Text>
              </Group>
              <Group gap="xs" mt={4}>
                <Text size="xs" c={over ? "red" : "dimmed"}>
                  {duration(project.minutes)} trabajadas
                  {project.estimated_hours ? ` de ${project.estimated_hours} h estimadas` : ""}
                </Text>
                {project.budget !== null && (
                  <Text size="xs" c="dimmed">
                    · Presupuesto {project.currency} {project.budget.toLocaleString("es-AR")}
                  </Text>
                )}
              </Group>

              {project.description && (
                <Text size="sm" mt="xs" lineClamp={3} style={{ whiteSpace: "pre-wrap" }}>
                  {project.description}
                </Text>
              )}

              <Stack gap={4} mt="sm">
                {project.milestones.map((m) => (
                  <Group key={m.id} justify="space-between" wrap="nowrap" gap="xs">
                    <Checkbox
                      size="xs"
                      checked={Boolean(m.done_at)}
                      onChange={(e) => void post({ milestone: { id: m.id, done: e.currentTarget.checked } })}
                      label={
                        <Text size="sm" td={m.done_at ? "line-through" : undefined} c={m.done_at ? "dimmed" : undefined}>
                          {m.title}
                          {m.due_date ? (
                            <Text span size="xs" c="dimmed">
                              {" "}
                              · {shortDate(m.due_date)}
                            </Text>
                          ) : null}
                        </Text>
                      }
                    />
                    {manage && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label="Quitar etapa"
                        onClick={() => void post({ milestone: { id: m.id, delete: true } })}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}
                {manage && <AddMilestone onAdd={(title, dueDate) => post({ milestone: { projectId: project.id, title, dueDate } })} />}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>

      {editing && (
        <ProjectModal
          project={editing}
          clients={clients}
          users={users}
          showBudget={me.permissions.includes("finance")}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (await post({ ...(editing.id ? { id: editing.id } : {}), ...values })) setEditing(null);
          }}
        />
      )}
    </Stack>
  );
}

function AddMilestone({ onAdd }: { onAdd: (title: string, dueDate: string | null) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  async function add() {
    if (!title.trim()) return;
    if (await onAdd(title.trim(), dueDate || null)) {
      setTitle("");
      setDueDate("");
    }
  }
  return (
    <Group gap={6} wrap="nowrap" mt={4}>
      <TextInput
        size="xs"
        placeholder="Nueva etapa (ej: Diseño aprobado)"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && void add()}
        style={{ flex: 1 }}
      />
      <TextInput size="xs" type="date" value={dueDate} onChange={(e) => setDueDate(e.currentTarget.value)} w={140} />
      <ActionIcon variant="light" onClick={() => void add()} disabled={!title.trim()} aria-label="Agregar etapa">
        <IconPlus size={14} />
      </ActionIcon>
    </Group>
  );
}

function ProjectModal({
  project,
  clients,
  users,
  showBudget,
  onClose,
  onSave,
}: {
  project: Partial<Project>;
  clients: Array<{ id: string; name: string }>;
  users: PanelUser[];
  showBudget: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: project.name ?? "",
    clientId: project.client_id ?? null,
    description: project.description ?? "",
    status: project.status ?? "planning",
    ownerId: project.owner_id ?? null,
    startDate: project.start_date ?? "",
    dueDate: project.due_date ?? "",
    estimatedHours: project.estimated_hours ?? "",
    budget: project.budget ?? "",
    currency: project.currency ?? "USD",
  });
  const [saving, setSaving] = useState(false);

  return (
    <Modal opened onClose={onClose} title={project.id ? `Editar ${project.name}` : "Nuevo proyecto"} size="lg">
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Nombre" placeholder="Sistema de turnos" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <Select
            label="Cliente"
            data={clients.map((c) => ({ value: c.id, label: c.name }))}
            value={form.clientId}
            onChange={(v) => setForm({ ...form, clientId: v })}
            searchable
          />
        </Group>
        <Textarea label="Alcance" autosize minRows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
        <Group grow>
          <Select
            label="Estado"
            data={Object.entries(PROJECT_STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={form.status}
            onChange={(v) => v && setForm({ ...form, status: v as ProjectStatus })}
            allowDeselect={false}
          />
          <Select
            label="Responsable"
            data={users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))}
            value={form.ownerId}
            onChange={(v) => setForm({ ...form, ownerId: v })}
            clearable
          />
        </Group>
        <Group grow>
          <TextInput label="Inicio" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} />
          <TextInput label="Entrega" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.currentTarget.value })} />
          <NumberInput label="Horas estimadas" min={0} value={form.estimatedHours} onChange={(v) => setForm({ ...form, estimatedHours: v === "" ? "" : Number(v) })} />
        </Group>
        {showBudget && (
          <Group grow>
            <NumberInput label="Presupuesto" min={0} decimalScale={2} value={form.budget} onChange={(v) => setForm({ ...form, budget: v === "" ? "" : Number(v) })} />
            <Select label="Moneda" data={["USD", "ARS"]} value={form.currency} onChange={(v) => v && setForm({ ...form, currency: v as "USD" | "ARS" })} allowDeselect={false} />
          </Group>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={saving}
            disabled={!form.name.trim() || !form.clientId}
            onClick={async () => {
              setSaving(true);
              const { budget, currency, ...rest } = form;
              await onSave({ ...rest, ...(showBudget ? { budget, currency } : {}) });
              setSaving(false);
            }}
          >
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
