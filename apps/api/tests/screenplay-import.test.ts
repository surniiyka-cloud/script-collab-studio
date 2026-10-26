import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScreenplay,suggestShots } from '../src/screenplay-import.ts';

test('splits Russian location headings and preserves original dialogue',()=>{
 const script='ИНТ. ОФИС — УТРО\n\nСЕРГЕЙ\nДоброе утро!\n\nНАТ. ОЗЕРО — ДЕНЬ\nВода спокойная.\n';
 const parsed=parseScreenplay(script);
 assert.equal(parsed.scenes.length,2);
 assert.deepEqual(parsed.characters,['СЕРГЕЙ']);
 assert.equal(parsed.scenes[0].blocks.find(x=>x.kind==='dialogue')?.text,'Доброе утро!');
 assert.equal(parsed.scenes.flatMap(scene=>scene.blocks).map(block=>block.text).join('\n'),script);
});
test('unchanged nonstandard text becomes one scene',()=>{
 const original='Тихое утро\nЧеловек смотрит на воду.';
 const parsed=parseScreenplay(original);
 assert.equal(parsed.scenes.length,1);
 assert.equal(parsed.scenes[0].blocks.map(x=>x.text).join('\n'),original);
 assert.ok(parsed.warnings.length);
 assert.deepEqual(suggestShots(parsed.scenes[0].blocks).map(x=>x.description),
 ['Тихое утро','Человек смотрит на воду.']);
});
test('rejects invalid input before any database writes',()=>{
 assert.throws(()=>parseScreenplay('   '),/EMPTY_SCRIPT/);
 assert.throws(()=>parseScreenplay('а'.repeat(400001)),/SCRIPT_TOO_LARGE/);
});
