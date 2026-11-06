import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subscription } from "@/lib/env";
import { addMonths, startOfLocalMonthISO } from "@/lib/subscription/period";

export type PaymentListItem = {
  id: string;
  clientId: string;
  clientName: string;
  provider: string;
  status: string;
  method: string | null;
  amount: number;
  netAmount: number | null;
  currency: string;
  period: string | null;
  note: string | null;
  createdAt: string;
};

export type PaymentFilters = { month?: string | null; clientId?: string | null; status?: string | null };

function monthStartISO(month: string): string {
  // Mediados de mes en UTC cae siempre dentro del mes local, sea cual sea la zona horaria.
  const probe = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15));
  return startOfLocalMonthISO(probe, subscription.timezone);
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export async function listPayments(filters: PaymentFilters): Promise<PaymentListItem[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("payments")
    .select(
      "id,client_id,provider,status,payment_method,amount,net_amount,currency,raw_payload,created_at,clients(name),invoices(period)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (isMonth(filters.month)) {
    query = query
      .gte("created_at", monthStartISO(filters.month))
      .lt("created_at", monthStartISO(addMonths(filters.month, 1)));
  }
  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const client = row.clients as unknown as { name: string } | null;
    const invoice = row.invoices as unknown as { period: string } | null;
    const payload = (row.raw_payload ?? {}) as { note?: unknown };
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: client?.name ?? "-",
      provider: row.provider as string,
      status: row.status as string,
      method: (row.payment_method as string | null) ?? null,
      amount: Number(row.amount) || 0,
      netAmount: row.net_amount === null ? null : Number(row.net_amount),
      currency: row.currency as string,
      period: invoice?.period ?? null,
      note: typeof payload.note === "string" && payload.note !== "" ? payload.note : null,
      createdAt: row.created_at as string,
    };
  });
}
