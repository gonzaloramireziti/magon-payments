import Image from "next/image";
import { Group, Text } from "@mantine/core";

export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  const px = big ? 36 : 28;
  return (
    <Group gap={8} wrap="nowrap">
      <Image
        src="/brand/magon-logo.png"
        alt="Magon"
        width={px}
        height={px}
        priority
        style={{ display: "block", borderRadius: "50%" }}
      />
      <Text fw={700} fz={big ? 20 : 15}>
        Magon
      </Text>
    </Group>
  );
}
