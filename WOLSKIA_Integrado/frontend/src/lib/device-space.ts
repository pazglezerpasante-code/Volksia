import type { SpaceData } from './ai-api';

export const DEVICE_SPACE_KEY = 'suri-device-space-v1';
export const emptyDeviceSpace = (): SpaceData => ({ tasks: [], notes: [], events: [] });

export function readDeviceSpace(): SpaceData | null {
  const raw = localStorage.getItem(DEVICE_SPACE_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || !['tasks', 'notes', 'events'].every(key => Array.isArray(value[key]) && value[key].every((item: { id?: unknown; title?: unknown }) => item && typeof item.id === 'string' && typeof item.title === 'string'))) {
    throw new Error('No se pudieron leer tus datos locales. No se sobrescribió el contenido guardado.');
  }
  return value as SpaceData;
}

export function writeDeviceSpace(data: SpaceData) {
  localStorage.setItem(DEVICE_SPACE_KEY, JSON.stringify(data));
}

/** Merge only changes made by this chat, preserving unrelated edits from another tab. */
export function mergeDeviceChanges(current: SpaceData, before: SpaceData, after: SpaceData): SpaceData {
  const next = emptyDeviceSpace();
  for (const col of ['tasks', 'notes', 'events'] as const) {
    const old = new Map(before[col].map(item => [item.id, item]));
    const result = new Map(after[col].map(item => [item.id, item]));
    const removed = new Set([...old.keys()].filter(id => !result.has(id)));
    const changed = after[col].filter(item => JSON.stringify(old.get(item.id)) !== JSON.stringify(item));
    const ids = new Set(changed.map(item => item.id));
    // Collections retain their own item types at the boundary.
    Object.assign(next, { [col]: [...changed, ...current[col].filter(item => !removed.has(item.id) && !ids.has(item.id))] });
  }
  return next;
}
