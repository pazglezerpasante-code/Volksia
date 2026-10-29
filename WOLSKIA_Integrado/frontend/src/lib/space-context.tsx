import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { removeAudio } from "./audio-store";
import { notifyWorkspace } from "./workspace-notices";
import { spaceApi, type SpaceCollection, type SpaceData } from "./ai-api";
import {
  DEVICE_SPACE_KEY,
  emptyDeviceSpace,
  readDeviceSpace,
  writeDeviceSpace,
  mergeDeviceChanges,
} from "./device-space";
type SpaceCtx = {
  data: SpaceData;
  applyChat: (before: SpaceData, after: SpaceData) => void;
  error: string;
  refresh: () => Promise<void>;
  add: (col: SpaceCollection, body: Record<string, unknown>) => Promise<boolean>;
  update: (col: SpaceCollection, id: string, body: Record<string, unknown>) => Promise<boolean>;
  remove: (col: SpaceCollection, id: string) => Promise<boolean>;
};
const EMPTY_SPACE: SpaceData = { tasks: [], notes: [], events: [] };
const SpaceContext = createContext<SpaceCtx | null>(null);

export function useSpace(): SpaceCtx {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace debe usarse dentro de <SpaceProvider>");
  return ctx;
}

export function SpaceProvider({ user, children }: { user: string; children: ReactNode }) {
  const [data, setData] = useState<SpaceData>(EMPTY_SPACE);
  const [error, setError] = useState("");
  const commit = useCallback((next: SpaceData) => {
    try {
      writeDeviceSpace(next);
      setData(next);
      setError("");
      return true;
    } catch {
      setError(
        "No se pudo guardar en este navegador. Revisá el espacio disponible o los permisos de almacenamiento.",
      );
      return false;
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const saved = readDeviceSpace();
      if (saved) setData(saved);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar tus datos.");
    }
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = readDeviceSpace();
        if (saved) {
          if (active) setData(saved);
        } else {
          // Import the old browser's server bucket once, without changing or deleting it.
          let previous = emptyDeviceSpace();
          try {
            previous = await spaceApi.all(user);
          } catch {
            /* offline: local lists remain usable */
          }
          if (!active) return;
          // A mutation made while migration was loading always wins.
          const existing = readDeviceSpace();
          if (existing) setData(existing);
          else {
            for (const col of ["tasks", "notes", "events"] as const) {
              const legacy = JSON.parse(localStorage.getItem(`wolskia-${col}`) || "[]");
              if (!previous[col].length && Array.isArray(legacy)) {
                Object.assign(previous, {
                  [col]: legacy
                    .filter((t: unknown) => typeof t === "string")
                    .map((title: string) => ({
                      id: `${col[0]}_${crypto.randomUUID()}`,
                      title,
                      done: false,
                      due: null,
                      priority: "normal",
                      detail: "",
                      content: "",
                      date: null,
                      time: null,
                      location: "",
                    })),
                });
              }
            }
            commit(previous);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo abrir el almacenamiento local.");
      }
    })();
    const sync = (e: StorageEvent) => {
      if (e.key === DEVICE_SPACE_KEY) void refresh();
    };
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("storage", sync);
    };
  }, [user, commit, refresh]);
  const change = async (
    col: SpaceCollection,
    id: string | null,
    body?: Record<string, unknown>,
  ) => {
    try {
      const next = readDeviceSpace() ?? data;
      const removedNote =
        col === "notes" && id && !body ? next.notes.find((note) => note.id === id) : null;
      if (id) {
        if (body)
          Object.assign(next, {
            [col]: next[col].map((item) => (item.id === id ? { ...item, ...body } : item)),
          });
        else Object.assign(next, { [col]: next[col].filter((item) => item.id !== id) });
      } else {
        const defaults =
          col === "tasks"
            ? { done: false, due: null, priority: "normal", detail: "" }
            : col === "notes"
              ? { content: "" }
              : { date: null, time: null, location: "", detail: "" };
        Object.assign(next, {
          [col]: [{ ...defaults, ...body, id: `${col[0]}_${crypto.randomUUID()}` }, ...next[col]],
        });
      }
      const saved = commit(next);
      if (saved && removedNote?.audioId) void removeAudio(removedNote.audioId).catch(() => {});
      if (saved)
        notifyWorkspace(
          id
            ? body
              ? "Cambios guardados"
              : "Elemento quitado"
            : col === "notes"
              ? "Nota guardada"
              : col === "tasks"
                ? "Tarea creada"
                : "Evento creado",
        );
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    }
  };
  const value: SpaceCtx = {
    data,
    error,
    refresh,
    add: (col, body) => change(col, null, body),
    update: (col, id, body) => change(col, id, body),
    remove: (col, id) => change(col, id),
    applyChat: (before, after) => {
      try {
        if (!commit(mergeDeviceChanges(readDeviceSpace() ?? data, before, after)))
          throw new Error("SURI hizo el cambio, pero no se pudo guardar el cambio.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
        throw e;
      }
    },
  };
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}
