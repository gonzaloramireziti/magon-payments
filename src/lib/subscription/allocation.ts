import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { InvoiceRow } from "@/lib/subscription/service";

export async function allocatePaymentToInvoices(
  clientId: string,
  amount: number,
  paymentId: string | null
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["pending", "overdue"])
    .order("due_date", { ascending: true });

  const invoices = (data ?? []) as InvoiceRow[];
  const paidIds: string[] = [];
  let remaining = amount;

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const due = Number(invoice.amount);
    if (remaining + 0.001 >= due) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: now })
        .eq("id", invoice.id);
      if (!error) {
        paidIds.push(invoice.id);
        remaining -= due;
      }
    }
  }

  if (paymentId && paidIds.length > 0) {
    await supabase
      .from("payments")
      .update({ invoice_id: paidIds[paidIds.length - 1] })
      .eq("id", paymentId);
  }

  return paidIds;
}

export async function markInvoicesPaid(invoiceIds: string[]): Promise<string[]> {
  if (invoiceIds.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: now })
    .in("id", invoiceIds)
    .in("status", ["pending", "overdue"]);
  if (error) throw error;
  return invoiceIds;
}
