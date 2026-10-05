import {transact,initialize,DEFAULT_SETTINGS,uid,backupOf,validateBackup,importInto,onExternalChange} from './db.js';
const $=id=>document.getElementById(id);
const loadingControls=['add','edit-mode','settings-open','categories-open','empty-add','search','sort'];
for(const id of loadingControls)$(id).disabled=true;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
let state,activeTab='all',editing=false,editingId=null,editingVersion=null,previewId=null,toastTimer,installPrompt;
let queue=Promise.resolve();const media=matchMedia('(prefers-color-scheme: dark)');
function toast(message){const notice=$('toast');notice.textContent=message;notice.hidden=false;notice.showPopover?.();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{notice.hidePopover?.();notice.hidden=true;},3000);}
function showError(message){toast(message);}
function applyTheme(){document.documentElement.dataset.theme=state.settings.theme==='auto'?(media.matches?'dark':'light'):state.settings.theme;document.body.classList.toggle('large',state.settings.buttonSize==='large');}
media.addEventListener('change',()=>{if(state)applyTheme();});
async function refresh(){state=await transact();render();}
function mutate(change,{count=true,message=''}={}){
  const run=queue.then(async()=>{state=await transact(s=>{change(s);if(count)s.settings.backupCounter+=1;});render();if(message)toast(message);});
  queue=run.catch(()=>{});return run;
}
function safeAction(action){return async(...args)=>{try{await action(...args);}catch(error){showError(error.message==='対応していないバックアップ形式です'?error.message:'保存できませんでした。'+(error.message||''));}};}
function sortedCategories(){return [...state.categories].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ja'));}
function categoryName(id){return state.categories.find(c=>c.id===id)?.name||'未分類';}
function sortedPhrases(phrases){return [...phrases].sort((a,b)=>{
  const tie=a.order-b.order||a.id.localeCompare(b.id);
  switch(state.settings.sortMode){case'usage':return b.useCount-a.useCount||tie;case'recent':return (Date.parse(b.lastUsedAt)||0)-(Date.parse(a.lastUsedAt)||0)||tie;case'name':return a.title.localeCompare(b.title,'ja')||tie;default:return tie;}
});}
function matches(p){const q=$('search').value.toLocaleLowerCase().trim();return (!q||[p.title,p.text,p.memo,categoryName(p.categoryId)].some(v=>v.toLocaleLowerCase().includes(q)))&&(activeTab==='all'||activeTab==='pinned'&&p.pinned||activeTab===p.categoryId||activeTab==='uncategorized'&&p.categoryId===null);}
function render(){
  applyTheme();$('sort').value=state.settings.sortMode;$('edit-mode').setAttribute('aria-pressed',String(editing));$('edit-mode').textContent=editing?'編集終了':'編集';$('edit-notice').hidden=!editing;$('backup-banner').hidden=state.settings.backupCounter<15;
  const tabs=[['all','すべて'],['pinned','固定'],...sortedCategories().map(c=>[c.id,c.name])];if(state.phrases.some(p=>p.categoryId===null))tabs.push(['uncategorized','未分類']);
  if(!tabs.some(([id])=>id===activeTab))activeTab='all';
  $('tabs').replaceChildren(...tabs.map(([id,name])=>{const b=el('button',id===activeTab?'active':'',name);b.setAttribute('aria-pressed',String(id===activeTab));b.onclick=()=>{activeTab=id;render();};return b;}));
  const phrases=sortedPhrases(state.phrases.filter(matches));const groups=[];
  const pinned=phrases.filter(p=>p.pinned);if(pinned.length)groups.push(['固定',pinned,true]);
  const ordinary=phrases.filter(p=>!p.pinned);
  for(const c of [...sortedCategories(),{id:null,name:'未分類'}]){const items=ordinary.filter(p=>p.categoryId===c.id);if(items.length)groups.push([c.name,items,false]);}
  $('results').replaceChildren(...groups.map(([name,items,pin])=>{
    const section=el('section','section');const head=el('div','section-head');head.append(el('h2','',pin?'⌁ 固定':name),el('span','count',String(items.length)),el('span','hint',editing?'編集・並び替え':'クリックでコピー'));const grid=el('div','grid');for(const p of items)grid.append(card(p));section.append(head,grid);return section;
  }));$('empty').hidden=phrases.length>0;
  if($('categories-dialog').open)renderCategories();
}
function card(p){
  const box=el('article',`phrase-card color-${p.color}`);box.dataset.id=p.id;
  const main=el('button','phrase-main');main.type='button';main.setAttribute('aria-label',`${editing?'編集':'コピー'}：${p.title}`);
  const top=el('span','card-top');top.append(el('span','phrase-icon',p.icon||'▤'));if(p.pinned)top.append(el('span','pin-mark','固定'));main.append(top,el('span','phrase-title',p.title),el('span','card-meta',categoryName(p.categoryId)));
  main.onclick=()=>editing?openPhrase(p.id):copyPhrase(p.id);
  const detail=el('button','details','⋯');detail.setAttribute('aria-label',`本文プレビュー：${p.title}`);detail.onclick=()=>openPreview(p.id);box.append(main,detail);
  if(editing){const controls=el('div','edit-controls');
    const group=state.phrases.filter(x=>x.pinned===p.pinned&&matches(x)&&(p.pinned||x.categoryId===p.categoryId)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));const index=group.findIndex(x=>x.id===p.id);
    for(const [label,action,disabled]of [['編集',()=>openPhrase(p.id),false],['↑',safeAction(()=>movePhrase(p.id,-1)),index===0||state.settings.sortMode!=='manual'],['↓',safeAction(()=>movePhrase(p.id,1)),index===group.length-1||state.settings.sortMode!=='manual'],[p.pinned?'固定解除':'固定',safeAction(()=>mutate(s=>{const item=s.phrases.find(x=>x.id===p.id);if(item){item.pinned=!item.pinned;item.updatedAt=new Date().toISOString();}})),false]]){
      const b=el('button','',label);b.setAttribute('aria-label',`${p.title}：${label}`);b.disabled=disabled;b.onclick=action;controls.append(b);
    }box.append(controls);
  }return box;
}
async function copyPhrase(id){
  const p=state.phrases.find(x=>x.id===id);if(!p)return;
  try{await navigator.clipboard.writeText(p.text);}catch{toast('コピーできませんでした。本文プレビューから選択してコピーしてください。');return;}
  toast('コピーしました');
  try{await mutate(s=>{const item=s.phrases.find(x=>x.id===id);if(item){item.useCount+=1;item.lastUsedAt=new Date().toISOString();}},{count:false});}
  catch{toast('コピーしました。利用履歴は保存できませんでした。');}
}
function movePhrase(id,delta){
  const visibleIds=new Set(state.phrases.filter(matches).map(p=>p.id));
  return mutate(s=>{const p=s.phrases.find(x=>x.id===id);if(!p)return;const group=s.phrases.filter(x=>x.pinned===p.pinned&&visibleIds.has(x.id)&&(p.pinned||x.categoryId===p.categoryId)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
    // Normalize before swapping so imported equal-order items are movable.
    const all=[...s.phrases].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));all.forEach((x,i)=>x.order=i);
    const index=group.findIndex(x=>x.id===id),other=group[index+delta];if(other){[p.order,other.order]=[other.order,p.order];p.updatedAt=other.updatedAt=new Date().toISOString();}
  });
}
function options(select,selected){select.replaceChildren(...[{id:null,name:'未分類'},...sortedCategories()].map(c=>{const o=el('option','',c.name);o.value=c.id||'';return o;}));select.value=selected||'';}
function openPhrase(id=null){
  const p=state.phrases.find(x=>x.id===id);editingId=p?.id||null;editingVersion=p?.updatedAt||null;
  $('phrase-form').reset();$('phrase-heading').textContent=p?'定型文を編集':'定型文を追加';$('phrase-title').value=p?.title||'';$('phrase-text').value=p?.text||'';$('phrase-memo').value=p?.memo||'';$('phrase-icon').value=p?.icon||'';$('phrase-color').value=p?.color||'sage';$('phrase-pinned').checked=p?.pinned||false;options($('phrase-category'),p?p.categoryId:state.settings.defaultCategory);$('phrase-delete').hidden=!p;$('phrase-error').textContent='';$('phrase-dialog').showModal();
}
$('phrase-form').onsubmit=async e=>{
  e.preventDefault();const title=$('phrase-title').value.trim(),text=$('phrase-text').value;
  if(!title||!text.trim()){$('phrase-error').textContent='表示名とコピー本文を入力してください。';return;}
  const submit=e.submitter;submit.disabled=true;
  const input={title,text,categoryId:$('phrase-category').value||null,pinned:$('phrase-pinned').checked,memo:$('phrase-memo').value,icon:$('phrase-icon').value,color:$('phrase-color').value};
  try{await mutate(s=>{
    if(input.categoryId&&!s.categories.some(c=>c.id===input.categoryId))throw new Error('カテゴリが変更されました。画面を開き直してください。');
    const now=new Date().toISOString(),existing=s.phrases.find(p=>p.id===editingId);
    if(editingId&&(!existing||existing.updatedAt!==editingVersion))throw new Error('別の画面で変更されています。編集を開き直してください。');
    if(existing)Object.assign(existing,input,{updatedAt:now});else s.phrases.push({...input,id:uid(),order:Math.max(-1,...s.phrases.map(p=>p.order))+1,useCount:0,createdAt:now,updatedAt:now,lastUsedAt:null});
  },{message:'保存しました'});$('phrase-dialog').close();}catch(error){$('phrase-error').textContent='保存できませんでした。'+error.message;}finally{submit.disabled=false;}
};
function confirmAction(title,text,label='実行'){
  $('confirm-title').textContent=title;$('confirm-text').textContent=text;$('confirm-yes').textContent=label;
  const d=$('confirm-dialog');d.returnValue='';d.showModal();return new Promise(resolve=>{d.addEventListener('close',()=>resolve(d.returnValue==='yes'),{once:true});});
}
$('confirm-yes').onclick=()=>$('confirm-dialog').close('yes');$('confirm-no').onclick=()=>$('confirm-dialog').close('no');
$('phrase-delete').onclick=safeAction(async()=>{const id=editingId;if(await confirmAction('定型文を削除','この定型文を削除しますか？','削除')){await mutate(s=>s.phrases=s.phrases.filter(p=>p.id!==id),{message:'削除しました'});$('phrase-dialog').close();}});
function openPreview(id){const p=state.phrases.find(x=>x.id===id);if(!p)return;previewId=id;$('preview-title').textContent=p.title;$('preview-text').textContent=p.text;$('preview-memo').textContent=p.memo;$('preview-meta').textContent=`使用回数：${p.useCount}回 · 最終使用：${p.lastUsedAt?new Date(p.lastUsedAt).toLocaleString('ja-JP'):'未使用'}`;$('preview-dialog').showModal();}
$('preview-copy').onclick=()=>copyPhrase(previewId);$('preview-edit').onclick=()=>{$('preview-dialog').close();openPhrase(previewId);};
$('add').onclick=() =>openPhrase();$('empty-add').onclick=()=>openPhrase();$('edit-mode').onclick=()=>{editing=!editing;render();};$('search').oninput=render;
$('sort').onchange=safeAction(e=>{const value=e.target.value;return mutate(s=>s.settings.sortMode=value,{count:false});});
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
function renderCategories(){
  const categories=sortedCategories();$('category-list').replaceChildren(...categories.map((c,index)=>{
    const row=el('div','category-row');const input=el('input');input.value=c.name;input.maxLength=80;input.setAttribute('aria-label',`${c.name}の名前`);row.append(input);
    for(const [label,action,disabled]of [
      ['保存',async()=>{const name=input.value.trim();if(!name)throw new Error('カテゴリ名を入力してください。');await mutate(s=>{if(s.categories.some(x=>x.id!==c.id&&x.name===name))throw new Error('同じ名前のカテゴリがあります。');const item=s.categories.find(x=>x.id===c.id);if(item){item.name=name;item.updatedAt=new Date().toISOString();}},{message:'カテゴリ名を保存しました'});},false],
      ['↑',()=>moveCategory(c.id,-1),index===0],['↓',()=>moveCategory(c.id,1),index===categories.length-1],
      ['削除',async()=>{if(await confirmAction('カテゴリを削除',`「${c.name}」を削除しますか？定型文は未分類に移動します。`,'削除'))await mutate(s=>{s.categories=s.categories.filter(x=>x.id!==c.id);for(const p of s.phrases)if(p.categoryId===c.id){p.categoryId=null;p.updatedAt=new Date().toISOString();}if(s.settings.defaultCategory===c.id)s.settings.defaultCategory=null;},{message:'カテゴリを削除しました'});},false]
    ]){const b=el('button',label==='削除'?'danger':'',label);b.setAttribute('aria-label',`${c.name}：${label}`);b.disabled=disabled;b.onclick=safeAction(action);row.append(b);}return row;
  }));
}
function moveCategory(id,delta){return mutate(s=>{const items=[...s.categories].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ja'));items.forEach((x,i)=>x.order=i);const index=items.findIndex(c=>c.id===id),other=items[index+delta];if(other){[items[index].order,other.order]=[other.order,items[index].order];items[index].updatedAt=other.updatedAt=new Date().toISOString();}});}
$('categories-open').onclick=()=>{renderCategories();$('categories-dialog').showModal();};
$('category-add-form').onsubmit=safeAction(async e=>{e.preventDefault();const name=$('category-new').value.trim();if(!name)return;await mutate(s=>{if(s.categories.some(c=>c.name===name))throw new Error('同じ名前のカテゴリがあります。');const now=new Date().toISOString();s.categories.push({id:uid(),name,order:Math.max(-1,...s.categories.map(c=>c.order))+1,createdAt:now,updatedAt:now});},{message:'カテゴリを追加しました'});$('category-new').value='';});
$('settings-open').onclick=async()=>{ $('theme').value=state.settings.theme;$('button-size').value=state.settings.buttonSize;$('settings-sort').value=state.settings.sortMode;options($('default-category'),state.settings.defaultCategory);$('settings-dialog').showModal();try{const granted=await navigator.storage?.persisted?.();$('storage-status').textContent=granted?'永続保存：許可済み。ブラウザデータ削除では消えるため、JSONも保存してください。':'永続保存：未許可。JSONバックアップを定期的に保存してください。';}catch{$('storage-status').textContent='JSONバックアップを定期的に保存してください。';}};
for(const [id,key]of [['theme','theme'],['button-size','buttonSize'],['settings-sort','sortMode'],['default-category','defaultCategory']])$(id).onchange=safeAction(e=>{const value=e.target.value||null;return mutate(s=>{s.settings[key]=value;},{count:false});});
async function exportBackup(){
  await queue;const snapshot=await transact();const blob=new Blob([JSON.stringify(backupOf(snapshot),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;const now=new Date();const stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0'),String(now.getSeconds()).padStart(2,'0')].join('');a.download=`quick-phrase-backup-${stamp}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  // Subtract only the changes included in this snapshot; preserve later edits.
  await mutate(s=>s.settings.backupCounter=Math.max(0,s.settings.backupCounter-snapshot.settings.backupCounter),{count:false});toast('バックアップを出力しました。ダウンロードを確認してください。');
}
$('export').onclick=safeAction(exportBackup);$('banner-backup').onclick=safeAction(exportBackup);
$('import').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>20*1024*1024)throw new Error('バックアップファイルは20MB以下にしてください。');
    let raw;try{raw=JSON.parse(await file.text());}catch{throw new Error('バックアップファイルを読み込めませんでした。JSON形式を確認してください。');}
    const backup=validateBackup(raw),mode=document.querySelector('input[name="import-mode"]:checked').value;
    if(mode==='replace'&&!await confirmAction('全置換で復元',`現在の全データを置き換えます。定型文${backup.phrases.length}件・カテゴリ${backup.categories.length}件で復元します。先にバックアップを保存してください。`,'全置換で復元'))return;
    await mutate(s=>importInto(s,backup,mode),{message:`${backup.phrases.length}件の定型文を復元しました`});$('settings-dialog').close();
  }catch(error){toast(error.message||'バックアップファイルを読み込めませんでした');}finally{e.target.value='';}
};
$('clear').onclick=safeAction(async()=>{if(await confirmAction('全データを削除','定型文・カテゴリ・利用履歴・設定をすべて削除します。必要なデータは先にバックアップを保存してください。','全データを削除')){await mutate(s=>{s.phrases=[];s.categories=[];s.settings={...DEFAULT_SETTINGS,initialized:true};},{count:false,message:'全データを削除しました'});activeTab='all';$('settings-dialog').close();render();}});
$('persist').onclick=async()=>{try{const granted=await navigator.storage?.persist?.();$('storage-status').textContent=granted?'永続保存が許可されました。JSONバックアップも保存してください。':'永続保存は許可されませんでした。JSONバックアップで備えてください。';}catch{toast('永続保存をリクエストできませんでした');}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').textContent='QUICK PHRASEをインストール';});
$('install').onclick=async()=>{if(installPrompt){try{await installPrompt.prompt();await installPrompt.userChoice;}catch{toast('Chromeのメニューからインストールしてください');}installPrompt=null;}else $('install-help').hidden=!$('install-help').hidden;};
onExternalChange(()=>{queue=queue.then(refresh).catch(()=>toast('更新を読み込めませんでした。再読み込みしてください。'));});
window.addEventListener('focus',()=>{if(state)queue=queue.then(refresh).catch(()=>{});});
async function setupOffline(){
  if(!('serviceWorker'in navigator)){$('offline-status').textContent='オフライン非対応のブラウザ';return;}
  try{await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;$('offline-status').textContent='● オフラインで使用できます';}catch{$('offline-status').textContent='オフライン準備に失敗。再読み込みしてください。';}
}
try{state=await initialize();render();for(const id of loadingControls)$(id).disabled=false;setupOffline();}catch(error){$('fatal').hidden=false;$('fatal').textContent='データを読み込めませんでした。別の画面を閉じて再読み込みしてください。ブラウザの保存設定も確認してください。';for(const id of loadingControls)$(id).disabled=true;}
