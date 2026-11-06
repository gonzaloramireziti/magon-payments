import { createTheme, rem } from "@mantine/core";

// Tema del panel: denso y sobrio, en la línea de Rentiva. El violeta es el acento de Magon.
export const theme = createTheme({
  fontFamily: "var(--font-inter), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  colors: {
    brand: [
      "#f3efff", "#e2dbfb", "#c3b3f2", "#a289ea", "#8665e3",
      "#744ede", "#6a42dd", "#5934c4", "#4e2db0", "#42259b",
    ],
  },
  fontSizes: { xs: rem(11), sm: rem(13), md: rem(14), lg: rem(16), xl: rem(20) },
  headings: {
    fontWeight: "650",
    sizes: {
      h1: { fontSize: rem(22), lineHeight: "1.3" },
      h2: { fontSize: rem(17), lineHeight: "1.35" },
      h3: { fontSize: rem(14), lineHeight: "1.4" },
    },
  },
  components: {
    Paper: { defaultProps: { withBorder: true, radius: "md" } },
    Card: { defaultProps: { withBorder: true, radius: "md" } },
    Badge: { defaultProps: { radius: "sm", variant: "light" } },
    Button: { defaultProps: { radius: "md" } },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.35, blur: 2 } } },
    Modal: { defaultProps: { centered: true, overlayProps: { backgroundOpacity: 0.35, blur: 2 } } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 300 } },
  },
});
