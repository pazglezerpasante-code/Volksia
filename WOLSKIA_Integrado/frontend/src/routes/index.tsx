import { useChatVoice, SpeakResponse } from "@/components/chat-voice";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { BubbleDock } from "@/components/bubble-dock";
import { SuriFace } from "@/components/suri-face";
import { AboutPage } from "@/components/about-page";
import { parseSpaceCommand } from "@/lib/space-commands";
import { TaskFilters, TaskCount, RemoveItem, WorkspaceNotices } from "@/components/workspace-interactions";
import { LabelInput } from "@/components/bencho/LabelInput";
import { VoiceRecorder, AudioNotePlayer } from "@/components/voice-recorder";
import { FileDropTarget } from "@/components/file-drop-target";
import { Toaster } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Info,
  Send,
  Download,
  Plus,
  Pencil,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
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
import { learnPreference, readWorkerMemory, sanitizeChatLines, workerMemoryContext, writeWorkerMemory } from "@/lib/worker-memory";
import { combineAttendanceMessages, parseAbsenceReasons, parseHolidayDates, resolveSuriOperation, runWorkspaceTool, selectSuriOperation, type LocalDownload } from "@/lib/workspace-runner";
import { RobotThinking, type RobotMood } from "@/components/robot";
import { type IconBarItem } from "@/components/icon-bar";
import { Markdown } from "@/components/markdown";
import { SpaceProvider, useSpace } from "@/lib/space-context";
import { runSpreadsheetAsk, runSpreadsheetChat, spreadsheetFile, spreadsheetIntent } from "@/lib/spreadsheet-chat";
import {
  aiApi,
  type ChatMessage,
  type EventItem,
  type NoteItem,
  type TaskItem,
  type ToolAction,
} from "@/lib/ai-api";


export const Route = createFileRoute("/")({ component: Home });

type Role = "admin" | "worker";
type Page = "chat" | "tools" | "tasks" | "notes" | "calendar" | "about";

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
  return <MotionConfig reducedMotion="user"><Studio session={profile} /></MotionConfig>;
}

const NAV: IconBarItem[] = [
  { key: "chat", label: "Chat", Icon: MessageSquare },
  { key: "tools", label: "Herramientas", Icon: Wrench },
  { key: "tasks", label: "Tareas", Icon: SquareCheckBig },
  { key: "notes", label: "Notas", Icon: NotebookPen },
  { key: "about", label: "Acerca de", Icon: Info },
];

function Studio({ session }: { session: { user: string; role: Role; name: string } }) {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState<Page>("chat");
  const [mood, setMood] = useState<RobotMood>("idle");
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("view");
    if (initial === "studio") window.history.replaceState(null, "", "?view=chat");
    if (["chat", "tools", "tasks", "notes", "calendar", "about"].includes(initial ?? "")) setPage(initial as Page);
  }, []);
  const go = (key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", key);
    window.history.replaceState(null, "", url);
    setPage(key as Page);
    if (key === "tools") {
      if (window.matchMedia("(max-width: 767px)").matches) return;
      setCollapsed(true);
    }
    setMood("idle");
  };

  /* Pantalla fija: la ventana nunca se estira ni scrollea. Lo que no
     entra se corta con "…" o scrollea dentro de su propio recuadro. */
  return (
    <SpaceProvider user={session.user}>
    <Toaster theme="dark" position="bottom-right" richColors closeButton />
    <WorkspaceNotices />
    <div className="suri-app wol-aurora flex h-dvh overflow-hidden">
      <aside id="workspace-navigation" className={`suri-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="suri-brand"><span>Suri<small>Tu asistente de trabajo</small></span></div>
        <button className="suri-collapse" aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"} aria-controls="workspace-navigation" title={collapsed ? "Expandir menú" : "Contraer menú"} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}><span className="suri-collapse-icon">{collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}</span><span className="suri-collapse-copy">Contraer menú</span></button>
        
        <nav aria-label="Navegación principal">{NAV.map(({ key, label, Icon }) => <button key={key} aria-label={label} title={label} aria-current={page === key ? "page" : undefined} onClick={() => go(key)}><Icon size={19} /><span>{label}</span></button>)}</nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="suri-mobile-header"><strong>Suri</strong><span>Tu asistente de trabajo</span></header>
        <div
          className={`${page === "tools" ? "suri-tools-content" : ""} min-h-0 flex-1 px-4 pb-20 md:px-6 md:pb-6 md:pl-0 ${
            page === "chat" || page === "tools" ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          <div className={page === "chat" ? "h-full" : "hidden"}><Chat active={page === "chat"} navigate={go} mood={mood} setMood={setMood} name={session.name} user={session.user} role={session.role} /></div>
          {page === "tools" ? <Tools /> : null}
          {page === "tasks" ? <TasksPage /> : null}
          {page === "notes" ? <><NotesPage /></> : null}
          {page === "calendar" ? <CalendarView /> : null}
          {page === "about" ? <AboutPage /> : null}
        </div>
      </section>
      <nav className="suri-mobile-nav" aria-label="Navegación del celular">
        {NAV.map(({ key, label, Icon }) => <button key={key} aria-current={page === key ? "page" : undefined} onClick={() => go(key)}><Icon size={22} /><span>{label}</span></button>)}
      </nav>
    </div>
    </SpaceProvider>
  );
}

function Chat({
  active,
  navigate,
  mood,
  setMood,
  name,
  user,
  role,
}: {
  active: boolean;
  navigate: (page: string) => void;
  mood: RobotMood;
  setMood: (m: RobotMood) => void;
  name: string;
  user: string;
  role: Role;
}) {

  const [copied, setCopied] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [memory, setMemory] = useState(() => readWorkerMemory(user));
  const [lines, setLines] = useState<{ who: "vos" | "wolskia"; text: string; meta?: string; kind?: "chat" | "tool"; actions?: ToolAction[]; downloads?: LocalDownload[] }[]>(() => {
    const saved = readWorkerMemory(user);
    return saved.enabled ? saved.messages.map((message) => ({ ...message })) : [];
  });
  const moodTimers = useRef<number[]>([]);
  useEffect(() => () => moodTimers.current.forEach(clearTimeout), []);
  const generation = useRef<AbortController | null>(null);
  useEffect(() => () => generation.current?.abort(), []);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number; content: string; readable: boolean; file: File }[]>([]);
  const pendingTool = useRef<ReturnType<typeof selectSuriOperation>>(null);
  const pendingText = useRef("");
  const pendingExcel = useRef<File | null>(null);
  const [activeSheet, setActiveSheet] = useState<File | null>(null);
  const spreadsheetHistory = useRef<ChatMessage[]>([]);
  const spreadsheetPending = useRef(false);
  const lastSpreadsheetMode = useRef<"ask" | "edit" | "create" | null>(null);
  const spreadsheetNeedsFile = useRef(false);
  const downloadUrls = useRef<string[]>([]);
  useEffect(() => () => { downloadUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: localSpace, applyChat, add: addSpace } = useSpace();

  // La memoria es opcional, local y nunca contiene adjuntos ni datos laborales.
  useEffect(() => {
    if (!memory.enabled) return;
    writeWorkerMemory(user, { ...memory, messages: sanitizeChatLines(lines) });
  }, [user, lines, memory]);

  // Siempre mostrar el último mensaje (la barra de scroll está oculta)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, busy]);

  async function attachFiles(files: File[]) {
              if (files.some(f => f.size > 8 * 1024 * 1024)) { window.alert("Cada adjunto debe pesar como máximo 8 MB."); return; }
              const parsed = await Promise.all(files.map(async (file) => {
                const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                const readable = ["txt", "md", "csv", "json", "log", "xml", "yaml", "yml", "html", "css", "ts", "tsx", "js", "jsx", "py", "sql"].includes(ext) && file.size <= 2 * 1024 * 1024;
                let content = "";
                if (readable) { try { content = await file.text(); } catch { /* no se pudo leer */ } }
                return { id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, size: file.size, content, readable: readable && Boolean(content), file };
              }));
              setAttachments((prev) => [...prev, ...parsed].slice(0, 5));

  }

  const voice = useChatVoice({ active, disabled: busy, text, onText: setText });

  async function send(raw?: string) {
    const userText = (raw ?? text).trim();
    if ((!userText && attachments.length === 0) || busy) return;
    voice.cancel();
    window.speechSynthesis?.cancel();
    moodTimers.current.forEach(clearTimeout);
    moodTimers.current = [];
    const localCommand = attachments.length === 0 ? parseSpaceCommand(userText) : null;
    const attachedExcel = attachments.find((a) => /\.(xls|xlsx)$/i.test(a.name))?.file;
    const followup = /^(?:sí|si|dale|detallalos en chat|mostralos)[.!?]*$/i.test(userText.trim());
    const intent = (followup && !attachedExcel ? lastSpreadsheetMode.current : null)
      ?? spreadsheetIntent(userText, Boolean(attachedExcel), Boolean(activeSheet))
      ?? (spreadsheetPending.current ? "edit" : null);
    const directlyRequested = selectSuriOperation(userText);
    const candidateOperation = resolveSuriOperation(userText, pendingTool.current, Boolean(attachedExcel));
    const genericEdit = /\b(?:agreg\w*|a[ñn]ad\w*|cambi\w*|modific\w*|edit\w*|quit\w*|borr\w*|elimin\w*|orden\w*|reemplaz\w*|pon\w*|columna\w*|fila\w*|celda\w*)\b/i.test(userText);
    const genericSpreadsheet = !localCommand && (intent === "ask" || intent === "create" || (intent === "edit" && (!candidateOperation || genericEdit)));
    const operation = localCommand || genericSpreadsheet ? null : candidateOperation;
    if (directlyRequested && pendingTool.current && directlyRequested !== pendingTool.current) {
      pendingText.current = "";
      pendingExcel.current = null;
    }
    const binaryExcel = attachedExcel || (operation && (!pendingTool.current || operation === pendingTool.current) ? pendingExcel.current : null);
    if (operation && operation !== "certificados") pendingTool.current = operation;
    const context = attachments.filter((a) => a.readable).map((file) =>
      "\n\n--- Archivo adjunto: " + file.name + " ---\n" + file.content.slice(0, 24000)).join("");
    const query = (userText || "Analizá los archivos adjuntos.") + context;
    const attachedForDisplay = attachments.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    setText("");
    setAttachments([]);
    const history: ChatMessage[] = lines.filter((line) => line.kind !== "tool" && (line.who === "vos" || line.meta))
      .slice(-13)
      .map((line) => ({ role: line.who === "vos" ? ("user" as const) : ("assistant" as const), content: line.text }));
    const remembered = workerMemoryContext(memory);
    if (remembered) history.unshift({ role: "user", content: remembered });
    if (memory.enabled && userText && !attachedExcel && !operation && !genericSpreadsheet) {
      setMemory((prev) => learnPreference(prev, userText));
    }
    setLines((prev) => [...prev, { who: "vos", kind: operation || binaryExcel || genericSpreadsheet ? "tool" : "chat",
      text: (userText || "Revisá los archivos adjuntos.") +
        (attachedForDisplay.length ? "\n\n📎 " + attachedForDisplay.join(" · ") : "") }]);
    setMood(attachedExcel ? "reading" : operation ? "searching" : "think");
    setBusy(true);
    let failed = false;
    try {
      if (localCommand) {
        // Explicit local commands must not depend on AI keys or an earlier Excel flow.
        if (!await addSpace(localCommand.collection, localCommand.body)) throw new Error("No se pudo guardar. Revisá los permisos de almacenamiento del navegador.");
        const noun = localCommand.collection === "notes" ? "Nota guardada" : "Tarea creada";
        setLines(prev => [...prev, { who: "wolskia", kind: "chat", text: `${noun}: **${localCommand.body.title}**${localCommand.body.due ? ` · Para el ${localCommand.body.due}` : ""}.\n\nLa encontrás en ${localCommand.collection === "notes" ? "Notas" : "Tareas"}.` }]);
        setMood("speak");
      } else if (genericSpreadsheet) {
        if (attachments.filter(a => /\.(xls|xlsx)$/i.test(a.name)).length > 1) throw new Error("Adjuntá una sola planilla por vez para indicar claramente qué archivo modificar.");
        const source = intent === "create" ? null : attachedExcel ?? activeSheet;
        lastSpreadsheetMode.current = intent;
        if (intent === "create") { if (!followup || !spreadsheetPending.current) spreadsheetHistory.current = []; setActiveSheet(null); spreadsheetNeedsFile.current = false; }
        if (attachedExcel) { setActiveSheet(attachedExcel); if (!spreadsheetPending.current) spreadsheetHistory.current = []; }
        const effectiveMessage = userText || (source && spreadsheetNeedsFile.current ? [...spreadsheetHistory.current].reverse().find(h => h.role === "user")?.content ?? "" : "");
        if (intent === "edit" && !source && (!spreadsheetPending.current || spreadsheetNeedsFile.current)) {
          setLines(prev => [...prev, { who: "wolskia", kind: "tool", text: "Adjuntá el archivo .xls o .xlsx que querés modificar y contame los cambios." }]);
          spreadsheetPending.current = true;
          spreadsheetNeedsFile.current = true;
          spreadsheetHistory.current.push({ role: "user", content: userText });
        } else if (!effectiveMessage && source) {
          setActiveSheet(source);
          setLines(prev => [...prev, { who: "wolskia", kind: "tool", text: "Recibí tu planilla. ¿Qué querés cambiar? Podés agregar filas o columnas, cambiar datos y ordenar la tabla." }]);
        } else {
          generation.current = new AbortController();
          setMood(source ? "processing" : "think");
          const response = await (intent === "ask" ? runSpreadsheetAsk : runSpreadsheetChat)(effectiveMessage || "¿Qué cambios necesitás en esta planilla?", source, spreadsheetHistory.current, generation.current.signal);
          spreadsheetNeedsFile.current = false;
          spreadsheetHistory.current = [...spreadsheetHistory.current, { role: "user", content: userText }, { role: "assistant", content: response.summary }].slice(-6) as ChatMessage[];
          spreadsheetPending.current = intent !== "ask" && response.status === "clarification";
          if (response.status === "answer") lastSpreadsheetMode.current = "ask";
          if (response.status === "ok") {
            lastSpreadsheetMode.current = "edit";
            const output = spreadsheetFile(response);
            const url = URL.createObjectURL(output);
            downloadUrls.current.push(url);
            setActiveSheet(output);
            const preview = response.preview?.map(sheet => {
              const rows = sheet.preview.slice(0, 6).map(row => row.values.map(v => String(v ?? "").replace(/[|\n\r]/g, " ")));
              if (!rows.length) return "";
              return `**${sheet.name}** · ${sheet.rows} filas · ${sheet.columns} columnas\n\n| ${rows[0].join(" | ")} |\n| ${rows[0].map(() => "---").join(" | ")} |\n${rows.slice(1).map(row => `| ${row.join(" | ")} |`).join("\n")}`;
            }).join("\n\n");
            setLines(prev => [...prev, { who: "wolskia", kind: "tool", text: `${response.summary}\n\n${preview ?? ""}\n\n${response.warning ?? ""}\n\nPodés descargarlo o pedirme otro cambio sobre esta versión.`, downloads: [{ name: output.name, url }] }]);
            pendingTool.current = null; pendingExcel.current = null; pendingText.current = "";
          } else {
            setLines(prev => [...prev, { who: "wolskia", kind: response.status === "answer" ? "chat" : "tool", text: response.summary }]);
          }
        }
        setMood("speak");
      } else if (operation === "certificados") {
        setLines((prev) => [...prev, { who: "wolskia", kind: "tool",
          text: "Para usar el gestor de certificados, abrí su página: [Gestor de certificados](https://gestor-certificados-06pf.onrender.com/). SURI no emite ni aprueba certificados." }]);
        pendingTool.current = null;
        pendingExcel.current = null;
        pendingText.current = "";
        setMood("speak");
      } else if (operation) {
        if (!binaryExcel) {
          pendingText.current = combineAttendanceMessages(pendingText.current, userText);
          setLines((prev) => [...prev, { who: "wolskia", kind: "tool",
            text: "Adjuntá el Excel .xls o .xlsx. Voy a reconocer el formato del contenido, no por el nombre." }]);
        } else {
          pendingExcel.current = binaryExcel;
          const instructions = combineAttendanceMessages(pendingText.current, userText);
          const holidays = operation === "asistencia" ? parseHolidayDates(instructions) : [];
          const reasons = operation === "asistencia" ? parseAbsenceReasons(instructions) : {};
          const period = operation === "encuesta2" && /todos? los dias|todo el periodo|todas las fechas/i.test(userText)
            ? ("todo" as const) : undefined;
          setMood("processing");
          const response = await runWorkspaceTool(operation, binaryExcel, { holidays, reasons, period });
          setLines((prev) => [...prev, { who: "wolskia", kind: "tool",
            text: response.summary, downloads: response.downloads }]);
          pendingTool.current = null;
          pendingText.current = "";
          pendingExcel.current = null;
        }
        setMood("speak");
      } else {
        generation.current = new AbortController();
        const before = structuredClone(localSpace);
        const response = await aiApi.chat({ message: query, history, provider: "auto", user, role, device_space: before }, generation.current.signal);
        if (response.device_space) applyChat(before, response.device_space);
        failed = response.status !== "ok";
        setMood(failed ? "alert" : "speak");
        setLines((prev) => [...prev, { who: "wolskia", kind: "chat",
          text: response.reply, meta: response.status === "ok" ? response.provider : undefined, actions: response.actions }]);
      }
    } catch (error) {
      failed = true;
      // Si el servidor falla, conservar la consulta y el binario para reintentar sin volver a seleccionar.
      if (attachedExcel || (genericSpreadsheet && attachments.length)) setAttachments(attachments);
      if (userText) setText(userText);
      if (operation === "asistencia") {
        pendingText.current = combineAttendanceMessages(pendingText.current, userText);
        if (binaryExcel) pendingExcel.current = binaryExcel;
      }
      const detail = generation.current?.signal.aborted ? "Recepción detenida. El proveedor puede seguir procesando la solicitud." : error instanceof Error ? error.message : "Error inesperado.";
      const missing = operation === "asistencia" && /Falta confirmar los motivos de ausencias prolongadas/i.test(detail);
      setMood("alert");
      setLines((prev) => [...prev, { who: "wolskia", kind: operation || binaryExcel || genericSpreadsheet ? "tool" : "chat",
        text: missing ? detail + "\n\nEl Excel sigue guardado. Si todos estaban de vacaciones, respondé «todos vacaciones» sin adjuntar el Excel otra vez." : detail }]);
    } finally {
      generation.current = null;
      setBusy(false);
      if (!failed) moodTimers.current.push(window.setTimeout(() => setMood("celebrate"), 700));
      moodTimers.current.push(window.setTimeout(() => setMood("idle"), failed ? 3000 : 3500));
    }
  }

  return (
    <FileDropTarget onFiles={attachFiles} disabled={busy}><div className="suri-chat-layout">
      <div className={`suri-chat ${lines.length ? "has-messages" : "is-welcome"}`}>
        <div className="suri-chat-greeting">{<SuriFace mood={mood} size={lines.length === 0 ? 270 : 76} compact={lines.length !== 0} />}<div>{active ? <h1>Hola, soy SURI</h1> : <p>Hola, soy SURI</p>}<p>Tu asistente de trabajo</p></div></div>
        <div className="suri-stage">
          {lines.length === 0 ? (
            <div className="suri-welcome">
              <div className="suri-empty-chat"><h2>¿Qué hacemos ahora?</h2><p>Contame qué necesitás. Podemos trabajar con tus archivos, organizar tareas o guardar una idea.</p><div className="suri-prompts"><button onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /> Trabajar con un archivo</button><button onClick={() => { setText("Creá una tarea para "); setMood("listen"); }}><SquareCheckBig size={18} /> Crear una tarea</button><button onClick={() => { setText("Guardá una nota: "); setMood("listen"); }}><NotebookPen size={18} /> Guardar una idea</button></div></div>
            </div>
          ) : (
            <div className="suri-message-area h-full min-h-0 w-full">
              <div
                ref={listRef}
                className="no-scrollbar flex h-full min-h-0 flex-col gap-3 overflow-y-auto scroll-smooth [mask-image:linear-gradient(to_bottom,transparent,black_24px)]"
              >
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={`wol-msg min-w-0 max-w-2xl shrink-0 rounded-2xl border px-4 py-3 text-sm ${line.who === "vos" ? "is-user" : "is-assistant"} ${
                      line.who === "vos"
                        ? "ml-auto border-accent/40 bg-gradient-to-br from-accent/20 to-accent/5"
                        : "border-line bg-bg/80"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-accent-2">
                      {line.who === "vos" ? null : <img className="suri-message-robot" src={`/robot/wolskia-${line.downloads?.length ? "ok" : "speak"}-384.webp`} alt="SURI" width={56} height={56} />}
                      {line.who === "vos" ? "Vos" : "SURI"}
                    </div>
                    {line.who === "vos" ? (
                      <div title={line.text} className="line-clamp-6 whitespace-pre-wrap leading-6 [overflow-wrap:anywhere]">{line.text}</div>
                    ) : (
                      <div className="min-w-0 overflow-x-auto [overflow-wrap:anywhere]">
                        <Markdown text={line.text} />
                      </div>
                    )}
                    {line.who === "wolskia" && <button type="button" className="suri-copy" aria-label="Copiar respuesta" onClick={async () => { try { await navigator.clipboard.writeText(line.text); setCopied(i); } catch { setCopied(null); } }}><Copy size={13} /> {copied === i ? "Copiado" : "Copiar"}</button>}
                    {line.who === "wolskia" && <SpeakResponse text={line.text} active={active && !voice.listening} />}
                    <ActionChips actions={line.actions} />
                    {line.downloads?.map((download, i) => (
                      <a key={i} href={download.url} download={download.name} className="suri-file-download"><span className="suri-file-icon"><FileText size={25} /></span><span><strong>{download.name}</strong><small><Check size={12} /> Listo para descargar</small></span><Download size={20} /><span className="suri-download-label">Descargar</span></a>
                    ))}
                    {line.meta ? <div className="mt-2 truncate text-[11px] text-muted">vía {line.meta}</div> : null}
                  </div>
                ))}
                {busy ? <RobotThinking /> : null}
              </div>
            </div>
          )}
        </div>
        <div data-chat-composer className="suri-composer">
          {activeSheet && <div className="suri-active-sheet"><FileText size={15} /><span>Archivo activo: <strong>{activeSheet.name}</strong></span><button type="button" disabled={busy} aria-label="Dejar de editar esta planilla" onClick={() => { setActiveSheet(null); lastSpreadsheetMode.current = null; spreadsheetHistory.current = []; spreadsheetPending.current = false; spreadsheetNeedsFile.current = false; }}>Quitar <X size={13} /></button></div>}
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2" aria-label="Archivos adjuntos seleccionados">
              {attachments.map((file) => (
                <div key={file.id} className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs">
                  <FileText size={15} className="shrink-0 text-accent-2" />
                  <span className="max-w-[160px] truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>
                  <span className="shrink-0 text-muted">{file.readable ? "Listo para analizar" : /\.(xls|xlsx)$/i.test(file.name) ? "Planilla lista para procesar" : "Solo referencia"}</span>
                  <button type="button" className="rounded-md p-1 text-muted hover:text-fg" aria-label={`Quitar ${file.name}`} onClick={() => setAttachments((prev) => prev.filter((f) => f.id !== file.id))}><X size={14} /></button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="chat-voice-status" role="status">{voice.status}</div>
          <form
            className="flex w-full min-w-0 items-center gap-1.5 rounded-2xl border border-line bg-bg/80 p-1.5 transition focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgba(47,141,255,0.12)] sm:gap-2 sm:p-2"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <input ref={fileInputRef} type="file" multiple className="hidden" aria-label="Seleccionar archivos" accept=".xls,.xlsx,.txt,.md,.csv,.json,.log,.xml,.yaml,.yml,.html,.css,.ts,.tsx,.js,.jsx,.py,.sql" onChange={e => { void attachFiles(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ""; }} />
            <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-accent hover:text-accent-2" aria-label="Adjuntar archivos" title="Adjuntar planillas, texto, código o datos" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></button>
            <input
              className="min-w-0 flex-1 bg-transparent px-2 py-2 outline-none placeholder:text-muted/80"
              placeholder={attachments.length ? "Preguntá sobre los archivos…" : "¿Qué hacemos hoy? Contame tu idea…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setMood("listen")}
              aria-label="Mensaje para Suri"
            />
            {voice.button}
            {busy && generation.current && <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs" onClick={() => generation.current?.abort()}>Detener</button>}
            <button className="wol-btn shrink-0 rounded-xl px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:px-5" aria-label="Enviar mensaje" type="submit" disabled={busy || (!text.trim() && attachments.length === 0)}>
              <><Send size={19} /><span className="sr-only">{busy ? "Analizando…" : "Enviar"}</span></>
            </button>
          </form>
          <p className="chat-voice-hint">Podés escribir o hablar. El dictado usa el servicio de voz de tu navegador.</p>
          <p className="mt-2 truncate px-2 text-[11px] text-muted max-md:hidden" title="Hasta 5 adjuntos; planillas hasta 8 MB, archivos de texto hasta 2 MB.">
            Hasta 5 adjuntos · Planillas hasta 8 MB · Texto hasta 2 MB.
          </p>
        </div>
      </div>
      <BubbleDock navigate={navigate} />
    </div></FileDropTarget>
  );
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
          : "suri-tools-frame flex h-full min-h-0 flex-col overflow-hidden"
      }
    >
      <div className="suri-tools-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4">
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
    <div className="suri-organizer-page mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}
      {children}
    </div>
  );
}

function TasksPage() {
  const { data, add, update, remove } = useSpace();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [filter, setFilter] = useState(0);
  const pending = data.tasks.filter((t) => !t.done).length;
  const visibleTasks = data.tasks.filter(t => filter === 0 || (filter === 1 ? !t.done : t.done));
  return (
    <PageShell title="Tareas" hint={`${pending} pendiente(s) · También podés pedirle a Suri en el chat: «agregá una tarea…»`}>
      <div className="task-controls bencho-scope"><TaskCount value={pending} /><TaskFilters selected={filter} onSelect={setFilter} /></div>
      <button type="button" className="suri-cta" aria-expanded={creating} onClick={() => { setCreating(v => !v); setEditing(null); setText(""); setDue(""); }}><span className="suri-cta-icon"><Plus size={16} strokeWidth={2.6} /></span>{creating ? "Cerrar" : "Nueva tarea"}</button>
      <AnimatePresence initial={false}>
        {creating && <motion.div key="task-form" className="suri-form-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}><form
          className="mt-6 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            if (await (editing ? update("tasks", editing, { title: text.trim(), due: due || null }) : add("tasks", { title: text.trim(), due: due || null }))) {
              setEditing(null);
              setText("");
              setDue("");
              setCreating(false);
            }
          }}
        >
          <div className="bencho-scope"><LabelInput field="Nueva tarea" value={text} onValueChange={setText} /></div>
          <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
          <button className="suri-cta is-wide" type="submit"><Check size={17} strokeWidth={2.6} />{editing ? "Guardar cambios" : "Agregar"}</button>
        </form></motion.div>}
      </AnimatePresence>
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {!data.tasks.length && <li className="suri-panel-empty">Tu lista empieza con una tarea. Agregala arriba o pedísela a SURI.</li>}
        {data.tasks.length > 0 && visibleTasks.length === 0 && <li className="suri-panel-empty">No hay tareas en este filtro.</li>}
        {visibleTasks.map((t) => (
          <li key={t.id} className={rowCls}>
            <button
              type="button"
              role="checkbox"
              aria-checked={t.done}
              className="sp-check"
              aria-label={`Marcar «${t.title}» como hecha`}
              onClick={() => void update("tasks", t.id, { done: !t.done })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </button>
            <span title={t.title} className={`min-w-0 flex-1 truncate ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
            {t.priority !== "normal" ? <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{PRIORITY_LABEL[t.priority]}</span> : null}
            {t.due ? <span className="shrink-0 text-xs text-accent-2">{t.due}</span> : null}
            <button aria-label={`Editar tarea ${t.title}`} className="shrink-0 text-accent-2" onClick={() => { setEditing(t.id); setText(t.title); setDue(t.due || ""); setCreating(true); }}><Pencil size={16} /></button><RemoveItem title={t.title} onConfirm={() => remove("tasks", t.id)} />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function NotesPage() {
  const { data, add, update, remove } = useSpace();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return (
    <PageShell title="Notas" hint="Apuntes e ideas · También podés pedirle a Suri en el chat: «anotá que…»">
      <form
        className="mt-6 grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          if (await (editing ? update("notes", editing, { title: title.trim(), content: content.trim() }) : add("notes", { title: title.trim(), content: content.trim() }))) {
            setEditing(null);
            setTitle("");
            setContent("");
          }
        }}
      >
        <div className="bencho-scope"><LabelInput field="Título de la nota" value={title} onValueChange={setTitle} /></div>
        <textarea className={`${inputCls} min-h-[84px] resize-y`} value={content} aria-label="Contenido de la nota" placeholder="Contenido (opcional)" onChange={(e) => setContent(e.target.value)} />
        <div className="flex justify-end gap-2">{editing && <button type="button" className="px-4" onClick={() => { setEditing(null); setTitle(""); setContent(""); }}>Cancelar</button>}<button className="suri-cta is-wide" type="submit"><Plus size={17} strokeWidth={2.6} />{editing ? "Guardar cambios" : "Agregar nota"}</button></div>
      </form>
      <VoiceRecorder />
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {!data.notes.length && <li className="suri-panel-empty">Guardá acá tu primera idea.</li>}
        {data.notes.map((n) => (
          <li key={n.id} className={`${rowCls} items-start`}>
            <div className="min-w-0 flex-1">
              <div title={n.title} className="font-medium [overflow-wrap:anywhere]">{n.title}</div>
              {n.audioId && <AudioNotePlayer id={n.audioId} />}
              {n.content ? <div className="mt-1 whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{n.content}</div> : null}
            </div>
            <div className="flex shrink-0 gap-3"><button aria-label={`Editar nota ${n.title}`} className="text-accent-2" onClick={() => { setEditing(n.id); setTitle(n.title); setContent(n.content); }}><Pencil size={16} /></button><RemoveItem title={n.title} onConfirm={() => remove("notes", n.id)} /></div>
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
        <button className="suri-cta is-wide" type="submit"><Plus size={17} strokeWidth={2.6} />Agregar</button>
      </form>
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {[...data.events].sort(byDate).map((ev) => (
          <li key={ev.id} className={rowCls}>
            <span className="shrink-0 text-xs text-accent-2">{ev.date ?? "Sin fecha"}{ev.time ? ` · ${ev.time}` : ""}</span>
            <span title={ev.title} className="min-w-0 flex-1 truncate">{ev.title}{ev.location ? ` @ ${ev.location}` : ""}</span>
            <RemoveItem title={ev.title} onConfirm={() => remove("events", ev.id)} />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
