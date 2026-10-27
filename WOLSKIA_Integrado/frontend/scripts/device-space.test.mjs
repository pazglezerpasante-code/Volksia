import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDeviceChanges, readDeviceSpace, writeDeviceSpace, emptyDeviceSpace } from '../src/lib/device-space.ts';

test('chat merges its changes without deleting a note created meanwhile', () => {
  const before = { ...emptyDeviceSpace(), notes: [{ id: 'n_1', title: 'Original', content: '' }] };
  const current = { ...before, notes: [...before.notes, { id: 'n_2', title: 'Otra pestaña', content: 'Preservar' }] };
  const after = { ...before, notes: [{ id: 'n_1', title: 'Editada por SURI', content: 'Nuevo texto' }] };
  const result = mergeDeviceChanges(current, before, after);
  assert.deepEqual(result.notes.map(n => n.title), ['Editada por SURI', 'Otra pestaña']);
});
test('only explicit deletions are removed', () => {
  const before = { ...emptyDeviceSpace(), notes: [{ id: 'n_1', title: 'Eliminar', content: '' }] };
  const current = { ...before, notes: [...before.notes, { id: 'n_2', title: 'Conservar', content: '' }] };
  assert.deepEqual(mergeDeviceChanges(current, before, emptyDeviceSpace()).notes.map(n => n.id), ['n_2']);
});
test('storage failures surface instead of silently losing notes', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) };
  assert.equal(readDeviceSpace(), null);
  writeDeviceSpace(emptyDeviceSpace());
  assert.deepEqual(readDeviceSpace(), emptyDeviceSpace());
  localStorage.setItem('suri-device-space-v1', '{broken');
  assert.throws(() => readDeviceSpace());
  globalThis.localStorage = { setItem() { throw new Error('quota'); } };
  assert.throws(() => writeDeviceSpace(emptyDeviceSpace()), /quota/);
});
