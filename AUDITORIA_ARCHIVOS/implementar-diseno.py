from pathlib import Path
p=Path('WOLSKIA_Integrado/frontend/src/routes/index.tsx')
s=p.read_text(encoding='utf-8')
s=s.replace('  CalendarDays,','  CalendarDays,\n  Laptop,\n  Send,\n  Download,\n  Plus,\n  Pencil,')
s=s.replace('import { IconBar, type IconBarItem }','import { type IconBarItem }')
s=s.replace('import { runSpreadsheetChat,', 'import { DEVICE_SPACE_KEY, emptyDeviceSpace, readDeviceSpace, writeDeviceSpace, mergeDeviceChanges } from "@/lib/device-space";\nimport { runSpreadsheetChat,')
s=s.replace('  { key: "calendar", label: "Calendario", Icon: CalendarDays },\n','')
s=s.replace('    if (key === "tools") setCollapsed(true);','    if (key === "tools") {\n      if (window.matchMedia("(max-width: 767px)").matches) return;\n      setCollapsed(true);\n    }')
s=s.replace('  const roleLabel = "Espacio personal";','  useEffect(() => {\n    const media = window.matchMedia("(max-width: 767px)");\n    const adapt = () => { if (media.matches && (page === "tools" || page === "calendar")) setPage("chat"); };\n    adapt(); media.addEventListener("change", adapt);\n    return () => media.removeEventListener("change", adapt);\n  }, [page]);')
s=s.replace('<RobotAvatar /><span>SURI<small>INTELLIGENT WORKSPACE</small></span>','<span>SURI<small>Tu asistente de trabajo</small></span>')
s=s.replace('<div className="suri-nav-label">ESPACIO DE TRABAJO</div>','')
s=s.replace('<div className="suri-sidebar-footer"><span className="suri-avatar">TU</span><span>Tu espacio<small>Perfil de este navegador</small></span></div>','<div className="suri-sidebar-footer"><Laptop size={18} /><span>En este dispositivo<small>Sin cuentas ni inicio de sesión</small></span></div>')
a=s.index('        <header className=')
b=s.index('        <div\n          className=',a)
s=s[:a]+'''        <header className="suri-mobile-header"><strong>SURI</strong><span>Tu asistente de trabajo</span></header>
'''+s[b:]
s=s.replace('className={page === "chat" ? "h-full" : "hidden"}', 'className={page === "chat" ? "h-full" : "hidden"}')
s=s.replace('{page === "tasks" ? <TasksPage /> : null}', '{page === "tasks" ? <><DayWelcome mood={mood} /><TasksPage /><div className="mobile-notes-preview"><DeviceOverview navigate={go} only="notes" /></div></> : null}')
s=s.replace('{page === "notes" ? <NotesPage /> : null}', '{page === "notes" ? <><DayWelcome mood="listen" /><NotesPage /></> : null}')
a=s.index('      {/* Celular:')
b=s.index('    </div>\n    </SpaceProvider>',a)
s=s[:a]+'''      <nav className="suri-mobile-nav" aria-label="Navegación del celular">
        {NAV.filter(item => item.key !== "tools").map(({ key, label, Icon }) => <button key={key} aria-current={page === key ? "page" : undefined} onClick={() => go(key)}><Icon size={22} /><span>{label}</span></button>)}
      </nav>
'''+s[b:]
s=s.replace('  const [contextVisible, setContextVisible] = useState(false);','')
s=s.replace('  const { refresh } = useSpace();','  const { data: localSpace, applyChat } = useSpace();')
s=s.replace('const response = await aiApi.chat({ message: query, history, provider: "auto", user, role }, generation.current.signal);','const before = structuredClone(localSpace);\n        const response = await aiApi.chat({ message: query, history, provider: "auto", user, role, device_space: before }, generation.current.signal);\n        if (response.device_space) applyChat(before, response.device_space);')
s=s.replace('        if (response.space_changed) void refresh();\n','')
s=s.replace('<div className={`mx-auto grid h-full w-full max-w-6xl grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 ${contextVisible ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>','<div className="suri-chat-layout">')
a=s.index('        <div className="suri-chat-top">')
b=s.index('        <div className="suri-stage">',a)
s=s[:a]+'''        <div className="suri-chat-greeting"><Robot mood={mood} size="sm" /><div><h1>Hola, soy SURI</h1><p>Tu asistente de trabajo</p></div></div>
'''+s[b:]
a=s.index('              <div className="suri-hero">')
b=s.index('            </div>\n          ) : (',a)
s=s[:a]+'''              <div className="suri-empty-chat"><h2>¿Qué hacemos ahora?</h2><p>Contame qué necesitás. Podemos trabajar con tus archivos, organizar tareas o guardar una idea.</p><div className="suri-prompts"><button onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /> Trabajar con un archivo</button><button onClick={() => { setText("Creá una tarea para "); setMood("listen"); }}><SquareCheckBig size={18} /> Crear una tarea</button><button onClick={() => { setText("Guardá una nota: "); setMood("listen"); }}><NotebookPen size={18} /> Guardar una idea</button></div></div>
'''+s[b:]
s=s.replace('${\n                      line.who === "vos"','${line.who === "vos" ? "is-user" : "is-assistant"} ${\n                      line.who === "vos"')
s=s.replace('{line.who === "vos" ? null : <RobotAvatar px={24} />}', '{line.who === "vos" ? null : <img className="suri-message-robot" src={`/robot/wolskia-${line.downloads?.length ? "ok" : "speak"}-384.webp`} alt="SURI" width={56} height={56} />}')
s=s.replace('{line.who === "vos" ? "Usted" : "Suri"}', '{line.who === "vos" ? "Vos" : "SURI"}')
s=s.replace('<a key={i} href={download.url} download={download.name} className="mt-2 mr-2 inline-flex rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent-2 hover:bg-accent/20">Descargar {download.name}</a>', '<a key={i} href={download.url} download={download.name} className="suri-file-download"><span className="suri-file-icon"><FileText size={25} /></span><span><strong>{download.name}</strong><small><Check size={12} /> Listo para descargar</small></span><Download size={20} /><span className="suri-download-label">Descargar</span></a>')
s=s.replace('{busy ? "Analizando…" : "Enviar"}', '<><Send size={19} /><span className="sr-only">{busy ? "Analizando…" : "Enviar"}</span></>')
s=s.replace('type="submit" disabled={busy || (!text.trim()', 'aria-label="Enviar mensaje" type="submit" disabled={busy || (!text.trim()')
s=s.replace('{contextVisible && <aside className="suri-context min-h-0 min-w-0 overflow-y-auto"><button className="suri-context-close" onClick={() => setContextVisible(false)}>Volver al chat</button><WorkspaceOverview /></aside>}', '<aside className="suri-daily-panel"><DeviceOverview navigate={navigate} /></aside>')
a=s.index('/** Datos viejos')
b=s.index('const MUTATING',a)
s=s[:a]+'''function SpaceProvider({ user, children }: { user: string; children: ReactNode }) {
  const [data, setData] = useState<SpaceData>(EMPTY_SPACE);
  const [error, setError] = useState("");
  const ready = useRef(false);
  const commit = useCallback((next: SpaceData) => {
    try { writeDeviceSpace(next); setData(next); setError(""); return true; }
    catch { setError("No se pudo guardar en este navegador. Revisá el espacio disponible o los permisos de almacenamiento."); return false; }
  }, []);
  const refresh = useCallback(async () => {
    try { const saved = readDeviceSpace(); if (saved) setData(saved); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar tus datos."); }
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = readDeviceSpace();
        if (saved) { if (active) setData(saved); }
        else {
          // Import the old browser's server bucket once, without changing or deleting it.
          let previous = emptyDeviceSpace();
          try { previous = await spaceApi.all(user); } catch { /* offline: local lists remain usable */ }
          if (!active) return;
          // A mutation made while migration was loading always wins.
          const existing = readDeviceSpace();
          if (existing) setData(existing);
          else {
            for (const col of ["tasks", "notes", "events"] as const) {
              const legacy = JSON.parse(localStorage.getItem(`wolskia-${col}`) || "[]");
              if (!previous[col].length && Array.isArray(legacy)) {
                Object.assign(previous, { [col]: legacy.filter((t: unknown) => typeof t === "string").map((title: string) => ({ id: `${col[0]}_${crypto.randomUUID()}`, title, done: false, due: null, priority: "normal", detail: "", content: "", date: null, time: null, location: "" })) });
              }
            }
            commit(previous);
          }
        }
        ready.current = true;
      } catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el almacenamiento local."); }
    })();
    const sync = (e: StorageEvent) => { if (e.key === DEVICE_SPACE_KEY) void refresh(); };
    window.addEventListener("storage", sync);
    return () => { active = false; window.removeEventListener("storage", sync); };
  }, [user, commit, refresh]);
  const change = async (col: SpaceCollection, id: string | null, body?: Record<string, unknown>) => {
    try {
      const next = readDeviceSpace() ?? data;
      if (id) {
        if (body) Object.assign(next, { [col]: next[col].map(item => item.id === id ? { ...item, ...body } : item) });
        else Object.assign(next, { [col]: next[col].filter(item => item.id !== id) });
      } else {
        const defaults = col === "tasks" ? { done: false, due: null, priority: "normal", detail: "" } : col === "notes" ? { content: "" } : { date: null, time: null, location: "", detail: "" };
        Object.assign(next, { [col]: [{ ...defaults, ...body, id: `${col[0]}_${crypto.randomUUID()}` }, ...next[col]] });
      }
      return commit(next);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); return false; }
  };
  const value: SpaceCtx = { data, error, refresh,
    add: (col, body) => change(col, null, body), update: (col, id, body) => change(col, id, body), remove: (col, id) => change(col, id),
    applyChat: (before, after) => {
      try { if (!commit(mergeDeviceChanges(readDeviceSpace() ?? data, before, after))) throw new Error("SURI hizo el cambio, pero no se pudo guardar en este dispositivo."); }
      catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); throw e; }
    },
  };
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

function LocalStorageLabel() {
  return <div className="suri-device-label" title="Se guarda en este navegador. Si borrás sus datos, también se borran tus tareas y notas."><Laptop size={17} /><span>Guardado en este dispositivo</span></div>;
}
function DayWelcome({ mood }: { mood: RobotMood }) {
  return <div className="suri-day-welcome"><div><h1>Tu día,<br />más simple</h1><p>Organizá tus tareas e ideas,<br />con la ayuda de SURI.</p></div><Robot mood={mood} size="sm" /></div>;
}
function DeviceOverview({ navigate, only }: { navigate: (page: string) => void; only?: "notes" }) {
  const { data, update, error } = useSpace();
  return <>{!only && <section className="suri-device-card"><header><h2><SquareCheckBig size={21} /> Tareas de hoy</h2><button onClick={() => navigate("tasks")}>Ver todas</button></header><div className="suri-mini-tasks">{data.tasks.slice(0, 5).map(t => <label key={t.id}><input type="checkbox" checked={t.done} onChange={e => void update("tasks", t.id, { done: e.target.checked })} /><span className={t.done ? "is-done" : ""}>{t.title}</span>{t.due && <small>{t.due}</small>}</label>)}{!data.tasks.length && <div className="suri-panel-empty"><p>Un lugar para tu próximo paso.</p><button onClick={() => navigate("tasks")}><Plus size={16} /> Agregar tarea</button></div>}</div><LocalStorageLabel /></section>}
    <section className="suri-device-card"><header><h2><FileText size={21} /> Notas rápidas</h2><button onClick={() => navigate("notes")}>Ver todas</button></header><div className="suri-mini-notes">{data.notes.slice(0, 3).map(n => <button key={n.id} onClick={() => navigate("notes")}><strong>{n.title}</strong><p>{n.content || "Sin contenido adicional"}</p></button>)}{!data.notes.length && <div className="suri-panel-empty"><p>Que esa idea no se pierda.</p><button onClick={() => navigate("notes")}><Plus size={16} /> Escribir nota</button></div>}</div><LocalStorageLabel /></section>{error && <p role="alert" className="suri-error">{error}</p>}</>;
}

'''+s[b:]
s=s.replace('  data: SpaceData;\n  error:', '  data: SpaceData;\n  applyChat: (before: SpaceData, after: SpaceData) => void;\n  error:')
s=s.replace('<div className="mx-auto max-w-3xl">','<div className="suri-organizer-page mx-auto max-w-3xl">')
s=s.replace('      {children}\n    </div>','      {children}\n      <LocalStorageLabel />\n    </div>')
s=s.replace('placeholder="Nueva tarea"','aria-label="Nueva tarea" placeholder="Nueva tarea"')
s=s.replace('placeholder="Título de la nota"','aria-label="Título de la nota" placeholder="Título de la nota"')
s=s.replace('placeholder="Contenido (opcional)"','aria-label="Contenido de la nota" placeholder="Contenido (opcional)"')
p.write_text(s,encoding='utf-8')
