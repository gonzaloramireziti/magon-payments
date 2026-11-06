import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/auth";

export class DocError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type Doc = {
  id: string;
  title: string;
  category: string;
  client_id: string | null;
  client_name: string | null;
  tags: string[];
  content: string;
  updated_by: string | null;
  updated_at: string;
};

export async function listDocs(): Promise<Doc[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("docs")
    .select("id,title,category,client_id,tags,content,updated_by,updated_at,clients(name)")
    .order("category", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { clients, ...rest } = row as typeof row & { clients: { name: string } | null };
    return { ...(rest as Omit<Doc, "client_name">), client_name: clients?.name ?? null };
  });
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).filter(Boolean))
  ).slice(0, 15);
}

export async function saveDoc(session: AdminSession, raw: Record<string, unknown>) {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 160) : "";
  if (!title) throw new DocError("MISSING_TITLE", 400, "Falta el título");
  const category =
    typeof raw.category === "string" && raw.category.trim() ? raw.category.trim().toLowerCase().slice(0, 40) : "general";
  const row = {
    title,
    category,
    client_id: typeof raw.clientId === "string" && raw.clientId ? raw.clientId : null,
    tags: normalizeTags(raw.tags),
    content: typeof raw.content === "string" ? raw.content.slice(0, 100_000) : "",
    updated_by: session.name,
  };
  const supabase = getSupabaseAdmin();
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const { data, error } = id
    ? await supabase.from("docs").update(row).eq("id", id).select("id").single()
    : await supabase.from("docs").insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteDoc(id: string) {
  const { error } = await getSupabaseAdmin().from("docs").delete().eq("id", id);
  if (error) throw error;
}
