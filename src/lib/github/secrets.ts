import sodium from "libsodium-wrappers";
import { github } from "@/lib/github/api";

// Secreto que el workflow usa para clonar (solo lectura) los otros repos del cliente.
export const READ_SECRET = "MAGON_GH_TOKEN";

/** Carga un secreto de Actions: GitHub pide el valor cifrado con la clave pública del repo (sealed box). */
export async function setRepoSecret(token: string, repo: string, name: string, value: string): Promise<void> {
  const { key, key_id } = await github<{ key: string; key_id: string }>(token, `/repos/${repo}/actions/secrets/public-key`);
  await sodium.ready;
  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(value),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL)
  );
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${name}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({ encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL), key_id }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
}
