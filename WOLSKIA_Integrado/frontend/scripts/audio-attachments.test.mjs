import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDeviceChanges } from '../src/lib/device-space.ts';
test('text-only AI round trips preserve browser audio attachments', () => {
 const before={tasks:[],events:[],notes:[{id:'n_voice',title:'Audio',content:'',audioId:'recording-123'}]};
 const after={tasks:[],events:[],notes:[{id:'n_voice',title:'Audio renombrado',content:''}]};
 assert.equal(mergeDeviceChanges(before,before,after).notes[0].audioId,'recording-123');
 assert.equal(mergeDeviceChanges(before,before,after).notes[0].title,'Audio renombrado');
});
