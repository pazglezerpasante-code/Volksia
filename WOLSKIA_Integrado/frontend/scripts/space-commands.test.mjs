import assert from 'node:assert/strict';
import { parseSpaceCommand } from '../src/lib/space-commands.ts';
import { test } from 'node:test';
const today = new Date(2026, 9, 28, 12);
test('creates Spanish task commands without AI and preserves original case', () => {
  for (const verb of ['Creá', 'Agregá', 'crea', 'Añadí']) {
    assert.deepEqual(parseSpaceCommand(`${verb} una tarea para Revisar Informe mañana`, today), { collection: 'tasks', body: { title: 'Revisar Informe', due: '2026-10-29' } });
  }
});
test('notes retain their full content and optional title', () => {
  assert.deepEqual(parseSpaceCommand('Guardá una nota: Reunión: Llevar el informe'), { collection: 'notes', body: { title: 'Reunión', content: 'Llevar el informe' } });
  assert.deepEqual(parseSpaceCommand('Anotá una nota: Idea nueva'), { collection: 'notes', body: { title: 'Idea nueva', content: 'Idea nueva' } });
});
test('does not mutate for questions, negation, conditionals or compound actions', () => {
  for (const message of ['¿Cómo creo una tarea?', 'No crees una tarea para hoy', 'Creá una tarea si aprueban el plan', 'Creá una tarea A y guardá una nota B', 'Mostrame las notas', 'Editá la tarea X', 'Creá una tarea', 'Creá una tarea mañana']) assert.equal(parseSpaceCommand(message), null, message);
});
test('relative dates roll across month and year boundaries', () => {
  assert.equal(parseSpaceCommand('Recordame Cerrar el mes mañana', new Date(2026,11,31,23))?.body.due, '2027-01-01');
  assert.equal(parseSpaceCommand('Creá una tarea: Revisar pasado mañana', today)?.body.due, '2026-10-30');
  assert.equal(parseSpaceCommand('Creá una tarea: Revisar el 2026-02-30', today), null);
});

test('the note shortcut advertised in the UI also works without AI', () => {
  assert.deepEqual(parseSpaceCommand('Anotá que Revisar el informe'), { collection: 'notes', body: { title: 'Revisar el informe', content: 'Revisar el informe' } });
});
