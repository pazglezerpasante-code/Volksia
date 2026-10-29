import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Upload } from "lucide-react";
/* Bencho dropzone: an opaque box inhales before the drop. Actual files use the chat's ingestion path. */
export function FileDropTarget({
  children,
  onFiles,
  disabled,
}: {
  children: ReactNode;
  onFiles: (files: File[]) => Promise<void>;
  disabled: boolean;
}) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  return (
    <div
      className="file-drop-target"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (!disabled) void onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {children}
      <AnimatePresence>
        {over && (
          <motion.div
            className="file-drop-overlay bencho-scope"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="upl-zone"
              initial={{ scale: 0.94 }}
              animate={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
            >
              <Upload size={30} />
              <strong>{disabled ? "Esperá a que Suri termine" : "Soltá tus archivos acá"}</strong>
              <span>Hasta 5 archivos · 8 MB por archivo</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
