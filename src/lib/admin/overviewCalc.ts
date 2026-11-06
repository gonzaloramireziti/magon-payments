// Cálculos del inicio del panel, sin dependencias: reciben los datos ya leídos de la base.

export type Amounts = { ARS: number; USD: number };

export type OverviewInvoice = {
  period: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "canceled";
};

export type OverviewClient = {
  id: string;
  name: string;
  phone: string | null;
  currency: string;
  monthlyAmount: number;
  state: string;
  amountDue: number;
  invoices: OverviewInvoice[];
};

export type CollectionRow = {
  clientId: string;
  name: string;
  phone: string | null;
  currency: string;
  state: string;
  amountDue: number;
  unpaidCount: number;
  oldestDueDate: string | null;
  // Positivo: días de atraso. Negativo: días que faltan para el vencimiento.
  daysOverdue: number | null;
  periodPaid: boolean;
};

export type PeriodSummary = {
  billed: Amounts;
  paid: Amounts;
  pending: Amounts;
  overdue: Amounts;
  invoices: number;
  paidInvoices: number;
};

export function emptyAmounts(): Amounts {
  return { ARS: 0, USD: 0 };
}

export function addAmount(target: Amounts, amount: number, currency: string): void {
  const key = currency.toUpperCase() === "USD" ? "USD" : "ARS";
  target[key] += Number.isFinite(amount) ? amount : 0;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const toUTC = (iso: string) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / 86_400_000);
}

function isUnpaid(invoice: OverviewInvoice): boolean {
  return invoice.status === "pending" || invoice.status === "overdue";
}

// "Vencido" son las facturas impagas cuyo vencimiento ya pasó, de cualquier período.
export function summarizePeriod(
  clients: OverviewClient[],
  period: string,
  today: string
): PeriodSummary {
  const summary: PeriodSummary = {
    billed: emptyAmounts(),
    paid: emptyAmounts(),
    pending: emptyAmounts(),
    overdue: emptyAmounts(),
    invoices: 0,
    paidInvoices: 0,
  };

  for (const client of clients) {
    for (const invoice of client.invoices) {
      if (invoice.status === "canceled") continue;
      if (isUnpaid(invoice) && invoice.dueDate < today) {
        addAmount(summary.overdue, invoice.amount, invoice.currency);
      }
      if (invoice.period !== period) continue;
      summary.invoices += 1;
      addAmount(summary.billed, invoice.amount, invoice.currency);
      if (invoice.status === "paid") {
        summary.paidInvoices += 1;
        addAmount(summary.paid, invoice.amount, invoice.currency);
      } else {
        addAmount(summary.pending, invoice.amount, invoice.currency);
      }
    }
  }
  return summary;
}

const STATE_ORDER: Record<string, number> = { blocked: 0, due: 1, active: 2 };

// Lista de cobranza: primero los bloqueados (el más atrasado arriba), después los que están
// por vencer y al final los que ya pagaron.
export function collectionList(
  clients: OverviewClient[],
  period: string,
  today: string
): CollectionRow[] {
  return clients
    .map((client) => {
      const unpaid = client.invoices
        .filter(isUnpaid)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const oldest = unpaid[0]?.dueDate ?? null;
      const periodInvoice = client.invoices.find((invoice) => invoice.period === period);
      return {
        clientId: client.id,
        name: client.name,
        phone: client.phone,
        currency: client.currency,
        state: client.state,
        amountDue: client.amountDue,
        unpaidCount: unpaid.length,
        oldestDueDate: oldest,
        daysOverdue: oldest ? daysBetween(oldest, today) : null,
        periodPaid: periodInvoice?.status === "paid",
      };
    })
    .sort((a, b) => {
      const byState = (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3);
      if (byState !== 0) return byState;
      return (b.daysOverdue ?? -Infinity) - (a.daysOverdue ?? -Infinity);
    });
}

export function convert(amounts: Amounts, rate: number): { totalArs: number; totalUsd: number } {
  const r = rate > 0 ? rate : 1;
  return { totalArs: amounts.ARS + amounts.USD * r, totalUsd: amounts.USD + amounts.ARS / r };
}
