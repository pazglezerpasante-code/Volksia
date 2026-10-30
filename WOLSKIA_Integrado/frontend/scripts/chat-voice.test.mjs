import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const cleanups = [];
  const statuses = [];
  let result = '';
  const instances = [];
  class Recognition {
    start() { this.started = true; }
    stop() { this.onend?.(); }
    abort() { this.aborted = true; }
    constructor() { instances.push(this); }
  }
  const source = readFileSync(new URL('../src/components/chat-voice.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const context = { exports, window: { SpeechRecognition: Recognition, speechSynthesis: { cancel() {} } }, document: { addEventListener() {}, removeEventListener() {} }, setTimeout: () => 1, clearTimeout() {}, require: (name) => {
    if (name === 'react') return { useState: value => [value, next => statuses.push(next)], useRef: value => ({ current: value }), useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    return {};
  } };
  vm.runInNewContext(js, context);
  const voice = exports.useChatVoice({ active: true, disabled: false, text: 'Por favor', onText: value => { result = value; } });
  return { voice, context, statuses, instance: () => instances.at(-1), result: () => result, cleanups };
}
test('dictation uses Spanish, preserves draft, replaces interim results without duplication', () => {
  const h = harness(); h.voice.button.props.onClick();
  assert.equal(h.instance().lang, 'es-AR');
  h.instance().onresult({ results: [{ 0: { transcript: 'creá una' }, isFinal: false }] });
  h.instance().onresult({ results: [{ 0: { transcript: 'creá una nota' }, isFinal: true }] });
  assert.equal(h.result(), 'Por favor creá una nota');
  h.voice.button.props.onClick();
  assert.match(h.statuses.at(-1), /Revisá el mensaje/);
});
test('cancel detaches callbacks so late recognition cannot overwrite a sent draft', () => {
  const h = harness(); h.voice.button.props.onClick(); const r = h.instance();
  h.voice.cancel(); assert.equal(r.aborted, true); assert.equal(r.onresult, null); assert.equal(r.onend, null);
});
test('denied permission and unavailable recognition produce actionable messages', () => {
  const h = harness(); h.voice.button.props.onClick(); h.instance().onerror({ error: 'not-allowed' });
  h.instance().stop(); assert.match(h.statuses.at(-2), /permisos/);
  delete h.context.window.SpeechRecognition;
  h.voice.button.props.onClick(); assert.match(h.statuses.at(-1), /no admite dictado/);
});
