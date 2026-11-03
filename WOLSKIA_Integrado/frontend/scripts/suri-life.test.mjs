import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/suri-life.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { newLife, advance, reactTo, EMOTIONS, EMOTION_STYLE, readLife, weatherLine, dominant } =
  await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
test("45 bounded emotions decay without mutating previous state", () => {
  const s = newLife();
  s.feelings.alegría = 100;
  const n = advance(s, s.updated + 3600000);
  assert.equal(EMOTIONS.length, 45);
  assert.equal(s.feelings.alegría, 100);
  assert.ok(n.feelings.alegría < 100);
  for (const v of Object.values(n.feelings)) assert.ok(v >= 0 && v <= 100);
});

test("v1 migration keeps diary, dreams, scores and previous feelings", () => {
  const s = newLife();
  for (const e of EMOTIONS.slice(25)) {
    delete s.feelings[e];
    delete s.base[e];
  }
  s.diary = ["recuerdo existente"];
  s.dreams = ["sueño existente"];
  s.score.wins = 7;
  s.feelings.cariño = 80;
  globalThis.localStorage = { getItem: () => JSON.stringify(s) };
  const n = readLife("suri-life-v1");
  assert.deepEqual(n.diary, s.diary);
  assert.deepEqual(n.dreams, s.dreams);
  assert.equal(n.score.wins, 7);
  assert.ok(n.feelings.cariño > 79);
  assert.equal(n.feelings.alivio, 0);
  delete globalThis.localStorage;
});

test("tone changes can become dominant and retain a secondary emotion", () => {
  for (const [text, expected] of [
    ["por fin, menos mal", "alivio"],
    ["no entiendo", "desconcierto"],
    ["no funciona", "frustración"],
    ["podemos juntos", "optimismo"],
  ]) {
    const n = reactTo(newLife(), text);
    assert.equal(dominant(n)[0][0], expected);
    assert.ok(dominant(n)[1][1] > 0);
  }
  for (const e of EMOTIONS) {
    assert.ok(EMOTION_STYLE[e].expression);
    assert.ok(Number.isFinite(EMOTION_STYLE[e].eyeY));
  }
});

test("personal thoughts retain Luis, Tomás and Dylan when life engine is active", () => {
  const face = readFileSync(new URL("../src/components/suri-face.tsx", import.meta.url), "utf8");
  for (const line of [
    "¿Qué estará haciendo Luis?",
    "¿Sos Tomás o alguien del equipo de Organización Sur?",
    "¿Sos Dylan o alguien del equipo de Organización Sur?",
    "Dylan y Tomás seguro están inventando algo…",
  ])
    assert.ok(face.includes(line));
  assert.ok(!face.includes("!managedLife.current && now >= l.nextThought"));
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

test("sleep starts after one minute and typing wakes immediately", () => {
  const now = Date.parse("2026-11-02T15:00:00Z");
  const s = newLife(now);
  assert.equal(advance(s, now + 59000).asleep, false);
  const sleeping = advance(s, now + 60000);
  assert.equal(sleeping.asleep, true);
  assert.equal(reactTo(sleeping, "Necesito ayuda", now + 61000).asleep, false);
});
