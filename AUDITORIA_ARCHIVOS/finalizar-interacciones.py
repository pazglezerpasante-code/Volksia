from pathlib import Path
p=Path('WOLSKIA_Integrado/frontend/src/routes/index.tsx');s=p.read_text(encoding='utf-8')
a=s.index('function TasksPage()');b=s.index('function NotesPage()',a);block=s[a:b]
block=block.replace('  const [creating, setCreating]', '  const [editing, setEditing] = useState<string | null>(null);\n  const [creating, setCreating]',1)
block=block.replace('onClick={() => setCreating(v => !v)}','onClick={() => { setCreating(v => !v); setEditing(null); setText(""); setDue(""); }}')
block=block.replace('if (await add("tasks", { title: text.trim(), due: due || null })) {','if (await (editing ? update("tasks", editing, { title: text.trim(), due: due || null }) : add("tasks", { title: text.trim(), due: due || null }))) {\n            setEditing(null);')
block=block.replace('type="submit">Agregar</button>', 'type="submit">{editing ? "Guardar cambios" : "Agregar"}</button>')
block=block.replace('<button className="shrink-0 text-muted hover:text-fg" onClick={() => void remove("tasks", t.id)}>Quitar</button>', '<button aria-label={`Editar tarea ${t.title}`} className="shrink-0 text-accent-2" onClick={() => { setEditing(t.id); setText(t.title); setDue(t.due || ""); setCreating(true); }}><Pencil size={16} /></button><button className="shrink-0 text-muted hover:text-fg" onClick={() => void remove("tasks", t.id)}>Quitar</button>')
s=s[:a]+block+s[b:]
# Prevent an old mood timer from changing SURI while a new response is running.
s=s.replace('  const generation = useRef<AbortController | null>(null);','  const moodTimers = useRef<number[]>([]);\n  useEffect(() => () => moodTimers.current.forEach(clearTimeout), []);\n  const generation = useRef<AbortController | null>(null);')
s=s.replace('    const attachedExcel = attachments.find', '    moodTimers.current.forEach(clearTimeout);\n    moodTimers.current = [];\n    const attachedExcel = attachments.find',1)
s=s.replace('if (!failed) window.setTimeout(() => setMood("ok"), 700);\n      window.setTimeout(() => setMood("idle"), failed ? 3000 : 1800);', 'if (!failed) moodTimers.current.push(window.setTimeout(() => setMood("ok"), 700));\n      moodTimers.current.push(window.setTimeout(() => setMood("idle"), failed ? 3000 : 3500));')
p.write_text(s,encoding='utf-8')
