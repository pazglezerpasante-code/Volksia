export type WorkspaceNotice = {
  id: number;
  title: string;
  body: string;
  kind: "success" | "error";
};
export const NOTICE_EVENT = "volksia-notice";
let sequence = 0;
export function notifyWorkspace(
  title: string,
  body = "Guardado",
  kind: WorkspaceNotice["kind"] = "success",
) {
  window.dispatchEvent(
    new CustomEvent<WorkspaceNotice>(NOTICE_EVENT, {
      detail: { id: Date.now() + sequence++, title, body, kind },
    }),
  );
}
