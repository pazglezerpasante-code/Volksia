import { useEffect, useState, type FormEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowRight, NotebookPen, Plus, SquareCheckBig } from "lucide-react";
import { useSpace } from "@/lib/space-context";
import type { TaskItem } from "@/lib/ai-api";

/* Panel de "Tareas de hoy" y "Notas" en forma de burbujas: tocás una y se
   abre su tarjeta. Reemplaza a la columna fija de la derecha. */

type Which = "tasks" | "notes";

const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const longToday = () =>
  new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

/** Ordena: vencidas y de hoy primero, después sin fecha, después futuras; las hechas al final. */
function rank(t: TaskItem, today: string) {
  if (t.done) return 4;
  if (!t.due) return 2;
  if (t.due < today) return 0;
  if (t.due === today) return 1;
  return 3;
}

function Check({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} className="sp-check" onClick={onToggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </button>
  );
}

function QuickAdd({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (text: string) => Promise<boolean> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = v.trim();
    if (!t || busy) return;
    setBusy(true);
    if (await onAdd(t)) setV("");
    setBusy(false);
  };
  return (
    <form className="suri-pop-add" onSubmit={submit}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={200} />
      <button type="submit" disabled={!v.trim() || busy} aria-label={label}><Plus size={18} /></button>
    </form>
  );
}

function TasksCard({ go }: { go: () => void }) {
  const { data, add, update } = useSpace();
  const today = todayISO();
  const sorted = [...data.tasks].sort((a, b) => rank(a, today) - rank(b, today));
  const pending = data.tasks.filter((t) => !t.done).length;
  const total = data.tasks.length;
  const pct = total ? Math.round(((total - pending) / total) * 100) : 0;
  const tag = (t: TaskItem) => {
    if (!t.due || t.done) return null;
    if (t.due < today) return <span className="sp-tag is-late">Vencida</span>;
    if (t.due === today) return <span className="sp-tag is-today">Hoy</span>;
    return <span className="sp-tag">{t.due.slice(8, 10)}/{t.due.slice(5, 7)}</span>;
  };
  return (
    <>
      <header className="suri-pop-head">
        <span className="suri-pop-icon"><SquareCheckBig size={21} /></span>
        <div><h2>Tareas de hoy</h2><p>{longToday()}</p></div>
        <span className="sp-pill">{pending} {pending === 1 ? "pendiente" : "pendientes"}</span>
      </header>
      {total > 0 && <div className="suri-pop-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progreso de tareas"><i style={{ width: `${pct}%` }} /></div>}
      <div className="suri-pop-body">
        {total === 0 && <div className="suri-pop-empty"><strong>Un lugar para tu próximo paso</strong>Escribí una tarea acá abajo y listo.</div>}
        {sorted.slice(0, 8).map((t) => (
          <div key={t.id} className={`sp-task ${t.done ? "is-done" : ""}`}>
            <Check on={t.done} label={`Marcar «${t.title}» como hecha`} onToggle={() => void update("tasks", t.id, { done: !t.done })} />
            <span className="sp-title">{t.title}</span>
            {tag(t)}
          </div>
        ))}
      </div>
      <QuickAdd placeholder="Agregar una tarea…" label="Agregar tarea" onAdd={(title) => add("tasks", { title, due: today })} />
      <div className="suri-pop-foot"><button type="button" onClick={go}>Ver todas las tareas <ArrowRight size={15} /></button></div>
    </>
  );
}

function NotesCard({ go }: { go: () => void }) {
  const { data, add } = useSpace();
  return (
    <>
      <header className="suri-pop-head">
        <span className="suri-pop-icon"><NotebookPen size={21} /></span>
        <div><h2>Notas rápidas</h2><p>Ideas para después</p></div>
        <span className="sp-pill">{data.notes.length}</span>
      </header>
      <div className="suri-pop-body">
        {data.notes.length === 0 && <div className="suri-pop-empty"><strong>Que esa idea no se pierda</strong>Anotá lo primero que se te ocurra.</div>}
        {data.notes.slice(0, 5).map((n) => (
          <button key={n.id} type="button" className="sp-note" onClick={go}>
            <strong>{n.title}</strong>
            <p>{n.content || "Sin contenido adicional"}</p>
          </button>
        ))}
      </div>
      <QuickAdd placeholder="Título de una nota nueva…" label="Guardar nota" onAdd={(title) => add("notes", { title, content: "" })} />
      <div className="suri-pop-foot"><button type="button" onClick={go}>Ver todas las notas <ArrowRight size={15} /></button></div>
    </>
  );
}

export function BubbleDock({ navigate }: { navigate: (page: string) => void }) {
  const { data, error } = useSpace();
  const mobile = useIsMobile();
  const [open, setOpen] = useState<Which | null>(null);
  const pending = data.tasks.filter((t) => !t.done).length;
  const items: { key: Which; label: string; Icon: typeof SquareCheckBig; count: number }[] = [
    { key: "tasks", label: "Tareas", Icon: SquareCheckBig, count: pending },
    { key: "notes", label: "Notas", Icon: NotebookPen, count: data.notes.length },
  ];
  return (
    <div className="suri-bubbles" role="group" aria-label="Tareas y notas">
      {items.map(({ key, label, Icon, count }) => (
        <Popover.Root key={key} open={open === key} onOpenChange={(v) => setOpen(v ? key : null)}>
          <div className="suri-bubble-wrap">
            <Popover.Trigger asChild>
              <button type="button" className={`suri-bubble is-${key}`} aria-label={`${label}: ${count}`}>
                <Icon />
                <span key={count} className={`sb-badge ${count === 0 ? "is-zero" : ""}`}>{count}</span>
              </button>
            </Popover.Trigger>
            <span className="sb-label">{label}</span>
          </div>
          <Popover.Portal>
            <Popover.Content
              className={`suri-pop is-${key}`}
              side={mobile ? "bottom" : "left"}
              align={mobile ? "end" : "start"}
              sideOffset={14}
              collisionPadding={12}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              {key === "tasks"
                ? <TasksCard go={() => { setOpen(null); navigate("tasks"); }} />
                : <NotesCard go={() => { setOpen(null); navigate("notes"); }} />}
              {error ? <p role="alert" style={{ padding: "0 18px 14px", fontSize: 13, color: "#ffb4b4" }}>{error}</p> : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ))}
    </div>
  );
}
