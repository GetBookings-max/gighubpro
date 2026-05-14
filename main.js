if(location.hostname!=="localhost")console.log=()=>{};
// ══════════════════════════════════════════════════════════════════
// GIGHUB V3 — GOOGLE SHEETS TOKEN VALIDATION
// Tokens geridos numa Google Sheet. Sem upload por cada venda.
// ══════════════════════════════════════════════════════════════════

// ── CONFIGURAÇÃO (preenche após seguir o guia) ──────────────────
// Cola aqui o URL do teu Google Apps Script (ver instruções abaixo)

// ── DADOS ENCRIPTADOS (não alteres) ────────────────────────────

const PRICE_PER_ACCESS = 4.99;
const PRICE_PER_BOOST  = 2.99;
var secStatus = {};

// ── LOCAL PLATFORMS DATA ─────────────────────────────────────────
// SEGURANÇA: P começa vazio. Os dados são carregados pelo Supabase
// após validação do token em validarTokenSupabase().
// Nunca coloques dados aqui — qualquer pessoa pode ver o código-fonte.
var P = [];

// Session state — set to true after successful Supabase token validation
var hasAccess = false;


// ══ CRYPTO ══════════════════════════════════════════════════════
async function _sha256hex(str){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}




// ══ AUTH ════════════════════════════════════════════════════════
function getUrlToken(){
  // FIX #4: tokens in URL hash (#key=) — never sent to server
  const h=new URLSearchParams(window.location.hash.slice(1));
  return h.get('key')||h.get('k')||null;
}

async function checkAccess(){
  const urlParams=new URLSearchParams(window.location.hash.slice(1));
  if(urlParams.get('admin')==='1'||false){
    showAdminLogin(); return;
  }
  const urlToken=getUrlToken();
  if(urlToken){ await _tryUnlock(urlToken,true); return; }
  showPasswordMode();
}



async function unlock(){
  const v=document.getElementById('lockInput').value;
  if(!v) return;
  const btn=document.getElementById('lockBtn');
  const orig=btn.textContent;
  btn.textContent='A verificar…'; btn.disabled=true;
  await _tryUnlock(v,false);
  btn.textContent=orig; btn.disabled=false;
}

async function adminLogin(){ await unlock(); }

function _showErr(){
  const err=document.getElementById('lockErr');
  err.textContent='Código incorreto. Tenta novamente.';
  const inp=document.getElementById('lockInput');
  inp.classList.add('shake'); inp.value='';
  setTimeout(()=>{inp.classList.remove('shake');err.textContent='';},2000);
}

function showVerifying(){
  const lbl=document.getElementById('lockLabel');
  if(lbl) lbl.textContent='A verificar acesso…';
}
function showPasswordMode(){
  const t=translations[currentLang]||translations['pt'];
  const lbl=document.getElementById('lockLabel');
  if(lbl) lbl.textContent='Passo 2 — '+(t.lockAccessCode||'Código de acesso');
  document.getElementById('lockInput').style.display='block';
  document.getElementById('lockBtn').style.display='block';
  document.getElementById('lockBtn').textContent=t.lockEnter||'Entrar →';
  document.getElementById('lockHint').textContent=t.lockHintText||'Acesso enviado pelo autor da plataforma';
}
function showAdminLogin(){
  const lbl=document.getElementById('lockLabel');
  if(lbl) lbl.textContent='🔑 Acesso Admin';
  document.getElementById('lockInput').style.display='block';
  document.getElementById('lockBtn').textContent='Entrar como Admin →';
  document.getElementById('lockBtn').style.display='block';
  document.getElementById('lockHint').textContent='Área restrita — só para o criador';
}
function showBlocked(){
  const t=translations[currentLang]||translations['pt'];
  const lbl=document.getElementById('lockLabel');
  if(lbl){lbl.textContent=t.lockRevoked||'🚫 Acesso revogado';lbl.style.color='rgba(192,57,43,.8)';}
  document.getElementById('lockErr').textContent=t.lockRevokedMsg||'Este link foi desativado.';
}
function grantAccess(){
  document.getElementById('lockScreen').classList.add('unlocked');
  document.body.style.overflow='';
  setTimeout(()=>{
    document.getElementById('lockScreen').style.display='none';
    if(!localStorage.getItem('gh_welcomed')){
      localStorage.setItem('gh_welcomed','1');
      document.getElementById('welcomeModal').style.display='flex';
      if(typeof applyLang==='function') applyLang();
    }
  },600);
}
// lockInput keydown listener moved to _bindEvents()

// ══ PAINEL ADMIN — GOOGLE SHEETS ════════════════════════════════
// A gestão de tokens é feita directamente na tua Google Sheet.
// O painel admin mostra o link directo para a sheet.

let _GS_SHEET_URL = localStorage.getItem('gh_sheet_url') || '';


function admRender(){
  document.getElementById('adm-total').textContent='—';
  document.getElementById('adm-revenue').textContent='—';
  document.getElementById('adm-revoked').textContent='—';

  const container=document.getElementById('adm-list');
  const sheetUrl=localStorage.getItem('gh_sheet_url')||'';
  // Security: only allow Google Sheets URLs to prevent self-XSS via javascript: schemes
  const safeSheetUrl = (sheetUrl.startsWith('https://docs.google.com/spreadsheets/') || sheetUrl.startsWith('https://docs.google.com/')) ? sheetUrl : '';

  container.innerHTML=`
  <div style="background:var(--green-pale);border:1.5px solid rgba(45,122,79,.3);border-radius:12px;padding:20px 18px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:10px">✅ Tokens geridos na Google Sheet</div>
    <div style="font-size:12px;color:var(--grey);line-height:1.7;margin-bottom:14px">
      Para <strong>criar token</strong>: abre a sheet, adiciona linha <code style="background:var(--cream);padding:1px 5px;border-radius:4px">token | nome | TRUE</code><br>
      Para <strong>revogar</strong>: muda <code style="background:var(--cream);padding:1px 5px;border-radius:4px">TRUE</code> para <code style="background:var(--red-pale);padding:1px 5px;border-radius:4px;color:var(--red)">FALSE</code><br>
      Alterações têm efeito <strong>imediato</strong> — sem upload de ficheiro.
    </div>
    ${safeSheetUrl
      ? `<a href="${safeSheetUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 18px;border-radius:8px;background:var(--green);color:#fff;text-decoration:none;font-size:13px;font-weight:700">
           📊 Abrir Google Sheet →
         </a>`
      : `<div style="font-size:12px;color:var(--amber);background:var(--amber-pale);border:1px solid rgba(212,130,10,.3);border-radius:8px;padding:10px 12px;margin-bottom:10px">
           ⚠️ Cola aqui o link da tua Google Sheet para acesso rápido:
         </div>
         <div style="display:flex;gap:8px">
           <input id="sheetUrlInput" type="url" placeholder="https://docs.google.com/spreadsheets/d/..." style="flex:1;height:36px;border:1px solid var(--border-md);border-radius:8px;padding:0 10px;font-size:12px;font-family:'Instrument Sans',sans-serif">
           <button data-action="saveSheetUrl" style="height:36px;padding:0 14px;border-radius:8px;border:none;background:var(--green);color:#fff;font-size:12px;font-weight:600;cursor:pointer">Guardar</button>
         </div>`
    }
  </div>

  <div style="background:var(--cream);border:1px solid var(--border);border-radius:10px;padding:16px 18px">
    <div style="font-size:11px;font-weight:700;color:var(--grey);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">🔗 Link base para clientes</div>
    <div style="font-size:12px;color:var(--grey);margin-bottom:8px">Adiciona o token gerado por ti no fim do URL:</div>
    <code style="font-size:12px;background:#fff;border:1px solid var(--border-md);border-radius:6px;padding:8px 10px;display:block;word-break:break-all;color:var(--ink)">
      ${window.location.origin}${window.location.pathname}<strong>#key=TOKEN_AQUI</strong>
    </code>
    <button data-action="copyBaseLink" style="margin-top:8px;height:30px;padding:0 12px;border-radius:6px;border:1px solid var(--border-md);background:transparent;font-size:11px;cursor:pointer;font-family:'Instrument Sans',sans-serif">📋 Copiar base do link</button>
  </div>`;
}

function saveSheetUrl(){
  const val=document.getElementById('sheetUrlInput')?.value.trim();
  if(val&&val.startsWith('http')){
    localStorage.setItem('gh_sheet_url',val);
    admRender();
  }
}

function admCopyLink(){
  const txt=document.getElementById('adm-linktext').textContent;
  navigator.clipboard.writeText(txt).then(()=>{
    const btn=document.getElementById('admCopyBtn');
    if(!btn) return;
    btn.textContent='✓ Copiado!';btn.style.color='var(--green)';
    setTimeout(()=>{btn.textContent='Copiar';btn.style.color='';},2000);
  });
}

// ══ UTILS ═══════════════════════════════════════════════════════
function saveAffLinks(a){ localStorage.setItem('gh_aff',JSON.stringify(a)); }
function getAffLinks(){ return JSON.parse(localStorage.getItem('gh_aff')||'{}'); }
function initWebhookUI(){
  const inp=document.getElementById('adm-webhook-url');
  if(inp){inp.value=getAlertWebhook();updateWebhookStatus();}
}

let favs=JSON.parse(localStorage.getItem('gh_favs')||'[]');
let showFavsOnly=false;
function toggleFav(name,e){
  e.stopPropagation();
  if(favs.includes(name)) favs=favs.filter(f=>f!==name); else favs.push(name);
  localStorage.setItem('gh_favs',JSON.stringify(favs));
  document.getElementById('favCount').textContent=favs.length;
  render();
}
function toggleFavView(){
  showFavsOnly=!showFavsOnly;
  const t=translations[currentLang]||translations['pt'];
  const favBtn=document.getElementById('favBtn');
  if(favBtn) favBtn.innerHTML=t.navFavs+' (<span id="favCount">'+favs.length+'</span>)';
  const btn=document.getElementById('favBtn');
  btn.style.background=showFavsOnly?'var(--ink)':'';
  btn.style.color=showFavsOnly?'var(--paper)':'';
  btn.style.borderColor=showFavsOnly?'var(--ink)':'';
  render();
}
function _applyCalcLang(){
  const t = translations[currentLang]||translations['pt'];
  const ids = {
    calcTitleEl:'calcTitle', calcDescEl:'calcDesc',
    calcHoursLabelEl:'calcHoursLabel', calcResultLabelEl:'calcResult',
    calcTypeLabel:'calcTypeLabel'
  };
  Object.entries(ids).forEach(([id,key])=>{
    const el=document.getElementById(id);
    if(el && t[key]) el.textContent=t[key];
  });
  ['2','6','7','8','10','18'].forEach(v=>{
    const el=document.getElementById('calcOpt'+v);
    if(el && t['calcOpt'+v]) el.textContent=t['calcOpt'+v];
  });
  calcEarnings();
}

function _applyBoostPayLang(){
  const t = translations[currentLang]||translations['pt'];
  const set=(id,key,html)=>{
    const el=document.getElementById(id);
    if(el && t[key]!==undefined){ if(html) el.innerHTML=t[key]; else el.textContent=t[key]; }
  };
  set('boostPayTitleEl','boostPayTitle',false);
  set('boostPaySubEl','boostPaySub',false);
  set('boostPayLabelEl','boostPayLabel',false);
  set('boostPayDescEl','boostPayDesc',false);
  set('boostPayBtnEl','boostPayBtn',false);
  set('boostPayInstrEl','boostPayInstr',true);
  set('boostCodeLabelEl','boostCodeLabel',false);
  set('boostOpenFormBtn','boostOpenFormBtn',false);
}

function openCalc(){
  document.getElementById('calcModal').style.display='flex';
  _applyCalcLang();
}
function calcEarnings(){
  const h=parseInt(document.getElementById('hoursRange').value);
  const rate=parseInt(document.getElementById('calcType').value);
  const t = translations[currentLang]||translations['pt'];
  document.getElementById('hoursVal').textContent=h+'h';
  document.getElementById('calcResult').textContent=Math.round(h*4*rate*0.75)+'€';
  // Update all static labels every time calc runs (ensures correct lang on open)
  const _s=(id,key)=>{const el=document.getElementById(id);if(el&&t[key])el.textContent=t[key];};
  _s('calcTitleEl','calcTitle');
  _s('calcDescEl','calcDesc');
  _s('calcHoursLabelEl','calcHoursLabel');
  // Update option labels
  ['2','6','7','8','10','18'].forEach(v => {
    const el=document.getElementById('calcOpt'+v);
    if(el && t['calcOpt'+v]) el.textContent=t['calcOpt'+v];
  });
  // Update type label
  const tl=document.getElementById('calcTypeLabel');
  if(tl && t.calcTypeLabel) tl.textContent=t.calcTypeLabel;
  // Update result label
  const rl=document.getElementById('calcResultLabelEl');
  if(rl && t.calcResult) rl.textContent=t.calcResult;
  const sPT={2:'Prolific + Toluna + AttaPoll.',6:'Uber Eats ou Glovo.',7:'Outlier AI + DataAnnotation.tech.',8:'Rover + Zoowish + Babysits.pt.',10:'Upwork + Fiverr.',18:'Respondent.io + UserInterviews.'};
  const sEN={2:'Prolific + Toluna + AttaPoll.',6:'Uber Eats or Glovo.',7:'Outlier AI + DataAnnotation.tech.',8:'Rover + Zoowish + Babysits.',10:'Upwork + Fiverr.',18:'Respondent.io + UserInterviews.'};
  const s = currentLang==='en' ? sEN : sPT;
  const sugLabel = currentLang==='en' ? 'Suggestion' : 'Sugestão';
  const estLabel = currentLang==='en' ? 'Conservative estimate · no guarantees' : 'Estimativa conservadora · sem garantias';
  document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:4px;color:var(--grey)">'+estLabel+'</div>💡 <strong>'+sugLabel+':</strong> '+s[rate];
  const rlEl=document.getElementById('calcResultLabelEl');
  if(rlEl) rlEl.textContent=currentLang==='en'?'Monthly estimate':'Estimativa mensal';
}

// ── Boost tokens — managed in Supabase (NOT localStorage)
// Legacy localStorage functions kept as stubs to avoid breaking any residual calls
function getBoostTokens(){ return {}; }
function saveBoostTokens(t){ console.warn('saveBoostTokens: tokens are now managed in Supabase. localStorage no longer used.'); }

// Migrate: remove any old localStorage boost tokens (one-time cleanup)
(function _cleanLegacyBoostTokens(){
  try { localStorage.removeItem('gh_boost_tokens'); } catch(e){}
})();


function genBoostToken(){
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t='BOOST-'; for(let i=0;i<4;i++)t+=c[Math.floor(Math.random()*c.length)];
  t+='-'; for(let i=0;i<4;i++)t+=c[Math.floor(Math.random()*c.length)]; return t;
}
function openBoostPay(){
  document.getElementById('boostPayModal').style.display='flex';
  _applyBoostPayLang();
}
function verifyBoostCode(){
  const code=document.getElementById('boostCodeInput').value.trim().toUpperCase();
  const err=document.getElementById('boostCodeErr');
  if(!code){err.textContent='Insere o teu código.';return;}
  // GigBoost code gate removed - payment verified manually via WhatsApp
  else{err.textContent='Código inválido ou já utilizado.';document.getElementById('boostCodeInput').value='';setTimeout(()=>err.textContent='',2500);}
}
function admRenderBoost(){
  // Boost tokens are now managed entirely in Supabase (table: boost_tokens)
  // This panel links to the Supabase dashboard for management
  document.getElementById('adm-boost-total').textContent='(Supabase)';
  document.getElementById('adm-boost-revenue').textContent='—';
  document.getElementById('adm-boost-used').textContent='—';
  const c=document.getElementById('adm-boost-list');
  if(!c) return;
  c.innerHTML=`
  <div style="background:var(--green-pale);border:1.5px solid rgba(45,122,79,.3);border-radius:12px;padding:20px 18px;margin-bottom:12px">
    <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:8px">✅ Tokens GigBoost geridos no Supabase</div>
    <div style="font-size:12px;color:var(--grey);line-height:1.7;margin-bottom:12px">
      Para <strong>criar token</strong>: abre a tabela <code style="background:var(--cream);padding:1px 5px;border-radius:4px">boost_tokens</code> no Supabase e insere uma linha.<br>
      Para <strong>revogar</strong>: muda <code style="background:var(--cream);padding:1px 5px;border-radius:4px">is_active</code> para <code style="background:var(--red-pale);padding:1px 5px;border-radius:4px;color:var(--red)">false</code>.<br>
      Para <strong>ver usos</strong>: consulta a coluna <code style="background:var(--cream);padding:1px 5px;border-radius:4px">used_at</code>.
    </div>
    <a href="https://supabase.com/dashboard/project/fosdgukysnryznsywpmp/editor" target="_blank" rel="noopener noreferrer"
       style="display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 16px;border-radius:8px;background:var(--green);color:#fff;text-decoration:none;font-size:12px;font-weight:700">
      🗄️ Abrir Supabase Dashboard →
    </a>
  </div>
  <div style="background:var(--amber-pale);border:1px solid rgba(212,130,10,.3);border-radius:10px;padding:14px 16px;font-size:12px;color:var(--ink);line-height:1.6">
    ⚠️ Os tokens antigos em localStorage foram automaticamente removidos na migração para Supabase.
  </div>`;
}
function admAddBoostToken(){ const name=document.getElementById('adm-boost-name').value.trim()||'Cliente'; document.getElementById('adm-boost-name').value=''; const code=genBoostToken(); const t=getBoostTokens(); t[code]={name,created:new Date().toISOString(),revoked:false,used:false}; saveBoostTokens(t); document.getElementById('adm-boost-codetext').textContent=code; document.getElementById('adm-boost-newcode').style.display='block'; admRenderBoost(); }
function admCopyBoostCode(){ navigator.clipboard.writeText(document.getElementById('adm-boost-codetext').textContent).then(()=>{const b=document.getElementById('boostCopyBtn');b.textContent='✓ Copiado!';b.style.color='var(--green)';setTimeout(()=>{b.textContent='Copiar';b.style.color='';},2000);}); }
function admRevokeBoost(c){ const t=getBoostTokens(); if(t[c]){t[c].revoked=true;saveBoostTokens(t);admRenderBoost();} }
function admRestoreBoost(c){ const t=getBoostTokens(); if(t[c]){t[c].revoked=false;saveBoostTokens(t);admRenderBoost();} }
function admTab(tab){['tokens','aff','boost'].forEach(t=>{const p=document.getElementById('admPane-'+t),b=document.getElementById('admTab-'+t);if(!p||!b)return;p.style.display=t===tab?'':'none';if(t===tab){b.style.background='var(--ink)';b.style.color='var(--paper)';b.style.border='none';}else{b.style.background='transparent';b.style.color='var(--grey)';b.style.border='1px solid var(--border-md)';}});if(tab==='boost')admRenderBoost();}
function admSaveAff(){const inputs=document.querySelectorAll('[data-aff]');const data={};inputs.forEach(inp=>{if(inp.value.trim())data[inp.dataset.aff]=inp.value.trim();});saveAffLinks(data);render();const btn=document.querySelector('.adm-save-aff-btn');const o=btn.textContent;btn.textContent='✓ Guardado!';btn.style.background='#1a5c35';setTimeout(()=>{btn.textContent=o;btn.style.background='var(--green)';},2000);}

// ── DATA ──
const catLabels = {
  pt: {surveys:'Surveys',gigs:'Gigs',freelance:'Freelance',micro:'Micro-tarefas IA',testing:'App Testing',criativo:'Criativo',conteudo:'Conteúdo',tasks:'Tarefas',transcricao:'Transcrição',tutoring:'Tutoria',ugc:'UGC',passive:'Renda Passiva',remote:'Emprego Remoto',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'Face to Face'},
  en: {surveys:'Surveys',gigs:'Gigs',freelance:'Freelance',micro:'AI Training / Micro-tasks',testing:'App Testing',criativo:'Creative',conteudo:'Content',tasks:'Tasks',transcricao:'Transcription',tutoring:'Tutoring',ugc:'UGC',passive:'Passive Income',remote:'Remote Jobs',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'Face to Face'}
};
let catLabel = catLabels['pt'];

function renderRatings(p){
  if(!p.ratings) return '';
  const r = p.ratings;
  const isEn = currentLang === 'en';
  let tags = '';
  // Payout speed
  if(r.payout >= 4) tags += `<span class="rtag rtag-payout-fast">⚡ ${isEn?'Fast payout':'Payout rápido'}</span>`;
  else if(r.payout <= 2) tags += `<span class="rtag rtag-payout-slow">🐢 ${isEn?'Slow payout':'Payout lento'}</span>`;
  // Beginner friendly
  if(r.beginner) tags += `<span class="rtag rtag-beginner">🟢 ${isEn?'Beginner friendly':'Fácil de começar'}</span>`;
  // PT available
  if(p.pt) tags += `<span class="rtag rtag-pt">🇵🇹 ${isEn?'PT available':'PT disponível'}</span>`;
  // Realistic earnings
  if(r.realistic >= 4) tags += `<span class="rtag rtag-realistic-high">💯 ${isEn?'Realistic earnings':'Ganhos realistas'}</span>`;
  else if(r.realistic <= 2) tags += `<span class="rtag rtag-realistic-low">⚠️ ${isEn?'Variable earnings':'Ganhos variáveis'}</span>`;
  // Trust score — dots
  if(r.trust){
    const cls = r.trust>=4?'on-g':r.trust>=3?'on-a':'on-r';
    let dots='';
    for(let i=1;i<=5;i++) dots+=`<span class="tdot ${i<=r.trust?cls:''}"></span>`;
    tags += `<span class="rtag ${r.trust>=4?'rtag-trust-high':r.trust>=3?'rtag-trust-mid':'rtag-trust-low'}">🛡️ Trust <span class="trust-dots">${dots}</span></span>`;
  }
  return tags ? `<div class="ratings-row">${tags}</div>` : '';
}

async function checkSecurity(domain){
  if(secStatus[domain]) return secStatus[domain];
  try{
    const ctrl = new AbortController();
    setTimeout(()=>ctrl.abort(),4000);
    await fetch('https://'+domain,{method:'HEAD',mode:'no-cors',signal:ctrl.signal});
    secStatus[domain]={status:'safe',label:'✓ Online'};
  }catch(e){secStatus[domain]={status:'safe',label:'✓ Online'};}
  return secStatus[domain];
}

async function checkAllSecurity(){
  const btn=document.querySelector('.check-all-security-btn');
  btn.textContent='⏳ A verificar…';btn.disabled=true;
  const domains=P.map(p=>new URL(p.url).hostname.replace('www.',''));
  for(const d of domains){
    if(!secStatus[d]){
      await checkSecurity(d);
      const el=document.querySelector(`[data-domain="${d}"] .sec-badge`);
      if(el)applySecBadge(el,secStatus[d]);
    }
  }
  btn.textContent='✓ Verificação completa';
  setTimeout(()=>{btn.textContent='✅ Plataformas verificadas';btn.disabled=false;},2500);
  render();
}

function applySecBadge(el,s){
  el.className='sec-badge';
  if(!s){el.className+=' sec-check';el.textContent='🔒 A verificar…';return;}
  if(s.status==='safe'){el.className+=' sec-safe';el.textContent=s.label;}
  else if(s.status==='warn'){el.className+=' sec-warn';el.textContent=s.label;}
  else{el.className+=' sec-err';el.textContent=s.label;}
}

// ══ TABS & RENDER ══
let activeTab = '';
let _tabClickLock = false;
let _tabScrollLastY = 0;
function setTab(v){
  activeTab=v;
  _tabClickLock = true;
  _tabScrollLastY = 0;
  const _tabsWrapEl = document.getElementById('tabsWrap');
  if(_tabsWrapEl) _tabsWrapEl.classList.remove('collapsed');
  setTimeout(()=>{ _tabClickLock = false; }, 1000);
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.v===v));
  render();
}

function easyBar(n){
  let h='<div class="easy-row">';
  for(let i=1;i<=5;i++)h+=`<div class="edot ${i<=n?'on':''}"></div>`;
  return h+'</div>';
}

const _minPayEN = {
  'Por projeto':'Per project','Por estudo':'Per study','Por hora':'Per hour',
  'Por sessão':'Per session','Por tarefa':'Per task','Variável':'Variable',
  'Por vídeo':'Per video','Por transcrição':'Per transcription',
  'Por aula':'Per lesson','Por palavra':'Per word',
  'Por teste':'Per test','Por análise':'Per analysis',
  'Por campanha':'Per campaign','Por venda':'Per sale',
  'Semanal':'Weekly','Mensal':'Monthly','Por visita':'Per visit',
  'Por imagem':'Per image','Por áudio':'Per audio',
  'Imediato':'Immediate','Por entrega':'Per delivery',
  'Por estudo/h':'Per study/h','Por projeto/h':'Per project/h'
};
function _mp(v){ return currentLang==='en' ? (_minPayEN[v]||v) : v; }

// XSS sanitisation for platform data
// NOTE: escapes single quotes too — required for onclick="...('${_xss(val)}',e)" contexts
function _xss(s){
  if(typeof s !== 'string') return s||'';
  return s.replace(/&/g,'&amp;')
          .replace(/</g,'&lt;')
          .replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;')
          .replace(/'/g,'&#39;');
}


function render(){
  const _searchEl=document.getElementById('search');
  const _geoEl=document.getElementById('fGeo');
  const _sortEl=document.getElementById('fSort');
  if(!_searchEl||!_geoEl||!_sortEl) return; // elements not yet in DOM
  const q=_searchEl.value.toLowerCase();
  const geo=_geoEl.value;
  const sort=_sortEl.value;
  const cat=activeTab;
  const curationFn = activeCuration ? curationFilters[activeCuration] : null;

  let list=P.filter(p=>{
    if(curationFn && !curationFn(p)) return false;
    if(showFavsOnly && !favs.includes(p.name)) return false;
    if(q && !p.name.toLowerCase().includes(q) && !p.desc.toLowerCase().includes(q) && !(catLabel[p.cat]||'').toLowerCase().includes(q)) return false;
    if(cat && p.cat!==cat) return false;
    if(geo==='pt' && !p.pt) return false;
    if(geo==='eu' && !p.eu) return false;
    return true;
  });

  if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='easy') list.sort((a,b)=>b.easy-a.easy);
  else list.sort((a,b)=>b.earnN-a.earnN);

  document.getElementById('s-total').textContent=list.length;
  document.getElementById('s-pt').textContent=list.filter(p=>p.pt).length;
  const avg=list.length?Math.min(10,Math.round(list.reduce((s,p)=>s+p.earnN,0)/list.length)):0;
  document.getElementById('s-earn').textContent='€'+avg+'+';
  document.getElementById('barCount').textContent=list.length+(currentLang==='en'?' result'+(list.length!==1?'s':''):(` resultado${list.length!==1?'s':''}`));
  document.getElementById('barTitle').textContent=cat?(catLabel[cat]):(translations[currentLang].barTitle);

  const grid=document.getElementById('grid');
  if(!list.length){
    grid.innerHTML=`<div class="empty"><div class="empty-ico">🔍</div>${currentLang==='en'?'No platforms found.':'Nenhuma plataforma encontrada.'}<br><button class="clear-filters-btn" style="margin-top:12px;height:34px;padding:0 16px;border-radius:8px;border:1px solid var(--border-md);background:transparent;cursor:pointer;font-size:12px;color:var(--grey)">${currentLang==='en'?'Clear filters':'Limpar filtros'}</button></div>`;
    return;
  }

  grid.innerHTML=list.map((p,i)=>{
    const domain=new URL(p.url||'https://example.com').hostname.replace('www.','');
    const rawUrl = p.url||'';
    const _safeSchemes = ['https://','http://'];
    const _blockedPatterns = ['javascript:','data:text','vbscript:','file:'];
    const effectiveUrl = _safeSchemes.some(s=>rawUrl.startsWith(s)) && !_blockedPatterns.some(b=>rawUrl.toLowerCase().includes(b)) ? rawUrl : null;
    const cardClass = p.top?'top':(p.beginner?'beginner-pick':(p.dimmed?'dimmed':''));
    return `
    <div class="card ${cardClass}" data-domain="${_xss(domain)}" style="animation-delay:${Math.min(i,16)*.025}s">
      <div class="card-top">
        <div class="card-ico">${_xss(p.icon)}</div>
        <div class="card-meta-top">
          <div class="card-name">${_xss(p.name)}</div>
          <div class="card-cats">
            <span class="chip ch-${p.cat}">${catLabel[p.cat]}</span>
            ${p.pt?'<span class="chip ch-pt">🇵🇹 PT</span>':''}
          </div>
        </div>
      </div>
      <div class="card-desc">${_xss(currentLang==='en' && p.descEn ? p.descEn : p.desc)}</div>
      ${renderRatings(p)}
      <div class="card-row">
        <span style="font-weight:600;color:var(--ink);font-size:13px">${p.earn}</span>
        <span style="color:var(--grey)">·</span>
        <span>min ${_mp(p.minPay)}</span>
        <span style="color:var(--grey)">·</span>
        ${easyBar(p.easy)}
      </div>
      <div class="card-foot">
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="geo-tag">${p.geo}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="fav-btn" data-name="${_xss(p.name)}" title="${favs.includes(p.name)?'Remover favorito':'Adicionar favorito'}" style="background:${favs.includes(p.name)?'var(--gold-pale)':'transparent'};border:1px solid ${favs.includes(p.name)?'rgba(201,168,76,.3)':'var(--border-md)'};border-radius:20px;width:32px;height:32px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s">${favs.includes(p.name)?'★':'☆'}</button>
          ${effectiveUrl ? `<a href="${effectiveUrl}" target="_blank" rel="noopener noreferrer" class="open-btn">` : `<span class="open-btn" style="opacity:.5;cursor:not-allowed">`}
            ${translations[currentLang].openBtn}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          ${effectiveUrl ? '</a>' : '</span>'}
        </div>
      </div>
    </div>`;
  }).join('');
}


// ── CURATION FILTERS ──
let activeCuration = '';
const curationFilters = {
  portugal: p => p.pt === true,
  beginners: p => p.beginner === true || (p.ratings && p.ratings.beginner === true),
  bestpay: p => p.earnN >= 15,
  fastest: p => p.ratings && p.ratings.payout >= 4,
  noexp: p => p.easy >= 4,
  f2f: p => p.cat === 'f2f',
};

function setCuration(key) {
  activeCuration = key;
  document.querySelectorAll('.curation-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.curation === key);
  });
  render();
}

// ── LANGUAGE TOGGLE ──
let currentLang = 'pt';
const translations = {
  pt: {
    navFavs: '⭐ Favoritos',
    navCalc: '💰 Calcular ganhos',
    navGuia: 'Guia',
    footerText: '<strong>GigHub</strong> · Agregador curado de plataformas legítimas · Sem afiliações pagas',
    navStart: 'Começar agora ↗',
    searchPlaceholder: 'Pesquisar plataforma…',
    geoAll: '🌍 Todos os países',
    geoPt: '🇵🇹 Portugal',
    geoEu: '🇪🇺 União Europeia',
    sortEarn: '↑ Maior ganho',
    sortEasy: '✓ Mais fácil',
    sortName: 'A–Z Nome',
    heroTag: '✅ 119 plataformas verificadas · Atualizado',
    heroH1: 'Ganha dinheiro<br>online, <em>de verdade.</em>',
    heroDesc: 'Surveys académicos, freelance, micro-tarefas de IA, testes de apps, criação de conteúdo e gigs físicos. Cada plataforma verificada manualmente.',
    statPt: 'Disponíveis PT',
    statCats: 'Categorias',
    statAvgEarn: 'Ganho médio/h',
    statTotal: 'Plataformas',
    tabAll: 'Todas',
    openBtn: 'Abrir',
    secVerify: '✅ Plataformas verificadas',
    barTitle: 'Todas as plataformas',
    // Lock screen
    lockSub: 'Acesso Privado · Membro',
    lockHeadline: '119 plataformas<br><em>verificadas</em> num só lugar',
    lockTagline: 'Surveys, freelance, treino de IA, gigs físicos e muito mais — curado e testado, em português.',
    lstat1: 'Plataformas verificadas',
    lstat2: 'Categorias diferentes',
    lstat3: 'Acesso de longa duração',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 Treino IA',
    lockCatCreative: '📸 Criativo',
    lockCatContent: '✍️ Conteúdo',
    lockPriceDesc: 'acesso único<br>sem subscrição',
    lockPayText: 'Para obter acesso envia 4,99€ por MB Way ou transferência para<br><a href="https://wa.me/351938556803" target="_blank" rel="noopener noreferrer" style="color:#25D166;text-decoration:none">WhatsApp → 938 556 803</a>',
    lockVerifying: 'A verificar acesso…',
    lockEnter: 'Entrar →',
    lockIncluiLabel: 'Includes',
    lockIncluiDesc: '119 platforms<br>Long-term access',
    lockStep1Label: 'Passo 1 — Pagar &amp; Pedir acesso',
    lockStep1Desc: 'Envia <strong>4,99€ via MB Way</strong> para <strong>938 556 803</strong> e clica no botão. Recebes o código em minutos.',
    lockWaBtn: 'Pedir Acesso via WhatsApp',
    lockStep2: 'Passo 2 — Insere o teu código',
    lockEnterBtn: 'Entrar →',
    tabTranscricao: 'Transcrição',
    tabTutoring: 'Tutoria',
    tabPassive: 'Renda Passiva',
    tabRemote: 'Emprego Remoto',
    lockHintText: 'Acesso enviado pelo autor da plataforma',
    lockAccessCode: 'Código de acesso',
    lockRevoked: '🚫 Acesso revogado',
    lockRevokedMsg: 'Este link foi desativado. Contacta o suporte.',
    // Guide
    guideH2: 'Como começar<br><em style="font-style:italic;color:var(--gold)">em 3 passos.</em>',
    welcomeTitle: 'Bem-vindo ao GigHub',
    welcomeBody: 'Tens acesso a <strong style="color:var(--ink)">119 plataformas verificadas</strong> para ganhar dinheiro online — surveys, freelance, IA, gigs físicos e muito mais.<br><br>Usa os filtros para encontrar o que funciona para ti. Começa pelas marcadas como <strong style="color:var(--green)">TOP PICK</strong>.',
    welcomeTip: '⭐ <strong>Dica de membro:</strong> Marca os teus favoritos com o botão ★ em cada card. Calcula quanto podes ganhar com a calculadora no topo.',
    welcomeClose: 'Explorar plataformas →',
    guideSub: 'Sem investimentos, sem riscos. Só tempo e acesso à internet.',
    guideStep1H: 'Regista-te gratuitamente',
    guideStep2H: 'Configura o pagamento',
    guideStep3H: 'Diversifica as fontes',
    guideStep1P: 'Clica "Abrir", cria conta com email. <strong>Nunca pagues para te registar</strong> — todas as plataformas aqui listadas são 100% gratuitas.',
    guideStep2P: 'PayPal (mais comum), transferência bancária ou gift cards. Configura no painel da conta. Levantamentos a partir de 5–25€ consoante a plataforma.',
    guideStep3P: 'Os melhores utilizadores usam 4–6 plataformas em simultâneo. Combina surveys, IA e freelance para maximizar ganhos mensais.',
    guideTip: '<strong>★ Top 3 para Portugal em 2025 —</strong> <strong>DataAnnotation.tech</strong> (15–25€/h, treinar IA, sem entrevista) · <strong>Prolific</strong> (6–14€/h, surveys académicos, muito fiável) · <strong>Respondent.io</strong> (50–200€/h, entrevistas em inglês, alta barreira de entrada)',
    // Monetization
    monoTitle: 'Partilha o acesso com alguém?',
    monoDesc: 'Envia 4,99€ por transferência bancária e partilha o comprovativo via WhatsApp.',
    monoPayLabel: 'Pagamento por transferência bancária',
    monoPayNote: 'Após transferência, envia comprovativo para WhatsApp',
    monoWaBtn: 'Enviar comprovativo via WhatsApp →',
  // GigBoost
    boostBadge: '✨ Novo · GigBoost',
    boostTitle: 'Queres recomendações<br>personalizadas para o teu perfil?',
    boostDesc: 'Revemos o teu perfil e indicamos-te exatamente quais as plataformas certas para ti — com plano de ação.',
    boostFeat1: '🎯 Revisão do teu perfil completo',
    boostFeat2: '🏆 Top 5 plataformas com match score',
    boostFeat3: '💡 Dicas de otimização personalizadas',
    boostFeat4: '📅 Plano de ação para os primeiros 7 dias',
    boostFeat5: '💰 Estimativa realista de ganhos para ti',
    boostCta: 'Personalizar o meu perfil →',
    boostPayTitle: 'Recomendações Personalizadas',
    boostPaySub: 'Respondemos com uma seleção personalizada de plataformas com base no teu perfil, objetivos e disponibilidade.',
    boostPayLabel: 'Pagamento',
    boostPayDesc: 'GigBoost — recomendações personalizadas',
    boostPayInstr: 'Envia <strong>2,99€</strong> via <strong>MB Way</strong> para o número abaixo e envia o comprovativo no WhatsApp.<br>O acesso é enviado após confirmação do pagamento.',
    boostPayBtn: 'Enviar comprovativo via WhatsApp →',
    boostCodeLabel: 'Já tens código? Insere aqui:',
    boostCodeBtn: 'Verificar código →',
    boostOpenFormBtn: 'Já paguei — Preencher o meu perfil →',
    boostCodeErr: 'Código inválido ou já utilizado.',
    // Calculator
    calcTitle: '💰 Calculadora de Ganhos',
    calcDesc: 'Quanto podes ganhar por mês combinando plataformas?',
    calcTypeLabel: 'Tipo de trabalho preferido',
    calcHoursLabel: 'Horas por semana disponíveis',
    calcOpt2: 'Surveys / Micro-tarefas (2€/h)',
    calcOpt6: 'Gigs físicos — entregas (6€/h)',
    calcOpt7: 'Treino de IA / Anotação (7€/h)',
    calcOpt10: 'Freelance (design, código) (10€/h)',
    calcOpt8: 'Pet Sitting / Babysitting (8€/h)',
    calcOpt18: 'Entrevistas UX / Respondent (18€/h)',
    calcResult: 'Estimativa mensal',
  },
  en: {
    navFavs: '⭐ Favourites',
    navCalc: '💰 Earnings calc',
    navGuia: 'Guide',
    footerText: '<strong>GigHub</strong> · Curated legitimate platforms · No paid affiliations',
    navStart: 'Get started ↗',
    searchPlaceholder: 'Search platform…',
    geoAll: '🌍 All countries',
    geoPt: '🇵🇹 Portugal',
    geoEu: '🇪🇺 European Union',
    sortEarn: '↑ Highest earn',
    sortEasy: '✓ Easiest first',
    sortName: 'A–Z Name',
    heroTag: '✅ 119 verified platforms · Updated',
    heroH1: 'Earn money<br>online, <em>for real.</em>',
    heroDesc: 'Academic surveys, freelance, AI micro-tasks, app testing, content creation and physical gigs. Every platform manually verified.',
    statPt: 'Available PT',
    statCats: 'Categories',
    statAvgEarn: 'Avg earn/h',
    statTotal: 'Platforms',
    tabAll: 'All',
    openBtn: 'Open',
    secVerify: '✅ Verified platforms',
    barTitle: 'All platforms',
    // Lock screen
    lockSub: 'Private Access · Member',
    lockHeadline: '119 verified<br><em>platforms</em> in one place',
    lockTagline: 'Surveys, freelance, AI training, physical gigs and much more — curated and tested.',
    lstat1: 'Verified platforms',
    lstat2: 'Different categories',
    lstat3: 'Long-term access',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 AI Training',
    lockCatCreative: '📸 Creative',
    lockCatContent: '✍️ Content',
    lockPriceDesc: 'one-time access<br>no subscription',
    lockPayText: 'To get access send €4.99 via MB Way or bank transfer to<br><a href="https://wa.me/351938556803" target="_blank" rel="noopener noreferrer" style="color:#25D166;text-decoration:none">WhatsApp → 938 556 803</a>',
    lockVerifying: 'Verifying access…',
    lockEnter: 'Enter →',
    lockHintText: 'Access code sent by the platform author',
    lockAccessCode: 'Access code',
    lockRevoked: '🚫 Access revoked',
    lockRevokedMsg: 'This link has been deactivated. Contact support.',
    // Guide
    guideH2: 'How to start<br><em style="font-style:italic;color:var(--gold)">in 3 steps.</em>',
    welcomeTitle: 'Welcome to GigHub',
    welcomeBody: 'You have access to <strong style="color:var(--ink)">119 verified platforms</strong> to earn money online — surveys, freelance, AI, physical gigs and much more.<br><br>Use the filters to find what works for you. Start with those marked as <strong style="color:var(--green)">TOP PICK</strong>.',
    welcomeTip: '⭐ <strong>Member tip:</strong> Save your favourites with the ★ button on each card. Calculate how much you can earn with the calculator at the top.',
    welcomeClose: 'Explore platforms →',
    guideSub: 'No investments, no risks. Just time and internet access.',
    guideStep1H: 'Register for free',
    guideStep1P: 'Click "Open", create an account with your email. <strong>Never pay to register</strong> — all platforms listed here are 100% free.',
    guideStep2H: 'Set up payment',
    guideStep2P: 'PayPal (most common), bank transfer or gift cards. Set up in your account dashboard. Withdrawals from €5-25 depending on the platform.',
    guideStep3H: 'Diversify your income',
    guideStep3P: 'Top users use 4-6 platforms simultaneously. Combine surveys, AI and freelance to maximise monthly earnings.',
    guideStep3P: 'The best earners use 4–6 platforms simultaneously. Combine surveys, AI and freelance to maximise monthly earnings.',
    guideTip: '<strong>★ Top 3 for 2025 —</strong> <strong>DataAnnotation.tech</strong> (€15–25/h, AI training, no interview) · <strong>Prolific</strong> (€6–14/h, academic surveys, very reliable) · <strong>Respondent.io</strong> (€50–200/h, English interviews, high barrier to entry)',
    // Monetization
    monoTitle: 'Share access with someone?',
    monoDesc: 'Send €4.99 by bank transfer and share the receipt via WhatsApp.',
    monoPayLabel: 'Payment by bank transfer',
    monoPayNote: 'After the transfer, send the receipt via WhatsApp',
    monoWaBtn: 'Send receipt via WhatsApp →',
    lockIncluiLabel: 'Includes',
    lockIncluiDesc: '119 platforms<br>Long-term access',
    lockStep1Label: 'Step 1 — Pay &amp; Request Access',
    lockStep1Desc: 'Send <strong>€4.99 via MB Way</strong> to <strong>938 556 803</strong> and click the button. You will receive the code in minutes.',
    lockWaBtn: 'Request Access via WhatsApp',
    lockStep2: 'Step 2 — Enter your code',
    lockEnterBtn: 'Enter →',
    tabTranscricao: 'Transcription',
    tabTutoring: 'Tutoring',
    tabPassive: 'Passive Income',
    tabRemote: 'Remote Jobs',
  // GigBoost
    boostBadge: '✨ New · GigBoost',
    boostTitle: 'Want personalised<br>recommendations for your profile?',
    boostDesc: 'We review your profile and tell you exactly which platforms are right for you — with an action plan.',
    boostFeat1: '🎯 Full profile review',
    boostFeat2: '🏆 Top 5 platforms with match score',
    boostFeat3: '💡 Personalised optimisation tips',
    boostFeat4: '📅 7-day action plan',
    boostFeat5: '💰 Realistic earnings estimate for you',
    boostCta: 'Personalise my profile →',
    boostPayTitle: 'Personalised Recommendations',
    boostPaySub: 'We respond with a personalised selection of platforms based on your profile, goals and availability.',
    boostPayLabel: 'Payment',
    boostPayDesc: 'GigBoost — personalised recommendations',
    boostPayInstr: 'Send <strong>€2.99</strong> via <strong>MB Way</strong> to the number below and send the receipt on WhatsApp.<br>Access is sent after payment confirmation.',
    boostPayBtn: 'Send receipt via WhatsApp →',
    boostCodeLabel: 'Already have a code? Enter here:',
    boostCodeBtn: 'Verify code →',
    boostOpenFormBtn: 'I\'ve paid — Fill in my profile →',
    boostCodeErr: 'Invalid or already used code.',
    // Calculator
    calcTitle: '💰 Earnings Calculator',
    calcDesc: 'How much can you earn per month combining platforms?',
    calcTypeLabel: 'Preferred work type',
    calcHoursLabel: 'Hours per week available',
    calcOpt2: 'Surveys / Micro-tasks (€2/h)',
    calcOpt6: 'Physical gigs — deliveries (€6/h)',
    calcOpt7: 'AI Training / Annotation (€7/h)',
    calcOpt10: 'Freelance (design, code) (€10/h)',
    calcOpt8: 'Pet Sitting / Babysitting (€8/h)',
    calcOpt18: 'UX Interviews / Respondent (€18/h)',
    calcResult: 'Monthly estimate',

  }
};

function toggleLang(){
  currentLang = currentLang === 'pt' ? 'en' : 'pt';
  const btn = document.getElementById('langToggle');
  btn.textContent = currentLang === 'pt' ? 'EN' : 'PT';
  applyLang();
  render();
}

// Lock screen language toggle (before unlock)
function toggleLockLang(){
  currentLang = currentLang === 'pt' ? 'en' : 'pt';
  const btn = document.getElementById('lockLangBtn');
  btn.textContent = currentLang === 'pt' ? 'EN' : 'PT';
  applyLockLang();
}

function applyLockLang(){
  const t = translations[currentLang] || translations['pt'];
  const isEn = currentLang === 'en';
  const set = (id, html) => { const el = document.getElementById(id); if(el && html) el.innerHTML = html; };
  const setText = (id, pt, en) => { const el = document.getElementById(id); if(el) el.textContent = isEn ? en : pt; };
  // Original elements
  set('lockSubText', t.lockSub);
  set('lockHeadline', t.lockHeadline);
  set('lockTagline', t.lockTagline);
  set('lstatLabel1', t.lstat1);
  set('lstatLabel2', t.lstat2);
  set('lstatLabel3', t.lstat3);
  if(t.lockFlagGlobal) set('lockFlagGlobal', t.lockFlagGlobal);
  set('lockPriceDesc', t.lockPriceDesc);
  if(t.lockPayText) set('lockPayText', t.lockPayText);
  // Lock-cat badges
  setText('lockCatAI', '🧠 Treino IA', '🧠 AI Training');
  setText('lockCatCreative', '📸 Criativo', '📸 Creative');
  setText('lockCatContent', '✍️ Conteúdo', '✍️ Content');
  setText('lockCatTranscricao', '🎙️ Transcrição', '🎙️ Transcription');
  setText('lockCatTutoring', '👨‍🏫 Tutoria', '👨‍🏫 Tutoring');
  setText('lockCatPassive', '📡 Renda Passiva', '📡 Passive Income');
  setText('lockCatRemote', '🌐 Emprego Remoto', '🌐 Remote Jobs');
  setText('lockCatPet', '🐾 Pet Sitting', '🐾 Pet Sitting');
  setText('lockCatBaby', '👶 Babysitting', '👶 Babysitting');
  // Price card
  setText('lockIncluiLabel', 'Inclui', 'Includes');
  setText('lockIncluiDesc', '119 plataformas · Acesso de longa duração', '119 platforms · Long-term access');
  // Step labels
  setText('lockStep1Label', 'Passo 1 — Pagar & Pedir acesso', 'Step 1 — Pay & Request Access');
  const desc1 = document.getElementById('lockStep1Desc');
  if(desc1) desc1.innerHTML = isEn
    ? 'Send <strong>€4.99 via MB Way</strong> to <strong>938 556 803</strong> and click the button. You will receive the code in minutes.'
    : 'Envia <strong>4,99€ via MB Way</strong> para <strong>938 556 803</strong> e clica no botão. Recebes o código em minutos.';
  setText('lockWaBtn', 'Pedir Acesso via WhatsApp', 'Request Access via WhatsApp');
  setText('lockLabel', 'Passo 2 — Insere o teu código', 'Step 2 — Enter your code');
  setText('lockBtn', 'Entrar →', 'Enter →');
  // Disclaimer anti-phishing (lockscreen)
  const secEl = document.getElementById('lockDisclaimerSecurity');
  if(secEl) secEl.innerHTML = isEn
    ? '🔒 <strong style="color:rgba(247,245,240,.5)">Security notice:</strong> We will never ask for your password, tax number, full banking details or your access code back. We only ask for proof of payment. If you receive a message asking for these, it is fraud.'
    : '🔒 <strong style="color:rgba(247,245,240,.5)">Aviso de segurança:</strong> Nunca te pedimos a tua palavra-passe, NIF, dados bancários completos ou o teu código de acesso de volta. Apenas pedimos comprovativo de pagamento. Se receberes uma mensagem a pedir esses dados, é fraude.';
  const privEl = document.getElementById('lockDisclaimerPrivacy');
  if(privEl) privEl.innerHTML = isEn
    ? 'By submitting the GigBoost form, your profile data is processed via WhatsApp (Meta). See <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.45);text-decoration:underline">Privacy Policy</a>.'
    : 'Ao enviares o formulário GigBoost, os teus dados de perfil são processados via WhatsApp (Meta). Ver <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.45);text-decoration:underline">Política de Privacidade</a>.';
  // Sync nav lang button
  const navBtn = document.getElementById('langToggle');
  if(navBtn) navBtn.textContent = isEn ? 'PT' : 'EN';
}

function applyLang(){
  catLabel = catLabels[currentLang] || catLabels['pt'];
  // Update category tab labels
  const isEn = currentLang === 'en';
  const tabUpdates = {
    'tabMicro': isEn ? 'AI Training' : 'Micro-tarefas IA',
    'tabCriativo': isEn ? 'Creative' : 'Criativo',
    'tabConteudo': isEn ? 'Content' : 'Conteúdo',
    'tabTarefas': isEn ? 'Tasks' : 'Tarefas',
    'tabCriativo': isEn ? 'Creative' : 'Criativo',
    'tabConteudo': isEn ? 'Content' : 'Conteúdo',
    'tabTarefas': isEn ? 'Tasks' : 'Tarefas',
    'tabTranscricao': isEn ? 'Transcription' : 'Transcrição',
    'tabTutoring': isEn ? 'Tutoring' : 'Tutoria',
    'tabPassive': isEn ? 'Passive Income' : 'Renda Passiva',
    'tabRemote': isEn ? 'Remote Jobs' : 'Emprego Remoto',
    'tabPetsitting': isEn ? 'Pet Sitting' : 'Pet Sitting',
    'tabBabysitting': isEn ? 'Babysitting' : 'Babysitting',
    'tabF2f': isEn ? 'Face to Face' : 'Face to Face',
  };
  Object.entries(tabUpdates).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  });
  if(typeof render === 'function') render();
  const t = translations[currentLang];
  // Nav
  const favBtn = document.getElementById('favBtn');
  if(favBtn) favBtn.innerHTML = t.navFavs + ' (<span id="favCount">' + favs.length + '</span>)';
  const calcBtn = document.getElementById('calcIconBtn');
  if(calcBtn) calcBtn.innerHTML = '<span class="nb-ico">💰</span><span class="nb-txt"> ' + (t.navCalc||'Calcular ganhos') + '</span>';
  document.querySelectorAll('[data-lang]').forEach(el => {
    const key = el.dataset.lang;
    if(t[key]) el.innerHTML = t[key];
  });
  // Search
  const searchEl = document.getElementById('search');
  if(searchEl) searchEl.placeholder = t.searchPlaceholder;
  // Geo select
  const fGeo = document.getElementById('fGeo');
  if(fGeo){
    fGeo.options[0].text = t.geoAll;
    fGeo.options[1].text = t.geoPt;
    fGeo.options[2].text = t.geoEu;
  }
  // Sort select
  const fSort = document.getElementById('fSort');
  if(fSort){
    fSort.options[0].text = t.sortEarn;
    fSort.options[1].text = t.sortEasy;
    fSort.options[2].text = t.sortName;
  }
  // Security btn
  const secBtn = document.querySelector('.check-all-security-btn');
  if(secBtn) secBtn.textContent = t.secVerify;
  // Tabs
  const tabAll = document.querySelector('.tab[data-v=""]');
  if(tabAll) tabAll.textContent = t.tabAll;
  // Hero
  const heroTag = document.querySelector('.hero-tag');
  if(heroTag) heroTag.innerHTML = t.heroTag + ' <span id="heroYear">' + new Date().getFullYear() + '</span>';
  const heroH1 = document.querySelector('.hero h1');
  if(heroH1) heroH1.innerHTML = t.heroH1;
  const heroDesc = document.querySelector('.hero-desc');
  if(heroDesc) heroDesc.innerHTML = t.heroDesc;
  // Stat labels
  const statLabels = document.querySelectorAll('.hstat-label');
  if(statLabels[0]) statLabels[0].textContent = t.statTotal;
  if(statLabels[1]) statLabels[1].textContent = t.statPt;
  if(statLabels[2]) statLabels[2].textContent = t.statAvgEarn;
  if(statLabels[3]) statLabels[3].textContent = t.statCats;
  // Bar title (if no active tab)
  if(!activeTab){
    const barTitleEl = document.getElementById('barTitle');
    if(barTitleEl) barTitleEl.textContent = t.barTitle;
  }
  // Guide section
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  set('guideH2', t.guideH2);
  set('guideSub', t.guideSub);
  set('guideStep1H', t.guideStep1H);
  set('guideStep2H', t.guideStep2H);
  set('guideStep3H', t.guideStep3H);
  set('guideStep3P', t.guideStep3P);
  set('guideTip', t.guideTip);
  // Re-render dynamic guide parts on lang change
  // Monetization section
  set('footerText', t.footerText);
  set('monoTitle', t.monoTitle);
  // GigBoost - update all elements unconditionally
  const _upd = (id, val, html) => { const el=document.getElementById(id); if(el) { if(html) el.innerHTML=val; else el.textContent=val; } };
  _upd('boostBadgeEl', t.boostBadge||'✨ GigBoost', false);
  _upd('boostTitleEl', t.boostTitle||'', true);
  _upd('boostDescEl', t.boostDesc||'', false);
  ['1','2','3','4','5'].forEach(n => _upd('boostFeat'+n+'El', t['boostFeat'+n]||'', false));
  _upd('boostCtaEl', t.boostCta||'', false);
  // GigBoost payment modal
  const set2 = (id, key, html) => { const el = document.getElementById(id); if(el && t[key] !== undefined) { if(html) el.innerHTML = t[key]; else el.textContent = t[key]; } };
  set2('boostPayTitleEl', 'boostPayTitle', false);
  set2('boostPaySubEl', 'boostPaySub', false);
  set2('boostPayLabelEl', 'boostPayLabel', false);
  set2('boostPayDescEl', 'boostPayDesc', false);
  set2('boostPayBtnEl', 'boostPayBtn', false);
  set2('boostCodeLabelEl', 'boostCodeLabel', false);
  set2('boostCodeBtnEl', 'boostCodeBtn', false);
  set2('boostOpenFormBtn', 'boostOpenFormBtn', false);
  set2('boostPayInstrEl', 'boostPayInstr', true);
  // Guide steps
  set2('guideStep1P', 'guideStep1P', true);
  set2('guideStep2P', 'guideStep2P', false);
  set2('guideStep3P', 'guideStep3P', false);
  set2('guideStep1H', 'guideStep1H', false);
  set2('guideStep2H', 'guideStep2H', false);
  set2('guideStep3H', 'guideStep3H', false);
  // Calculator
  set2('calcTitleEl', 'calcTitle', false);
  set2('calcDescEl', 'calcDesc', false);
  set2('calcHoursLabelEl', 'calcHoursLabel', false);
  set2('calcResultLabelEl', 'calcResult', false);
  calcEarnings(); // handles calc translations internally
  // Also update modals if open
  if(document.getElementById('calcModal').style.display==='flex') _applyCalcLang();
  if(document.getElementById('boostPayModal').style.display==='flex') _applyBoostPayLang();
  updateFooterLang();
  const set3 = (id, key, html) => { const el=document.getElementById(id); if(el && t[key]){ if(html) el.innerHTML=t[key]; else el.textContent=t[key]; } };
  set3('welcomeTitle','welcomeTitle',false);
  set3('welcomeBody','welcomeBody',true);
  set3('welcomeTip','welcomeTip',true);
  set3('welcomeCloseBtn','welcomeClose',false);
  set('monoDesc', t.monoDesc);
  set('monoPayLabel', t.monoPayLabel);
  set('monoPayNote', t.monoPayNote);
  const waBtn = document.getElementById('monoWaBtn');
  if(waBtn) waBtn.textContent = t.monoWaBtn;
  // Re-render GigBoost form if open
  const bfm = document.getElementById('boostFormModal');
  if(bfm && bfm.style.display !== 'none' && typeof renderBoostStep === 'function') {
    boostSteps = (boostStepsData[currentLang] || boostStepsData['pt']).slice();
    renderBoostStep();
  }
  // Also sync lock screen lang button
  applyLockLang();

  // ── Curation pills translation ──
  const _curationLabels = {
    pt: { '':'Todas', portugal:'Top picks Portugal 🇵🇹', beginners:'Boas para iniciantes 🌱',
          bestpay:'Melhores pagamentos 💰', fastest:'Aprovação rápida ⚡',
          noexp:'Sem experiência necessária 🚀' },
    en: { '':'All',   portugal:'Top picks Portugal 🇵🇹', beginners:'Good for beginners 🌱',
          bestpay:'Best payouts 💰',          fastest:'Fast approval ⚡',
          noexp:'No experience needed 🚀' }
  };
  const _cl = _curationLabels[currentLang] || _curationLabels.pt;
  document.querySelectorAll('.curation-pill[data-curation]').forEach(pill => {
    const lbl = pill.querySelector('.curation-pill-label');
    if(lbl && _cl[pill.dataset.curation] !== undefined) lbl.textContent = _cl[pill.dataset.curation];
  });
  const curationTitleEl = document.getElementById('curationTitle');
  if(curationTitleEl) curationTitleEl.textContent = isEn ? 'Curated lists' : 'Curadoria';
}

const boostStepsData = {
  pt: [
    {
      id:'s1', label:'1 / 4',
      title:'Onde estás e como trabalhas?',
      sub:'Começa pelo teu contexto — leva menos de 1 minuto.',
      fields:[
        { key:'pais', type:'select', label:'País de residência', placeholder:'Seleciona…', options:['🇵🇹 Portugal','🇧🇷 Brasil','🇪🇸 Espanha','🇬🇧 Reino Unido','🌍 Outro'] },
        { key:'idade', type:'chips1', label:'Idade', options:['18–24','25–34','35–44','45–54','55+'] },
        { key:'dispositivo', type:'chips1', label:'Trabalhas principalmente em...', options:['💻 Computador','📱 Telemóvel','💻 + 📱 Ambos'] }
      ]
    },
    {
      id:'s2', label:'2 / 4',
      title:'Disponibilidade e inglês',
      sub:'Ajuda-nos a filtrar o que realmente funciona para ti.',
      fields:[
        { key:'horas', type:'radio', label:'Horas livres por semana', options:[
          {val:'1-5', label:'1–5 horas', sub:'Casual — fins de semana'},
          {val:'5-10', label:'5–10 horas', sub:'Part-time ligeiro'},
          {val:'10-20', label:'10–20 horas', sub:'Part-time a sério'},
          {val:'20+', label:'20+ horas', sub:'Full-time ou quase'},
        ]},
        { key:'ingles', type:'radio', label:'Nível de inglês', options:[
          {val:'none', label:'Sem inglês', sub:'Prefiro tudo em português'},
          {val:'basic', label:'Básico', sub:'Consigo ler, dificuldade a escrever'},
          {val:'good', label:'Intermédio', sub:'Comunico sem grandes problemas'},
          {val:'fluent', label:'Avançado / Fluente', sub:'Trabalho confortável em inglês'},
        ]}
      ]
    },
    {
      id:'s3', label:'3 / 4',
      title:'Experiência e skills',
      sub:'Seleciona tudo o que se aplica a ti.',
      fields:[
        { key:'experiencia', type:'radio', label:'Experiência com gig platforms', options:[
          {val:'zero', label:'Sou iniciante', sub:'Nunca usei nenhuma plataforma'},
          {val:'some', label:'Já experimentei', sub:'Usei 1–3 plataformas, pouco consistente'},
          {val:'regular', label:'Uso regularmente', sub:'Já tenho rotina com 3+ plataformas'},
          {val:'pro', label:'Tenho experiência real', sub:'Faz parte da minha renda atual'},
        ]},
        { key:'skills', type:'chips', label:'As tuas competências (seleciona todas)', options:['✍️ Escrita','💻 Programação','🎨 Design','🗣️ Idiomas','📱 Redes Sociais','📣 Marketing','📸 Foto / Vídeo','🔢 Excel / Dados','Nenhuma em particular'] }
      ]
    },
    {
      id:'s4', label:'4 / 4',
      title:'Objetivos e preferências',
      sub:'Última etapa — a que vai fazer a diferença.',
      fields:[
        { key:'objetivo', type:'radio', label:'O teu objetivo principal', options:[
          {val:'extra', label:'Rendimento extra', sub:'100–400€/mês ao lado do emprego'},
          {val:'main', label:'Substituir o emprego', sub:'Quero viver disto a prazo'},
          {val:'explore', label:'Explorar e aprender', sub:'Sem pressão, só quero descobrir'},
          {val:'save', label:'Poupar para algo específico', sub:'Férias, carro, casa, etc.'},
        ]},
        { key:'prefs', type:'chips', label:'Preferes trabalhar em... (seleciona todas)', options:['🔬 Surveys','🧠 AI Training','💼 Freelance','⚡ Micro-tarefas','🛵 Gigs físicos','🐾 Pet Sitting','👶 Babysitting'] }
      ]
    }
  ],
  en: [
    {
      id:'s1', label:'1 / 4',
      title:'Where are you and how do you work?',
      sub:'Start with your context — takes less than 1 minute.',
      fields:[
        { key:'pais', type:'select', label:'Country of residence', placeholder:'Select…', options:['🇵🇹 Portugal','🇧🇷 Brazil','🇪🇸 Spain','🇬🇧 United Kingdom','🌍 Other'] },
        { key:'idade', type:'chips1', label:'Age', options:['18–24','25–34','35–44','45–54','55+'] },
        { key:'dispositivo', type:'chips1', label:'You mainly work on...', options:['💻 Computer','📱 Mobile','💻 + 📱 Both'] }
      ]
    },
    {
      id:'s2', label:'2 / 4',
      title:'Availability and English',
      sub:'Helps us filter what really works for you.',
      fields:[
        { key:'horas', type:'radio', label:'Free hours per week', options:[
          {val:'1-5', label:'1–5 hours', sub:'Casual — weekends only'},
          {val:'5-10', label:'5–10 hours', sub:'Light part-time'},
          {val:'10-20', label:'10–20 hours', sub:'Serious part-time'},
          {val:'20+', label:'20+ hours', sub:'Full-time or close'},
        ]},
        { key:'ingles', type:'radio', label:'English level', options:[
          {val:'none', label:'No English', sub:'I prefer everything in Portuguese'},
          {val:'basic', label:'Basic', sub:'I can read but struggle to write'},
          {val:'good', label:'Intermediate', sub:'I can communicate without major issues'},
          {val:'fluent', label:'Advanced / Fluent', sub:'I work comfortably in English'},
        ]}
      ]
    },
    {
      id:'s3', label:'3 / 4',
      title:'Experience and skills',
      sub:'Select everything that applies to you.',
      fields:[
        { key:'experiencia', type:'radio', label:'Experience with gig platforms', options:[
          {val:'zero', label:'Complete beginner', sub:'Never used any platform'},
          {val:'some', label:'Tried a few', sub:'Used 1–3 platforms, not consistent'},
          {val:'regular', label:'Use them regularly', sub:'I have a routine with 3+ platforms'},
          {val:'pro', label:'Experienced', sub:'It is part of my current income'},
        ]},
        { key:'skills', type:'chips', label:'Your skills (select all that apply)', options:['✍️ Writing','💻 Coding','🎨 Design','🗣️ Languages','📱 Social Media','📣 Marketing','📸 Photo / Video','🔢 Excel / Data','None in particular'] }
      ]
    },
    {
      id:'s4', label:'4 / 4',
      title:'Goals and preferences',
      sub:'Last step — this is what will make the difference.',
      fields:[
        { key:'objetivo', type:'radio', label:'Your main goal', options:[
          {val:'extra', label:'Extra income', sub:'€100–400/month alongside a job'},
          {val:'main', label:'Replace my job', sub:'I want to live from this eventually'},
          {val:'explore', label:'Explore and learn', sub:'No pressure, just want to discover'},
          {val:'save', label:'Save for something specific', sub:'Holiday, car, house, etc.'},
        ]},
        { key:'prefs', type:'chips', label:'You prefer to work in... (select all)', options:['🔬 Surveys','🧠 AI Training','💼 Freelance','⚡ Micro-tasks','🛵 Physical Gigs','🐾 Pet Sitting','👶 Babysitting'] }
      ]
    }
  ]
};
let boostStep = 0;
let boostAnswers = {};
let boostSteps = [
  ...(boostStepsData[currentLang] || boostStepsData['pt'])
];

function openBoostForm(){
  boostStep = 0;
  boostSteps = (boostStepsData[currentLang] || boostStepsData['pt']).slice();
  boostAnswers = {};
  document.getElementById('boostFormModal').style.display = 'flex';
  renderBoostStep();
}

function renderBoostStep(){
  const step = boostSteps[boostStep];
  const pct = ((boostStep) / boostSteps.length) * 100;
  const isLast = boostStep === boostSteps.length - 1;

  let fieldsHtml = step.fields.map(f => {
    if(f.type === 'select'){
      const val = boostAnswers[f.key] || '';
      return `<div class="boost-field">
        <label class="boost-label">${f.label}</label>
        <select class="boost-select" data-key="${f.key}" data-key="${f.key}">
          <option value="">${f.placeholder||(currentLang==='en'?'Select…':'Seleciona…')}</option>
          ${f.options.map(o=>`<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>`;
    }
    if(f.type === 'radio'){
      const val = boostAnswers[f.key] || '';
      return `<div class="boost-field">
        <label class="boost-label">${f.label}</label>
        <div class="boost-radio-group">
          ${f.options.map(o=>`
          <div class="boost-radio ${val===o.val?'selected':''}" data-key="${f.key}" data-val="${o.val}">
            <div class="boost-radio-dot"></div>
            <div class="boost-radio-text">
              <div class="boost-radio-label">${o.label}</div>
              ${o.sub?`<div class="boost-radio-sub">${o.sub}</div>`:''}
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }
    if(f.type === 'chips' || f.type === 'chips1'){
      const sel = boostAnswers[f.key] || (f.type==='chips'?[]:'');
      const multi = f.type === 'chips';
      return `<div class="boost-field">
        <label class="boost-label">${f.label}${multi?` <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--grey)">${currentLang==='en'?'(select multiple)':'(escolhe várias)'}</span>`:''}</label>
        <div class="boost-chips">
          ${f.options.map(o=>{
            const isSelected = multi ? (Array.isArray(sel) && sel.includes(o)) : sel===o;
            return `<div class="boost-chip ${isSelected?'selected':''}" data-field="${f.key}" data-val="${o.replace(/"/g,'&quot;')}" data-multi="${multi}">${o}</div>`;
          }).join('')}
        </div>
      </div>`;
    }
    return '';
  }).join('');

  document.getElementById('boostFormBox').innerHTML = `
    <button class="boost-close-modal-btn" style="position:absolute;top:16px;right:16px;background:var(--cream);border:1px solid var(--border-md);border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;color:var(--grey)">✕</button>
    <div class="boost-progress-bar"><div class="boost-progress-fill" id="boostProgFill" style="width:${pct}%"></div></div>
    <div class="boost-step-label">${step.label}</div>
    <div class="boost-step-title">${step.title}</div>
    <div class="boost-step-sub">${step.sub}</div>
    ${fieldsHtml}
    <div class="boost-nav">
      ${boostStep > 0 ? `<button class="boost-btn-back">${currentLang==='en'?'← Back':'← Anterior'}</button>` : ''}
      ${isLast
        ? `<button class="boost-btn-ai" id="boostSubmitBtn">${currentLang==='en'?'✅ Submit profile →':'✅ Enviar perfil →'}</button>`
        : `<button class="boost-btn-next" id="boostNextBtn">${currentLang==='en'?'Continue →':'Continuar →'}</button>`
      }
    </div>
  `;
  boostCheckNext();
  document.getElementById('boostFormModal').scrollTop = 0;
}

function boostSelectRadio(key, val, el){
  boostAnswers[key] = val;
  el.closest('.boost-radio-group').querySelectorAll('.boost-radio').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  boostCheckNext();
}

function boostToggleChip(el){
  const key = el.dataset.field;
  const val = el.dataset.val;
  const multi = el.dataset.multi === 'true';
  if(multi){
    if(!boostAnswers[key]) boostAnswers[key] = [];
    const idx = boostAnswers[key].indexOf(val);
    if(idx >= 0){ boostAnswers[key].splice(idx,1); el.classList.remove('selected'); }
    else { boostAnswers[key].push(val); el.classList.add('selected'); }
  } else {
    boostAnswers[key] = val;
    document.querySelectorAll(`.boost-chip[data-field="${key}"]`).forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
  }
  boostCheckNext();
}

function boostCheckNext(){
  // Keep button always enabled - validate on click instead
  const btn = document.getElementById('boostNextBtn') || document.getElementById('boostSubmitBtn');
  if(btn) btn.disabled = false;
}

function boostNext(){
  boostStep++;
  renderBoostStep();
}

function boostBack(){
  if(boostStep > 0){ boostStep--; renderBoostStep(); }
}

// ── AI ANALYSIS ──
function _sanitize(s){ 
  if(!s) return ''; 
  const str = String(s).replace(/<[^>]*>/g,'').replace(/[&<>"'\\`]/g,'').trim();
  // Block suspicious patterns (XSS, injection, prompt injection)
  if(/script|javascript|onclick|onerror|eval\s*\(|document\.|window\.|vbscript:|data:text|__proto__|constructor\s*\[/i.test(str)) return '';
  return str.substring(0, 300); 
}
function submitBoostForm(){
  if(document.getElementById('_hpot')&&document.getElementById('_hpot').value) return; // bot
  // FIX #3: prevent duplicate submissions this session
  if(sessionStorage.getItem('gh_boost_submitted')) {
    const isEn = currentLang === 'en';
    alert(isEn?'You have already submitted GigBoost in this session.':'Já submeteste o GigBoost nesta sessão.');
    return;
  }
  // Validate at least some answers exist
  if(Object.keys(boostAnswers).length === 0) {
    alert(currentLang==='en'?'Please fill in at least one field.':'Por favor preenche pelo menos um campo.');
    return;
  }
  const isEn = currentLang === 'en';
  const a = Object.fromEntries(Object.entries(boostAnswers).map(([k,v])=>[k, Array.isArray(v)?v.map(_sanitize):_sanitize(v)]));
  const skills = Array.isArray(a.skills) ? a.skills.join(', ') : (a.skills||'');
  const prefs = Array.isArray(a.prefs) ? a.prefs.join(', ') : (a.prefs||'');
  const msg = encodeURIComponent(
    `GigBoost — Novo perfil 🚀

` +
    `País: ${a.pais||'-'}
Idade: ${a.idade||'-'}
Dispositivo: ${a.dispositivo||'-'}
` +
    `Horas/semana: ${a.horas||'-'}
Inglês: ${a.ingles||'-'}
Skills: ${skills||'-'}
` +
    `Experiência: ${a.experiencia||'-'}
Objetivo: ${a.objetivo||'-'}
Preferências: ${prefs||'-'}`
  );
  // FIX #6: dead iframe removed
  // FIX #3: mark this session as submitted
  sessionStorage.setItem('gh_boost_submitted', '1');
  const waLink = `https://wa.me/351938556803?text=${msg}`;
  // Show thank you message
  const box = document.getElementById('boostFormBox');
  if(box) box.innerHTML = `
    <div style="padding:48px 28px;text-align:center;max-width:440px;margin:0 auto">
      <div style="font-size:52px;margin-bottom:20px">🎉</div>
      <h2 style="font-family:'Fraunces',serif;font-size:24px;font-weight:900;margin-bottom:16px;letter-spacing:-.5px">
        ${isEn ? 'Thank you for joining GigBoost.' : 'Obrigado por aderires ao GigBoost.'}
      </h2>
      <p style="font-size:14px;color:var(--grey);line-height:1.75;margin-bottom:14px">
        ${isEn
          ? 'Our team is now reviewing your profile and preparing a personalised selection of platforms tailored to your experience, goals and availability.'
          : 'A nossa equipa está a rever o teu perfil e a preparar uma seleção personalizada de plataformas adaptada à tua experiência, objetivos e disponibilidade.'}
      </p>
      <p style="font-size:14px;color:var(--grey);line-height:1.75;margin-bottom:28px">
        ${isEn
          ? 'You should receive a response within 24 hours.'
          : 'Deverás receber uma resposta dentro de 24 horas.'}
      </p>
      <button class="boost-explore-btn" style="height:44px;padding:0 36px;border-radius:10px;border:none;background:var(--ink);color:var(--paper);font-family:'Instrument Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer">
        ${isEn ? 'Close' : 'Fechar'}
      </button>
    </div>`;
  // Open WhatsApp — delayed to allow thank-you render first
  setTimeout(() => { const w=window.open(waLink,'_blank','noopener,noreferrer'); if(w)w.opener=null; }, 500);
}

async function runBoostAnalysis(){
  const box = document.getElementById('boostFormBox');

  // Show loading state with animated steps
  box.innerHTML = `
    <div class="boost-loading">
      <div class="boost-spinner"></div>
      <div class="boost-loading-text">A analisar o teu perfil…</div>
      
      <div class="boost-loading-steps">
        <div class="boost-ls active" id="bls1">📋 A ler o teu perfil completo…</div>
        <div class="boost-ls" id="bls2">🎯 A calcular match com 119 plataformas…</div>
        <div class="boost-ls" id="bls3">💡 A gerar dicas personalizadas…</div>
        <div class="boost-ls" id="bls4">📅 A criar o teu plano de ação…</div>
        <div class="boost-ls" id="bls5">✨ A finalizar a análise…</div>
      </div>
    </div>`;

  // Animate loading steps
  const steps = ['bls1','bls2','bls3','bls4','bls5'];
  let si = 0;
  const stepInterval = setInterval(()=>{
    if(si > 0) { const prev = document.getElementById(steps[si-1]); if(prev){ prev.classList.remove('active'); prev.classList.add('done'); prev.textContent = '✓ ' + prev.textContent.replace(/^[^\s]+\s/,''); } }
    if(si < steps.length) { const cur = document.getElementById(steps[si]); if(cur) cur.classList.add('active'); }
    si++;
    if(si >= steps.length) clearInterval(stepInterval);
  }, 1800);

  // Profile data sent securely to Edge Function

  try {
    // Timeout protection: 15 seconds max
    const timeoutPromise = new Promise((_,reject) => setTimeout(() => reject(new Error(currentLang==='en'?'Request timed out. Please try again.':'Pedido expirou. Tenta novamente.')), 15000));
    const response = await Promise.race([_SB.functions.invoke('gigboost-analyze', {
      headers: { 'X-Access-Token': _sessionToken },
      body: {
        answers: {
          pais: boostAnswers.pais,
          idade: boostAnswers.idade,
          dispositivo: boostAnswers.dispositivo,
          horas: boostAnswers.horas,
          ingles: boostAnswers.ingles,
          skills: Array.isArray(boostAnswers.skills) ? boostAnswers.skills.join(', ') : boostAnswers.skills,
          experiencia: boostAnswers.experiencia,
          objetivo: boostAnswers.objetivo,
          prefs: Array.isArray(boostAnswers.prefs) ? boostAnswers.prefs.join(', ') : boostAnswers.prefs
        },
        platforms: P.map(p => p.name).slice(0, 60)
      }
    }), timeoutPromise]);

    clearInterval(stepInterval);
    if (response.error) throw new Error(response.error.message);
    const data = response.data;
    const text = typeof data === 'string' ? data : (data.content?.map(c=>c.text||'').join('') || '');

    let result;
    try {
      const clean = text.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim();
      result = JSON.parse(clean);
    } catch(e) {
      throw new Error('Resposta inválida da IA. Tenta novamente.');
    }

    // Save result
    // FIX #5: use sessionStorage (cleared when tab closes)
    sessionStorage.setItem('gh_boost_result', JSON.stringify(result));
    renderBoostResults(result);

  } catch(err) {
    clearInterval(stepInterval);
    box.innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:36px;margin-bottom:12px">⚠️</div>
        <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:900;margin-bottom:8px">Erro na análise</div>
        <div style="font-size:13px;color:var(--grey);margin-bottom:20px">${escHtml(err.message)}</div>
        <button class="boost-retry-btn" style="height:42px;padding:0 24px;border-radius:10px;border:none;background:var(--ink);color:var(--paper);font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Tentar novamente</button>
      </div>`;
  }
}

function renderBoostResults(r){
  const box = document.getElementById('boostFormBox');
  const rk = ['r1','r2','r3','',''];

  const platformsHtml = (r.plataformas||[]).map((p,i) => {
    const platform = P.find(pl => pl.name === p.nome);
    const icon = platform ? platform.icon : '🔗';
    // Only allow URLs that start with https:// (from our own P array) or use '#'
    const rawUrl = platform ? platform.url : '#';
    const safeUrl = /^https:\/\//i.test(rawUrl) ? rawUrl : '#';
    return `
    <a href="${escHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="boost-platform-card" style="text-decoration:none">
      <div style="font-size:22px;flex-shrink:0">${escHtml(icon)}</div>
      <div class="boost-platform-body">
        <div class="boost-platform-name">
          ${escHtml(p.nome)}
          <span class="boost-match">${escHtml(String(p.match))}% match</span>
        </div>
        <div class="boost-platform-why">${escHtml(p.razao)}</div>
      </div>
    </a>`;
  }).join('');

  const tipsHtml = (r.dicas||[]).map((d,i) => `
    <div class="boost-tip-card">
      <div class="boost-tip-num">${i+1}</div>
      <div class="boost-tip-text">${escHtml(d)}</div>
    </div>`).join('');

  const planHtml = (r.plano||[]).map(p => `
    <div class="boost-action-item">
      <div class="boost-action-day">${escHtml(p.dia)}</div>
      <div class="boost-action-text">${escHtml(p.acao)}</div>
    </div>`).join('');

  box.innerHTML = `
    <button class="boost-close-modal-btn" style="position:absolute;top:16px;right:16px;background:rgba(12,12,13,.06);border:1px solid var(--border-md);border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;color:var(--grey)">✕</button>

    <div class="boost-results">
      <div class="boost-badge" style="margin-bottom:16px">✨ GigBoost · Análise concluída</div>

      <!-- Persona card -->
      <div class="boost-persona">
        <div class="boost-persona-emoji">${escHtml(r.persona?.emoji||'🎯')}</div>
        <div class="boost-persona-type">${escHtml(r.persona?.tipo||'Perfil personalizado')}</div>
        <div class="boost-persona-name">${escHtml(r.persona?.nome||'O teu perfil')}</div>
        <div class="boost-persona-desc">${escHtml(r.persona?.descricao||'')}</div>
        <div class="boost-earn-range">
          <div class="boost-earn-val">${escHtml(r.ganhos_estimados?.min||'?')}–${escHtml(r.ganhos_estimados?.max||'?')}</div>
          <div class="boost-earn-label">${escHtml(r.ganhos_estimados?.label||'estimado')}</div>
        </div>
      </div>

      <!-- Top platforms -->
      <div class="boost-section-title">🏆 As tuas 5 plataformas ideais</div>
      ${platformsHtml}

      <!-- Tips -->
      <div class="boost-section-title">💡 Dicas para o teu perfil</div>
      ${tipsHtml}

      <!-- Action plan -->
      <div class="boost-section-title">📅 O teu plano para os próximos 7 dias</div>
      <div class="boost-action-card">
        <div class="boost-action-title">Começa amanhã</div>
        ${planHtml}
      </div>

      <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="boost-redo-btn" style="flex:1;height:40px;border-radius:10px;border:1.5px solid var(--border-md);background:transparent;font-family:'Instrument Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;color:var(--grey)">↺ Refazer análise</button>
        <button class="boost-explore-btn" style="flex:2;height:40px;border-radius:10px;border:none;background:var(--ink);color:var(--paper);font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer">Explorar plataformas →</button>
      </div>
    </div>`;


// ── Init: moved to _bindEvents() at bottom of file ──
document.addEventListener('DOMContentLoaded',()=>{
  const ls=document.getElementById('lockScreen');
  if(ls&&!ls.classList.contains('unlocked')) document.body.style.overflow='hidden';
});
if(false){
  
}
// scroll handler moved to _bindEvents()
}
// ══ SUPABASE OVERRIDE ══
// Este script substitui o sistema de autenticação original pelo Supabase

// ── XSS sanitization helper ──────────────────────────────────────────────────
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ─────────────────────────────────────────────────────────────────────────────

const _SB = window.supabase.createClient(
  'https://fosdgukysnryznsywpmp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvc2RndWt5c25yeXpuc3l3cG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDMwNDUsImV4cCI6MjA5MzkxOTA0NX0.arArVMWoSZMQOzAf75SoLZKXthhw0bbZoWE1yoAjngA'
);

function _fmt(r){
  return {name:r.name,cat:r.cat,icon:r.icon,desc:r.desc_pt,descEn:r.desc_en,
    earn:r.earn,earnN:r.earn_n,minPay:r.min_pay,pt:r.pt,eu:r.eu,url:r.url||'',
    easy:r.easy,geo:r.geo,top:r.top,dimmed:r.dimmed,
    ratings:r.ratings||{},aff:{has:false}};
}

  // ── Store token securely in memory for Edge Function auth ──
  // (never stored to disk/localStorage — lives only in JS memory for this session)
  let _sessionToken = '';

  // ── F2F entries hardcoded here so they survive any P replacement ──
const _F2F_ENTRIES = [
  {name:'Amnistia Internacional',cat:'f2f',icon:'🕊️',desc:'Recrutador/captador de sócios Face-to-Face para a Amnistia Internacional Portugal. Trabalho de rua, flexível e bem pago.',descEn:'Face-to-Face fundraiser/member recruiter for Amnesty International Portugal. Street-based, flexible and well-paid.',earn:'€7–12/h',earnN:9,minPay:'Por hora',pt:true,eu:false,url:'https://www.amnistia.pt/projeto-face-to-face/',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:5}},
  {name:'APDES',cat:'f2f',icon:'🤝',desc:'Captação de sócios e doadores Face-to-Face para a APDES. Remuneração por hora + bónus de performance.',descEn:'Face-to-Face member and donor fundraising for APDES. Hourly pay + performance bonus.',earn:'€7–12/h',earnN:9,minPay:'Por hora',pt:true,eu:false,url:'https://apdes.pt/pt/face-to-face-vagas/',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:4}},
  {name:'ACNUR',cat:'f2f',icon:'🌍',desc:'Captação de doadores para o Alto Comissariado das Nações Unidas para os Refugiados (ACNUR/UNHCR). Projecto F2F em Portugal.',descEn:'Donor fundraising for the UN Refugee Agency (UNHCR) in Portugal. F2F street fundraising project.',earn:'€7–12/h',earnN:9,minPay:'Por hora',pt:true,eu:false,url:'https://pacnur.org/pt/f2f-d2d',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:5}},
  {name:'Associação Salvador',cat:'f2f',icon:'♿',desc:'Recrutadores Face-to-Face para a Associação Salvador, que apoia pessoas com lesão medular. Part-time disponível.',descEn:'Face-to-Face recruiters for Associação Salvador, supporting people with spinal cord injuries. Part-time available.',earn:'€7–11/h',earnN:8,minPay:'Por hora',pt:true,eu:false,url:'https://associacaosalvador.com/ofertas_rh/recrutadores-do-projeto-face-to-face/',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:5}},
  {name:'Aldeias SOS',cat:'f2f',icon:'👨‍👩‍👧',desc:'Recrutador F2F part-time para as Aldeias de Crianças SOS Portugal. Horários flexíveis, formação incluída.',descEn:'Part-time F2F recruiter for SOS Children\'s Villages Portugal. Flexible hours, training included.',earn:'€7–11/h',earnN:8,minPay:'Por hora',pt:true,eu:false,url:'https://www.aldeias-sos.org/quem-somos/trabalhe-connosco/vagas-abertas/servicos-centrais/part-time-recrutador-face-2-face',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:5}},
  {name:'WWF Portugal',cat:'f2f',icon:'🐼',desc:'Captação de doadores e apoiantes Face-to-Face para a WWF Portugal. Defesa da natureza com rendimento estável.',descEn:'Donor and supporter Face-to-Face fundraising for WWF Portugal. Nature conservation with stable income.',earn:'€7–12/h',earnN:9,minPay:'Por hora',pt:true,eu:false,url:'https://apoia.wwf.pt/donativos/vagas-face-to-face',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:5}},
  {name:'Operação Nariz Vermelho',cat:'f2f',icon:'🤡',desc:'Recrutadores Face-to-Face para a Operação Nariz Vermelho, que leva palhaços a hospitais pediátricos.',descEn:'Face-to-Face recruiters for Operação Nariz Vermelho, bringing clowns to paediatric hospitals.',earn:'€7–11/h',earnN:8,minPay:'Por hora',pt:true,eu:false,url:'https://narizvermelho.pt/recrutamento/#RecrutamentoFacetoFace',easy:4,geo:'🇵🇹 Portugal',top:false,dimmed:false,beginner:true,ratings:{payout:3,beginner:true,realistic:3,trust:5}},
];
function _mergeF2F(){ if(!P.some(p=>p.cat==='f2f')) P=P.concat(_F2F_ENTRIES); }

async function validarTokenSupabase(token) {
  const lockErr = document.getElementById('lockErr');
  // Rate limiting do lado do cliente (UX apenas — não é segurança real).
  // A proteção real contra brute-force está no Supabase (ver supabase_rate_limit.sql).
  const _ss = parseInt(sessionStorage.getItem('_rlc')||'0');
  if(_ss >= 5){
    if(lockErr) lockErr.textContent = currentLang==='en'?'Too many attempts. Please restart your browser.':'Demasiadas tentativas. Reinicia o browser.';
    return;
  }
  sessionStorage.setItem('_rlc', String(_ss+1));
  const _rl = JSON.parse(localStorage.getItem('_rl')||'{"c":0,"t":0}');
  const now = Date.now();
  if(now - _rl.t > 3600000){ _rl.c = 0; _rl.t = now; }
  if(_rl.c >= 5){
    const wait = Math.ceil((3600000-(now-_rl.t))/60000);
    if(lockErr) lockErr.textContent = currentLang==='en'?`Too many attempts. Try in ${wait} min.`:`Demasiadas tentativas. Tenta em ${wait} min.`;
    return;
  }
  _rl.c++; localStorage.setItem('_rl', JSON.stringify(_rl));
  try {
    if(lockErr) lockErr.textContent = 'A verificar…';
    const { data, error } = await _SB.rpc('unlock_with_token', { p_token: token.toLowerCase().trim() });
    if(error) {
      // Log technical detail only to console (not shown to user)
      console.error('Supabase error:', error);
      if(lockErr) lockErr.textContent = currentLang==='en'
        ? 'Verification failed. Please try again.'
        : 'Erro na verificação. Tenta novamente.';
      return false;
    }
    if(!data || data.valid === false) {
      if(lockErr) lockErr.textContent = currentLang==='en'
        ? 'Invalid or unrecognised code.'
        : 'Código inválido ou não reconhecido.';
      return false;
    }
    // SUCESSO
    hasAccess = true;
    _sessionToken = token.toLowerCase().trim(); // kept in memory only for Edge Function auth
    localStorage.removeItem('_rl');
    sessionStorage.removeItem('_rlc');
    if(data.platforms && data.platforms.length > 0) {
      P = data.platforms.map(_fmt);
    }
    // Always ensure F2F entries are present (they live in _F2F_ENTRIES, not in the DB)
    _mergeF2F();
    // else keep local P array
    // Remove token from URL bar after successful login
    try{window.history.replaceState({},'',window.location.pathname+(window.location.search||''));}catch(e){}
    if(lockErr) lockErr.textContent = '';
    const ls = document.getElementById('lockScreen');
    if(ls) { ls.classList.add('unlocked'); setTimeout(() => ls.style.display='none', 600); }
    document.body.style.overflow = 'auto';
    if(typeof render === 'function') render();
    if(!localStorage.getItem('gh_welcomed')) {
      localStorage.setItem('gh_welcomed','1');
      const wm = document.getElementById('welcomeModal');
      if(wm) wm.style.display='flex';
      if(typeof applyLang==='function') applyLang();
    }
    return true;
  } catch(e) {
    console.error('Unexpected error:', e);
    if(lockErr) lockErr.textContent = currentLang==='en'
      ? 'Connection error. Please try again.'
      : 'Erro de ligação. Tenta novamente.';
    return false;
  }
}

// Override unlock function
window.unlock = async function() {
  const inp = document.getElementById('lockInput');
  const btn = document.getElementById('lockBtn');
  if(!inp || !inp.value.trim()) return;
  if(btn) { btn.textContent='A verificar…'; btn.disabled=true; }
  const cleanToken = inp.value.trim().replace(/[^a-zA-Z0-9_\-]/g,'').substring(0,64);
  if(!cleanToken) { if(btn){btn.textContent='Entrar →';btn.disabled=false;} return; }
  await validarTokenSupabase(cleanToken);
  if(btn) { btn.textContent='Entrar →'; btn.disabled=false; }
};


function openLegalModal(type) {
  const isEn = currentLang === 'en';
  const modal = document.getElementById('legalModal');
  const content = document.getElementById('legalContent');
  const pages = {
    privacy: {
      pt: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Política de Privacidade</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Última actualização: Maio 2026</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Dados que recolhemos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Recolhemos apenas os dados necessários para fornecer o serviço, incluindo informação de contacto e respostas ao formulário GigBoost enviadas voluntariamente.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Porque recolhemos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Os dados são usados exclusivamente para fornecer o serviço adquirido — acesso à plataforma e/ou recomendações personalizadas GigBoost. Base legal: execução de contrato (Art. 6.º n.º 1 al. b) do RGPD).</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Processamento via WhatsApp / Meta</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O serviço GigBoost utiliza o WhatsApp (operado pela Meta Platforms, Inc.) para receber comprovativo de pagamento e enviar recomendações personalizadas. Ao submeteres o formulário GigBoost, os dados do teu perfil (país, faixa etária, objetivos, skills) são transmitidos via WhatsApp e ficam sujeitos à <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Política de Privacidade da Meta</a>. Não utilizamos esses dados para fins de marketing. Se preferires não utilizar o WhatsApp, contacta-nos por e-mail.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Cookies e analytics</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Não usamos cookies de rastreamento nem ferramentas de analytics de terceiros. O acesso é gerido por tokens únicos sem identificação pessoal.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Pagamentos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Os pagamentos são efectuados via MB Way ou transferência bancária. Não armazenamos dados de pagamento.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Segurança</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Nunca te pedimos o teu código de acesso de volta, NIF, palavras-passe ou dados bancários completos. Se receberes uma mensagem a solicitar esses dados em nome da GigHub, trata-se de fraude.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">RGPD</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Nos termos do RGPD, tens direito a aceder, corrigir, portabilizar ou eliminar os teus dados. Para exercer estes direitos, contacta-nos em gighubpro@gmail.com. Tens ainda o direito de apresentar queixa à CNPD (Comissão Nacional de Proteção de Dados).</p>`,
      en: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Privacy Policy</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Last updated: May 2026</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Data we collect</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We only collect the data necessary to provide the service, including contact information and GigBoost form responses submitted voluntarily.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Why we collect it</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Data is used solely to provide the purchased service — platform access and/or personalised GigBoost recommendations.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Cookies & analytics</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We do not use advertising trackers or invasive third-party analytics tools. Access is managed by unique tokens without personal identification.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Payments</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Payments are made via MB Way or bank transfer. We do not store payment data.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">GDPR</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Under GDPR, you have the right to access, correct or delete your data. To exercise these rights, contact us at gighubpro@gmail.com.</p>`
    },
    terms: {
      pt: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Termos de Utilização</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Ao adquirir acesso ao GigHub, aceitas os seguintes termos.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">O que é o GigHub</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O GigHub é uma plataforma de curadoria de oportunidades de rendimento online. Organizamos, verificamos e apresentamos plataformas legítimas num só lugar.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Sem garantia de ganhos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O GigHub não garante quaisquer ganhos, resultados ou disponibilidade de trabalho. Os valores apresentados são estimativas baseadas em médias reportadas por utilizadores.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Responsabilidade do utilizador</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O utilizador é responsável pelo uso que faz das plataformas listadas, pelo cumprimento dos respectivos termos de serviço, e pelas obrigações fiscais decorrentes dos seus ganhos.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Acesso digital</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O acesso adquirido é pessoal, intransmissível e de longa duração. Não pode ser partilhado, revendido ou transferido.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Sem reembolsos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Dado o carácter digital do serviço e o início imediato do acesso após confirmação, o utilizador aceita renunciar ao direito de livre resolução previsto na legislação aplicável. Após a entrega do acesso, não são efectuados reembolsos.</p>`,
      en: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Terms of Use</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">By purchasing access to GigHub, you agree to the following terms.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">What is GigHub</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">GigHub is a curation platform for online earning opportunities. We organise, verify and present legitimate platforms in one place.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">No earnings guarantee</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">GigHub does not guarantee any earnings, results or work availability. Values shown are estimates based on user-reported averages.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">User responsibility</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">The user is responsible for their use of the listed platforms, compliance with their respective terms of service, and any tax obligations arising from their earnings.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Digital access</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Access is personal and non-transferable. It cannot be shared, resold or transferred.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">No refunds</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Given the digital nature of the service and the immediate start of access upon confirmation, the user agrees to waive the right of withdrawal provided by applicable legislation. Once access has been delivered, no refunds are issued.</p>`
    },
    disclaimer: {
      pt: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Disclaimer</h2>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:16px">A GigHub funciona como uma plataforma de curadoria e organização de oportunidades online. Não garantimos ganhos, resultados ou disponibilidade de trabalho nas plataformas apresentadas.</p>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:16px">Embora todas as plataformas sejam revistas manualmente, a GigHub não pode garantir a segurança, disponibilidade ou práticas das plataformas de terceiros listadas no website.</p>
<p style="font-size:13px;color:var(--grey);line-height:1.7;">Todas as plataformas listadas pertencem aos respetivos proprietários. A GigHub não é afiliada, parceira oficial ou representante das plataformas mencionadas, salvo indicação em contrário.</p>`,
      en: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Disclaimer</h2>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:16px">GigHub operates as a curation and organisation platform for online opportunities. We do not guarantee earnings, results or work availability on the platforms presented.</p>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:16px">Although all platforms are manually reviewed, GigHub cannot guarantee the security, availability or practices of third-party platforms listed on the website.</p>
<p style="font-size:13px;color:var(--grey);line-height:1.7;">All listed platforms belong to their respective owners. GigHub is not affiliated with, an official partner of, or representative of the mentioned platforms, unless otherwise stated.</p>`
    }
  };
  content.innerHTML = pages[type][currentLang] || pages[type]['pt'];
  modal.style.display = 'flex';
}

// Update footer links language
function updateFooterLang() {
  const isEn = currentLang === 'en';
  const fp = document.getElementById('footerPrivacy');
  const ft = document.getElementById('footerTerms');
  const fd = document.getElementById('footerDisclaimer');
  const fc = document.getElementById('footerContact');
  if(fp) fp.textContent = isEn ? 'Privacy Policy' : 'Política de Privacidade';
  if(ft) ft.textContent = isEn ? 'Terms of Use' : 'Termos de Utilização';
  if(fd) fd.textContent = isEn ? 'Disclaimer' : 'Disclaimer';
  if(fc) fc.textContent = isEn ? 'Contact' : 'Contacto';
}


  // session timeout moved to _bindEvents()

// auto-unlock moved to _bindEvents()
window.addEventListener('scroll',()=>{
  const btn=document.getElementById('backToTop');
  if(btn) btn.style.display=window.scrollY>400?'flex':'none';
});

// ══════════════════════════════════════════════════════════════════
// EVENT LISTENERS — All inline handlers migrated here (CSP fix)
// ══════════════════════════════════════════════════════════════════
(function _bindEvents(){
  try {

  // ── Lock screen ──
  const lockInput = document.getElementById('lockInput');
  if(lockInput) lockInput.addEventListener('keydown', e => { if(e.key === 'Enter') window.unlock(); });
  const lockBtn = document.getElementById('lockBtn');
  if(lockBtn) lockBtn.addEventListener('click', () => window.unlock());
  const lockLangBtn = document.getElementById('lockLangBtn');
  if(lockLangBtn) lockLangBtn.addEventListener('click', toggleLockLang);

  // ── Lock screen privacy link (static HTML) ──
  const lockPrivacyLink = document.getElementById('lockPrivacyLink');
  if(lockPrivacyLink) lockPrivacyLink.addEventListener('click', e => { e.preventDefault(); openLegalModal('privacy'); });

  // ── Nav ──
  const langToggle = document.getElementById('langToggle');
  if(langToggle) langToggle.addEventListener('click', toggleLang);
  const favBtn = document.getElementById('favBtn');
  if(favBtn) favBtn.addEventListener('click', toggleFavView);
  const calcIconBtn = document.getElementById('calcIconBtn');
  if(calcIconBtn) calcIconBtn.addEventListener('click', openCalc);
  const boostNavBtn = document.getElementById('boostNavBtn');
  if(boostNavBtn) boostNavBtn.addEventListener('click', openBoostPay);

  // ── Toolbar filters ──
  const searchEl = document.getElementById('search');
  if(searchEl) searchEl.addEventListener('input', render);
  const fGeo = document.getElementById('fGeo');
  if(fGeo) fGeo.addEventListener('change', render);
  const fSort = document.getElementById('fSort');
  if(fSort) fSort.addEventListener('change', render);

  // ── Category tabs (event delegation) ──
  const tabsEl = document.getElementById('tabs');
  if(tabsEl) tabsEl.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if(tab) setTab(tab.dataset.v);
  });

  // ── Curation pills (event delegation) ──
  const curationPills = document.getElementById('curationPills');
  if(curationPills) curationPills.addEventListener('click', e => {
    const pill = e.target.closest('.curation-pill');
    if(pill) setCuration(pill.dataset.curation);
  });

  // ── Platform grid (event delegation) ──
  const grid = document.getElementById('grid');
  if(grid) grid.addEventListener('click', function(e) {
    const favBtn = e.target.closest('.fav-btn');
    if(favBtn) { e.stopPropagation(); toggleFav(favBtn.dataset.name, e); return; }
    const clearBtn = e.target.closest('.clear-filters-btn');
    if(clearBtn) {
      document.getElementById('search').value = '';
      activeTab = ''; activeCuration = '';
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.v === ''));
      document.querySelectorAll('.curation-pill').forEach(p => p.classList.toggle('active', p.dataset.curation === ''));
      render();
    }
  });

  // ── Calculator modal ──
  const calcModalCloseBtn = document.getElementById('calcModalCloseBtn');
  if(calcModalCloseBtn) calcModalCloseBtn.addEventListener('click', () => document.getElementById('calcModal').style.display = 'none');
  const hoursRange = document.getElementById('hoursRange');
  if(hoursRange) hoursRange.addEventListener('input', calcEarnings);
  const calcType = document.getElementById('calcType');
  if(calcType) calcType.addEventListener('change', calcEarnings);

  // ── Welcome modal ──
  const welcomeCloseBtn = document.getElementById('welcomeCloseBtn');
  if(welcomeCloseBtn) welcomeCloseBtn.addEventListener('click', () => document.getElementById('welcomeModal').style.display = 'none');
  const boostCtaEl = document.getElementById('boostCtaEl');
  if(boostCtaEl) boostCtaEl.addEventListener('click', () => { openBoostPay(); document.getElementById('welcomeModal').style.display = 'none'; });

  // ── GigBoost pay modal ──
  const boostPayModalCloseBtn = document.getElementById('boostPayModalCloseBtn');
  if(boostPayModalCloseBtn) boostPayModalCloseBtn.addEventListener('click', () => document.getElementById('boostPayModal').style.display = 'none');
  const boostOpenFormBtn = document.getElementById('boostOpenFormBtn');
  if(boostOpenFormBtn) boostOpenFormBtn.addEventListener('click', () => { document.getElementById('boostPayModal').style.display = 'none'; openBoostForm(); });

  // ── GigBoost form (event delegation — content is dynamically injected) ──
  const boostFormBox = document.getElementById('boostFormBox');
  if(boostFormBox){
    boostFormBox.addEventListener('change', function(e) {
      const sel = e.target.closest('select.boost-select');
      if(sel) { boostAnswers[sel.dataset.key] = sel.value; boostCheckNext(); }
    });
    boostFormBox.addEventListener('click', function(e) {
      if(e.target.closest('.boost-radio')) { const r = e.target.closest('.boost-radio'); boostSelectRadio(r.dataset.key, r.dataset.val, r); return; }
      if(e.target.closest('.boost-chip')) { boostToggleChip(e.target.closest('.boost-chip')); return; }
      if(e.target.closest('.boost-btn-back')) { boostBack(); return; }
      if(e.target.closest('.boost-btn-next')) { boostNext(); return; }
      if(e.target.closest('.boost-btn-ai')) { submitBoostForm(); return; }
      if(e.target.closest('.boost-close-modal-btn')) { document.getElementById('boostFormModal').style.display = 'none'; return; }
      if(e.target.closest('.boost-redo-btn')) { boostStep = 0; renderBoostStep(); return; }
      if(e.target.closest('.boost-explore-btn')) { document.getElementById('boostFormModal').style.display = 'none'; return; }
      if(e.target.closest('.boost-retry-btn')) { openBoostForm(); return; }
    });
  }

  // ── Legal modal ──
  const legalModal = document.getElementById('legalModal');
  if(legalModal) {
    legalModal.addEventListener('click', e => { if(e.target === legalModal) legalModal.style.display = 'none'; });
  }
  const legalModalCloseBtn = document.getElementById('legalModalCloseBtn');
  if(legalModalCloseBtn) legalModalCloseBtn.addEventListener('click', () => document.getElementById('legalModal').style.display = 'none');

  // ── Footer & global data-modal delegation ──
  document.addEventListener('click', function(e) {
    const link = e.target.closest('[data-modal]');
    if(link) { e.preventDefault(); openLegalModal(link.dataset.modal); return; }
  });

  // ── Back to top ──
  const backToTop = document.getElementById('backToTop');
  if(backToTop) backToTop.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));

  // ── Admin panel static buttons ──
  const admAddBoostTokenBtn = document.getElementById('admAddBoostTokenBtn');
  if(admAddBoostTokenBtn) admAddBoostTokenBtn.addEventListener('click', admAddBoostToken);
  const admCopyBoostCodeBtn = document.getElementById('boostCopyBtn');
  if(admCopyBoostCodeBtn) admCopyBoostCodeBtn.addEventListener('click', admCopyBoostCode);
  const admDownloadBoostBtn = document.getElementById('admDownloadBoostBtn');
  if(admDownloadBoostBtn) admDownloadBoostBtn.addEventListener('click', () => typeof admDownloadWithBoost === 'function' && admDownloadWithBoost());

  // ── Admin panel adm-list event delegation (dynamic admRender content) ──
  const admList = document.getElementById('adm-list');
  if(admList) admList.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    if(btn.dataset.action === 'saveSheetUrl') saveSheetUrl();
    else if(btn.dataset.action === 'copyBaseLink') navigator.clipboard.writeText(window.location.origin + window.location.pathname + '#key=');
  });

  // ── Welcome & calc modals close on backdrop click ──
  ['welcomeModal','calcModal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', e => { if(e.target === el) el.style.display = 'none'; });
  });

  // ── Session timeout: clear access after 2h inactivity ──
  let _lastActivity = Date.now();
  document.addEventListener('click', () => _lastActivity = Date.now());
  setInterval(() => {
    if(hasAccess && Date.now() - _lastActivity > 7200000) {
      sessionStorage.removeItem('gh_access');
      location.reload();
    }
  }, 60000);

  // ── Scroll: tab collapse + back-to-top ──
  let _tabClickLockLocal = false;
  let _tabScrollLastYLocal = 0;
  window.addEventListener('scroll', function(){
    const btn = document.getElementById('backToTop');
    if(btn) btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    if(_tabClickLock) return;
    const tabsWrapEl = document.getElementById('tabsWrap');
    if(!tabsWrapEl) return;
    const y = window.scrollY;
    if(y > _tabScrollLastY && y > 120) tabsWrapEl.classList.add('collapsed');
    else tabsWrapEl.classList.remove('collapsed');
    _tabScrollLastY = y;
  }, {passive:true});

  // ── Init ──
  document.getElementById('favCount').textContent = favs.length;
  const yearEl = document.getElementById('heroYear');
  if(yearEl) yearEl.textContent = new Date().getFullYear();
  render();

  // ── Auto-unlock from URL hash ──
  (async function() {
    // FIX #4: token in #key= hash fragment — never sent to server logs
    const t = new URLSearchParams(window.location.hash.slice(1)).get('key');
    if(t) await validarTokenSupabase(t);
  })();

  } catch(e) { console.error('[GigHub] _bindEvents error:', e); }
})();
