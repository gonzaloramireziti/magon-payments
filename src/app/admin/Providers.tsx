"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { theme } from "./theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ModalsProvider labels={{ confirm: "Confirmar", cancel: "Cancelar" }}>
        <Notifications position="top-right" limit={3} />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
