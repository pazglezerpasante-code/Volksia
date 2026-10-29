import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Upload, Download } from "lucide-react";

type Result = { sheets: string[]; sheet: string; rows: number; columns: number; preview: unknown[][]; summary: string; warning: string; changed: boolean; download?: string };

export function SheetWorkspace({ initialFile }: { initialFile?: File | null }) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [result, setResult] = useState<Result | null>(null);
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    setConfirmed(false);
    if (!result?.download) { setUrl(""); return; }
    const bytes = Uint8Array.from(atob(result.download), c => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result]);
  async function process(nextFile: File, sheet = "", instruction = "") {
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError("");
    setResult(previous => instruction && previous ? { ...previous, download: undefined } : null);
    try {
      if (nextFile.size > 8 * 1024 * 1024) throw new Error("El límite es 8 MB.");
      const body = new FormData();
      body.append("file", nextFile); body.append("sheet", sheet); body.append("command", instruction);
      const response = await fetch("/api/ai/sheets", { method: "POST", body, signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "No se pudo procesar el archivo.");
      if (requestId.current === id) setResult(data);
    } catch (e) {
      if (requestId.current === id && !abort.signal.aborted) setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally { if (requestId.current === id) setBusy(false); }
  }
  useEffect(() => { if (initialFile) void process(initialFile); }, [initialFile]);
  return <section className="suri-sheet" aria-labelledby="sheet-title">
    <div className="suri-eyebrow"><FileSpreadsheet size={16} /> DATOS / EXCEL</div>
    <h1 id="sheet-title">Tus datos, con claridad.</h1>
    <p className="text-muted">Explorá una planilla, verificá los resultados y prepará una copia con tus cambios.</p>
    <label className="suri-upload"><Upload size={24} /><span>{file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Seleccionar una planilla"}<small>XLSX o CSV UTF-8 · hasta 8 MB · 1.000.000 de celdas</small></span>
      <input type="file" accept=".xlsx,.csv" disabled={busy} onChange={e => { const next = e.target.files?.[0]; if (next) { setFile(next); setCommand(""); void process(next); } }} />
    </label>
    <p className="text-xs text-muted">Se procesa en el backend de SURI sin guardar el archivo ni enviarlo a la IA. Cada operación parte del original.</p>
    {busy && <p role="status">Procesando la planilla…</p>}
    {error && <p role="alert" className="suri-error">{error}</p>}
    {result && <>
      <div className="suri-sheet-toolbar"><label>Hoja <select value={result.sheet} onChange={e => { if (file) void process(file, e.target.value); }}>{result.sheets.map(s => <option key={s}>{s}</option>)}</select></label><span>{result.rows} filas · {result.columns} columnas</span></div>
      <div className="suri-table" tabIndex={0} role="region" aria-label="Vista previa de las primeras 50 filas de datos"><table><tbody>{result.preview.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{row.map((cell, j) => i === 0 ? <th scope="col" key={j}>{String(cell ?? "")}</th> : <td key={j}>{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div>
      <form className="suri-sheet-form" onSubmit={e => { e.preventDefault(); if (file) void process(file, result.sheet, command); }}>
        <label htmlFor="sheet-command">¿Qué querés hacer?</label>
        <p className="text-xs text-muted">Usá encabezados exactos: sumar Ingresos por Persona; buscar duplicados; cambiar B2 por 125; ordenar por Fecha; filtrar Fecha entre 2026-10-01 y 2026-10-08.</p>
        <div><input id="sheet-command" value={command} onChange={e => setCommand(e.target.value)} placeholder="sumar Ingresos" required maxLength={500} /><button className="wol-btn" disabled={busy}>Revisar resultado</button></div>
      </form>
      <div role="status" className="suri-result">{result.summary}</div>
      {url && !confirmed && <button type="button" className="suri-download" onClick={() => setConfirmed(true)}>Confirmar cambios y preparar descarga</button>}
      {url && confirmed && <a className="suri-download" href={url} download="suri-version-revisada.xlsx"><Download size={16} /> Descargar copia confirmada</a>}
      <p className="text-xs text-muted">{result.warning}</p>
    </>}
  </section>;
}
