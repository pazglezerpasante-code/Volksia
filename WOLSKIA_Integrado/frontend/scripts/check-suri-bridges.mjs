/**
 * Comprobación de las tres herramientas del Workspace antes del build de Vercel.
 * Es estática: no sustituye las pruebas de exportación de Excel en navegador.
 */
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";

const tools = [
  ["turnero.html", "turnero", ["readExcel", "parseADTR", "downloadReminder"]],
  ["control-asistencia.html", "asistencia", ["askAbsenceReasons", "generatedWorkbook", "HOLIDAYS"]],
  ["gestor-encuestas.html", "encuestas", ["encBuild", "buildRows", "encBuildXlsx"]],
];
for (const filename of ['xlsx.full.min.js', 'jszip.min.js']) {
  const content = readFileSync(new URL('../public/vendor/' + filename, import.meta.url), 'utf8');
  new Script(content, { filename });
  if (content.length < 10000) throw Error('Dependencia local incompleta: ' + filename);
}
for (const [filename, operation, names] of tools) {
  const path = fileURLToPath(new URL("../public/suri-tools/" + filename, import.meta.url));
  const html = readFileSync(path, "utf8");
  if (!html.includes('/vendor/xlsx.full.min.js')) throw Error('Falta lector local en ' + filename);
  if (/https?:\/\/[^"'\s]+\/xlsx\.full\.min\.js/.test(html)) throw Error('El lector depende de CDN en ' + filename);
  const match = html.match(/<script id="suri-chat-bridge">([\s\S]*?)<\/script>/);
  if (!match) throw Error("Falta el puente real en " + filename);
  new Script(match[1], { filename: filename + ":suri-chat-bridge" });
  for (const symbol of names) {
    if (!html.includes(symbol)) throw Error(filename + " no contiene " + symbol);
  }
  if (!html.includes("suriToolReady") || !html.includes("suriToolResult")) {
    throw Error("Falta transferencia de resultados en " + filename);
  }
  console.log("OK:", filename, "(" + operation + ")");
}
