import { createHash } from 'node:crypto';
export type Kind = 'heading'|'action'|'character'|'dialogue'|'parenthetical'|'transition';
export type Block = {kind:Kind;text:string;sourceLine:number};
export type ParsedScene = {title:string;sourceLineStart:number;blocks:Block[]};
export type Preview = {digest:string;scenes:ParsedScene[];characters:string[];warnings:string[];length:number};
const heading=/^(?:(?:INT\/EXT|ИНТ\/НАТ|INT|EXT|ИНТ|НАТ)\.?\s+|(?:СЦЕНА|SCENE)\s*\d+(?=\s|[:.―—-]))/iu;
const char=/^[\p{Lu}\p{N} ._()\-Ё]{2,55}$/u;
export function parseScreenplay(input:string):Preview {
 const source=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if (!source.trim()) throw Error('EMPTY_SCRIPT');
 if (source.length>400_000) throw Error('SCRIPT_TOO_LARGE');
 const lines=source.split('\n');
 if(lines.length>20_000) throw Error('TOO_MANY_LINES');
 const scenes:ParsedScene[]=[];const names=new Set<string>();const warnings:string[]=[];
 let current:ParsedScene|null=null;let inDialogue=false;
 for(let i=0;i<lines.length;i++){
  const text=lines[i],trimmed=text.trim(),next=lines[i+1]?.trim(),previous=lines[i-1]?.trim();
  const starts=heading.test(trimmed);
  if(starts||!current){
   current={title:(starts?trimmed:'Сцена 1 — вступление').slice(0,200),sourceLineStart:i+1,blocks:[]};
   scenes.push(current);inDialogue=false;
  }
  let kind:Kind='action';
  if(starts)kind='heading';
  else if(trimmed&&/^(?:CUT TO:|FADE OUT|ПЕРЕХОД:|ЗАТЕМНЕНИЕ)/iu.test(trimmed))kind='transition';
  else if(trimmed.startsWith('(')&&trimmed.endsWith(')'))kind='parenthetical';
  else if(trimmed&&char.test(trimmed)&&/[\p{Lu}]/u.test(trimmed)&&next&&(!previous||previous.startsWith('('))&&!/^(КОНЕЦ|НАЧАЛО|ДЕНЬ|НОЧЬ|УТРО|ВЕЧЕР)$/iu.test(trimmed)){
   kind='character';names.add(trimmed.replace(/\s*\([^)]*\)\s*$/,''));
  }else if(trimmed&&inDialogue)kind='dialogue';
  current.blocks.push({kind,text,sourceLine:i+1});
  if(!trimmed||starts||kind==='transition')inDialogue=false;
  else if(kind==='character'||kind==='dialogue'||kind==='parenthetical')inDialogue=true;
  else inDialogue=false;
 }
 if(scenes.length>150)throw Error('TOO_MANY_SCENES');
 if(scenes.length===1)warnings.push('Проверьте разметку сцен: обнаружена только одна сцена.');
 if(!names.size)warnings.push('Имена персонажей можно добавить вручную.');
 return {digest:createHash('sha256').update(source).digest('hex'),scenes,characters:[...names].slice(0,120),warnings,length:source.length};
}
export type Shot = {title:string;description:string;shotType:'WIDE'|'MEDIUM'|'CLOSE_UP'|'OTHER';durationMs:number;sourceLine:number|null;soundCue:string;musicCue:string};
export function suggestShots(blocks:Block[]):Shot[]{
 return blocks.filter(b=>b.text.trim()&&b.kind!=='character').slice(0,20).map((b,i)=>({
  title:'Кадр '+String(i+1).padStart(2,'0'),description:b.text.trim().slice(0,700),
  shotType:b.kind==='heading'?'WIDE':b.kind==='dialogue'?'CLOSE_UP':b.kind==='transition'?'OTHER':'MEDIUM',
  durationMs:b.kind==='dialogue'?5000:3500,sourceLine:b.sourceLine||null,soundCue:'',musicCue:''
 }));
}
