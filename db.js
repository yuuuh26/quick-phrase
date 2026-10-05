export const DB_NAME = 'quick-phrase-v1';
export const DEFAULT_SETTINGS = {sortMode:'manual',theme:'auto',buttonSize:'normal',defaultCategory:null,backupCounter:0};
const stores=['phrases','categories','settings'];
let connection;
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('quick-phrase-data'):null;
channel?.unref?.();
export function onExternalChange(callback){if(channel)channel.onmessage=callback;}
function openDB(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{for(const name of stores)req.result.createObjectStore(name,{keyPath:'id'});};
    req.onerror=()=>{connection=null;reject(req.error);};
    req.onblocked=()=>{connection=null;reject(new Error('別のQUICK PHRASE画面を閉じて、再読み込みしてください。'));};
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
  });return connection;
}
export async function transact(change){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,change?'readwrite':'readonly');let result,failure;
    const data={};let done=0;
    tx.oncomplete=()=>{if(change)channel?.postMessage('changed');resolve(result);};
    tx.onabort=()=>reject(failure||tx.error||new Error('保存できませんでした'));
    tx.onerror=()=>{};
    for(const name of stores){const req=tx.objectStore(name).getAll();req.onsuccess=()=>{
      data[name]=req.result;
      if(++done!==stores.length)return;
      const state={phrases:data.phrases,categories:data.categories,settings:{...DEFAULT_SETTINGS,...data.settings.find(x=>x.id==='preferences')}};
      try{
        if(change){change(state);for(const name of ['phrases','categories']){const store=tx.objectStore(name);store.clear();for(const item of state[name])store.put(item);}tx.objectStore('settings').put({...state.settings,id:'preferences'});}
        result=state;
      }catch(error){failure=error;tx.abort();}
    };}
  });
}
export function uid(){return crypto.randomUUID();}
export async function initialize(){return transact(state=>{
  if(state.settings.initialized)return;
  const now=new Date().toISOString();
  const names=['よく使う','ChatGPT','アプリ開発','Notion','仕事','その他'];
  state.categories=names.map((name,order)=>({id:uid(),name,order,createdAt:now,updatedAt:now}));
  const samples=[['詳しく整理','以上の内容を、重要な情報を省略せず詳しく整理して。',0,'✦'],['コピペ形式','今挙げた内容をすべて統合して、そのままコピペできる形で出力して。',0,'▤'],['Notionに保存','NotionのNスキルを使って、今回の内容を整理して保存して。',3,'N'],['セキュリティ確認','この方法について、セキュリティ面・プライバシー面・想定されるリスクも確認して。',1,'◇'],['比較表にして','それぞれの違いを、分かりやすい比較表にして。',1,'▦'],['WORK仕様書','WORKへ引き継げる実装仕様書を作成して。',2,'⌘'],['修正版を全文','修正版を、そのままコピペできる形で全文出力して。',2,'↻']];
  state.phrases=samples.map(([title,text,cat,icon],order)=>({id:uid(),title,text,categoryId:state.categories[cat].id,pinned:order<3,order,memo:'',icon,color:'sage',useCount:0,createdAt:now,updatedAt:now,lastUsedAt:null}));
  state.settings.initialized=true;
});}
export function backupOf(state){return {app:'quick-phrase',schemaVersion:1,exportedAt:new Date().toISOString(),phrases:state.phrases,categories:state.categories,settings:state.settings};}
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const str=(x,max,required=false)=>typeof x==='string'&&x.length<=max&&(!required||x.trim().length>0);
const num=x=>Number.isSafeInteger(x)&&x>=0;
const date=x=>str(x,50,true)&&Number.isFinite(Date.parse(x));
export function validateBackup(raw){
  const bad=()=>{throw new Error('対応していないバックアップ形式です');};
  if(!isObj(raw)||raw.app!=='quick-phrase'||raw.schemaVersion!==1||!Array.isArray(raw.phrases)||!Array.isArray(raw.categories)||!isObj(raw.settings)||raw.phrases.length>20000||raw.categories.length>2000)bad();
  const ids=new Set(),cids=new Set();
  const categories=raw.categories.map(c=>{if(!isObj(c)||!str(c.id,128,true)||cids.has(c.id)||!str(c.name,80,true)||!num(c.order)||!date(c.createdAt)||!date(c.updatedAt))bad();cids.add(c.id);return {id:c.id,name:c.name,order:c.order,createdAt:c.createdAt,updatedAt:c.updatedAt};});
  const phrases=raw.phrases.map(p=>{
    if(!isObj(p)||!str(p.id,128,true)||ids.has(p.id)||!str(p.title,120,true)||!str(p.text,100000,true)||!str(p.memo,10000)||!str(p.icon,16)||typeof p.pinned!=='boolean'||!num(p.order)||!num(p.useCount)||!date(p.createdAt)||!date(p.updatedAt)||(p.lastUsedAt!==null&&!date(p.lastUsedAt))||(p.categoryId!==null&&!cids.has(p.categoryId)))bad();
    ids.add(p.id);return {id:p.id,title:p.title,text:p.text,categoryId:p.categoryId,pinned:p.pinned,order:p.order,memo:p.memo,icon:p.icon,color:['sage','blue','rose','amber'].includes(p.color)?p.color:'sage',useCount:p.useCount,createdAt:p.createdAt,updatedAt:p.updatedAt,lastUsedAt:p.lastUsedAt};
  });
  const s=raw.settings;
  if(!['manual','usage','recent','name'].includes(s.sortMode)||!['auto','light','dark'].includes(s.theme)||!['normal','large'].includes(s.buttonSize)||!num(s.backupCounter)||(s.defaultCategory!==null&&!cids.has(s.defaultCategory)))bad();
  return {phrases,categories,settings:{...DEFAULT_SETTINGS,sortMode:s.sortMode,theme:s.theme,buttonSize:s.buttonSize,defaultCategory:s.defaultCategory,backupCounter:s.backupCounter,initialized:true}};
}
export function importInto(state,backup,mode){
  if(mode==='replace'){state.phrases=backup.phrases;state.categories=backup.categories;state.settings=backup.settings;return;}
  if(mode!=='append')throw new Error('インポート方法を選択してください');
  if(state.phrases.length+backup.phrases.length>20000)throw new Error('定型文は合計20,000件までです。');
  const map=new Map();let next=Math.max(-1,...state.categories.map(c=>c.order))+1;
  for(const c of [...backup.categories].sort((a,b)=>a.order-b.order)){
    const existing=state.categories.find(x=>x.name===c.name);const id=existing?.id||uid();map.set(c.id,id);if(!existing)state.categories.push({...c,id,order:next++});
  }
  if(state.categories.length>2000)throw new Error('カテゴリは合計2,000件までです。');
  next=Math.max(-1,...state.phrases.map(p=>p.order))+1;
  for(const p of [...backup.phrases].sort((a,b)=>a.order-b.order))state.phrases.push({...p,id:uid(),categoryId:p.categoryId===null?null:map.get(p.categoryId),order:next++});
}
