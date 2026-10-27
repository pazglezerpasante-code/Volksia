from pathlib import Path
p=Path('WOLSKIA_Integrado/frontend/src/routes/index.tsx');s=p.read_text(encoding='utf-8')
a=s.index('function TasksPage()');b=s.index('function NotesPage()',a);block=s[a:b]
block=block.replace('  const [text, setText]', '  const [creating, setCreating] = useState(false);\n  const [text, setText]',1)
block=block.replace('      <form','      <button className="suri-add-toggle" aria-expanded={creating} onClick={() => setCreating(v => !v)}><Plus size={17} /> {creating ? "Cerrar" : "Nueva tarea"}</button>\n      {creating && <form',1)
block=block.replace('            setDue("");','            setDue("");\n            setCreating(false);',1).replace('      </form>','      </form>}',1)
s=s[:a]+block+s[b:]
p.write_text(s,encoding='utf-8')
