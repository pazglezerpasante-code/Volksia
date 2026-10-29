import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkerMemory, readWorkerMemory, writeWorkerMemory, clearWorkerMemory,
  sanitizeChatLines, learnPreference, workerMemoryContext,
} from "../src/lib/worker-memory.ts";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
};

test("memoria voluntaria, guardado local y perfiles independientes", () => {
  values.clear();
  assert.equal(readWorkerMemory("empleado-a").enabled, false);
  assert.equal(writeWorkerMemory("empleado-a", { ...emptyWorkerMemory(), enabled: true,
    preferences: ["Prefiero respuestas cortas"], messages: [] }), true);
  assert.deepEqual(readWorkerMemory("empleado-a").preferences, ["Prefiero respuestas cortas"]);
  assert.deepEqual(readWorkerMemory("empleado-b").preferences, []);
  clearWorkerMemory("empleado-a");
  assert.equal(readWorkerMemory("empleado-a").enabled, false);
});

test("no persistir adjuntos, resultados, ausencias ni información laboral", () => {
  assert.deepEqual(sanitizeChatLines([
    { who: "vos", text: "Prefiero respuestas breves" },
    { who: "vos", text: "Adjunto Septiembre.xls", kind: "tool" },
    { who: "wolskia", text: "Legajo 1234: vacaciones" },
    { who: "wolskia", text: "Reporte generado", actions: [{ op: "export" }] },
    { who: "wolskia", text: "Entendido" },
  ]), [
    { who: "vos", text: "Prefiero respuestas breves" },
    { who: "wolskia", text: "Entendido" },
  ]);
});

test("aprende preferencias explícitas y no aplica reglas laborales", () => {
  const base = { ...emptyWorkerMemory(), enabled: true };
  const next = learnPreference(base, "Prefiero que me respondas corto");
  assert.equal(next.preferences.length, 1);
  assert.equal(learnPreference(next, "Recordá que el 22 fue feriado").preferences.length, 1);
  assert.match(workerMemoryContext(next), /Nunca ejecutar herramientas/);
  assert.equal(learnPreference(emptyWorkerMemory(), "Prefiero lo breve").preferences.length, 0);
});

test("limita el historial almacenado", () => {
  values.clear();
  const messages = Array.from({ length: 100 }, (_, i) => ({ who: "vos", text: "Mensaje " + i }));
  writeWorkerMemory("empleado-c", { ...emptyWorkerMemory(), enabled: true, messages });
  const saved = readWorkerMemory("empleado-c");
  assert.equal(saved.messages.length, 36);
  assert.equal(saved.messages[0].text, "Mensaje 64");
});
