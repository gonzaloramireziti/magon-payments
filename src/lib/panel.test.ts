import { describe, expect, it, vi } from "vitest";

// Los módulos de servicio importan Supabase al cargarse: acá solo se prueban sus funciones puras.
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

const { can, permissionsFor, isRole } = await import("./admin/roles");
const { alertThreshold, nextState, daysBetween } = await import("./infra/service");
const { elapsedMinutes } = await import("./time/service");
const { isTicketStatus, resolvedAtFor } = await import("./tickets/policy");
const { buildReportText } = await import("./reports/clientReport");
const { parseDuration, duration } = await import("../app/admin/lib/time");

describe("roles", () => {
  it("solo el admin ve la plata y administra", () => {
    expect(can("admin", "finance")).toBe(true);
    expect(can("dev", "finance")).toBe(false);
    expect(can("soporte", "manage")).toBe(false);
  });
  it("desarrollo usa bóveda y agente; soporte no", () => {
    expect(permissionsFor("dev")).toEqual(["vault", "agent"]);
    expect(can("soporte", "vault")).toBe(false);
    expect(can("soporte", "agent")).toBe(false);
  });
  it("valida los roles", () => {
    expect(isRole("dev")).toBe(true);
    expect(isRole("root")).toBe(false);
  });
});

describe("horas", () => {
  it.each([
    ["1:30", 90],
    ["2", 120],
    ["1.5", 90],
    ["1,5", 90],
    ["45", 45],
    ["45m", 45],
    ["2h", 120],
    ["1h 15m", 75],
    ["3 horas", 180],
    ["0", null],
    ["25h", null],
    ["abc", null],
  ])("«%s» son %s minutos", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });
  it("muestra la duración", () => {
    expect(duration(90)).toBe("1 h 30 min");
    expect(duration(60)).toBe("1 h");
    expect(duration(5)).toBe("5 min");
  });
  it("el cronómetro guarda al menos 1 minuto y como mucho 24 h", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(elapsedMinutes("2026-11-16T11:59:50Z", now)).toBe(1);
    expect(elapsedMinutes("2026-11-16T10:30:00Z", now)).toBe(90);
    expect(elapsedMinutes("2026-11-10T00:00:00Z", now)).toBe(1440);
  });
});

describe("vencimientos", () => {
  it("avisa a los 30, 7, 1 y 0 días, una vez por umbral", () => {
    expect(alertThreshold(45, null)).toBeNull();
    expect(alertThreshold(30, null)).toBe(30);
    expect(alertThreshold(20, 30)).toBeNull();
    expect(alertThreshold(7, 30)).toBe(7);
    expect(alertThreshold(3, null)).toBe(7);
    expect(alertThreshold(1, 7)).toBe(1);
    expect(alertThreshold(0, 1)).toBe(0);
    expect(alertThreshold(0, 0)).toBeNull();
    expect(alertThreshold(-1, null)).toBeNull();
  });
  it("cuenta días entre fechas", () => {
    expect(daysBetween("2026-11-16", "2026-12-16")).toBe(30);
    expect(daysBetween("2026-11-16", "2026-11-15")).toBe(-1);
  });
});

describe("monitoreo", () => {
  it("una falla aislada no lo marca caído; dos seguidas sí", () => {
    expect(nextState({ status: "up", fail_count: 0 }, false)).toEqual({ status: "up", fail_count: 1, changed: null });
    expect(nextState({ status: "up", fail_count: 1 }, false)).toEqual({ status: "down", fail_count: 2, changed: "down" });
  });
  it("mientras sigue caído no vuelve a avisar", () => {
    expect(nextState({ status: "down", fail_count: 4 }, false).changed).toBeNull();
  });
  it("al volver avisa una vez y reinicia el contador", () => {
    expect(nextState({ status: "down", fail_count: 4 }, true)).toEqual({ status: "up", fail_count: 0, changed: "up" });
    expect(nextState({ status: null, fail_count: 0 }, true).changed).toBeNull();
  });
});

describe("tickets", () => {
  it("«Esperando al cliente» es un estado válido y no cierra el ticket", () => {
    expect(isTicketStatus("waiting")).toBe(true);
    expect(resolvedAtFor("waiting", null, "2026-11-16T00:00:00Z")).toBeNull();
    expect(resolvedAtFor("done", null, "2026-11-16T00:00:00Z")).toBe("2026-11-16T00:00:00Z");
  });
});

describe("resumen mensual al cliente", () => {
  const base = {
    client: { id: "c1", name: "Carpoint", email: null },
    period: "2026-10",
    periodLabel: "octubre 2026",
    resolved: [{ number: 12, title: "Exportar a Excel", type: "feature", status: "done", channel: "default", created_at: "", resolved_at: "" }],
    opened: [],
    inProgress: [],
    incidents: [],
    minutes: 150,
    projects: [{ name: "Turnos", status: "in_progress", done: 1, total: 3, due_date: null }],
  };
  it("lista lo resuelto, los proyectos y las horas, sin datos internos", () => {
    const text = buildReportText(base);
    expect(text).toContain("Hola Carpoint");
    expect(text).toContain("#12 Exportar a Excel");
    expect(text).toContain("Turnos (en curso · 1/3 etapas)");
    expect(text).toContain("2,5 h");
    expect(text).toContain("Sin caídas");
  });
});
