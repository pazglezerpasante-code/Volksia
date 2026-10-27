import type { ChatMessage } from "./ai-api";

export type SpreadsheetResult = {
  status: "ok" | "clarification";
  summary: string;
  warning?: string;
  filename?: string;
  download?: string;
  preview?: { name: string; rows: number; columns: number; preview: { row: number; values: unknown[] }[]; truncated: boolean }[];
};

export function spreadsheetIntent(text: string, attached: boolean, active: boolean): "create" | "edit" | null {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const excel = /\b(?:excel|xlsx?|planilla|hoja de calculo)\b/.test(t);
  if (!excel && !attached && /\b(?:tarea\w*|nota\w*|evento\w*|recordatorio\w*|agenda\w*)\b/.test(t)) return null;
  if (excel && /\b(?:crea\w*|hac\w*|haz\w*|arma\w*|genera\w*|necesito|quiero)\b/.test(t)
      && !/\b(?:modific\w*|edit\w*|cambi\w*)\b/.test(t) && !attached) return "create";
  if (attached || (excel && /\b(?:modific\w*|edit\w*|cambi\w*|agreg\w*|orden\w*|reemplaz\w*)\b/.test(t))
      || (active && /\b(?:agreg\w*|anad\w*|cambi\w*|modific\w*|edit\w*|quit\w*|borr\w*|elimin\w*|orden\w*|reemplaz\w*|pon\w*|pone\w*|sum\w*|columna\w*|fila\w*|hoja\w*|convert\w*)\b/.test(t))) return "edit";
  return null;
}

export async function runSpreadsheetChat(message: string, file: File | null, history: ChatMessage[], signal: AbortSignal): Promise<SpreadsheetResult> {
  const body = new FormData();
  body.append("message", message);
  body.append("history", JSON.stringify(history.slice(-6)));
  if (file) body.append("file", file);
  const response = await fetch("/api/ai/sheets/chat", { method: "POST", body, signal });
  const raw = await response.text();
  let data: SpreadsheetResult & { message?: string };
  try { data = JSON.parse(raw); } catch { throw new Error("El servidor no pudo procesar el Excel. Reintentá en unos segundos."); }
  if (!response.ok) throw new Error(data.message ?? "No se pudo generar la planilla.");
  if (!["ok", "clarification"].includes(data.status)) throw new Error("El servidor devolvió un resultado incompleto.");
  return data;
}

export function spreadsheetFile(result: SpreadsheetResult): File {
  if (!result.download || !result.filename) throw new Error("No se recibió el archivo generado.");
  const bytes = Uint8Array.from(atob(result.download), c => c.charCodeAt(0));
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error("El resultado no es un XLSX válido.");
  return new File([bytes], result.filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
