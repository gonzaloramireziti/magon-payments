// Repos de GitHub de un cliente, como "owner/nombre" u "owner/nombre@rama" cuando el cliente
// trabaja sobre una rama propia (p. ej. una rama por cliente). Sin dependencias: se prueba suelto.

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}(@[A-Za-z0-9._/-]{1,100})?$/;

/** Separa "owner/nombre@rama" en el repo y la rama base (null = la rama por defecto). */
export function splitRepo(entry: string): { repo: string; base: string | null } {
  const at = entry.indexOf("@");
  return at === -1 ? { repo: entry, base: null } : { repo: entry.slice(0, at), base: entry.slice(at + 1) };
}

/** Acepta "owner/nombre[@rama]" o la URL del repo; descarta lo inválido y los repetidos. */
export function normalizeRepos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const repo = item
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
    if (REPO.test(repo) && !result.some((r) => r.toLowerCase() === repo.toLowerCase())) result.push(repo);
  }
  return result.slice(0, 10);
}
