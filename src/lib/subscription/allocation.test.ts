import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase falso: guarda las facturas en memoria y registra los updates.
type Invoice = { id: string; amount: number; due_date: string; status: string };
let invoices: Invoice[] = [];
let paymentUpdates: Array<Record<string, unknown>> = [];

function builder(table: string) {
  const filters: Array<(row: Invoice) => boolean> = [];
  let update: Record<string, unknown> | null = null;
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filters.push((row) => (row as Record<string, unknown>)[column] === value || column === "client_id");
      return api;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes((row as Record<string, unknown>)[column]));
      return api;
    },
    order: () => api,
    update: (values: Record<string, unknown>) => {
      update = values;
      return api;
    },
    then: (resolve: (value: { data: unknown; error: null }) => void) => {
      if (table === "payments") {
        if (update) paymentUpdates.push(update);
        return resolve({ data: null, error: null });
      }
      const rows = invoices.filter((row) => filters.every((f) => f(row)));
      if (update) {
        for (const row of rows) Object.assign(row, update);
        return resolve({ data: null, error: null });
      }
      return resolve({ data: rows.map((r) => ({ ...r })).sort((a, b) => a.due_date.localeCompare(b.due_date)), error: null });
    },
  };
  return api;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => builder(table) }) }));

const { allocatePaymentToInvoices } = await import("./allocation");

describe("asignación de pagos a facturas (FIFO)", () => {
  beforeEach(() => {
    invoices = [
      { id: "jul", amount: 15000, due_date: "2026-08-10", status: "overdue" },
      { id: "ago", amount: 15000, due_date: "2026-09-10", status: "pending" },
      { id: "sep", amount: 15000, due_date: "2026-10-10", status: "pending" },
    ];
    paymentUpdates = [];
  });

  it("paga primero la factura más vieja", async () => {
    const paid = await allocatePaymentToInvoices("c1", 15000, "p1");
    expect(paid).toEqual(["jul"]);
    expect(invoices.find((i) => i.id === "jul")?.status).toBe("paid");
    expect(invoices.find((i) => i.id === "ago")?.status).toBe("pending");
    expect(paymentUpdates).toEqual([{ invoice_id: "jul" }]);
  });

  it("con el monto de dos facturas paga las dos más viejas", async () => {
    expect(await allocatePaymentToInvoices("c1", 30000, null)).toEqual(["jul", "ago"]);
  });

  it("un pago parcial no marca nada como pagado", async () => {
    expect(await allocatePaymentToInvoices("c1", 10000, "p1")).toEqual([]);
    expect(invoices.every((i) => i.status !== "paid")).toBe(true);
    expect(paymentUpdates).toEqual([]);
  });

  it("tolera diferencias de centavos por redondeo", async () => {
    expect(await allocatePaymentToInvoices("c1", 14999.9995, null)).toEqual(["jul"]);
  });
});
