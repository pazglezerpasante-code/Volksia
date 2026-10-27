import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spreadsheetIntent } from './spreadsheet-chat.ts';

test('recognizes creation with the requested names', () => {
  assert.equal(spreadsheetIntent('haceme un excel con Papa, Pepe, Pipi y Popo', false, false), 'create');
  assert.equal(spreadsheetIntent('Creá una planilla con columna Asistencia', false, true), 'create');
});
test('recognizes edits and file uploads', () => {
  assert.equal(spreadsheetIntent('modificá el archivo xlsx', false, false), 'edit');
  assert.equal(spreadsheetIntent('agregale una columna Horas', false, true), 'edit');
  assert.equal(spreadsheetIntent('poneles 8 horas a todos', false, true), 'edit');
  assert.equal(spreadsheetIntent('', true, false), 'edit');
});
test('keeps ordinary chat and tasks outside spreadsheet editing', () => {
  assert.equal(spreadsheetIntent('qué es Excel', false, false), null);
  assert.equal(spreadsheetIntent('agregá una tarea revisar informe', false, true), null);
  assert.equal(spreadsheetIntent('creá una nota', false, true), null);
  assert.equal(spreadsheetIntent('hola cómo estás', false, true), null);
});
