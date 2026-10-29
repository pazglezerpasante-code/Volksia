import type { SpaceCollection } from "./ai-api";

export type SpaceCommand = { collection: SpaceCollection; body: Record<string, unknown> };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Only explicit creation commands. Questions, quoted material and edits stay with the agent. */
export function parseSpaceCommand(input: string, today = new Date()): SpaceCommand | null {
  const source = input.trim().replace(/^(?:hola[ ,]+)?suri[,: ]+/i, "").replace(/^(?:por favor[,: ]+)/i, "");
  const plain = normalize(source);
  if (/^[¿?]|^(?:como|que|por que|explica|no |no quiero|si |cuando )\b/.test(plain)) return null;
  const explicitNote = /^(?:anota(?:me)?|apunta(?:me)?)\s+que\s+(.+)$/.exec(plain);
  const match = /^(?:crea(?:me)?|crear|agrega(?:me)?|agregar|anota(?:me)?|anotar|guarda(?:me)?|guardar|apunta(?:me)?|registra(?:me)?|anadi(?:me)?|anade(?:me)?|anadir)\s+(?:(?:una?|la|esta|nueva?|mi)\s+)*(tarea|nota|pendiente|recordatorio)\b\s*(?:(?:que diga|titulada?|llamada?|para|sobre|con el texto|con el contenido)\s*)?[:—-]?\s*(.+)$/i.exec(plain) ?? (explicitNote ? ["", "nota", explicitNote[1]] : null);
  const remind = /^(?:recordame|recordarme)\s+(.+)$/i.exec(plain);
  if (!match && !remind) return null;
  const collection = match && normalize(match[1]) === "nota" ? "notes" : "tasks";
  let content = match ? source.slice(source.length - match[2].length).trim() : source.replace(/^\S+\s+/, "").trim();
  // A multi-action or conditional request must be interpreted by the agent, not half-executed.
  if (!content || /\b(?:y (?:crea|agrega|guarda|borra|elimina|anota)|si |cuando )/i.test(normalize(content))) return null;
  if (collection === "notes") {
    const split = content.indexOf(":");
    const title = (split > 0 && split < 100 ? content.slice(0, split) : content.split("\n")[0]).trim();
    return { collection, body: { title: title.slice(0, 160), content: split > 0 && split < 100 ? content.slice(split + 1).trim() : content } };
  }
  if (/^(?:para\s+)?(?:hoy|manana|pasado manana|\d{4}-\d{2}-\d{2})$/.test(normalize(content))) return null;
  let due: string | null = null;
  const relative = /\s+(?:para\s+)?(hoy|mañana|pasado mañana)[.!]?$/i.exec(content);
  const iso = /\s+(?:para\s+|el\s+)?(\d{4}-\d{2}-\d{2})[.!]?$/i.exec(content);
  if (relative) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    d.setDate(d.getDate() + (normalize(relative[1]) === "hoy" ? 0 : normalize(relative[1]) === "manana" ? 1 : 2));
    due = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    content = content.slice(0, relative.index).trim();
  } else if (iso) {
    const date = new Date(iso[1] + "T12:00:00");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== iso[1]) return null;
    due = iso[1]; content = content.slice(0, iso.index).trim();
  }
  if (!content) return null;
  return { collection, body: { title: content, due } };
}
