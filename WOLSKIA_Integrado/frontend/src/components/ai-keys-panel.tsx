import { useState } from "react";
import {
  aiApi,
  type AiStatus,
  type KeyTest,
  type ProviderChoice,
  type ProviderId,
} from "@/lib/ai-api";

type Props = {
  status: AiStatus | null;
  error: string;
  onStatus: (s: AiStatus) => void;
  provider: ProviderChoice;
  onProvider: (p: ProviderChoice) => void;
};

/** Panel "Modelos de IA": cargar claves de Gemini y Grok, probarlas y elegir proveedor. */
export function AiKeysPanel({ status, error, onStatus, provider, onProvider }: Props) {
  const [gemini, setGemini] = useState("");
  const [grok, setGrok] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tests, setTests] = useState<Partial<Record<ProviderId, KeyTest>>>({});

  const configured = status?.providers.filter((p) => p.configured) ?? [];
  const [open, setOpen] = useState(true);
  const show = open || configured.length === 0;

  async function saveAndTest() {
    const body: { gemini?: string; grok?: string } = {};
    if (gemini.trim()) body.gemini = gemini.trim();
    if (grok.trim()) body.grok = grok.trim();
    if (!body.gemini && !body.grok && configured.length === 0) {
      setMsg("Pegá al menos una clave.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      if (body.gemini || body.grok) onStatus(await aiApi.saveKeys(body));
      const { results } = await aiApi.testKeys();
      setTests(results);
      setGemini("");
      setGrok("");
      const fresh = await aiApi.status();
      onStatus(fresh);
      if (provider !== "auto" && !fresh.providers.find((p) => p.id === provider)?.configured) {
        onProvider("auto");
      }
      const anyOk = Object.values(results).some((r) => r?.ok);
      setMsg(anyOk ? "Listo. Ya podés chatear." : "Ninguna clave pasó la prueba.");
      if (anyOk) setOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      onStatus(await aiApi.clearKeys());
      setTests({});
      setMsg("Claves borradas de la memoria del servidor.");
      onProvider("auto");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  const rows = status?.providers.filter((p) => p.configured) ?? [];
  const inputCls =
    "w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-accent";

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Modelos de IA</h2>
        {configured.length > 0 ? (
          <button className="text-xs text-muted" onClick={() => setOpen(!show)}>
            {show ? "Ocultar" : "Editar"}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-warn">{error}</p> : null}

      <ul className="mt-3 grid gap-1 text-xs">
        {rows.length === 0 && !error ? (
          <li className="text-muted">Sin claves. Pegalas abajo para empezar.</li>
        ) : null}
        {rows.map((p) => {
          const t = tests[p.id];
          return (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>
                <span className={t && !t.ok ? "text-warn" : "text-ok"}>●</span> {p.label}
              </span>
              <span className="text-muted">
                {p.masked}
                {p.source === "env" ? " (.env)" : ""}
              </span>
            </li>
          );
        })}
      </ul>

      {Object.entries(tests).map(([id, t]) =>
        t && !t.ok ? (
          <p key={id} className="mt-2 text-xs text-warn">
            {t.message}
          </p>
        ) : null,
      )}

      {show ? (
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-xs text-muted">
            Clave de Gemini
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={inputCls}
              placeholder="AIza…"
              value={gemini}
              onChange={(e) => setGemini(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            Clave de Grok (xAI) o Groq
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={inputCls}
              placeholder="xai-…  o  gsk_…"
              value={grok}
              onChange={(e) => setGrok(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={saveAndTest}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-bg disabled:opacity-60"
            >
              {busy ? "Probando…" : "Guardar y probar"}
            </button>
            {configured.length > 0 ? (
              <button
                disabled={busy}
                onClick={clearAll}
                className="rounded-lg border border-line px-3 py-2 text-xs text-muted disabled:opacity-60"
              >
                Borrar
              </button>
            ) : null}
          </div>
          <p className="text-[11px] leading-5 text-muted">
            Las claves quedan solo en la memoria del servidor local: no se guardan en disco y se
            pierden al cerrar el backend.
          </p>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-accent-2">{msg}</p> : null}

      {configured.length > 0 ? (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-2 text-xs text-muted">Responder con</div>
          <div className="flex flex-wrap gap-1">
            {([{ id: "auto", label: "Auto" }, ...configured] as { id: ProviderChoice; label: string }[]).map(
              (o) => (
                <button
                  key={o.id}
                  onClick={() => onProvider(o.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${provider === o.id ? "border-accent bg-accent text-bg" : "border-line text-muted"}`}
                >
                  {o.label}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
