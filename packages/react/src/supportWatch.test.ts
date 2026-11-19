import { describe, expect, it } from "vitest";
import { pendingAnswers, rememberSubmitted } from "./supportWatch";

const tickets = [
  { number: 1, title: "No anda el recibo", status: "waiting" },
  { number: 2, title: "Exportar a Excel", status: "analysis" },
  { number: 3, title: "Error al cobrar", status: "waiting" },
];

describe("pendingAnswers", () => {
  it("devuelve los reportes esperando respuesta aunque ya se hayan visto", () => {
    const seen = { statuses: { "1": "waiting", "3": "waiting" }, mine: [] };
    expect(pendingAnswers(seen, tickets, false).map((t) => t.number)).toEqual([1, 3]);
  });

  it("sin identidad, solo los cargados desde este navegador", () => {
    const state = rememberSubmitted({ statuses: {}, mine: [] }, 3);
    expect(pendingAnswers(state, tickets, true).map((t) => t.number)).toEqual([3]);
  });

  it("al responder (vuelve a análisis) deja de estar pendiente", () => {
    const answered = tickets.map((t) => ({ ...t, status: "analysis" }));
    expect(pendingAnswers({ statuses: {}, mine: [] }, answered, false)).toEqual([]);
  });
});
