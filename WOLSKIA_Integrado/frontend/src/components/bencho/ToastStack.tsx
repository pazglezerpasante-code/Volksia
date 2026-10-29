import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX, X } from "lucide-react";
import type { WorkspaceNotice } from "@/lib/workspace-notices";
/* ══ Toast stack ══════════════════════════════════════════
   Three toasts, always: the newest in front, the two before it
   tucked behind with a sliver of each showing above it, a step
   smaller each and a barely-there grey (the reference's tones). Point at the stack and it
   fans out into a list; move away and it gathers back up.

   ── ONE SPRING, THREE PLACES ────────────────────────────
   A toast's place is worked out from how far back it is and
   whether the stack is open, and Framer springs it there. Opening,
   closing, a toast leaving and the next arriving are all the same
   move — every toast heading for its new place on the same spring,
   a touch under critical so it settles with a hint of give.

   ── HOVER IS THE WHOLE FRAME ────────────────────────────
   The stack opens about its middle, so the front toast moves when
   it opens. Hovering the toasts themselves would let the list slide
   out from under the pointer and close again; the frame is the
   list's own size, so hovering it is hovering the list. Pointer
   over/out with a containment test rather than enter/leave, so the
   wall's demonstration — which dispatches its own pointer events,
   and leaves with no relatedTarget — opens and closes it too (the
   tilt card's note has the long version).

   ── IT NEVER RUNS OUT ───────────────────────────────────
   Dismiss one and it slides away; a new one rises in at the front
   from the pool, so there are always three. Reintentar on the failed
   payment turns that toast into the payment going through, in
   place. */

/* Volksia: only real saved operations enter this stack. Dismiss never fabricates a replacement. */
export function ToastStack({
  items,
  onDismiss,
}: {
  items: WorkspaceNotice[];
  onDismiss: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = items.slice(0, 3);
  const height = open ? shown.length * 74 : 64 + Math.max(0, shown.length - 1) * 14;
  return (
    <div
      className="tst live-toast-stack"
      data-open={open || undefined}
      role="region"
      aria-label="Avisos de tu espacio"
      style={{ height, width: 300, "--tst-r": "16px" } as React.CSSProperties}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <AnimatePresence>
        {shown.map((item, index) => (
          <motion.div
            key={item.id}
            className="tst-toast"
            data-kind={item.kind}
            data-front={index === 0 || undefined}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{
              opacity: 1,
              y: open ? index * 74 : index * 14,
              scale: open ? 1 : 1 - index * 0.04,
            }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            style={{ height: 64, zIndex: 3 - index }}
            aria-hidden={!open && index > 0}
          >
            <span className="tst-icon">
              {item.kind === "error" ? <CircleX size={18} /> : <CircleCheck size={18} />}
            </span>
            <span className="tst-text">
              <b>{item.title}</b>
              <span>{item.body}</span>
            </span>
            <button
              className="tst-x"
              type="button"
              aria-label={`Cerrar aviso ${item.title}`}
              tabIndex={open || index === 0 ? 0 : -1}
              onClick={() => onDismiss(item.id)}
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {shown[0]?.title}
      </span>
    </div>
  );
}
