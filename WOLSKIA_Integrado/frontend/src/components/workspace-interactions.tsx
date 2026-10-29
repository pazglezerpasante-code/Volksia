import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, X, SquareCheckBig, NotebookPen } from "lucide-react";
import { motion, MotionConfig } from "framer-motion";
import { toast } from "sonner";
import { RollingCounter } from "./bencho/RollingCounter";
import { SlideToConfirm } from "./bencho/SlideToConfirm";
import { ToastStack } from "./bencho/ToastStack";
import { useSpace } from "@/lib/space-context";
import { NOTICE_EVENT, type WorkspaceNotice } from "@/lib/workspace-notices";
import type { NoteItem } from "@/lib/ai-api";

export function WorkspaceNotices() {
  const [items, setItems] = useState<WorkspaceNotice[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const receive = (event: Event) => {
      const item = (event as CustomEvent<WorkspaceNotice>).detail;
      setItems((prev) => [item, ...prev].slice(0, 3));
      const timer = setTimeout(() => {
        setItems((prev) => prev.filter((n) => n.id !== item.id));
        timers.delete(timer);
      }, 7000);
      timers.add(timer);
    };
    window.addEventListener(NOTICE_EVENT, receive);
    return () => {
      window.removeEventListener(NOTICE_EVENT, receive);
      timers.forEach(clearTimeout);
    };
  }, []);
  return items.length ? (
    <div className="workspace-notices bencho-scope">
      <MotionConfig reducedMotion="user">
        <ToastStack
          items={items}
          onDismiss={(id) => setItems((prev) => prev.filter((n) => n.id !== id))}
        />
      </MotionConfig>
    </div>
  ) : null;
}
export function TaskCount({ value }: { value: number }) {
  return (
    <div className="task-count">
      <RollingCounter count={value} start={value} readOnly />
      <span>Tareas pendientes</span>
    </div>
  );
}
export function TaskFilters({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  const labels = ["Todas", "Pendientes", "Hechas"];
  return (
    <div className="task-filter">
      <div className="task-filter-copy">
        <div role="group" aria-label="Filtrar tareas">
          {labels.map((label, index) => (
            <button key={label} aria-pressed={index === selected} onClick={() => onSelect(index)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
export function RemoveItem({
  title,
  onConfirm,
}: {
  title: string;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!busy.current) setOpen(v);
      }}
    >
      <Dialog.Trigger className="remove-item">Quitar</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="quick-overlay" />
        <Dialog.Content className="quick-dialog bencho-scope">
          <header>
            <Dialog.Title>Quitar este elemento</Dialog.Title>
            <Dialog.Close aria-label="Cerrar confirmación">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description>Se quitará «{title}».</Dialog.Description>
          <div className="confirm-slide">
            <SlideToConfirm
              key={attempt}
              width={260}
              onConfirm={() => {
                if (busy.current) return;
                busy.current = true;
                void onConfirm()
                  .then((saved) => {
                    if (saved) setOpen(false);
                    else {
                      toast.error("No se pudo quitar el elemento");
                      setAttempt((n) => n + 1);
                    }
                  })
                  .finally(() => {
                    busy.current = false;
                  });
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
/* Asset swap's two slabs and anchored expanding picker, adapted to the objects this workspace owns.
   The note stays where it is; the lower slab is a new task. No monetary data or fake rates. */
export function NoteTransfer({ note }: { note: NoteItem }) {
  const { add } = useSpace();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note.title);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setTitle(note.title);
          setExpanded(false);
        }
      }}
    >
      <Dialog.Trigger
        className="note-transfer-trigger"
        aria-label={`Crear tarea desde ${note.title}`}
      >
        <SquareCheckBig size={16} />
        <span>Crear tarea</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="quick-overlay" />
        <Dialog.Content className="quick-dialog bencho-scope">
          <header>
            <Dialog.Title>De idea a próximo paso</Dialog.Title>
            <Dialog.Close aria-label="Cerrar creación de tarea">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description>
            Convertí esta idea en una tarea. La nota se conserva.
          </Dialog.Description>
          <div
            className="note-swap swp"
            style={{ height: 235, "--swp-r": "18px" } as React.CSSProperties}
          >
            <div className="swp-card" style={{ top: 0 }}>
              <div className="swp-face">
                <span className="swp-label">
                  Tu nota <NotebookPen size={14} />
                </span>
                <strong>{note.title}</strong>
              </div>
            </div>
            <motion.div
              className="swp-card"
              style={{ bottom: 0 }}
              animate={{ height: expanded ? 235 : 116 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <div className="swp-face">
                <span className="swp-label">Nueva tarea</span>
                {expanded ? (
                  <input
                    autoFocus
                    aria-label="Título de la tarea desde nota"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                ) : (
                  <button onClick={() => setExpanded(true)}>{title}</button>
                )}
              </div>
              {expanded && (
                <p className="swap-detail">Un próximo paso que podés completar en Tareas.</p>
              )}
            </motion.div>
            <button
              className="swap-direction"
              aria-label="Editar la nueva tarea"
              onClick={() => setExpanded((v) => !v)}
            >
              <motion.span animate={{ rotate: expanded ? 180 : 0 }}>
                <ArrowDown size={18} />
              </motion.span>
            </button>
          </div>
          <button
            className="workspace-primary"
            disabled={saving || !title.trim()}
            onClick={async () => {
              setSaving(true);
              if (await add("tasks", { title: title.trim(), detail: note.content })) setOpen(false);
              setSaving(false);
            }}
          >
            {saving ? "Creando…" : "Crear tarea"}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
