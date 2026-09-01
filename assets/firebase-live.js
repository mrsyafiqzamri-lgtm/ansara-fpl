import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCC8B_uALWwF-iC3FDkxKGsw4MIQENYFfE",
  authDomain: "ansara-fpl-live.firebaseapp.com",
  databaseURL: "https://ansara-fpl-live-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ansara-fpl-live",
  storageBucket: "ansara-fpl-live.firebasestorage.app",
  messagingSenderId: "556574266774",
  appId: "1:556574266774:web:592360da2f2f341a7c39b7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

function ensureAudienceBar() {
  let bar = document.getElementById("liveAudienceBar");
  if (bar) return bar;

  const style = document.createElement("style");
  style.textContent = `
    .live-audience-wrap {padding:0 24px;margin:2px auto 10px;max-width:1180px;box-sizing:border-box}
    .live-audience-bar {min-height:42px;display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap;padding:9px 14px;border:1px solid #e2e6ed;border-radius:16px;background:rgba(255,255,255,.84);color:#667085;font-size:14px;line-height:1.25;text-align:center;box-sizing:border-box}
    .live-audience-bar strong {color:#111827;font-weight:800}
    .live-audience-dot {width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}
    .live-audience-separator {color:#b5bcc8;margin:0 1px}
    .live-audience-bar.is-error .live-audience-dot {background:#9ca3af;box-shadow:none}
    @media (max-width:640px){.live-audience-wrap{padding:0 22px;margin-bottom:8px}.live-audience-bar{min-height:40px;border-radius:15px;font-size:13px}}
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "live-audience-wrap";
  bar = document.createElement("div");
  bar.id = "liveAudienceBar";
  bar.className = "live-audience-bar";
  bar.setAttribute("aria-live", "polite");
  bar.innerHTML = `<span class="live-audience-dot" aria-hidden="true"></span><span><strong id="onlineNowCount">—</strong> online now</span><span class="live-audience-separator" aria-hidden="true">·</span><span><strong id="visitorsTodayCount">—</strong> visitors today</span>`;
  wrap.appendChild(bar);
  const controlbar = document.querySelector(".controlbar");
  if (controlbar && controlbar.parentNode) controlbar.insertAdjacentElement("afterend", wrap);
  else (document.querySelector(".app-shell") || document.body).prepend(wrap);
  return bar;
}

const audienceBar = ensureAudienceBar();
let onlineEl = document.getElementById("onlineNowCount");
let visitorsEl = document.getElementById("visitorsTodayCount");
function setUnavailable(){audienceBar.classList.add("is-error");audienceBar.innerHTML='<span class="live-audience-dot" aria-hidden="true"></span><span>Live audience unavailable</span>'}
function malaysiaDateKey(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const values={};for(const part of parts)if(part.type!=="literal")values[part.type]=part.value;return `${values.year}-${values.month}-${values.day}`}
function countOnlineUsers(value){if(!value||typeof value!=="object")return 0;return Object.values(value).reduce((count,connections)=>count+(connections&&typeof connections==="object"&&Object.keys(connections).length>0?1:0),0)}
let stopTodayListener=null,activeDateKey=null;
function attachTodayVisitors(uid){
  const dateKey=malaysiaDateKey();if(dateKey===activeDateKey)return;
  if(typeof stopTodayListener==="function")stopTodayListener();activeDateKey=dateKey;
  set(ref(db,`visitors/${dateKey}/${uid}`),true).catch(error=>console.error("Visitor write failed:",error));
  stopTodayListener=onValue(ref(db,`visitors/${dateKey}`),snapshot=>{visitorsEl=document.getElementById("visitorsTodayCount");if(visitorsEl)visitorsEl.textContent=String(snapshot.size)},error=>{console.error("Visitors listener failed:",error);setUnavailable()});
}
let audienceStarted=false;
function startRealtimeAudience(user){
  if(audienceStarted)return;audienceStarted=true;const uid=user.uid;
  onValue(ref(db,".info/connected"),async snapshot=>{if(snapshot.val()!==true)return;const connectionRef=push(ref(db,`presence/${uid}`));try{await onDisconnect(connectionRef).remove();await set(connectionRef,true)}catch(error){console.error("Presence write failed:",error)}},error=>{console.error("Connection listener failed:",error);setUnavailable()});
  onValue(ref(db,"presence"),snapshot=>{onlineEl=document.getElementById("onlineNowCount");if(onlineEl)onlineEl.textContent=String(countOnlineUsers(snapshot.val()))},error=>{console.error("Presence listener failed:",error);setUnavailable()});
  attachTodayVisitors(uid);setInterval(()=>attachTodayVisitors(uid),60000);
}

/* AFCL permanent bridge --------------------------------------------------
   Kept in the engine's existing Firebase module so automatic dashboard
   rebuilds cannot remove AFCL navigation/profile integration again. */
const AFCL={qualificationGw:2,qualifiers:768,potSize:192,tieSeed:"AFCL-2026-27-SEEDING-TIE-V1"};
let afclRows=null,afclMap=null,afclLoading=null;
function afclHash(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function afclEsc(v){return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function afclJson(url){const r=await fetch(`${url}${url.includes("?")?"&":"?"}v=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
async function loadAfclRows(){
  if(afclRows)return afclRows;if(afclLoading)return afclLoading;
  afclLoading=(async()=>{const manifest=await afclJson("data/manifest.json"),data=await afclJson(manifest.snapshot);const q=AFCL.qualificationGw;
    const rows=(data.individual||[]).map(base=>{const hs=(data.histories?.[base.id]||[]).map(Number),gw2=Number(hs[q-1]||0),total=hs.slice(0,q).reduce((s,x)=>s+x,0);return {...base,gw2,total,tie:afclHash(`${AFCL.tieSeed}|${base.id}`)}}).sort((a,b)=>b.gw2-a.gw2||b.total-a.total||a.tie-b.tie||String(a.team_name||"").localeCompare(String(b.team_name||"")));
    rows.forEach((r,i)=>{r.seed=i+1;r.qualified=i<AFCL.qualifiers;r.pot=r.qualified?Math.floor(i/AFCL.potSize)+1:null});afclRows=rows;afclMap=new Map(rows.map(r=>[String(r.id),r]));return rows})().catch(e=>{console.debug("AFCL bridge data unavailable",e);afclLoading=null;return null});return afclLoading;
}
function ensureAfclChrome(){
  if(!document.getElementById("afclBridgeStyle")){const st=document.createElement("style");st.id="afclBridgeStyle";st.textContent='@media(max-width:719px){.bottom-nav.afcl-six{grid-template-columns:repeat(6,1fr)}.bottom-nav.afcl-six a small{font-size:8px}.bottom-nav.afcl-six a span{font-size:15px}}';document.head.appendChild(st)}
  const nav=document.querySelector(".bottom-nav");if(!nav)return;nav.classList.add("afcl-six");if(nav.querySelector("[data-afcl-main]"))return;
  const link=document.createElement("a");link.href="afcl.html#/overview";link.dataset.afclMain="1";link.innerHTML="<span>🏆</span><small>AFCL</small>";const more=nav.querySelector('[data-nav="more"]');nav.insertBefore(link,more||null);
}
async function enhanceAfclRoute(){
  ensureAfclChrome();const appEl=document.getElementById("app");if(!appEl)return;const parts=(location.hash||"").replace(/^#\/?/,"").split("/").filter(Boolean),route=parts[0]||"home";
  if(route==="manager"){
    if(document.getElementById("afclManagerCard"))return;await loadAfclRows();const r=afclMap?.get(String(decodeURIComponent(parts[1]||"")));if(!r||document.getElementById("afclManagerCard"))return;
    const el=document.createElement("section");el.id="afclManagerCard";el.className="section";el.innerHTML=`<div class="section-head"><div><h2>ANSARA Fantasy Champions League</h2><span class="subline">Official GW2 qualification & seeding</span></div><a href="afcl.html#/manager/${encodeURIComponent(r.id)}">Full AFCL record</a></div><div class="profile-kpis" style="padding:0 14px 14px"><div><span>AFCL Status</span><strong style="font-size:14px;color:${r.qualified?'#15803d':'#b91c1c'}">${r.qualified?'Qualified':'Did Not Qualify'}</strong></div><div><span>GW2 Seed</span><strong>#${r.seed}</strong></div><div><span>GW2 Points</span><strong>${Number(r.gw2).toLocaleString('en-MY')}</strong></div><div><span>Pot</span><strong>${r.pot?`P${r.pot}`:'—'}</strong></div></div>`;appEl.appendChild(el);
  }
  if(route==="more"){
    if(document.getElementById("afclRulesMoreCard"))return;const grid=appEl.querySelector(".more-grid");if(!grid)return;const a=document.createElement("a");a.id="afclRulesMoreCard";a.href="afcl.html#/rules";a.className="more-card";a.innerHTML="<span>📘</span>Rules & FAQ";grid.appendChild(a);
  }
}
const afclObserver=new MutationObserver(()=>enhanceAfclRoute());const observedApp=document.getElementById("app");if(observedApp)afclObserver.observe(observedApp,{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(enhanceAfclRoute,0));ensureAfclChrome();enhanceAfclRoute();

onAuthStateChanged(auth,user=>{if(user)startRealtimeAudience(user)});
signInAnonymously(auth).catch(error=>{console.error("Anonymous sign-in failed:",error);setUnavailable()});
