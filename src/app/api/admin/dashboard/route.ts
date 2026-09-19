import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin/auth";
import { subscription } from "@/lib/env";
import { getUsdRate } from "@/lib/exchange/rate";
import { startOfLocalMonthISO } from "@/lib/subscription/period";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type MoneyRow = { amount: number | string; currency: string };

function sumByCurrency(rows: MoneyRow[]): { ars: number; usd: number } {
  let ars = 0;
  let usd = 0;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const currency = String(row.currency ?? "").toUpperCase();
    if (currency === "USD") usd += amount;
    else if (currency === "ARS") ars += amount;
  }
  return { ars, usd };
}

function totals(ars: number, usd: number, rate: number) {
  const r = rate > 0 ? rate : 1;
  return {
    ars,
    usd,
    totalUsd: usd + ars / r,
    totalArs: ars + usd * r,
  };
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  const period = new URL(request.url).searchParams.get("period") === "all" ? "all" : "month";
  const supabase = getSupabaseAdmin();

  try {
    let paymentsQuery = supabase
      .from("payments")
      .select("amount,currency")
      .eq("status", "approved");
    if (period === "month") {
      paymentsQuery = paymentsQuery.gte(
        "created_at",
        startOfLocalMonthISO(new Date(), subscription.timezone)
      );
    }

    const [paymentsRes, costsRes, invoicesRes, rate] = await Promise.all([
      paymentsQuery,
      supabase.from("costs").select("amount,currency").eq("active", true),
      supabase
        .from("invoices")
        .select("amount,currency,client_id")
        .in("status", ["pending", "overdue"]),
      getUsdRate(),
    ]);

    if (paymentsRes.error) throw paymentsRes.error;
    if (costsRes.error) throw costsRes.error;
    if (invoicesRes.error) throw invoicesRes.error;

    const earningsRaw = sumByCurrency((paymentsRes.data ?? []) as MoneyRow[]);
    const costsRaw = sumByCurrency((costsRes.data ?? []) as MoneyRow[]);
    const debtRaw = sumByCurrency((invoicesRes.data ?? []) as MoneyRow[]);

    const earnings = totals(earningsRaw.ars, earningsRaw.usd, rate.rate);
    const costs = totals(costsRaw.ars, costsRaw.usd, rate.rate);
    const debt = totals(debtRaw.ars, debtRaw.usd, rate.rate);
    const net = {
      totalUsd: earnings.totalUsd - costs.totalUsd,
      totalArs: earnings.totalArs - costs.totalArs,
    };

    const debtClients = new Set(
      (invoicesRes.data ?? []).map((row) => (row as { client_id?: string }).client_id)
    ).size;

    return okJson({
      period,
      rate: { usd: rate.rate, source: rate.source, updatedAt: rate.updatedAt, available: rate.rate > 0 },
      earnings,
      costs,
      net,
      debt: { ...debt, clients: debtClients },
      costsCount: (costsRes.data ?? []).length,
    });
  } catch (error) {
    console.error("[api/admin/dashboard]", error);
    return errorJson("No se pudo calcular el dashboard", 500, "DASHBOARD_ERROR");
  }
}
