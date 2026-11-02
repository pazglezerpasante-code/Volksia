import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/suri-life.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { newLife, advance, reactTo, EMOTIONS, readLife, weatherLine } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
test("25 bounded emotions decay without mutating previous state", () => {
  const s = newLife();
  s.feelings.alegría = 100;
  const n = advance(s, s.updated + 3600000);
  assert.equal(EMOTIONS.length, 25);
  assert.equal(s.feelings.alegría, 100);
  assert.ok(n.feelings.alegría < 100);
  for (const v of Object.values(n.feelings)) assert.ok(v >= 0 && v <= 100);
});
test("offline sleep restores energy, no absence penalty", () => {
  const s = newLife();
  s.energy = 10;
  const n = advance(s, s.updated + 8 * 3600000);
  assert.ok(n.energy > 90);
  assert.equal(n.affection, s.affection);
  assert.equal(n.asleep, true);
});
test("new request always wakes character, empathy and honesty", () => {
  const s = newLife();
  s.asleep = true;
  assert.equal(reactTo(s, "Estoy triste").asleep, false);
  assert.match(reactTo(s, "Estoy triste").lastLine, /Te leo/);
  assert.match(reactTo(s, "sentís de verdad").lastLine, /simulación/);
  assert.ok(reactTo(s, "Gracias").affection > s.affection);
});
test("corrupted local storage recovers safely", () => {
  globalThis.localStorage = { getItem: () => "{bad" };
  assert.equal(readLife("x").version, 1);
  globalThis.localStorage = { getItem: () => JSON.stringify({ ...newLife(), feelings: null }) };
  assert.equal(readLife("x").feelings.calma, 50);
  delete globalThis.localStorage;
});
test("weather thresholds and storm priority", () => {
  const w = { temperature_2m: 38, weather_code: 0, relative_humidity_2m: 50, precipitation: 0 };
  assert.match(weatherLine(w), /horno/);
  assert.match(weatherLine({ ...w, weather_code: 95 }), /Truenos/);
  assert.match(weatherLine({ ...w, temperature_2m: 5 }), /bufanda/);
});

test('sleep starts after one minute and typing wakes immediately',()=>{
  const now=Date.parse('2026-11-02T15:00:00Z');
  const s=newLife(now);
  assert.equal(advance(s,now+59000).asleep,false);
  const sleeping=advance(s,now+60000);
  assert.equal(sleeping.asleep,true);
  assert.equal(reactTo(sleeping,'Necesito ayuda',now+61000).asleep,false);
});
