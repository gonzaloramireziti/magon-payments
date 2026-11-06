"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { api, notifyError, notifyOk } from "../lib/api";
import { money } from "../lib/format";

type Cost = { id: string; name: string; amount: number | string; currency: string; active: boolean };

export function Costs() {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [editing, setEditing] = useState<Cost | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ costs: Cost[] }>("/api/admin/costs");
      setCosts(data.costs);
    } catch (error) {
      notifyError(error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = (currency: string) =>
    costs.filter((c) => c.active && c.currency === currency).reduce((acc, c) => acc + Number(c.amount), 0);

  function remove(cost: Cost) {
    modals.openConfirmModal({
      title: "Borrar costo",
      children: <Text size="sm">¿Borrar «{cost.name}»?</Text>,
      labels: { confirm: "Borrar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`/api/admin/costs?id=${encodeURIComponent(cost.id)}`, { method: "DELETE" });
          notifyOk("Costo borrado");
          void load();
        } catch (error) {
          notifyError(error);
        }
      },
    });
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Costos fijos</Title>
          <Text size="sm" c="dimmed">
            {money(total("ARS"), "ARS")} + {money(total("USD"), "USD")} por mes
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
          Nuevo costo
        </Button>
      </Group>

      <Paper>
        {costs.map((cost, index) => (
          <Group
            key={cost.id}
            justify="space-between"
            px="md"
            py="sm"
            wrap="nowrap"
            style={index ? { borderTop: "1px solid var(--mantine-color-default-border)" } : undefined}
          >
            <div style={{ minWidth: 0 }}>
              <Group gap={8}>
                <Text size="sm" fw={600}>
                  {cost.name}
                </Text>
                {!cost.active && (
                  <Badge size="xs" color="gray">
                    Inactivo
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {money(Number(cost.amount), cost.currency)} / mes
              </Text>
            </div>
            <Group gap={4} wrap="nowrap">
              <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(cost)} aria-label="Editar">
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" onClick={() => remove(cost)} aria-label="Borrar">
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
        ))}
        {costs.length === 0 && (
          <Text size="sm" c="dimmed" p="md">
            No hay costos cargados.
          </Text>
        )}
      </Paper>

      {editing && (
        <CostModal
          cost={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </Stack>
  );
}

function CostModal({ cost, onClose, onSaved }: { cost: Cost | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cost?.name ?? "");
  const [amount, setAmount] = useState<number | string>(cost ? Number(cost.amount) : "");
  const [currency, setCurrency] = useState(cost?.currency ?? "ARS");
  const [active, setActive] = useState(cost?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/admin/costs", {
        method: cost ? "PATCH" : "POST",
        json: { id: cost?.id, name, amount: Number(amount), currency, active },
      });
      notifyOk(cost ? "Costo actualizado" : "Costo creado");
      onSaved();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={cost ? "Editar costo" : "Nuevo costo"}>
      <Stack gap="sm">
        <TextInput label="Nombre" placeholder="Hosting, dominio…" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Group grow align="flex-end">
          <NumberInput label="Monto mensual" value={amount} onChange={setAmount} min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," />
          <SegmentedControl value={currency} onChange={setCurrency} data={["ARS", "USD"]} />
        </Group>
        <Switch label="Activo" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
