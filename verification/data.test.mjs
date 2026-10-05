import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,validateBackup,importInto,backupOf} from '../db.js';
const stamp='2026-10-05T08:30:00.000Z';
const category={id:'c1',name:'ChatGPT',order:0,createdAt:stamp,updatedAt:stamp};
const phrase={id:'p1',title:'コピペ',text:'  本文\n<script>悪意のある入力</script>\n  ',categoryId:'c1',pinned:true,order:0,memo:'メモ',icon:'🌱',color:'sage',useCount:12,createdAt:stamp,updatedAt:stamp,lastUsedAt:stamp};
const sample={phrases:[phrase],categories:[category],settings:{...DEFAULT_SETTINGS,initialized:true}};
const raw=backupOf(sample),validated=validateBackup(raw);assert.deepEqual(validated,sample);assert.equal(validated.phrases[0].text,phrase.text);
const copy=()=>structuredClone(raw);
let cases=0;function invalid(modify){const x=copy();modify(x);assert.throws(()=>validateBackup(x),/対応していない/);cases++;}
invalid(x=>x.app='another-app');invalid(x=>x.schemaVersion=2);invalid(x=>x.phrases=null);invalid(x=>x.settings=null);invalid(x=>x.phrases.push(x.phrases[0]));invalid(x=>x.categories.push(x.categories[0]));invalid(x=>x.phrases[0].categoryId='missing');invalid(x=>x.phrases[0].useCount=-1);invalid(x=>x.phrases[0].order=1.5);invalid(x=>x.phrases[0].pinned='true');invalid(x=>x.phrases[0].lastUsedAt='invalid');invalid(x=>x.phrases[0].createdAt='invalid');invalid(x=>x.phrases[0].memo={});invalid(x=>x.phrases[0].title=' ');invalid(x=>x.phrases[0].text='\n ');invalid(x=>x.settings.defaultCategory='missing');invalid(x=>x.settings.theme='unknown');invalid(x=>x.settings.sortMode='unknown');invalid(x=>x.settings.buttonSize='unknown');invalid(x=>x.settings.backupCounter=-1);invalid(x=>x.categories[0].order=-1);invalid(x=>x.categories[0].name=' ');invalid(x=>x.phrases[0].text='a'.repeat(100001));invalid(x=>x.phrases=Array(20001).fill(x.phrases[0]));
const unknown=copy();unknown.phrases[0].extra={unsafe:true};unknown.settings.extra='<script>';const normalized=validateBackup(unknown);assert.equal(normalized.phrases[0].extra,undefined);assert.equal(normalized.settings.extra,undefined);
const append={phrases:[{...phrase,id:'existing',order:5}],categories:[{...category,id:'existing-category',order:3}],settings:{...DEFAULT_SETTINGS,theme:'dark'}};
importInto(append,validated,'append');assert.equal(append.phrases.length,2);assert.equal(append.categories.length,1);assert.equal(append.phrases[1].categoryId,'existing-category');assert.notEqual(append.phrases[1].id,'p1');assert.equal(append.phrases[1].order,6);assert.equal(append.settings.theme,'dark');
const addedCategory=validateBackup({...raw,categories:[{...category,name:'Notion'}]});importInto(append,addedCategory,'append');assert.equal(append.categories.length,2);assert.notEqual(append.categories[1].id,'c1');assert.equal(append.phrases[2].categoryId,append.categories[1].id);
const unique=new Set(append.phrases.map(p=>p.id));assert.equal(unique.size,3);
const replace={phrases:[],categories:[],settings:{...DEFAULT_SETTINGS}};importInto(replace,validated,'replace');assert.deepEqual(replace,sample);assert.throws(()=>importInto(replace,validated,'unsupported'));
const nullCategory=copy();nullCategory.phrases[0].categoryId=null;assert.equal(validateBackup(nullCategory).phrases[0].categoryId,null);
console.log(`PASS: ${cases} invalid-format cases, full backup round-trip, preserved multiline/whitespace, unknown-property removal, append ID regeneration, same-name category mapping, category creation, replace, null category.`);
