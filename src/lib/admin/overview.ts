import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subscription } from "@/lib/env";
import { getUsdRate } from "@/lib/exchange/rate";
import { getSubscriptionStatus } from "@/lib/subscription/service";
import {
  formatPeriodLabel,
  getPeriodInfo,
  startOfLocalMonthISO,
} from "@/lib/subscription/period";
import {
  addAmount,
  collectionList,
  convert,
  emptyAmounts,
  summarizePeriod,
  type OverviewClient,
} from "@/lib/admin/overviewCalc";

type ClientRecord = {
  id: string;
  client_key: string;
  name: string;
  phone: string | null;
  currency: string;
  monthly_amount: number | string;
};

async function loadActiveClients(): Promise<OverviewClient[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("id,client_key,name,phone,currency,monthly_amount")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;

  // getSubscriptionStatus genera las facturas que falten y marca las vencidas, así que el
  // resumen siempre ve el período en curso aunque el cliente no haya entrado a su sistema.
  const rows = await Promise.all(
    ((data ?? []) as ClientRecord[]).map(async (client): Promise<OverviewClient | null> => {
      try {
        const status = await getSubscriptionStatus(client.client_key);
        return {
          id: client.id,
          name: client.name,
          phone: client.phone,
          currency: client.currency,
          monthlyAmount: Number(client.monthly_amount) || 0,
          state: status.state,
          amountDue: status.amountDue,
          invoices: status.invoices,
        };
      } catch (error) {
        console.error("[admin/overview] estado de", client.name, error);
        return null;
      }
    })
  );
  return rows.filter((row): row is OverviewClient => row !== null);
}

async function collectedThisMonth() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payments")
    .select("amount,currency")
    .eq("status", "approved")
    .gte("created_at", startOfLocalMonthISO(new Date(), subscription.timezone));
  if (error) throw error;
  const amounts = emptyAmounts();
  for (const row of data ?? []) addAmount(amounts, Number(row.amount), String(row.currency));
  return { amounts, count: (data ?? []).length };
}

// Si la migración de tickets todavía no se corrió, el inicio funciona igual sin ese bloque.
async function ticketCounts() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select("status,type")
    .not("status", "in", "(done,discarded)");
  if (error) return null;
  const rows = data ?? [];
  return {
    new: rows.filter((row) => row.status === "new").length,
    open: rows.length,
    bugs: rows.filter((row) => row.type === "bug").length,
    features: rows.filter((row) => row.type === "feature").length,
  };
}

export async function getAdminOverview() {
  const info = getPeriodInfo(new Date(), subscription.timezone, subscription.dueDay);
  const [clients, collected, rate, tickets] = await Promise.all([
    loadActiveClients(),
    collectedThisMonth(),
    getUsdRate(),
    ticketCounts(),
  ]);

  const summary = summarizePeriod(clients, info.billingPeriod, info.today);

  return {
    today: info.today,
    period: info.billingPeriod,
    periodLabel: formatPeriodLabel(info.billingPeriod),
    dueDate: info.dueDate,
    daysUntilDue: info.daysUntilDue,
    rate: { usd: rate.rate, source: rate.source, available: rate.rate > 0 },
    summary: {
      ...summary,
      totals: {
        billed: convert(summary.billed, rate.rate),
        paid: convert(summary.paid, rate.rate),
        pending: convert(summary.pending, rate.rate),
        overdue: convert(summary.overdue, rate.rate),
      },
    },
    collected: {
      ...collected,
      totals: convert(collected.amounts, rate.rate),
    },
    collection: collectionList(clients, info.billingPeriod, info.today),
    tickets,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
