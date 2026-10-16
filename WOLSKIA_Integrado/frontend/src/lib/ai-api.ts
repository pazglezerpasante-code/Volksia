/**
 * Cliente tipado del backend Flask (WOLSKIA Pro).
 * Todas las rutas son relativas (`/api/ai/*`): en desarrollo Vite las
 * reenvía a Flask (ver `vite.config.ts`). Solo se llaman desde el navegador,
 * nunca durante el render de servidor.
 */
import { useCallback, useEffect, useState } from "react";

export type ProviderId = "gemini" | "groq" | "xai";
export type ProviderChoice = "auto" | ProviderId;

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** "ui" = cargada desde el panel, "env" = viene del .env del backend */
  source: "ui" | "env" | "none";
  /** Clave enmascarada (AIza…1234). El backend nunca devuelve la clave completa. */
  masked: string;
};

export type AiStatus = { providers: ProviderStatus[]; configured: boolean };

export type KeyTest = {
  ok: boolean;
  status: "ok" | "invalid" | "rate_limit" | "network" | "error";
  message: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Acción real que la IA ejecutó en el servidor (function calling). */
export type ToolAction = {
  tool: string;
  domain: "space" | "files" | "system";
  kind: "task" | "note" | "event" | "file" | null;
  op: "add" | "update" | "delete" | "list" | "read" | "create" | "edit" | null;
  ok: boolean;
  summary: string;
  item?: Record<string, unknown> | null;
};

export type ChatResult = {
  reply: string;
  provider: string;
  provider_id?: ProviderId;
  status: "ok" | "no_key" | "rate_limit" | "validation" | "error";
  intent?: string;
  actions?: ToolAction[];
  /** true si la IA agregó / editó / eliminó algo en «Tu espacio» → refrescar la UI */
  space_changed?: boolean;
};

/* ─── «Tu espacio» ─────────────────────────────────────────────────────── */
export type TaskItem = {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  priority: "low" | "normal" | "high";
  detail: string;
};
export type NoteItem = { id: string; title: string; content: string };
export type EventItem = {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string;
  detail: string;
};
export type SpaceData = { tasks: TaskItem[]; notes: NoteItem[]; events: EventItem[] };
export type SpaceCollection = keyof SpaceData;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. ¿Está abierto el backend?");
  }
  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* respuesta no JSON (p. ej. página de error del proxy) */
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string; errors?: Record<string, string> } | null)?.message ??
      Object.values((data as { errors?: Record<string, string> } | null)?.errors ?? {})[0] ??
      (res.status >= 500
        ? "El backend no responde. Verificá que Flask esté corriendo (puerto 5050)."
        : `Error HTTP ${res.status}`);
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const aiApi = {
  status: () => request<AiStatus>("/api/ai/status"),

  /** Campo ausente = sin cambios · "" = borrar · otro valor = guardar. */
  saveKeys: (keys: { gemini?: string; grok?: string }) =>
    request<AiStatus>("/api/ai/keys", { method: "POST", body: JSON.stringify(keys) }),

  clearKeys: () => request<AiStatus>("/api/ai/keys", { method: "DELETE" }),

  testKeys: () =>
    request<{ results: Partial<Record<ProviderId, KeyTest>> }>("/api/ai/test-keys", {
      method: "POST",
    }),

  chat: (body: {
    message: string;
    history: ChatMessage[];
    provider: ProviderChoice;
    user?: string;
    role?: "admin" | "worker";
  }) => request<ChatResult>("/api/ai/chat", { method: "POST", body: JSON.stringify(body) }),
};

const q = (user: string) => `?user=${encodeURIComponent(user)}`;

/** CRUD de «Tu espacio». La IA usa el mismo almacén desde el servidor. */
export const spaceApi = {
  all: (user: string) => request<SpaceData>(`/api/space${q(user)}`),
  add: (user: string, col: SpaceCollection, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/space/${col}${q(user)}`, { method: "POST", body: JSON.stringify(body) }),
  update: (user: string, col: SpaceCollection, id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/space/${col}/${id}${q(user)}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (user: string, col: SpaceCollection, id: string) =>
    request<{ ok: boolean }>(`/api/space/${col}/${id}${q(user)}`, { method: "DELETE" }),
  /** Migra las listas viejas de localStorage (el servidor solo importa si no hay datos). */
  importLegacy: (user: string, legacy: { tasks: string[]; notes: string[]; events: string[] }) =>
    request<{ ok: boolean }>(`/api/space/import${q(user)}`, { method: "POST", body: JSON.stringify(legacy) }),
};

/** Estado de las claves del backend, con recarga manual. */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const s = await aiApi.status();
      setStatus(s);
      setError("");
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, error, refresh, setStatus };
}
