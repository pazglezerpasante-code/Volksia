import { createFileRoute } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  MessageSquare,
  Paperclip,
  FileText,
  X,
  NotebookPen,
  SquareCheckBig,
  Wrench,
} from "lucide-react";
import { clearWorkerMemory, emptyWorkerMemory, learnPreference, readWorkerMemory, sanitizeChatLines, workerMemoryContext, writeWorkerMemory } from "@/lib/worker-memory";
import { Robot, RobotAvatar, RobotThinking, type RobotMood } from "@/components/robot";
import { IconBar, type IconBarItem } from "@/components/icon-bar";
import { Markdown } from "@/components/markdown";
import {
  aiApi,
  spaceApi,
  type ChatMessage,
  type EventItem,
  type NoteItem,
  type SpaceCollection,
  type SpaceData,
  type TaskItem,
  type ToolAction,
} from "@/lib/ai-api";

export const Route = createFileRoute("/")({ component: Home });

type Role = "admin" | "worker";
type Page = "chat" | "tools" | "tasks" | "notes" | "calendar";

/** Sin pantalla de acceso: se crea un identificador estable para este navegador.
 * Nota: no equivale a autenticación; no usarlo para proteger datos sensibles en un despliegue público. */
function Home() {
  const [profile, setProfile] = useState<{ user: string; role: Role; name: string } | null>(null);
  useEffect(() => {
    try {
      const old = localStorage.getItem("wolskia-session");
      const parsed = old ? JSON.parse(old) as { user?: string; role?: Role; name?: string } : null;
      let user = parsed?.user;
      if (!user) {
        user = localStorage.getItem("wolskia-profile-id") ?? "";
        if (!user) {
          user = `perfil-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-5)}`;
          localStorage.setItem("wolskia-profile-id", user);
        }
      }
      localStorage.setItem("wolskia-profile-id", user);
      localStorage.removeItem("wolskia-session");
      setProfile({ user, role: "admin", name: "Suri" });
    } catch {
      setProfile({ user: "perfil-local", role: "admin", name: "Suri" });
    }
  }, []);
  if (!profile) return <main className="min-h-screen bg-bg" aria-label="Cargando Suri" />;
  return <Studio session={profile} />;
}

const NAV: IconBarItem[] = [
  { key: "chat", label: "Chat", Icon: MessageSquare },
  { key: "tools", label: "Herramientas", Icon: Wrench },
  { key: "tasks", label: "Tareas", Icon: SquareCheckBig },
  { key: "notes", label: "Notas", Icon: NotebookPen },
  { key: "calendar", label: "Calendario", Icon: CalendarDays },
];

function Studio({ session }: { session: { user: string; role: Role; name: string } }) {
  const [page, setPage] = useState<Page>("chat");
  const [mood, setMood] = useState<RobotMood>("idle");
  const go = (key: string) => {
    setPage(key as Page);
    setMood("idle");
  };
  const roleLabel = "Espacio personal";

  /* Pantalla fija: la ventana nunca se estira ni scrollea. Lo que no
     entra se corta con "…" o scrollea dentro de su propio recuadro. */
  return (
    <SpaceProvider user={session.user}>
    <div className="wol-aurora flex h-dvh overflow-hidden">
      {/* Escritorio: riel vertical con el Icon bar */}
      <aside className="relative hidden w-24 shrink-0 md:block">
        <img
          src="/robot/wolskia-avatar.webp"
          srcSet="/robot/wolskia-avatar-96.webp 96w, /robot/wolskia-avatar.webp 192w"
          sizes="48px"
          width={48}
          height={48}
          alt="Suri, el robot asistente de planta"
          decoding="async"
          className="absolute left-1/2 top-6 h-12 w-12 -translate-x-1/2 rounded-full bg-[#0d1c2c] object-cover ring-2 ring-accent-2/40 shadow-[0_0_24px_rgba(106,212,255,0.35)]"
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <IconBar items={NAV} value={page} onChange={go} axis="column" />
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 md:px-6 md:pl-0">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/robot/wolskia-avatar.webp" srcSet="/robot/wolskia-avatar-96.webp 96w, /robot/wolskia-avatar.webp 192w" sizes="36px" width={36} height={36} alt="Suri, el robot asistente de planta" decoding="async" className="h-9 w-9 shrink-0 rounded-full bg-[#0d1c2c] object-cover ring-1 ring-accent-2/40 md:hidden" />
            <div className="min-w-0">
              <div className="truncate font-display text-base font-semibold leading-tight">Suri</div>
              <div className="truncate text-xs text-muted">Asistente de planta</div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right leading-tight">
              <div className="truncate text-sm font-medium">{session.name}</div>
              <div className="truncate text-xs text-muted">{roleLabel}</div>
            </div>

          </div>
        </header>
        <div
          className={`min-h-0 flex-1 px-4 pb-20 md:px-6 md:pb-6 md:pl-0 ${
            page === "chat" || page === "tools" ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {page === "chat" ? <Chat mood={mood} setMood={setMood} name={session.name} user={session.user} role={session.role} /> : null}
          {page === "tools" ? <Tools /> : null}
          {page === "tasks" ? <TasksPage /> : null}
          {page === "notes" ? <NotesPage /> : null}
          {page === "calendar" ? <CalendarView /> : null}
        </div>
      </section>
      {/* Celular: el mismo Icon bar, en horizontal abajo */}
      <div className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center md:hidden">
        <IconBar items={NAV} value={page} onChange={go} axis="row" />
      </div>
    </div>
    </SpaceProvider>
  );
}

function Chat({
  mood,
  setMood,
  name,
  user,
  role,
}: {
  mood: RobotMood;
  setMood: (m: RobotMood) => void;
  name: string;
  user: string;
  role: Role;
}) {
  const [text, setText] = useState("");
  const [memory, setMemory] = useState(() => readWorkerMemory(user));
  const [showMemory, setShowMemory] = useState(false);
  const [lines, setLines] = useState<{ who: "vos" | "wolskia"; text: string; meta?: string; actions?: ToolAction[] }[]>(() => {
    const saved = readWorkerMemory(user);
    return saved.enabled ? saved.messages.map((message) => ({ ...message })) : [];
  });
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number; content: string; readable: boolean }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { refresh } = useSpace();

  // La memoria es opcional, local y nunca contiene adjuntos ni datos laborales.
  useEffect(() => {
    if (!memory.enabled) return;
    writeWorkerMemory(user, { ...memory, messages: sanitizeChatLines(lines) });
  }, [user, lines, memory]);

  function toggleMemory() {
    const next = {
      ...memory,
      enabled: !memory.enabled,
      messages: memory.enabled ? memory.messages : sanitizeChatLines(lines),
    };
    writeWorkerMemory(user, next);
    setMemory(next);
    if (next.enabled && !lines.length && next.messages.length) {
      setLines(next.messages.map((message) => ({ ...message })));
    }
  }

  function forgetMemory() {
    if (!window.confirm("¿Borrar la memoria personal guardada en este navegador?")) return;
    clearWorkerMemory(user);
    setMemory(emptyWorkerMemory());
    setLines([]);
    setShowMemory(false);
  }

  // Siempre mostrar el último mensaje (la barra de scroll está oculta)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, busy]);

  async function send(raw?: string) {
    const userText = (raw ?? text).trim();
    if ((!userText && attachments.length === 0) || busy) return;
    const attachmentContext = attachments.map((file) => file.readable
      ? `\n\n--- Archivo adjunto: ${file.name} ---\n${file.content.slice(0, 24000)}`
      : `\n\n[Archivo adjunto: ${file.name}. El contenido binario no se pudo leer desde esta versión de Suri.]`).join("");
    const q = `${userText || "Analizá los archivos adjuntos y ayudame con su contenido."}${attachmentContext}`;
    const attachedForDisplay = attachments.map((file) => file.name);
    setText("");
    setAttachments([]);
    const history: ChatMessage[] = lines
      .filter((l) => l.who === "vos" || l.meta)
      .slice(-13)
      .map((l) => ({
        role: l.who === "vos" ? ("user" as const) : ("assistant" as const),
        content: l.text,
      }));
    const rememberedContext = workerMemoryContext(memory);
    if (rememberedContext) history.unshift({ role: "user", content: rememberedContext });
    if (memory.enabled && userText && attachments.length === 0) {
      setMemory((prev) => learnPreference(prev, userText));
    }
    setLines((prev) => [...prev, { who: "vos", text: `${userText || "Revisá los archivos adjuntos."}${attachedForDisplay.length ? `\n\n📎 ${attachedForDisplay.join(" · ")}` : ""}` }]);
    setMood("think");
    setBusy(true);
    let failed = false;
    try {
      const r = await aiApi.chat({ message: q, history, provider: "auto", user, role });
      failed = r.status !== "ok";
      if (r.space_changed) void refresh(); // la IA tocó Tu espacio: sincronizar el panel
      setMood(failed ? "alert" : "speak");
      setLines((prev) => [
        ...prev,
        { who: "wolskia", text: r.reply, meta: r.status === "ok" ? r.provider : undefined, actions: r.actions },
      ]);
    } catch (e) {
      failed = true;
      setMood("alert");
      setLines((prev) => [
        ...prev,
        { who: "wolskia", text: e instanceof Error ? e.message : "Error inesperado." },
      ]);
    } finally {
      setBusy(false);
      if (!failed) window.setTimeout(() => setMood("ok"), 700);
      window.setTimeout(() => setMood("idle"), failed ? 3000 : 1800);
    }
  }

  const prompts = [
    "Armar el plan de la semana",
    "Estado de la linea manana",
    "Resumir el parte de calidad",
    "Redactar el aviso al equipo",
  ];

  return (
    <div className="mx-auto grid h-full w-full max-w-6xl grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="glass relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] px-4 py-5 md:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(47,141,255,0.16),transparent_46%)]" />
        <h1 className={`relative shrink-0 text-center text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl ${lines.length ? "max-md:hidden" : ""}`}>
          Hola, soy Suri.
        </h1>
        <p className={`wol-lead relative mx-auto mt-2 w-full max-w-2xl shrink-0 text-center text-sm leading-5 text-muted sm:text-base ${lines.length ? "max-md:hidden" : ""}`}>Tu asistente inteligente para organizar ideas, consultar información y trabajar con las herramientas de esta página. ¿Por dónde empezamos?</p>
        <div className="relative mx-auto mt-2 flex max-w-2xl shrink-0 flex-wrap items-center justify-center gap-2 text-[11px] text-muted" aria-label="Memoria personal de Suri">
          <span>{memory.enabled ? "Memoria local activa" : "Memoria local apagada"}</span>
          <button type="button" className="rounded-lg border border-line px-2 py-1 hover:text-fg" onClick={toggleMemory}>
            {memory.enabled ? "Pausar memoria" : "Activar memoria"}
          </button>
          {(memory.enabled || memory.messages.length > 0 || memory.preferences.length > 0) && <>
            <button type="button" className="rounded-lg border border-line px-2 py-1 hover:text-fg" onClick={() => setShowMemory((v) => !v)}>{showMemory ? "Ocultar" : "Ver memoria"}</button>
            <button type="button" className="rounded-lg border border-line px-2 py-1 hover:text-fg" onClick={forgetMemory}>Borrar memoria</button>
          </>}
          <span className="max-md:hidden">Solo este navegador · no guarda planillas</span>
        </div>
        {showMemory && (
          <div className="relative mx-auto mt-2 max-h-24 w-full max-w-2xl overflow-auto rounded-lg border border-line bg-bg/90 p-2 text-xs text-muted" aria-live="polite">
            <p>{memory.messages.length} mensajes guardados.</p>
            {memory.preferences.length ? <p className="mt-1">Preferencias: {memory.preferences.join(" · ")}</p> : <p className="mt-1">Todavía no hay preferencias aprendidas. Podés decir «prefiero respuestas breves».</p>}
          </div>
        )
        <div className="wol-stage relative mt-3 flex min-h-0 flex-1 flex-col items-center justify-center">
          {lines.length === 0 ? (
            <div className="grid w-full max-w-3xl grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="hidden gap-3 md:grid">
                {prompts.slice(0, 2).map((p) => (
                  <button key={p} title={p} className="wol-suggest truncate rounded-2xl border border-line bg-bg/60 px-4 py-4 text-left text-sm" onClick={() => send(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <div><Robot mood={mood} size="fit" /></div>
              <div className="hidden gap-3 md:grid">
                {prompts.slice(2).map((p) => (
                  <button key={p} title={p} className="wol-suggest truncate rounded-2xl border border-line bg-bg/60 px-4 py-4 text-left text-sm" onClick={() => send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 w-full gap-5 md:grid-cols-[minmax(0,1fr)_190px] md:items-end">
              <div
                ref={listRef}
                className="no-scrollbar flex h-full min-h-0 flex-col gap-3 overflow-y-auto scroll-smooth [mask-image:linear-gradient(to_bottom,transparent,black_24px)]"
              >
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={`wol-msg min-w-0 max-w-2xl shrink-0 rounded-2xl border px-4 py-3 text-sm ${
                      line.who === "vos"
                        ? "ml-auto border-accent/40 bg-gradient-to-br from-accent/20 to-accent/5"
                        : "border-line bg-bg/80"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-accent-2">
                      {line.who === "vos" ? null : <RobotAvatar px={24} />}
                      {line.who === "vos" ? "Usted" : "Suri"}
                    </div>
                    {line.who === "vos" ? (
                      <div title={line.text} className="line-clamp-6 whitespace-pre-wrap leading-6 [overflow-wrap:anywhere]">{line.text}</div>
                    ) : (
                      <div className="min-w-0 overflow-x-auto [overflow-wrap:anywhere]">
                        <Markdown text={line.text} />
                      </div>
                    )}
                    <ActionChips actions={line.actions} />
                    {line.meta ? <div className="mt-2 truncate text-[11px] text-muted">vía {line.meta}</div> : null}
                  </div>
                ))}
                {busy ? <RobotThinking /> : null}
              </div>
              <div className="hidden justify-center md:flex">
                <Robot mood={mood} size="md" />
              </div>
            </div>
          )}
        </div>
        <div data-chat-composer className="relative mx-auto mt-3 w-full max-w-2xl shrink-0">
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2" aria-label="Archivos adjuntos seleccionados">
              {attachments.map((file) => (
                <div key={file.id} className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs">
                  <FileText size={15} className="shrink-0 text-accent-2" />
                  <span className="max-w-[220px] truncate">{file.name}</span>
                  <span className="shrink-0 text-muted">{file.readable ? "Listo para analizar" : "Solo referencia"}</span>
                  <button type="button" className="rounded-md p-1 text-muted hover:text-fg" aria-label={`Quitar ${file.name}`} onClick={() => setAttachments((prev) => prev.filter((f) => f.id !== file.id))}><X size={14} /></button>
                </div>
              ))}
            </div>
          ) : null}
          <form
            className="flex w-full min-w-0 items-center gap-1.5 rounded-2xl border border-line bg-bg/80 p-1.5 transition focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgba(47,141,255,0.12)] sm:gap-2 sm:p-2"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <input ref={fileInputRef} type="file" multiple className="hidden" aria-label="Seleccionar archivos" accept=".txt,.md,.csv,.json,.log,.xml,.yaml,.yml,.html,.css,.ts,.tsx,.js,.jsx,.py,.sql" onChange={async (e) => {
              const input = e.currentTarget;
              const files = Array.from(input.files ?? []);
              const parsed = await Promise.all(files.map(async (file) => {
                const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                const readable = ["txt", "md", "csv", "json", "log", "xml", "yaml", "yml", "html", "css", "ts", "tsx", "js", "jsx", "py", "sql"].includes(ext) && file.size <= 2 * 1024 * 1024;
                let content = "";
                if (readable) { try { content = await file.text(); } catch { /* no se pudo leer */ } }
                return { id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, size: file.size, content, readable: readable && Boolean(content) };
              }));
              setAttachments((prev) => [...prev, ...parsed].slice(0, 5));
              input.value = "";
            }} />
            <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-accent hover:text-accent-2" aria-label="Adjuntar archivos" title="Adjuntar archivos de texto, código o datos" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></button>
            <input
              className="min-w-0 flex-1 bg-transparent px-2 py-2 outline-none placeholder:text-muted/80"
              placeholder={attachments.length ? "Preguntá sobre los archivos…" : "Escribí un mensaje para Suri…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setMood("listen")}
              aria-label="Mensaje para Suri"
            />
            <button className="wol-btn shrink-0 rounded-xl px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:px-5" type="submit" disabled={busy || (!text.trim() && attachments.length === 0)}>
              {busy ? "Analizando…" : "Enviar"}
            </button>
          </form>
          <p className="mt-2 truncate px-2 text-[11px] text-muted max-md:hidden" title="Hasta 5 archivos de texto o código, de hasta 2 MB cada uno.">
            Hasta 5 archivos de texto o código, de hasta 2 MB cada uno.
          </p>
        </div>
        <div data-chat-chips className="relative mx-auto mt-3 hidden shrink-0 flex-wrap justify-center gap-2 [@media(min-height:700px)]:flex">
          {["Buscar modulo", "Abrir turnero", "Agregar una tarea", "Agendar un evento", "Crear una nota", "Ver mis archivos"].map((chip) => (
            <button key={chip} className="wol-suggest rounded-full border border-line bg-bg/40 px-4 py-2 text-xs text-muted hover:text-fg" onClick={() => send(chip)}>
              {chip}
            </button>
          ))}
        </div>
      </div>
      <aside className="hidden min-h-0 min-w-0 xl:block">
        <WorkspaceOverview />
      </aside>
    </div>
  );
}


/* ═══ «Tu espacio»: almacén compartido con la IA (servidor = fuente de verdad) ═══ */

type SpaceCtx = {
  data: SpaceData;
  error: string;
  refresh: () => Promise<void>;
  add: (col: SpaceCollection, body: Record<string, unknown>) => Promise<boolean>;
  update: (col: SpaceCollection, id: string, body: Record<string, unknown>) => Promise<boolean>;
  remove: (col: SpaceCollection, id: string) => Promise<boolean>;
};
const EMPTY_SPACE: SpaceData = { tasks: [], notes: [], events: [] };
const SpaceContext = createContext<SpaceCtx | null>(null);

function useSpace(): SpaceCtx {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace debe usarse dentro de <SpaceProvider>");
  return ctx;
}

/** Datos viejos (listas de strings en localStorage) → se migran una vez al servidor. */
function takeLegacy(): { tasks: string[]; notes: string[]; events: string[] } | null {
  try {
    const read = (k: string): string[] => {
      const v = JSON.parse(localStorage.getItem(k) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    };
    const legacy = { tasks: read("wolskia-tasks"), notes: read("wolskia-notes"), events: read("wolskia-events") };
    return legacy.tasks.length + legacy.notes.length + legacy.events.length ? legacy : null;
  } catch {
    return null;
  }
}

function SpaceProvider({ user, children }: { user: string; children: ReactNode }) {
  const [data, setData] = useState<SpaceData>(EMPTY_SPACE);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setData(await spaceApi.all(user));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar Tu espacio.");
    }
  }, [user]);

  useEffect(() => {
    void (async () => {
      const legacy = takeLegacy();
      if (legacy) {
        try {
          await spaceApi.importLegacy(user, legacy);
          // respaldo por las dudas y limpieza de las claves viejas
          localStorage.setItem(`wolskia-legacy-backup-${user}`, JSON.stringify(legacy));
          ["wolskia-tasks", "wolskia-notes", "wolskia-events"].forEach((k) => localStorage.removeItem(k));
        } catch {
          /* sin backend: se reintenta en la próxima carga */
        }
      }
      await refresh();
    })();
  }, [user, refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado.");
        return false;
      }
    },
    [refresh],
  );

  const value: SpaceCtx = {
    data,
    error,
    refresh,
    add: (col, body) => run(() => spaceApi.add(user, col, body)),
    update: (col, id, body) => run(() => spaceApi.update(user, col, id, body)),
    remove: (col, id) => run(() => spaceApi.remove(user, col, id)),
  };
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

const MUTATING = new Set(["add", "update", "delete", "create", "edit"]);

/** Fichas con lo que la IA realmente ejecutó (viene del servidor, no del texto del modelo). */
function ActionChips({ actions }: { actions?: ToolAction[] }) {
  const shown = (actions ?? []).filter((a) => !a.ok || (a.op && MUTATING.has(a.op)));
  if (!shown.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Acciones realizadas">
      {shown.map((a, i) => (
        <span
          key={i}
          title={a.summary}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
            a.ok ? "border-accent/40 bg-accent/10 text-accent-2" : "border-warn/50 bg-warn/10 text-warn"
          }`}
        >
          {a.ok ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0" />}
          <span className="truncate">{a.summary}</span>
        </span>
      ))}
    </div>
  );
}

const PRIORITY_LABEL = { low: "baja", normal: "normal", high: "alta" } as const;
const taskLabel = (t: TaskItem) => `${t.done ? "✓ " : ""}${t.title}${t.due ? ` · ${t.due}` : ""}`;
const noteLabel = (n: NoteItem) => n.title;
const eventLabel = (e: EventItem) => `${e.date ?? "Sin fecha"}${e.time ? ` ${e.time}` : ""} — ${e.title}`;
const byDate = (a: EventItem, b: EventItem) =>
  `${a.date ?? "9999"} ${a.time ?? ""}`.localeCompare(`${b.date ?? "9999"} ${b.time ?? ""}`);

const SECTION_STYLE = {
  tasks: { rgb: "47,141,255", text: "text-[#6ab4ff]", title: "Tus próximas tareas", hint: "«Recordame revisar el informe mañana»" },
  notes: { rgb: "167,139,250", text: "text-[#b9a5fb]", title: "Notas guardadas", hint: "«Anotá esta idea para después»" },
  calendar: { rgb: "61,214,164", text: "text-[#5fe0b8]", title: "Tu agenda", hint: "«Agendá una reunión para el viernes»" },
} as const;

function WorkspaceOverview() {
  const { data, error } = useSpace();
  const [section, setSection] = useState<"tasks" | "notes" | "calendar">("tasks");
  const events = [...data.events].sort(byDate);
  const total = data.tasks.length + data.notes.length + data.events.length;
  const tabs = [
    { id: "tasks", label: "Tareas", count: data.tasks.length, Icon: SquareCheckBig },
    { id: "notes", label: "Notas", count: data.notes.length, Icon: NotebookPen },
    { id: "calendar", label: "Agenda", count: data.events.length, Icon: CalendarDays },
  ] as const;
  const chosen: string[] = section === "tasks"
    ? data.tasks.map(taskLabel)
    : section === "notes"
      ? data.notes.map(noteLabel)
      : events.map(eventLabel);
  const where = section === "tasks" ? "tareas" : section === "notes" ? "notas" : "eventos";
  const ActiveIcon = tabs.find((item) => item.id === section)?.Icon ?? SquareCheckBig;
  const st = SECTION_STYLE[section];
  const rgb = st.rgb;
  return (
    <section className="glass relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.75rem] p-5">
      <div className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full blur-3xl transition-colors duration-500" style={{ background: `rgba(${rgb},0.16)` }} />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-accent-2/5 blur-3xl" />

      <div className="relative flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-2">
            <span className="h-px w-5 bg-accent-2/60" />Panel personal
          </div>
          <h2 className="mt-2 text-[22px] font-semibold leading-none tracking-tight">Tu espacio</h2>
          <p className="mt-2 text-xs leading-5 text-muted">Todo lo importante, en un solo lugar.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-3xl font-semibold leading-none tabular-nums">{total}</span>
          <span className="mt-1 text-[10px] uppercase tracking-widest text-muted">en total</span>
        </div>
      </div>

      <div className="relative mt-5 grid shrink-0 grid-cols-3 gap-2">
        {tabs.map((item) => {
          const on = section === item.id;
          const c = SECTION_STYLE[item.id].rgb;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              aria-pressed={on}
              className="group relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all duration-300 hover:-translate-y-0.5"
              style={{
                borderColor: on ? `rgba(${c},0.55)` : "rgba(23,43,64,0.9)",
                background: on ? `linear-gradient(160deg, rgba(${c},0.20), rgba(${c},0.04))` : "rgba(5,11,19,0.40)",
                boxShadow: on ? `0 10px 28px -14px rgba(${c},0.8), inset 0 1px 0 rgba(255,255,255,0.06)` : "none",
              }}
            >
              <div className="flex items-center justify-between">
                <item.Icon size={16} className={on ? SECTION_STYLE[item.id].text : "text-muted"} />
                {on ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(${c})`, boxShadow: `0 0 10px rgb(${c})` }} /> : null}
              </div>
              <div className="mt-3 text-2xl font-semibold leading-none tabular-nums">{item.count}</div>
              <div className="mt-1.5 text-[11px] text-muted">{item.label}</div>
            </button>
          );
        })}
      </div>

      <div className="relative mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line/70 bg-bg/40">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `rgba(${rgb},0.14)` }}>
              <ActiveIcon size={14} className={st.text} />
            </span>
            <span className="truncate">{st.title}</span>
          </div>
          <span className="shrink-0 rounded-full border border-line/70 bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-muted">
            {chosen.length} {chosen.length === 1 ? "elemento" : "elementos"}
          </span>
        </div>

        {chosen.length ? (
          <ul className="no-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {chosen.slice(0, 8).map((item, i) => (
              <li
                key={`${item}-${i}`}
                title={item}
                className="flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition hover:border-line/80 hover:bg-white/[0.03]"
              >
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `rgb(${rgb})`, boxShadow: `0 0 10px rgba(${rgb},0.7)` }} />
                <span className="min-w-0 flex-1 text-fg/85 [overflow-wrap:anywhere]">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 py-4 text-center">
            <div className="relative grid h-16 w-16 place-items-center">
              <span className="absolute inset-0 rounded-full blur-xl" style={{ background: `rgba(${rgb},0.28)` }} />
              <span
                className="relative grid h-14 w-14 place-items-center rounded-2xl border"
                style={{ borderColor: `rgba(${rgb},0.40)`, background: `linear-gradient(160deg, rgba(${rgb},0.22), rgba(${rgb},0.05))` }}
              >
                <ActiveIcon size={24} className={st.text} />
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold">Todavía no hay {where}</h3>
            <p className="mt-1.5 max-w-[230px] text-xs leading-5 text-muted">
              Agregalos desde su sección o pedíselo a Suri en el chat.
            </p>
            <div className="mt-4 hidden max-w-full items-center gap-2 rounded-full border border-line/70 bg-white/[0.03] px-3.5 py-1.5 text-[11px] text-muted [@media(min-height:760px)]:flex">
              <span className="shrink-0 font-medium text-fg">Probá:</span>
              <span className="truncate">{st.hint}</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-3 flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-warn" : "bg-ok"}`} />
        {error ? "No se pudo sincronizar" : "Espacio sincronizado"}
      </div>
      {error ? <p role="status" className="mt-2 shrink-0 text-xs text-warn">{error}</p> : null}
    </section>
  );
}

const WORKSPACE_URL: string =
  (import.meta.env?.VITE_WORKSPACE_URL as string | undefined) ?? "https://pazglezerpasante-code.github.io/volksia-workspace/";

const toolbarBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-white/5 hover:text-fg";

/**
 * Centro de herramientas (VOLKSIA Workspace).
 * Va dentro de un marco con aire (como el resto de las pantallas) y una barra fina
 * con Recargar / Abrir en pestaña nueva / Ampliar. "Ampliar" lo pasa a pantalla
 * completa (sin menú ni cabecera) para ganar todo el espacio; Esc o el mismo
 * botón vuelven. El iframe no se vuelve a cargar al ampliar o reducir.
 */
function Tools() {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loaded) return;
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(t);
  }, [loaded, reloadKey]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const reload = () => {
    setLoaded(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col bg-bg pt-[env(safe-area-inset-top)]"
          : "glass flex h-full min-h-0 flex-col overflow-hidden rounded-3xl"
      }
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Wrench size={15} className="shrink-0 text-accent-2" />
          <span className="truncate font-display text-sm font-semibold">Herramientas</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={reload} className={toolbarBtn} aria-label="Recargar herramientas" title="Recargar">
            <RefreshCw size={15} />
          </button>
          <a
            href={WORKSPACE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={toolbarBtn}
            aria-label="Abrir en una pestaña nueva"
            title="Abrir en una pestaña nueva"
          >
            <ExternalLink size={15} />
          </a>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={toolbarBtn}
            aria-label={expanded ? "Reducir" : "Ampliar a pantalla completa"}
            title={expanded ? "Reducir (Esc)" : "Ampliar a pantalla completa"}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-white">
        {!loaded ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-bg p-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex w-fit items-center gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-accent-2" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
              <p className="mt-4 text-sm text-muted">Cargando herramientas…</p>
              {slow ? (
                <p className="mt-3 text-xs leading-5 text-muted">
                  Está tardando más de lo normal. Revisá tu conexión o{" "}
                  <a className="text-accent-2 underline" href={WORKSPACE_URL} target="_blank" rel="noopener noreferrer">
                    abrilo en una pestaña aparte
                  </a>
                  .
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <iframe
          key={reloadKey}
          src={WORKSPACE_URL}
          title="Herramientas"
          className="block h-full w-full border-0"
          onLoad={() => setLoaded(true)}
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        />
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-muted">
      {label}
      <input className="rounded-lg border border-line bg-bg px-3 py-3" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const inputCls = "rounded-xl border border-line bg-panel/70 px-4 py-3";
const rowCls = "flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/70 px-4 py-3 text-sm";

function PageShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { error } = useSpace();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}
      {children}
    </div>
  );
}

function TasksPage() {
  const { data, add, update, remove } = useSpace();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const pending = data.tasks.filter((t) => !t.done).length;
  return (
    <PageShell title="Tareas" hint={`${pending} pendiente(s) · También podés pedirle a Suri en el chat: «agregá una tarea…»`}>
      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (await add("tasks", { title: text.trim(), due: due || null })) {
            setText("");
            setDue("");
          }
        }}
      >
        <input className={`${inputCls} flex-1`} value={text} placeholder="Nueva tarea" onChange={(e) => setText(e.target.value)} />
        <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <button className="wol-btn rounded-xl px-5 py-3" type="submit">Agregar</button>
      </form>
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {data.tasks.map((t) => (
          <li key={t.id} className={rowCls}>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[var(--color-accent,#2f8dff)]"
              checked={t.done}
              aria-label={`Marcar «${t.title}» como hecha`}
              onChange={(e) => void update("tasks", t.id, { done: e.target.checked })}
            />
            <span title={t.title} className={`min-w-0 flex-1 truncate ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
            {t.priority !== "normal" ? <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{PRIORITY_LABEL[t.priority]}</span> : null}
            {t.due ? <span className="shrink-0 text-xs text-accent-2">{t.due}</span> : null}
            <button className="shrink-0 text-muted hover:text-fg" onClick={() => void remove("tasks", t.id)}>Quitar</button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function NotesPage() {
  const { data, add, remove } = useSpace();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return (
    <PageShell title="Notas" hint="Apuntes e ideas · También podés pedirle a Suri en el chat: «anotá que…»">
      <form
        className="mt-6 grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          if (await add("notes", { title: title.trim(), content: content.trim() })) {
            setTitle("");
            setContent("");
          }
        }}
      >
        <input className={inputCls} value={title} placeholder="Título de la nota" onChange={(e) => setTitle(e.target.value)} />
        <textarea className={`${inputCls} min-h-[84px] resize-y`} value={content} placeholder="Contenido (opcional)" onChange={(e) => setContent(e.target.value)} />
        <button className="wol-btn rounded-xl px-5 py-3 sm:justify-self-end" type="submit">Agregar</button>
      </form>
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {data.notes.map((n) => (
          <li key={n.id} className={`${rowCls} items-start`}>
            <div className="min-w-0 flex-1">
              <div title={n.title} className="truncate font-medium">{n.title}</div>
              {n.content ? <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{n.content}</div> : null}
            </div>
            <button className="shrink-0 text-muted hover:text-fg" onClick={() => void remove("notes", n.id)}>Quitar</button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function CalendarView() {
  const { data, add, remove } = useSpace();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  return (
    <PageShell title="Calendario" hint="Eventos con fecha · También podés pedirle a Suri en el chat: «agendá una reunión…»">
      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || !date) return;
          if (await add("events", { title: text.trim(), date, time: time || null })) {
            setText("");
            setTime("");
          }
        }}
      >
        <input type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
        <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora" />
        <input className={`${inputCls} flex-1`} placeholder="Evento" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="wol-btn rounded-xl px-5 py-3" type="submit">Agregar</button>
      </form>
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {[...data.events].sort(byDate).map((ev) => (
          <li key={ev.id} className={rowCls}>
            <span className="shrink-0 text-xs text-accent-2">{ev.date ?? "Sin fecha"}{ev.time ? ` · ${ev.time}` : ""}</span>
            <span title={ev.title} className="min-w-0 flex-1 truncate">{ev.title}{ev.location ? ` @ ${ev.location}` : ""}</span>
            <button className="shrink-0 text-muted hover:text-fg" onClick={() => void remove("events", ev.id)}>Quitar</button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
