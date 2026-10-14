(function(){
'use strict';
const url=window.STORE143_CONFIG?.gasWebAppUrl;
const configured=typeof url==='string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(url);
const iframe=document.createElement('iframe');
iframe.style.cssText='position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
iframe.title='Store143 API bridge';
iframe.setAttribute('aria-hidden','true');
const pending=new Map(); let ready=false, token='', bridgeWindow=null, bridgeOrigin='';
const isGasOrigin=origin=>{try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.script.googleusercontent.com'));}catch{return false}};
let readyResolve;const readyPromise=new Promise(r=>readyResolve=r);
window.addEventListener('message',e=>{
 if(!isGasOrigin(e.origin))return;
 const p=e.data;if(!p||typeof p!=='object')return;
 if(p.kind==='store143-ready'){
   if(!e.source || (bridgeWindow && e.source!==bridgeWindow))return;
   bridgeWindow=e.source;bridgeOrigin=e.origin;ready=true;readyResolve();return;
 }
 if(!ready || e.source!==bridgeWindow || e.origin!==bridgeOrigin)return;
 if(p.kind!=='store143-response'||!pending.has(p.id))return;
 const q=pending.get(p.id);pending.delete(p.id);clearTimeout(q.timer);
 if(p.error)q.reject(Error(p.error));else if(!p.data?.ok)q.reject(Error(p.data?.error||'Apps Script error'));
 else q.resolve(p.data.result);
});
if(configured){iframe.src=url+(url.includes('?')?'&':'?')+'bridge=1';document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(iframe));}
async function call(op,fields={}){
 if(!configured)throw Error('ยังไม่ได้ตั้ง gasWebAppUrl ใน config.js');
 await Promise.race([readyPromise,new Promise((_,reject)=>setTimeout(()=>reject(Error('เชื่อม Apps Script ไม่ได้: ตรวจ Deploy Anyone และ URL /exec')),12000))]);
 const id=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random());
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Apps Script ตอบกลับช้าเกินไป'))},30000);
  pending.set(id,{resolve,reject,timer});
  iframe.contentWindow.postMessage({kind:'store143-request',id,request:{op,token,...fields}},'*');
 });
}
const qs=(url)=>new URL(url,'https://local.invalid');
async function request(path,opt={}){
 const u=qs(path),method=(opt.method||'GET').toUpperCase();let body={};
 if(typeof opt.body==='string'){try{body=JSON.parse(opt.body)}catch(e){throw Error('Invalid JSON body')}}
 if(u.pathname==='/login'&&method==='POST'){
   const r=await call('login',body);token=r.token;return {id:r.id,role:r.role};
 }
 if(u.pathname==='/me'){
   if(!token)throw Error('Not logged in');return call('me');
 }
 if(u.pathname==='/logout'){const r=await call('logout');token='';return r;}
 if(u.pathname==='/overview'){
   const r=await call('overview');return {...r,counts:r.counts||[],actions:r.actions||[]};
 }
 if(u.pathname==='/gate-analytics'){
   const r=await call('getReport',{category:'gate'});return r?.report?.type==='gate'?{empty:false,filename:r.filename,sheets:r.report}:{empty:true};
 }
 if(u.pathname==='/aging-summary'){
   const r=await call('getReport',{category:'aging'});
   if(r?.report?.type==='aging')return {empty:false,...r.report,filename:r.filename,uploaded_at:r.uploaded_at};
   return {empty:true};
 }
 if(u.pathname==='/focus-summary'){
   const r=await call('getReport',{category:'focus'});
   if(r?.report?.type==='focus')return {empty:false,...r.report,filename:r.filename};
   return {empty:true};
 }
 if(u.pathname.startsWith('/versions/')){
   const category=u.pathname.split('/')[2];const r=await call('getReport',{category});
   return r?[{id:'latest',filename:r.filename,uploaded_at:r.uploaded_at,uploaded_by:'admin'}]:[];
 }
 if(u.pathname.startsWith('/actions/')&&method==='POST'){
   const category=u.pathname.split('/')[2];return call('submitAction',{category,...body});
 }
 if(u.pathname.startsWith('/records/')){
   const category=u.pathname.split('/')[2];const [r,acts]=await Promise.all([call('getReport',{category}),call('actions',{category})]);
   const d=r?.report;if(!d||!Array.isArray(d.rows))return {total:0,records:[]};
   const q=(u.searchParams.get('q')||'').toLowerCase();const page=Number(u.searchParams.get('page')||1);
   const all=d.rows.map((data,i)=>{const key=String(data['Art No']||data['Item Number']||data['Item No']||data['ITEM']||data['Item']||Object.values(data)[0]||i);return {item_key:key,data,submitted:acts.find(a=>String(a.item_key)===key)||null}}).filter(x=>Object.values(x.data).join(' ').toLowerCase().includes(q));
   return {total:all.length,records:all.slice((page-1)*50,page*50)};
 }
 throw Error('ฟังก์ชัน '+u.pathname+' ยังไม่ได้ย้ายจาก Express มา Apps Script');
}
async function upload(){throw Error('ระบบอัปโหลด Excel ผ่าน GitHub Pages ยังไม่ได้เชื่อม กรุณาอัปโหลดผ่าน Apps Script V16 ก่อน');}
window.Store143Bridge={request,upload};
})();
