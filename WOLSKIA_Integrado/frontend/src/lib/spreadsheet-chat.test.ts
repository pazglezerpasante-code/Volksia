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

test('consulta archivos sin entrar al editor', () => {
  assert.equal(spreadsheetIntent('listame los turnos', true, false), 'ask');
  assert.equal(spreadsheetIntent('detallalos en chat', false, true), 'ask');
  assert.equal(spreadsheetIntent('qué tiene este archivo', true, false), 'ask');
  assert.equal(spreadsheetIntent('necesito que leas este Excel', true, false), 'ask');
  assert.equal(spreadsheetIntent('mostrame los datos y cambiá las horas', false, true), 'edit');
});

test('consulta usa el endpoint de lectura y acepta respuestas sin descarga', async () => {
  const { runSpreadsheetAsk } = await import('./spreadsheet-chat.ts');
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/ai/sheets/ask');
    assert.equal(options?.method, 'POST');
    assert.equal((options?.body as FormData).get('message'), 'listame los turnos');
    return new Response(JSON.stringify({ status: 'answer', summary: 'Total: 14' }), { status: 200 });
  };
  try {
    const result = await runSpreadsheetAsk('listame los turnos', null, [], new AbortController().signal);
    assert.equal(result.status, 'answer');
    assert.equal(result.download, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
