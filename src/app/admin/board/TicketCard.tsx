"use client";

import type { DragEvent } from "react";
import { ActionIcon, Avatar, Badge, Button, Group, Menu, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { IconBug, IconBulb, IconClock, IconDots, IconHandGrab } from "@tabler/icons-react";
import { initials, relative } from "../lib/format";
import { COLUMNS, STATUS_LABEL, TYPE, URGENCY, sourceLabel, type Me, type Ticket, type TicketStatus } from "../lib/tickets";
import { agingLevel, humanDuration } from "./filter";

export function TicketCard({
  ticket,
  me,
  dragging,
  onOpen,
  onTake,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  ticket: Ticket;
  me: Me;
  dragging: boolean;
  onOpen: () => void;
  onTake: () => void;
  onMove: (status: TicketStatus) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent) => void;
}) {
  const type = TYPE[ticket.type];
  const urgency = URGENCY[ticket.urgency];
  const mine = me.id !== null && ticket.assignee_id === me.id;
  // Cuánto lleva en esta columna: naranja o rojo cuando se estanca (ver agingLevel).
  const aging = agingLevel(ticket.status, ticket.status_since);

  return (
    <Paper
      className="mg-card"
      p="sm"
      draggable
      data-dragging={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      tabIndex={0}
      role="button"
      aria-label={`Ticket ${ticket.number}: ${ticket.title}`}
      style={{ borderLeftColor: `var(--mantine-color-${urgency.color}-6)` }}
    >
      <Stack gap={6}>
        <Group justify="space-between" gap={6} wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            {ticket.type === "bug" ? (
              <IconBug size={14} color={`var(--mantine-color-${type.color}-6)`} />
            ) : (
              <IconBulb size={14} color={`var(--mantine-color-${type.color}-6)`} />
            )}
            <Text size="xs" c="dimmed" fw={500}>
              #{ticket.number}
            </Text>
            <Badge size="xs" color={urgency.color}>
              {urgency.label}
            </Badge>
          </Group>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={(event) => event.stopPropagation()}
                aria-label="Acciones"
              >
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
              <Menu.Label>Mover a</Menu.Label>
              {[...COLUMNS.map((c) => c.status), "discarded" as TicketStatus]
                .filter((status) => status !== ticket.status)
                .map((status) => (
                  <Menu.Item key={status} onClick={() => onMove(status)}>
                    {STATUS_LABEL[status]}
                  </Menu.Item>
                ))}
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Text size="sm" fw={600} lh={1.35} lineClamp={3} style={{ wordBreak: "break-word" }}>
          {ticket.title}
        </Text>

        {ticket.labels.length > 0 && (
          <Group gap={4}>
            {ticket.labels.slice(0, 4).map((label) => (
              <Badge key={label} size="xs" variant="outline" color="gray" tt="none">
                {label}
              </Badge>
            ))}
            {ticket.labels.length > 4 && (
              <Text size="xs" c="dimmed">
                +{ticket.labels.length - 4}
              </Text>
            )}
          </Group>
        )}

        <Group justify="space-between" gap={6} wrap="nowrap">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Tooltip
              label={`En «${STATUS_LABEL[ticket.status]}» desde ${relative(ticket.status_since)} · cargado ${relative(ticket.created_at)}`}
            >
              <Badge
                size="xs"
                variant={aging === "ok" ? "default" : "light"}
                color={aging === "late" ? "red" : aging === "warn" ? "orange" : "gray"}
                leftSection={<IconClock size={10} />}
                style={{ flexShrink: 0 }}
              >
                {humanDuration(Date.now() - new Date(ticket.status_since).getTime())}
              </Badge>
            </Tooltip>
            <Text size="xs" c="dimmed" truncate>
              {ticket.client_name}
              {ticket.channel !== "default" ? ` · ${sourceLabel(ticket.channel)}` : ""}
            </Text>
          </Group>
          {ticket.assignee_name ? (
            <Tooltip label={mine ? "Asignado a vos" : `Asignado a ${ticket.assignee_name}`}>
              <Avatar size={22} radius="xl" color={mine ? "brand" : "gray"}>
                <Text fz={10} fw={700}>
                  {initials(ticket.assignee_name)}
                </Text>
              </Avatar>
            </Tooltip>
          ) : (
            <Button
              className="mg-card-take"
              size="compact-xs"
              variant="light"
              leftSection={<IconHandGrab size={12} />}
              disabled={!me.id}
              onClick={(event) => {
                event.stopPropagation();
                onTake();
              }}
            >
              Tomar
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
