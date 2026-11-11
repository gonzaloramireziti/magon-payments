// Llamadas a la API REST de GitHub con el token de cada usuario.

export class GithubError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function github<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (response.status === 401) {
    throw new GithubError("GITHUB_UNAUTHORIZED", 400, "GitHub rechazó tu token. Revisalo en «Mis integraciones».");
  }
  if (response.status === 403 || response.status === 404) {
    // GitHub devuelve 404 cuando el token no tiene acceso al repo.
    throw new GithubError(
      "GITHUB_FORBIDDEN",
      400,
      `GitHub no deja acceder a ${path.split("/").slice(2, 4).join("/")}: revisá que tu token tenga acceso a ese repo (Issues, Pull requests y Contents).`
    );
  }
  if (response.status === 422) {
    const data = (await response.json().catch(() => ({}))) as { message?: string; errors?: Array<{ message?: string }> };
    const detail = data.errors?.map((e) => e.message).filter(Boolean).join("; ") || data.message || "datos inválidos";
    throw new GithubError("GITHUB_INVALID", 400, `GitHub: ${detail}`);
  }
  if (!response.ok) throw new GithubError("GITHUB_ERROR", 502, `GitHub respondió ${response.status}`);
  return (await response.json()) as T;
}
