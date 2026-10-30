import type { ChatMessage } from "./ai-api";

export type SpreadsheetResult = {
  status: "ok" | "clarification" | "answer";
  summary: string;
  warning?: string;
  meta?: { total_records: number; matched_records: number; shown_records: number; sheets: unknown[] };
  filename?: string;
  download?: string;
  preview?: { name: string; rows: number; columns: number; preview: { row: number; values: unknown[] }[]; truncated: boolean }[];
};

export function spreadsheetIntent(text: string, attached: boolean, active: boolean): "create" | "edit" | "ask" | null {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const excel = /\b(?:excel|xlsx?|planilla|hoja de calculo)\b/.test(t);
  if (!excel && !attached && /\b(?:tarea\w*|nota\w*|evento\w*|recordatorio\w*|agenda\w*)\b/.test(t)) return null;
  const editing = /\b(?:agreg\w*|anad\w*|cambi\w*|modific\w*|edit\w*|borr\w*|elimin\w*|orden\w*|reemplaz\w*|quit\w*|pon\w*|sum\w*|columna\w*|fila\w*)\b/.test(t);
  if ((attached || active) && !editing && /list|mostr|detall|cuant|quien|que tiene|resum|busc|datos|lee|leas|turnos de|\?/.test(t)) return "ask";
  if (excel && /\b(?:crea\w*|hac\w*|haz\w*|arma\w*|genera\w*|necesito|quiero)\b/.test(t)
      && !/\b(?:modific\w*|edit\w*|cambi\w*)\b/.test(t) && !attached) return "create";
  if (attached || (excel && /\b(?:modific\w*|edit\w*|cambi\w*|agreg\w*|orden\w*|reemplaz\w*)\b/.test(t))
      || (active && /\b(?:agreg\w*|anad\w*|cambi\w*|modific\w*|edit\w*|quit\w*|borr\w*|elimin\w*|orden\w*|reemplaz\w*|pon\w*|pone\w*|sum\w*|columna\w*|fila\w*|hoja\w*|convert\w*)\b/.test(t))) return "edit";
  return null;
}

export async function runSpreadsheetChat(message: string, file: File | null, history: ChatMessage[], signal: AbortSignal, endpoint = "/api/ai/sheets/chat"): Promise<SpreadsheetResult> {
  const body = new FormData();
  body.append("message", message);
  body.append("history", JSON.stringify(history.slice(-6)));
  if (file) body.append("file", file);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body, signal });
  } catch (error) {
    if (signal.aborted) throw new Error("Se canceló el envío de la planilla.");
    throw new Error("No hay conexión con el servidor de planillas. Revisá la conexión e intentá nuevamente.");
  }
  const raw = await response.text();
  let data: (SpreadsheetResult & { message?: string; error?: string }) | null = null;
  try { data = JSON.parse(raw); } catch { /* proxy may return HTML error */ }
  if (!response.ok) {
    if (data?.message) throw new Error(data.message);
    if (response.status === 413) throw new Error("El archivo supera el límite permitido por el servidor o el proxy (actualmente 8 MB en SURI).");
    if (response.status === 502 || response.status === 503 || response.status === 504)
      throw new Error("El backend de planillas no está disponible o agotó el tiempo de respuesta. Comprobá Render y la conexión con Vercel.");
    if (response.status === 401 || response.status === 403) throw new Error("El servidor rechazó la autorización. Revisá la configuración segura del proxy.");
    throw new Error(`El servidor devolvió un error HTTP ${response.status}. No se pudo procesar el Excel.`);
  }
  if (!data) throw new Error("El servidor devolvió una respuesta que no es JSON. Comprobá el proxy de Vercel y los registros del backend.");
  if (!["ok", "clarification", "answer"].includes(data.status)) throw new Error("El servidor devolvió un resultado incompleto.");
  return data;
}

export function spreadsheetFile(result: SpreadsheetResult): File {
  if (!result.download || !result.filename) throw new Error("No se recibió el archivo generado.");
  const bytes = Uint8Array.from(atob(result.download), c => c.charCodeAt(0));
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error("El resultado no es un XLSX válido.");
  return new File([bytes], result.filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function runSpreadsheetAsk(message: string, file: File | null, history: ChatMessage[], signal: AbortSignal): Promise<SpreadsheetResult> {
  return runSpreadsheetChat(message, file, history, signal, "/api/ai/sheets/ask");
}
