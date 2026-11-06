import { Group, Text, ThemeIcon } from "@mantine/core";

export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <Group gap={8} wrap="nowrap">
      <ThemeIcon size={big ? 32 : 26} radius="md" variant="filled">
        <Text fw={800} fz={big ? 16 : 13} c="white">
          M
        </Text>
      </ThemeIcon>
      <Text fw={700} fz={big ? 20 : 15}>
        Magon
      </Text>
    </Group>
  );
}
