import { describe, expect, it } from "vitest";
import { addMonths, dueDateForPeriod, formatPeriodLabel, getPeriodInfo, periodOf } from "./period";

const TZ = "America/Argentina/Buenos_Aires";
// Mediodía en Argentina (15:00 UTC) para no depender del borde del día.
const at = (date: string) => new Date(`${date}T15:00:00Z`);

describe("regla de facturación (se paga contra factura del mes anterior)", () => {
  it("el día 5 se cobra el mes anterior, vence el 10 y todavía no está vencido", () => {
    const info = getPeriodInfo(at("2026-09-05"), TZ, 10);
    expect(info.billingPeriod).toBe("2026-08");
    expect(info.currentPeriod).toBe("2026-09");
    expect(info.dueDate).toBe("2026-09-10");
    expect(info.daysUntilDue).toBe(5);
    expect(info.isPastDue).toBe(false);
  });

  it("el día 10 vence hoy (todavía no bloquea)", () => {
    const info = getPeriodInfo(at("2026-09-10"), TZ, 10);
    expect(info.daysUntilDue).toBe(0);
    expect(info.isPastDue).toBe(false);
  });

  it("desde el 11 está vencido", () => {
    const info = getPeriodInfo(at("2026-09-11"), TZ, 10);
    expect(info.daysUntilDue).toBe(-1);
    expect(info.isPastDue).toBe(true);
  });

  it("en enero factura diciembre del año anterior", () => {
    const info = getPeriodInfo(at("2027-01-03"), TZ, 10);
    expect(info.billingPeriod).toBe("2026-12");
    expect(info.dueDate).toBe("2027-01-10");
  });

  it("usa la fecha de Argentina, no la UTC (23:30 del 31 en AR ya es 1° en UTC)", () => {
    const lateNight = new Date("2026-09-01T02:30:00Z"); // 31/08 23:30 en Argentina
    expect(periodOf(lateNight, TZ)).toBe("2026-08");
    expect(getPeriodInfo(lateNight, TZ).billingPeriod).toBe("2026-07");
  });
});

describe("períodos", () => {
  it("suma y resta meses cruzando años", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-05", -13)).toBe("2025-04");
  });

  it("el servicio de agosto vence el 10 de septiembre", () => {
    expect(dueDateForPeriod("2026-08")).toBe("2026-09-10");
    expect(dueDateForPeriod("2026-12", 5)).toBe("2027-01-05");
  });

  it("nombra el período en castellano", () => {
    expect(formatPeriodLabel("2026-08").toLowerCase()).toContain("agosto");
  });
});
