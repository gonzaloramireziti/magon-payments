// Limpia conversaciones copiadas o exportadas de WhatsApp para cargarlas como descripción de un
// ticket. Sin React ni dependencias: se prueba suelto.
//
// Formatos reconocidos (cada mensaje empieza con fecha, hora y quién lo mandó):
//   Exportado Android:   10/11/26, 10:50 - Juan Pérez: texto
//                        10/11/26 10:50 a. m. - Juan Pérez: texto
//   Exportado iPhone:    [10/11/26, 10:50:12] Juan Pérez: texto
//   Copiado (Web/PC):    [10:50, 10/11/2026] Juan Pérez: texto
// Las líneas sin ese encabezado son la continuación del mensaje anterior.

const DATE = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}`;
const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?`;
const SENDER = String.raw`([^:\n]{1,60}?)`;

const BRACKET = new RegExp(String.raw`^\[(?:${DATE},?\s+${TIME}|${TIME},?\s+${DATE})\]\s*${SENDER}:\s?(.*)$`, "i");
const DASH = new RegExp(String.raw`^${DATE},?\s+${TIME}\s+-\s+${SENDER}:\s?(.*)$`, "i");

// Marcas de adjuntos que no viajan en el texto.
const MEDIA = [
  /^<?\s*(multimedia|archivo|media)\s+(omitid[oa]|omitted)\s*>?$/i,
  /^(imagen|image|video|audio|sticker|gif|documento|document)\s+(omitid[oa]|omitted)$/i,
  /\(archivo adjunto\)$/i,
  /\(file attached\)$/i,
];
const DELETED = [/^(se eliminó este mensaje|este mensaje fue eliminado|eliminaste este mensaje)\.?$/i, /^this message was deleted\.?$/i];
const EDITED = /\s*<(se editó este mensaje|this message was edited)\.?>\s*$/i;

// WhatsApp mete marcas invisibles de dirección de texto (LRM, RLM, etc.) al principio de líneas.
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

export type CleanResult = {
  text: string;
  // Quiénes escribieron, en orden de aparición.
  senders: string[];
  // Cantidad de mensajes reconocidos (0 = no parecía una conversación de WhatsApp).
  messages: number;
  // Adjuntos que se omitieron: conviene agregar las capturas a mano.
  media: number;
};

type Message = { sender: string; lines: string[] };

function parseHeader(line: string): { sender: string; body: string } | null {
  const match = BRACKET.exec(line) ?? DASH.exec(line);
  if (!match) return null;
  return { sender: match[1].trim(), body: match[2] ?? "" };
}

export function cleanWhatsApp(raw: string): CleanResult {
  const messages: Message[] = [];
  let media = 0;
  let current: Message | null = null;

  for (const original of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = original.replace(INVISIBLE, "").replace(/\s+$/, "");
    const header = parseHeader(line.trimStart());
    let body = header ? header.body : line;
    if (header) {
      current = { sender: header.sender, lines: [] };
      messages.push(current);
    }
    body = body.replace(EDITED, "");
    const trimmed = body.trim();
    if (MEDIA.some((pattern) => pattern.test(trimmed))) {
      media += 1;
      continue;
    }
    if (DELETED.some((pattern) => pattern.test(trimmed))) continue;
    if (current) current.lines.push(body);
    else if (trimmed) {
      // Texto antes del primer encabezado: se conserva tal cual.
      current = { sender: "", lines: [body] };
      messages.push(current);
    }
  }

  const recognized = messages.filter((message) => message.sender !== "");
  if (recognized.length === 0) {
    return { text: raw.trim(), senders: [], messages: 0, media };
  }

  const senders = Array.from(new Set(recognized.map((message) => message.sender)));
  const single = senders.length === 1;

  // Mensajes seguidos de la misma persona van juntos (salto simple). Si hablan varias personas,
  // cada cambio de autor va separado por una línea en blanco y con el nombre adelante.
  let text = "";
  let lastSender: string | null = null;
  for (const message of messages) {
    const content = message.lines.join("\n").replace(/^\n+|\n+$/g, "");
    if (!content.trim()) continue;
    const sameAuthor = single || message.sender === lastSender;
    if (text) text += sameAuthor ? "\n" : "\n\n";
    text += sameAuthor || message.sender === "" ? content : `${message.sender}:\n${content}`;
    lastSender = message.sender;
  }

  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), senders, messages: recognized.length, media };
}

// Primera línea con contenido, recortada en una palabra, como sugerencia de título.
export function suggestTitle(text: string, max = 90): string {
  const first =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !/^[^:]{1,60}:$/.test(line)) ?? "";
  const clean = first.replace(/^[-*•\d.)\s]+/, "").replace(/[.:;,\s]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
