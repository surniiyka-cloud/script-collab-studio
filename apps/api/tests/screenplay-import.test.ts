import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineDialogue,parseScreenplay,suggestShots } from '../src/screenplay-import.ts';

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

test('chapter-form screenplay: prologue, 12 numbered worlds and epilogue',()=>{
 const worlds=[
  'НАЗАД В БУДУЩЕЕ','ИВАН ВАСИЛЬЕВИЧ МЕНЯЕТ ПРОФЕССИЮ','МАТРИЦА',
  'ТЕРМИНАТОР','ТРИ БОГАТЫРЯ','БРЕМЕНСКИЕ МУЗЫКАНТЫ','ВИННИ-ПУХ',
  'КРОКОДИЛ ГЕНА И ЧЕБУРАШКА','НУ, ПОГОДИ!','ПРОСТОКВАШИНО',
  'БРАТ 2','ОСОБЕННОСТИ НАЦИОНАЛЬНОЙ РЫБАЛКИ',
 ];
 const lines=[
  'МИССИЯ 52','ПО ТУ СТОРОНУ ЭКРАНА','',
  'ПРОЛОГ. РЫБАЛКА','00:00–00:50 · Тихий берег. Раннее утро',
  'Рассвет. Герой ловит рыбу.',
  'ВАДИМ ГЕОРГИЕВИЧ: Доброе утро.',
  'СА: Я на рыбалке.',
  'ПЕРЕХОД: ВСПЫШКА → другая история.',
 ];
 for(let i=0;i<worlds.length;i++){
  lines.push(String(i+1).padStart(2,'0')+'. '+worlds[i]);
  lines.push('00:50–01:32 · Городская площадь');
  lines.push(i===5?'Добрыня: Поедем дальше.':'ДОК: Держитесь!');
 }
 lines.push('ЭПИЛОГ. БАЙКАЛ','09:44–11:03 · Рассвет. Берег Байкала',
   'СА (улыбается): Красота...', 'ГОЛОС ЗА КАДРОМ: С днём рождения!');
 const text=lines.join('\n');
 const parsed=parseScreenplay(text);
 assert.equal(parsed.scenes.length,14,'12 numbered chapters + prologue + epilogue');
 assert.equal(parsed.scenes[0].title,'ПРОЛОГ. РЫБАЛКА');
 assert.equal(parsed.scenes[6].title,'06. БРЕМЕНСКИЕ МУЗЫКАНТЫ');
 assert.equal(parsed.scenes[13].title,'ЭПИЛОГ. БАЙКАЛ');
 assert.equal(parsed.scenes[0].timecode,'00:00–00:50');
 assert.equal(parsed.scenes[0].locationHint,'Тихий берег');
 assert.equal(parsed.scenes[0].timeOfDay,'Раннее утро');
 assert.equal(parsed.scenes[13].timecode,'09:44–11:03');
 assert.equal(parsed.scenes[13].locationHint,'Рассвет. Берег Байкала');
 assert.ok(parsed.characters.includes('СА'));
 assert.ok(parsed.characters.includes('ВАДИМ ГЕОРГИЕВИЧ'));
 assert.ok(parsed.characters.includes('ДОБРЫНЯ'));
 assert.ok(!parsed.characters.includes('ГОЛОС ЗА КАДРОМ'));
 const firstDialogue=parsed.scenes[0].blocks.find(b=>b.speaker==='ВАДИМ ГЕОРГИЕВИЧ');
 assert.equal(firstDialogue?.dialogueText,'Доброе утро.');
 assert.equal(firstDialogue?.text,'ВАДИМ ГЕОРГИЕВИЧ: Доброе утро.');
 assert.equal(parsed.scenes[13].blocks.find(b=>b.speaker==='СА')?.delivery,'улыбается');
 assert.equal([...parsed.frontMatter,...parsed.scenes.flatMap(scene=>scene.blocks)]
   .map(block=>block.text).join('\n'),text,'Original source survives the split byte-for-byte');
});
test('inline cues cannot turn narrative colon lines into false speakers',()=>{
 assert.equal(inlineDialogue('Он раскрывает ладони: красная и синяя таблетки.'),null);
 assert.equal(inlineDialogue('Знаменитое замедление: герой уворачивается.'),null);
 assert.equal(inlineDialogue('ПЕРЕХОД: ВСПЫШКА → озеро.'),null);
 assert.equal(inlineDialogue('На экране: поздравление.'),null);
 assert.deepEqual(inlineDialogue('ВТОРОЙ РАЗБОЙНИК (шёпотом): Может, попросим выкуп?'),{
  speaker:'ВТОРОЙ РАЗБОЙНИК',delivery:'шёпотом',dialogueText:'Может, попросим выкуп?',
 });
 assert.deepEqual(inlineDialogue('Добрыня: Давай поедем.'),{
  speaker:'ДОБРЫНЯ',dialogueText:'Давай поедем.',
 });
});


test('a scene containing only a heading and one spoken line gets two grounded storyboard shots',()=>{
 const source='ИНТ. ОФИС — УТРО\n\nСЕРГЕЙ\nДоброе утро!\n\nНАТ. ОЗЕРО — ДЕНЬ\nВода спокойная.';
 const parsed=parseScreenplay(source);
 const shots=suggestShots(parsed.scenes[0].blocks);
 assert.equal(shots.length,2);
 assert.deepEqual(shots.map(shot=>shot.shotType),['WIDE','CLOSE_UP']);
 assert.deepEqual(shots.map(shot=>shot.description),['ИНТ. ОФИС — УТРО','Доброе утро!']);
 assert.ok(shots.every(shot=>shot.sourceLine!==null));
});
test('film chapter timecode is metadata rather than a redundant storyboard frame',()=>{
 const parsed=parseScreenplay([
  'ПРОЛОГ. РЫБАЛКА',
  '00:00–00:50 · Тихий берег. Раннее утро',
  'Туман держится над водой.',
  'ВАДИМ ГЕОРГИЕВИЧ: СА, доброе утро.',
  'СА: ВГ, я на рыбалке.',
 ].join('\n'));
 const shots=suggestShots(parsed.scenes[0].blocks);
 assert.equal(shots.length,4);
 assert.deepEqual(shots.map(shot=>shot.shotType),['WIDE','MEDIUM','CLOSE_UP','CLOSE_UP']);
 assert.equal(shots[0].description,'ПРОЛОГ. РЫБАЛКА');
 assert.ok(!shots.some(shot=>shot.description.startsWith('00:00–00:50')));
 assert.equal(shots[2].description,'ВАДИМ ГЕОРГИЕВИЧ: СА, доброе утро.');
 assert.equal(shots[3].description,'СА: ВГ, я на рыбалке.');
});
