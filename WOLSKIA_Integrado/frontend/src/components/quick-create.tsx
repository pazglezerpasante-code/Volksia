import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useSpace } from "@/lib/space-context";
import { LabelInput as QuickTitle } from "./bencho/LabelInput";
import { CreateMenu } from "./bencho/CreateMenu";
export function QuickCreate({ navigate }: { navigate: (key: string) => void }) {
  const [kind, setKind] = useState<"tasks" | "notes" | null>(null);
  return (
    <Dialog.Root
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) setKind(null);
      }}
    >
      <div className="quick-create bencho-scope">
        <CreateMenu
          corner={18}
          onSelect={(index) => {
            if (index < 2) setKind(index === 0 ? "notes" : "tasks");
            else navigate(index === 2 ? "calendar" : "tools");
          }}
        />
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="quick-overlay" />
        <Dialog.Content className="quick-dialog">
          <header>
            <Dialog.Title>
              {kind === "notes" ? "Una idea para después" : "Tu próximo paso"}
            </Dialog.Title>
            <Dialog.Close aria-label="Cerrar creación">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Completá el título y guardá.
          </Dialog.Description>
          {kind && (
            <WorkspaceQuickForm
              kind={kind}
              onDone={() => {
                setKind(null);
                navigate(kind);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WorkspaceQuickForm({ kind, onDone }: { kind: "tasks" | "notes"; onDone: () => void }) {
  const { add } = useSpace();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="quick-form bencho-scope"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || saving) return;
        setSaving(true);
        if (
          await add(kind, {
            title: title.trim(),
            ...(kind === "notes" ? { content: content.trim() } : {}),
          })
        )
          onDone();
        setSaving(false);
      }}
    >
      <QuickTitle
        value={title}
        onValueChange={setTitle}
        field={kind === "notes" ? "Título de la nota" : "Qué necesitás hacer"}
      />
      {kind === "notes" && (
        <textarea
          aria-label="Contenido de la nota rápida"
          placeholder="Desarrollá tu idea…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}
      <button className="workspace-primary" disabled={saving || !title.trim()}>
        {saving ? "Guardando…" : kind === "notes" ? "Guardar nota" : "Crear tarea"}
      </button>
    </form>
  );
}
