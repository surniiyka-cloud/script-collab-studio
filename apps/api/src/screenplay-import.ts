import { createHash } from 'node:crypto';

export type Kind = 'heading'|'action'|'character'|'dialogue'|'parenthetical'|'transition';
export type Block = {
 kind:Kind;text:string;sourceLine:number;
 speaker?:string;dialogueText?:string;delivery?:string;
};
export type ParsedScene = {
 title:string;sourceLineStart:number;blocks:Block[];
 timecode:string|null;locationHint:string|null;timeOfDay:string|null;
};
export type Preview = {
 digest:string;scenes:ParsedScene[];characters:string[];
 warnings:string[];length:number;frontMatter:Block[];
};
const standardHeading=/^(?:(?:INT\/EXT|EXT\/INT|ИНТ\/НАТ|НАТ\/ИНТ|INT|EXT|ИНТ|НАТ|НАТУРА|ИНТЕРЬЕР)\.?\s+|(?:СЦЕНА|SCENE)\s*\d+(?=\s|[:.―—-]))/iu;
// Written scripts often use numbered chapters rather than INT./EXT. headings.
// "06. БРЕМЕНСКИЕ МУЗЫКАНТЫ" must work even when DOCX style is Normal.
const numberedHeading=/^\d{1,3}\.\s+[А-ЯЁA-Z][А-ЯЁA-Z0-9\s,!?—–\-«»().]{2,180}$/u;
const chapterHeading=/^(?:ПРОЛОГ|ЭПИЛОГ|ФИНАЛ|ПРОЛОГUE|EPILOGUE|PROLOGUE)(?:\s*[.:\-—–]\s*|\s+)\S/iu;
const timeHeading=/^(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})\s*[·•]\s*(.+)$/u;
const separatedSpeaker=/^[\p{Lu}\p{N} ._()\-Ё]{2,55}$/u;
const excludeSpeakers=/^(?:ПЕРЕХОД|НА ЭКРАНЕ|ПРИНЦИП ПЕРЕХОДОВ|КОНЕЦ|ПРОЛОГ|ЭПИЛОГ|КАМЕРА)$/iu;
const narrationCues=/^(?:ГОЛОС ЗА КАДРОМ|ЗАКАДРОВЫЙ ГОЛОС|NARRATOR|VOICEOVER)$/iu;

function isHeading(value:string):boolean {
 return standardHeading.test(value)||numberedHeading.test(value)||chapterHeading.test(value);
}
function normalize(input:string):string {
 return input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
}
/** True for actual speaker labels; rejects narration like "Он раскрывает ладони: ..." */
export function inlineDialogue(value:string):{speaker:string;dialogueText:string;delivery?:string}|null {
 const match=value.trim().match(/^([\p{L}\p{N}][\p{L}\p{N}\s._\-]{0,49}?)(?:\s*\(([^()\n]{1,35})\))?\s*:\s*(\S.*)$/u);
 if(!match)return null;
 const name=match[1].trim().replace(/\s+/g,' ');
 if(excludeSpeakers.test(name)||name.length>40)return null;
 const words=name.split(' ');
 const isUpper=name===name.toLocaleUpperCase('ru-RU')&&/[\p{Lu}]/u.test(name);
 // One single title-case speaker (e.g. "Добрыня:") is allowed.
 const isProperName=words.length===1&&/^[\p{Lu}][\p{Ll}]+(?:-[\p{Lu}][\p{Ll}]+)*$/u.test(name);
 if(!isUpper&&!isProperName)return null;
 if(isUpper&&words.length>5)return null;
 return {
  speaker:name.toLocaleUpperCase('ru-RU'),
  dialogueText:match[3].trim(),
  ...(match[2]?{delivery:match[2].trim()}:{}),
 };
}
function parseTime(value:string){
 const match=value.match(timeHeading);
 if(!match)return null;
 const raw=match[3].trim();
 const day=raw.match(/(?:^|[.]\s+)(Раннее утро|Утро|День|Вечер|Ночь|Рассвет|Закат)\.?$/iu);
 const place=day?raw.slice(0,raw.length-day[0].length).trim():raw;
 return {timecode:match[1]+'–'+match[2],locationHint:(place||raw).slice(0,200),
  timeOfDay:day?.[1]??null};
}
function sceneBlock(kind:Kind,text:string,sourceLine:number,extras?:Partial<Block>):Block {
 return {kind,text,sourceLine,...extras};
}
export function parseScreenplay(input:string):Preview {
 const source=normalize(input);
 if(!source.trim())throw Error('EMPTY_SCRIPT');
 if(source.length>400_000)throw Error('SCRIPT_TOO_LARGE');
 const lines=source.split('\n');
 if(lines.length>20_000)throw Error('TOO_MANY_LINES');
 const chapters=lines.map(line=>isHeading(line.trim()));
 const hasChapters=chapters.some(Boolean);
 const scenes:ParsedScene[]=[];const names=new Set<string>();const warnings:string[]=[];
 const frontMatter:Block[]=[];
 let current:ParsedScene|null=null;let inDialogue=false;
 function makeScene(title:string,start:number) {
  current={title:title.slice(0,200),sourceLineStart:start,blocks:[],timecode:null,locationHint:null,timeOfDay:null};
  scenes.push(current);
  inDialogue=false;
 }
 for(let i=0;i<lines.length;i++){
  const text=lines[i],trimmed=text.trim();
  const starts=chapters[i]&&!!trimmed;
  if(starts)makeScene(trimmed,i+1);
  if(!current&&!starts){
   if(hasChapters){frontMatter.push(sceneBlock('action',text,i+1));continue;}
   makeScene('Сцена 1 — вступление',1);
  }
  const scene=current!;
  const next=lines[i+1]?.trim(),previous=lines[i-1]?.trim();
  const time=parseTime(trimmed);
  let kind:Kind='action',details:Partial<Block>={};
  if(starts)kind='heading';
  else if(time){
   kind='heading';
   if(!scene.timecode){
    scene.timecode=time.timecode;scene.locationHint=time.locationHint;
    scene.timeOfDay=time.timeOfDay;
   }
  }else if(trimmed&&/^(?:ПЕРЕХОД\s*:|CUT TO:|FADE OUT|ЗАТЕМНЕНИЕ)/iu.test(trimmed))kind='transition';
  else{
   const inline=inlineDialogue(trimmed);
   if(inline){
    kind='dialogue';details=inline;
    if(!narrationCues.test(inline.speaker))names.add(inline.speaker);
   }else if(trimmed.startsWith('(')&&trimmed.endsWith(')'))kind='parenthetical';
   else if(trimmed&&separatedSpeaker.test(trimmed)&&/[\p{Lu}]/u.test(trimmed)&&next&&
    (!previous||previous.startsWith('('))&&!excludeSpeakers.test(trimmed)){
    kind='character';names.add(trimmed.replace(/\s*\([^)]*\)\s*$/,'').toLocaleUpperCase('ru-RU'));
   }else if(trimmed&&inDialogue)kind='dialogue';
  }
  // Location may also be written directly in conventional INT/EXT headings.
  if(starts&&standardHeading.test(trimmed)){
   const place=trimmed.replace(standardHeading,'').split(/\s+[–—-]\s+/u)[0].trim();
   if(place)scene.locationHint=place.slice(0,200);
  }
  scene.blocks.push(sceneBlock(kind,text,i+1,details));
  if(!trimmed||starts||kind==='transition'||kind==='heading')inDialogue=false;
  else inDialogue=kind==='character'||kind==='dialogue'||kind==='parenthetical';
 }
 if(scenes.length>150)throw Error('TOO_MANY_SCENES');
 if(scenes.length===1)warnings.push('Распознана только одна сцена. Проверьте заголовки глав и структуру текста.');
 if(!names.size)warnings.push('Говорящие персонажи не распознаны автоматически. Проверьте оформление реплик.');
 if(frontMatter.some(x=>x.text.trim()))
  warnings.push('Титульная часть до первой сцены сохранится отдельно от сцен.');
 return {digest:createHash('sha256').update(source).digest('hex'),
  characters:[...names].slice(0,120),scenes,warnings,length:source.length,frontMatter};
}
export type Shot={title:string;description:string;shotType:'WIDE'|'MEDIUM'|'CLOSE_UP'|'OTHER';
 durationMs:number;sourceLine:number|null;soundCue:string;musicCue:string};
export function suggestShots(blocks:Block[]):Shot[]{
 return blocks.filter(b=>b.text.trim()&&b.kind!=='character'&&b.kind!=='heading').slice(0,20).map((b,i)=>({
  title:'Кадр '+String(i+1).padStart(2,'0'),
  description:(b.dialogueText&&b.speaker?b.speaker+': '+b.dialogueText:b.text.trim()).slice(0,700),
  shotType:b.kind==='dialogue'?'CLOSE_UP':b.kind==='transition'?'OTHER':'MEDIUM',
  durationMs:b.kind==='dialogue'?5000:3500,sourceLine:b.sourceLine||null,soundCue:'',musicCue:'',
 }));
}
