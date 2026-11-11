import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { buildTriageMessage, TRIAGE_SYSTEM, type TriageInput, type TriageQuestion } from "@/lib/triage/message";

export const TRIAGE_MODEL = "claude-opus-5-5";

const TriageSchema = z.object({
  verdict: z.enum(["direct", "needs_decision"]),
  summary: z.string(),
  questions: z.array(
    z.object({
      kind: z.enum(["negocio", "tecnica", "cliente"]),
      question: z.string(),
      why: z.string(),
    })
  ),
});

export class TriageError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Clasifica el ticket con la API key del usuario que lo pide. Esfuerzo bajo: es una
 * clasificación, no el trabajo de código. Si el modelo declina por política, el servidor
 * reintenta con el modelo recomendado (fallbacks "default").
 */
export async function analyzeTicket(
  apiKey: string,
  input: TriageInput
): Promise<{ verdict: "direct" | "needs_decision"; summary: string; questions: TriageQuestion[]; model: string }> {
  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: TRIAGE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: TRIAGE_SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(TriageSchema) },
      messages: [{ role: "user", content: buildTriageMessage(input) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new TriageError("INVALID_KEY", 400, "Anthropic rechazó tu API key. Revisala en «Mis integraciones».");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new TriageError("RATE_LIMITED", 429, "Anthropic está limitando los pedidos de tu cuenta. Probá en un rato.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new TriageError("ANTHROPIC_ERROR", 502, `Anthropic respondió ${error.status ?? "con error"}: ${error.message}`);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new TriageError("REFUSED", 422, "Claude no quiso analizar este ticket. Revisalo a mano.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new TriageError("BAD_OUTPUT", 502, "Claude no devolvió un análisis válido. Probá de nuevo.");

  return {
    verdict: parsed.questions.length === 0 ? "direct" : parsed.verdict,
    summary: parsed.summary.trim().slice(0, 600),
    questions: parsed.questions.slice(0, 6).map((q, index) => ({
      id: `q${index + 1}`,
      kind: q.kind,
      question: q.question.trim().slice(0, 500),
      why: q.why.trim().slice(0, 500),
    })),
    model: response.model,
  };
}
