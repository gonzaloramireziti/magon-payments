// Repos de GitHub de un cliente, como "owner/nombre". Sin dependencias: se prueba suelto.

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/** Acepta "owner/nombre" o la URL del repo; descarta lo inválido y los repetidos. */
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
