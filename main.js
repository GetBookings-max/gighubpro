if(location.hostname!=="localhost"){
  console.log=()=>{};
  console.warn=()=>{};
  // Note: console.error intentionally NOT suppressed — allows Supabase/runtime errors to surface
}

const PRICE_PER_ACCESS = 24.99;
const PRICE_PER_BOOST  = 4.99;

// Build WA URLs using constants so price is always consistent
function _waAccessUrl(lang) {
  const amt = PRICE_PER_ACCESS.toFixed(2).replace('.', ',') + '€';
  const pt = `Olá! Quero acesso ao GigHub (+100 plataformas verificadas). Acabei de enviar ${amt} via MB Way para 938 556 803. Segue o comprovativo 👇`;
  const en = `Hi! I want access to GigHub (+100 verified platforms). I just sent €${PRICE_PER_ACCESS.toFixed(2)} via MB Way to 938 556 803. Receipt follows 👇`;
  return `https://wa.me/351938556803?text=${encodeURIComponent(lang === 'en' ? en : pt)}`;
}
function _waBoostUrl() {
  const amt = PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€';
  return `https://wa.me/351938556803?text=${encodeURIComponent(`Oi! Acabei de pagar ${amt} pelo GigBoost. Segue o comprovativo.`)}`;
}

// ── LOCAL PLATFORMS DATA ─────────────────────────────────────────
// SEGURANÇA: P começa vazio. Os dados são carregados pelo Supabase
// após validação do token em validarTokenSupabase().
// Nunca coloques dados aqui — qualquer pessoa pode ver o código-fonte.
var P = [];

// Session state — set to true after successful Supabase token validation
var hasAccess = false;
// Session integrity nonce — generated server-side during validarTokenSupabase().
// render() requires this to be set; typing `hasAccess=true` in DevTools alone
// leaves _sessionNonce null, so render() will not display content.
let _sessionNonce = null;


// ══ CRYPTO ══════════════════════════════════════════════════════
async function _sha256hex(str){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}




// ══ AUTH ════════════════════════════════════════════════════════

// ── showPasswordMode / showAdminLogin: display the access key input
function showPasswordMode(){
  const t=translations[currentLang]||translations['pt'];
  const lbl=document.getElementById('lockLabel');
  if(lbl) lbl.textContent=t.lockAccessCode||'Chave de acesso';
  document.getElementById('lockInput').style.display='block';
  document.getElementById('lockBtn').style.display='block';
  document.getElementById('lockBtn').textContent=t.lockEnter||'Entrar →';
  document.getElementById('lockHint').textContent=t.lockHintText||'Chave enviada após confirmação de pagamento';
}
function showAdminLogin(){
  const lbl=document.getElementById('lockLabel');
  if(lbl) lbl.textContent='🔑 Acesso Admin';
  document.getElementById('lockInput').style.display='block';
  document.getElementById('lockBtn').textContent='Entrar como Admin →';
  document.getElementById('lockBtn').style.display='block';
  document.getElementById('lockHint').textContent='Área restrita — só para o criador';
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
  // Apply same strict regex as saveSheetUrl() — protects against manually-tampered localStorage
  const _GS_REGEX = /^https:\/\/docs\.google\.com\/spreadsheets\/[^\s<>"']+$/;
  const safeSheetUrl = (_GS_REGEX.test(sheetUrl)) ? sheetUrl : '';
  // Use escHtml for proper attribute-context escaping (not just quote replacement)
  // safeSheetUrl is validated against Google Sheets domain + strict regex above; safe for href
  const safeSheetUrlEncoded = safeSheetUrl || '';

  container.innerHTML=`
  <div style="background:var(--green-pale);border:1.5px solid rgba(45,122,79,.3);border-radius:12px;padding:20px 18px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:10px">✅ Tokens geridos na Google Sheet</div>
    <div style="font-size:12px;color:var(--grey);line-height:1.7;margin-bottom:14px">
      Para <strong>criar token</strong>: abre a sheet, adiciona linha <code style="background:var(--cream);padding:1px 5px;border-radius:4px">token | nome | TRUE</code><br>
      Para <strong>revogar</strong>: muda <code style="background:var(--cream);padding:1px 5px;border-radius:4px">TRUE</code> para <code style="background:var(--red-pale);padding:1px 5px;border-radius:4px;color:var(--red)">FALSE</code><br>
      Alterações têm efeito <strong>imediato</strong> — sem upload de ficheiro.
    </div>
    ${safeSheetUrlEncoded
      ? `<a href="${escHtml(safeSheetUrlEncoded)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 18px;border-radius:8px;background:var(--green);color:#fff;text-decoration:none;font-size:13px;font-weight:700">
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
      ${escHtml(window.location.origin)}${escHtml(window.location.pathname)}<strong>#key=TOKEN_AQUI</strong>
    </code>
    <button data-action="copyBaseLink" style="margin-top:8px;height:30px;padding:0 12px;border-radius:6px;border:1px solid var(--border-md);background:transparent;font-size:11px;cursor:pointer;font-family:'Instrument Sans',sans-serif">📋 Copiar base do link</button>
  </div>`;
}

function saveSheetUrl(){
  const val=document.getElementById('sheetUrlInput')?.value.trim();
  // Strict validation: must be a Google Sheets URL with no suspicious characters
  if(val && val.startsWith('https://docs.google.com/spreadsheets/') && /^https:\/\/docs\.google\.com\/spreadsheets\/[^\s<>"']+$/.test(val)){
    localStorage.setItem('gh_sheet_url', val.substring(0, 500)); // cap length
    admRender();
  }
}

// ══ UTILS ═══════════════════════════════════════════════════════
function saveAffLinks(a){ localStorage.setItem('gh_aff',JSON.stringify(a)); }
function getAffLinks(){ try { return JSON.parse(localStorage.getItem('gh_aff')||'{}'); } catch(e){ return {}; } }
function getAlertWebhook(){ try { return localStorage.getItem('gh_alert_webhook')||''; } catch(e){ return ''; } }
function setAlertWebhook(url){ try { if(url) localStorage.setItem('gh_alert_webhook', url); else localStorage.removeItem('gh_alert_webhook'); } catch(e){} }
function initWebhookUI(){
  const inp=document.getElementById('adm-webhook-url');
  if(inp){inp.value=getAlertWebhook();updateWebhookStatus();}
}

let favs = (() => { try { const v = JSON.parse(localStorage.getItem('gh_favs')||'[]'); return Array.isArray(v) ? v.filter(x=>typeof x==='string' && x.length < 200) : []; } catch(e){ return []; } })();
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
  // For UX interviews (rate=18): apply a realistic PT-availability factor (~0.15).
  // Even if you set aside 10h/week, very few sessions are actually available in PT —
  // capping the estimate prevents dangerously inflated expectations.
  const _availFactor = rate === 18 ? 0.15 : 0.75;
  const _base = Math.round(h*4*rate*_availFactor);
  // Show a range (±25%) to signal it's indicative, not a guarantee.
  const _low  = Math.round(_base * 0.75 / 5) * 5;  // round to nearest 5
  const _high = Math.round(_base * 1.25 / 5) * 5;
  document.getElementById('calcResult').textContent= _low+'€–'+_high+'€';
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
  const sPT={
    2:'AttaPoll · Netsonda · YouGov',
    6:'Uber Eats · Glovo · Bolt Food',
    7:'DataAnnotation.tech · Clickworker · Outlier',
    8:'Rover · Babysits · Yoopies',
    10:'Superprof · Preply · TaskRabbit',
    18:'Prolific · UserInterviews · Respondent.io'
  };
  const sEN={
    2:'AttaPoll · Netsonda · YouGov',
    6:'Uber Eats · Glovo · Bolt Food',
    7:'DataAnnotation.tech · Clickworker · Outlier',
    8:'Rover · Babysits · Yoopies',
    10:'Superprof · Preply · TaskRabbit',
    18:'Prolific · UserInterviews · Respondent.io'
  };
  const s = currentLang==='en' ? sEN : sPT;
  const sugLabel = currentLang==='en' ? 'Suggested' : 'Sugestões';
  const estLabel = currentLang==='en' ? 'Conservative estimate · no guarantees' : 'Estimativa conservadora · sem garantias';
  document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+sugLabel+': <span style="font-weight:400;color:var(--grey)">'+s[rate]+'</span></div>';
  const rlEl=document.getElementById('calcResultLabelEl');
  if(rlEl) rlEl.textContent=currentLang==='en'?'Monthly estimate':'Estimativa mensal';
}

// ── Boost tokens — managed in Supabase (NOT localStorage)
// Legacy localStorage functions kept as stubs to avoid breaking any residual calls
function getBoostTokens(){ return {}; }
function saveBoostTokens(){ }

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
  const modal = document.getElementById('boostPayModal');
  if(modal) {
    // Update WA link href dynamically so price is always from the constant
    const waLink = modal.querySelector('a[href*="wa.me"]');
    if(waLink) waLink.href = _waBoostUrl();
    // Clear token input and error on each open (prevent stale state)
    const ti = document.getElementById('boostTokenInput');
    const te = document.getElementById('boostTokenErr');
    if(ti) ti.value = '';
    if(te) te.textContent = '';
  }
  modal.style.display='flex';
  _applyBoostPayLang();
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
    <div style="font-size:12px;color:var(--grey)">Acede ao Supabase Dashboard directamente no browser (não armazenado aqui por razões de segurança).</div>
  </div>
  <div style="background:var(--amber-pale);border:1px solid rgba(212,130,10,.3);border-radius:10px;padding:14px 16px;font-size:12px;color:var(--ink);line-height:1.6">
    ⚠️ Os tokens antigos em localStorage foram automaticamente removidos na migração para Supabase.
  </div>`;
}
function admAddBoostToken(){
  // Tokens are managed in Supabase (boost_tokens table) — cannot be created client-side.
  // This UI stub is left for compat; direct the admin to Supabase dashboard instead.
  const newCodeEl = document.getElementById('adm-boost-newcode');
  const codeTextEl = document.getElementById('adm-boost-codetext');
  if(newCodeEl && codeTextEl) {
    codeTextEl.textContent = '— Cria o token no Supabase dashboard →';
    newCodeEl.style.display = 'block';
  }
}
function admCopyBoostCode(){ navigator.clipboard.writeText(document.getElementById('adm-boost-codetext').textContent).then(()=>{const b=document.getElementById('boostCopyBtn');b.textContent='✓ Copiado!';b.style.color='var(--green)';setTimeout(()=>{b.textContent='Copiar';b.style.color='';},2000);}); }
function admRevokeBoost(c){ console.warn('[GigHub Admin] Revoke boost tokens via Supabase dashboard (table: boost_tokens, set is_active=false).'); }
function admRestoreBoost(c){ console.warn('[GigHub Admin] Restore boost tokens via Supabase dashboard (table: boost_tokens, set is_active=true).'); }
function admTab(tab){['tokens','aff','boost'].forEach(t=>{const p=document.getElementById('admPane-'+t),b=document.getElementById('admTab-'+t);if(!p||!b)return;p.style.display=t===tab?'':'none';if(t===tab){b.style.background='var(--ink)';b.style.color='var(--paper)';b.style.border='none';}else{b.style.background='transparent';b.style.color='var(--grey)';b.style.border='1px solid var(--border-md)';}});if(tab==='boost')admRenderBoost();}
function admSaveAff(){const inputs=document.querySelectorAll('[data-aff]');const data={};inputs.forEach(inp=>{if(inp.value.trim())data[inp.dataset.aff]=inp.value.trim();});saveAffLinks(data);render();const btn=document.querySelector('.adm-save-aff-btn');if(!btn) return;const o=btn.textContent;btn.textContent='✓ Guardado!';btn.style.background='#1a5c35';setTimeout(()=>{btn.textContent=o;btn.style.background='var(--green)';},2000);}

// ── DATA ──
const catLabels = {
  pt: {surveys:'Surveys',gigs:'Gigs',freelance:'Freelance',micro:'Treino de IA',testing:'Testes',criativo:'Stock & Design',conteudo:'Conteúdo',tasks:'Get-Paid-To',mystery:'Cliente Mistério',transcricao:'Transcrição',tutoring:'Tutoria',ugc:'UGC',passive:'Nicho',remote:'Emprego Remoto',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'Trabalho Presencial'},
  en: {surveys:'Surveys',gigs:'Gigs',freelance:'Freelance',micro:'AI Training',testing:'App Testing',criativo:'Stock & Design',conteudo:'Content',tasks:'Get-Paid-To',mystery:'Mystery Shopping',transcricao:'Transcription',tutoring:'Tutoring',ugc:'UGC',passive:'Niche',remote:'Remote Jobs',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'In-Person Work'}
};
let catLabel = catLabels['pt'];

// ── TAXONOMY — sistema de três pilares fixos ──────────────────────────────────
//
// PILAR 1 — DIFICULDADE DE ENTRADA (sempre visível, um de três estados):
//   [Rigoroso]  → entrevista, lista de espera, teste de admissão, seleção competitiva.
//   [Moderado]  → exige licenciatura / portfólio / background profissional específico.
//   [Fácil]     → registo aberto, sem teste, sem entrevista.
//
// PILAR 2 — ESTABILIDADE DE GANHOS (sempre visível, um de dois estados):
//   [Estável]   → taxa fixa ou previsível (entrega, aula, hora).
//   [Variável]  → ganhos flutuantes (disponibilidade, procura, comissões).
//
// PILAR 3 — DESTAQUE (opcional, máx. 1 por card):
//   [Recomendado] → seleção curada de top picks.
//
// Regras de prioridade:
//   Pilar 1: Rigoroso > Moderado > Fácil (set explícito > easy score > fallback de categoria)
//   Pilar 2: set explícito > ratings.realistic > fallback de categoria
//   Pilar 3: _SUGGESTED_SET (independente dos outros dois)
// ─────────────────────────────────────────────────────────────────────────────

// PILAR 1 — RIGOROSO: entrevista / lista de espera / teste de admissão / seleção competitiva
const _RIGOROSO_PLATFORMS = new Set([
  'Prolific',
  'Respondent.io','Respondent',
  'UserInterviews',
  'NannyPortugal','Nanny Portugal',
  'Zoowish',
  'Cambly',
  'Hotjar Engage','Hotjar',
  'PlaytestCloud',
  'TestingTime',
  'Tryber',
  'dscout',
]);

// PILAR 1 — MODERADO: exige licenciatura / portfólio / background profissional
const _MODERADO_PLATFORMS = new Set([
  'CourseHero','Course Hero',
  '99designs',
  'DataAnnotation.tech','DataAnnotation',
  'Outlier',
  'TransPerfect',
  // Entregas — exigem documentos (carta, veículo, verificação de antecedentes)
  // mas sem entrevista nem lista de espera → moderado, nunca rigoroso
  'Uber Eats (Courier)','Glovo','Bolt Food (Courier)',
  'Carteiro CTT','Grabr',
  'Bolt Driver','Uber Driver',
]);

// PILAR 2 — ESTÁVEL: taxa fixa ou previsível uma vez ativo
const _ESTAVEL_PLATFORMS = new Set([
  'Uber Eats (Courier)','Glovo','Bolt Food (Courier)',
  'Clickworker','Preply','Superprof','Cambly',
  'Bolt Driver','Bolt Courier','Carteiro CTT',
  'Uber Driver',
]);

// PILAR 2 — VARIÁVEL: ganhos dependem de disponibilidade / procura / comissões
const _VARIAVEL_PLATFORMS = new Set([
  'Freecash','ySense','Swagbucks','AttaPoll',
  'UserInterviews','Respondent.io','Respondent','Prolific',
  'Etsy','Adobe Stock','Shutterstock',
  'Substack','Ko-fi',
  'dscout','PlaytestCloud','TestingTime',
  'Triaba','NiceQuest','ZapSurveys','Zap Surveys',
]);

// Fallback por categoria — ENTRADA (usado quando a plataforma não está em nenhum set de entrada)
const _CAT_ENTRY_FALLBACK = {
  surveys:'facil', tasks:'facil', micro:'facil', gigs:'facil',
  f2f:'facil', petsitting:'facil', babysitting:'facil',
  mystery:'facil', passive:'facil', conteudo:'facil', transcricao:'facil',
  testing:'moderado', criativo:'moderado', ugc:'moderado',
  freelance:'moderado', tutoring:'moderado', remote:'moderado',
};

// Fallback por categoria — GANHOS (usado quando a plataforma não está em nenhum set de ganhos)
const _CAT_EARNINGS_FALLBACK = {
  gigs:'estavel', petsitting:'estavel', babysitting:'estavel', f2f:'estavel', micro:'estavel',
  surveys:'variavel', testing:'variavel', criativo:'variavel',
  conteudo:'variavel', tasks:'variavel', ugc:'variavel',
  passive:'variavel', transcricao:'variavel', mystery:'variavel',
  tutoring:'variavel', freelance:'variavel', remote:'variavel',
};

function renderRatings(p){
  const r = p.ratings || {};
  const isEn = currentLang === 'en';

  // ── PILAR 1: Dificuldade de Entrada ──────────────────────────────────────────
  let entryLevel;
  // _MODERADO_PLATFORMS tem prioridade máxima — sobrepõe-se ao easy<=2 da DB.
  // Isto garante que plataformas de entregas (documentos mas sem entrevista)
  // nunca aparecem como Rigoroso independentemente do score na DB.
  if(_MODERADO_PLATFORMS.has(p.name)) {
    entryLevel = 'moderado';
  } else if(_RIGOROSO_PLATFORMS.has(p.name) || p.easy <= 2) {
    entryLevel = 'rigoroso';
  } else if(p.easy >= 4) {
    entryLevel = 'facil';
  } else {
    entryLevel = _CAT_ENTRY_FALLBACK[p.cat] || 'facil';
  }

  const entryTag = entryLevel === 'rigoroso'
    ? `<span class="rtag rtag-selective">🔴 ${isEn?'Competitive':'Rigoroso'}</span>`
    : entryLevel === 'moderado'
      ? `<span class="rtag rtag-entry-mid">🟡 ${isEn?'Qualification req.':'Moderado'}</span>`
      : `<span class="rtag rtag-entry-easy">🟢 ${isEn?'Easy sign-up':'Fácil'}</span>`;

  // ── PILAR 2: Estabilidade de Ganhos ──────────────────────────────────────────
  let earningsLevel;
  if(_ESTAVEL_PLATFORMS.has(p.name) || r.realistic >= 4) {
    earningsLevel = 'estavel';
  } else if(_VARIAVEL_PLATFORMS.has(p.name) || r.realistic <= 2) {
    earningsLevel = 'variavel';
  } else {
    earningsLevel = _CAT_EARNINGS_FALLBACK[p.cat] || 'variavel';
  }

  const earningsTag = earningsLevel === 'estavel'
    ? `<span class="rtag rtag-realistic-high">💰 ${isEn?'Stable':'Estável'}</span>`
    : `<span class="rtag rtag-realistic-low">💰 ${isEn?'Variable':'Variável'}</span>`;

  // ── PILAR 3: Destaque (opcional) ─────────────────────────────────────────────
  const highlightTag = _SUGGESTED_SET.has(p.name)
    ? `<span class="rtag rtag-suggested">⭐ ${isEn?'Recommended':'Recomendado'}</span>`
    : '';

  return `<div class="ratings-row">${entryTag}${earningsTag}${highlightTag}</div>`;
}

// NOTE: no-cors fetch blocks all response inspection, so this function
// cannot actually detect downtime or issues. It always resolves to 'safe'.
// Kept only because checkAllSecurity is referenced in the admin panel;
// no sec-badge is inserted by render() so no misleading indicator reaches users.
async function checkSecurity(domain){
  if(!window.secStatus) window.secStatus = {};
  if(secStatus[domain]) return secStatus[domain];
  secStatus[domain]={status:'safe',label:'✓ Online'};
  return secStatus[domain];
}

async function checkAllSecurity(){
  const btn=document.querySelector('.check-all-security-btn');
  if(!btn) return;
  btn.textContent='⏳ A verificar…';btn.disabled=true;
  const domains=P.reduce((acc,p)=>{ try{ acc.push(new URL(p.url).hostname.replace('www.','')); }catch(e){} return acc; },[]);
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
let activeWorkType = '';

// ── Delivery platform names (subset of cat:gigs)
const _DELIVERY_NAMES = new Set([
  'Uber Eats (Courier)', 'Glovo', 'Bolt Food (Courier)', 'Carteiro CTT',
  'Grabr',
  'Bolt Driver', 'Uber Driver',
]);

// ── Inherently face-to-face categories
const _F2F_CATS = new Set(['f2f', 'gigs', 'petsitting', 'babysitting']);

// ── New tab group filters (maps tab data-v → predicate on platform)
const TAB_CAT_FILTERS = {
  '':           () => true,
  'surveys':    p => p.cat === 'surveys',
  'testing':    p => p.cat === 'testing',
  'micro':      p => p.cat === 'micro',
  'mystery':    p => p.cat === 'mystery',
  'gpt':        p => p.cat === 'tasks',
  'deliveries': p => p.cat === 'gigs' && _DELIVERY_NAMES.has(p.name),
  'skills':     p => ['freelance', 'tutoring', 'transcricao', 'remote'].includes(p.cat),
  'criativo':   p => p.cat === 'criativo',
  'creative':   p => ['conteudo', 'ugc'].includes(p.cat),
  'gigs_events':p => p.cat === 'gigs' && !_DELIVERY_NAMES.has(p.name),
  'caregiving': p => ['petsitting', 'babysitting'].includes(p.cat),
  'f2f':        p => p.cat === 'f2f',
  'other':      p => ['passive'].includes(p.cat),
};

// ── Display labels for each tab group
const TAB_GROUP_LABELS = {
  pt: {
    '':           'Todas as plataformas',
    'surveys':    '📝 Inquéritos e Estudos de Mercado',
    'testing':    '🔬 Testes de Usabilidade e Estudos Comportamentais',
    'micro':      '🤖 Treino de Inteligência Artificial e Microtarefas',
    'mystery':    '🕵️ Cliente Mistério e Auditoria de Qualidade',
    'gpt':        '🎁 Plataformas Get-Paid-To (Recompensas e Ofertas)',
    'deliveries': '🚗 Entregas, Estafetas e Condução',
    'skills':     '🧑‍🏫 Ensino, Tutorias e Apoio Académico',
    'criativo':   '🎨 Venda de Stock, Design e E-commerce',
    'creative':   '📱 Criação de Conteúdo, E-commerce e Influência',
    'gigs_events':'🛠️ Tarefas Locais, Eventos e Hotelaria',
    'caregiving': '🫶 Caregiving',
    'f2f':        '🤝 Trabalho Presencial e Local',
    'other':      '💚 Outras Plataformas e Serviços de Nicho',
  },
  en: {
    '':           'All platforms',
    'surveys':    '📝 Surveys & Market Research',
    'testing':    '🔬 Usability Testing & Behavioural Studies',
    'micro':      '🤖 AI Training & Micro-tasks',
    'mystery':    '🕵️ Mystery Shopping & Quality Auditing',
    'gpt':        '🎁 Get-Paid-To (Rewards & Offers)',
    'deliveries': '🚗 Deliveries, Couriers & Driving',
    'skills':     '🧑‍🏫 Teaching, Tutoring & Academic Support',
    'criativo':   '🎨 Stock, Design & E-commerce',
    'creative':   '📱 Content Creation, E-commerce & Influence',
    'gigs_events':'🛠️ Local Tasks, Events & Hospitality',
    'caregiving': '🫶 Caregiving',
    'f2f':        '🤝 In-Person & Local Work',
    'other':      '💚 Other Platforms & Niche Services',
  },
};
function setTab(v){
  activeTab=v;
  // Reset curation when a tab is explicitly selected — prevents stacked zero-result confusion
  activeCuration='';
  document.querySelectorAll('.curation-pill').forEach(el=>el.classList.toggle('active',el.dataset.curation===''));
  const _tabsWrapEl = document.getElementById('tabsWrap');
  if(_tabsWrapEl) _tabsWrapEl.classList.remove('collapsed');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.v===v));
  render();
}

function easyBar(n){
  const isEn = currentLang === 'en';
  const label = isEn ? 'Entry' : 'Entrada';
  const dotCls = n >= 4 ? 'on-easy' : n >= 3 ? 'on-mid' : 'on-hard';
  let h = `<div class="easy-row"><span class="easy-label">${label}</span>`;
  for(let i=1;i<=5;i++) h += `<div class="edot ${i<=n ? dotCls : ''}"></div>`;
  return h + '</div>';
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

// XSS sanitisation for platform data — escHtml() is declared below (hoisted) and aliased as _xss


function render(){
  const _searchEl=document.getElementById('search');
  if(!_searchEl) return; // element not yet in DOM
  const q=_searchEl.value.toLowerCase();
  const geo='';
  const sort='earn';
  const cat=activeTab;
  const curationFn = activeCuration ? curationFilters[activeCuration] : null;

  const _workType = document.getElementById('fWorkType') ? document.getElementById('fWorkType').value : activeWorkType;
  let list=P.filter(p=>{
    if(curationFn && !curationFn(p)) return false;
    if(showFavsOnly && !favs.includes(p.name)) return false;
    if(q && !p.name.toLowerCase().includes(q) && !(currentLang==='en'&&p.descEn?p.descEn:p.desc).toLowerCase().includes(q) && !(catLabel[p.cat]||'').toLowerCase().includes(q)) return false;
    // New tab group filter
    if(cat) { const _tf = TAB_CAT_FILTERS[cat]; if(!_tf || !_tf(p)) return false; }
    // Work type filter (Remote / Face-to-Face)
    if(_workType === 'f2f' && !_F2F_CATS.has(p.cat)) return false;
    if(_workType === 'remote' && _F2F_CATS.has(p.cat)) return false;
    if(geo==='pt' && !p.pt) return false;
    if(geo==='eu' && !p.eu) return false;
    return true;
  });

  if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='easy') list.sort((a,b)=>b.easy-a.easy);
  else list.sort((a,b)=>b.earnN-a.earnN);

  document.getElementById('s-total').textContent=list.length;
  const topCount = list.filter(p=>_SUGGESTED_SET.has(p.name)).length;
  const _earnEl = document.getElementById('s-earn');
  if(_earnEl) _earnEl.textContent = topCount||'—';
  document.getElementById('barCount').textContent=list.length+(currentLang==='en'?' result'+(list.length!==1?'s':''):(` resultado${list.length!==1?'s':''}`));

  // ── Update tab counts (based on current geo/curation/search/workType, ignoring category filter) ──
  const _tabBase = P.filter(p=>{
    if(curationFn && !curationFn(p)) return false;
    if(showFavsOnly && !favs.includes(p.name)) return false;
    if(q && !p.name.toLowerCase().includes(q) && !(currentLang==='en'&&p.descEn?p.descEn:p.desc).toLowerCase().includes(q) && !(catLabel[p.cat]||'').toLowerCase().includes(q)) return false;
    if(_workType === 'f2f' && !_F2F_CATS.has(p.cat)) return false;
    if(_workType === 'remote' && _F2F_CATS.has(p.cat)) return false;
    if(geo==='pt' && !p.pt) return false;
    if(geo==='eu' && !p.eu) return false;
    return true;
  });
  document.querySelectorAll('.tab[data-v]').forEach(tab=>{
    const countEl=tab.querySelector('.tab-count');
    if(!countEl) return;
    const v=tab.dataset.v;
    if(v===''){countEl.textContent='';return;}
    const f=TAB_CAT_FILTERS[v];
    if(!f){countEl.textContent='';return;}
    const cnt=_tabBase.filter(f).length;
    countEl.textContent=cnt>0?cnt:'';
  });
  // barTitle: curation > tab > default
  const _curationTitles={
    pt:{portugal:'Top picks Portugal 🇵🇹',beginners:'Boas para iniciantes 🌱',bestpay:'Melhores pagamentos 💰',fastest:'Ganhos estáveis ⚡',noexp:'Sem experiência necessária 🚀'},
    en:{portugal:'Top picks Portugal 🇵🇹',beginners:'Good for beginners 🌱',bestpay:'Best payouts 💰',fastest:'Stable earnings ⚡',noexp:'No experience needed 🚀'}
  };
  const _curationTitle = activeCuration ? (_curationTitles[currentLang]||_curationTitles.pt)[activeCuration] : null;
  const _tabGroupLabel = (TAB_GROUP_LABELS[currentLang]||TAB_GROUP_LABELS.pt)[cat];
  document.getElementById('barTitle').textContent= _curationTitle || _tabGroupLabel || translations[currentLang].barTitle;

  const grid=document.getElementById('grid');
  if(!hasAccess || !_sessionNonce){
    grid.innerHTML=''; // grid hidden behind lock screen anyway, keep empty
    return;
  }
  // Show loading skeleton if access granted but data not yet received.
  // A one-time 8s watchdog is set on first render after unlock; if P is still
  // empty after that, it means the RPC returned no rows — show an error.
  if(hasAccess && P.length === 0) {
    if(!window._loadWatchdog) {
      window._loadWatchdog = setTimeout(() => {
        if(P.length === 0 && hasAccess) {
          const g = document.getElementById('grid');
          if(g) g.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div>${currentLang==='en'?'No platforms received. Please reload the page.':'Nenhuma plataforma recebida. Por favor, recarrega a página.'}</div>`;
        }
      }, 8000);
    }
    grid.innerHTML = `<div class="empty"><div class="empty-ico" style="font-size:32px;animation:spin 1s linear infinite;display:inline-block">⏳</div><br><span style="font-size:13px;color:var(--grey)">${currentLang==='en'?'Loading platforms…':'A carregar plataformas…'}</span></div>`;
    return;
  }
  if(window._loadWatchdog) { clearTimeout(window._loadWatchdog); window._loadWatchdog = null; }
  if(!list.length){
    grid.innerHTML=`<div class="empty"><div class="empty-ico">🔍</div>${currentLang==='en'?'No platforms found.':'Nenhuma plataforma encontrada.'}<br><button class="clear-filters-btn" style="margin-top:12px;height:34px;padding:0 16px;border-radius:8px;border:1px solid var(--border-md);background:transparent;cursor:pointer;font-size:12px;color:var(--grey)">${currentLang==='en'?'Clear filters':'Limpar filtros'}</button></div>`;
    return;
  }

  grid.innerHTML=list.map((p,i)=>{
    const domain=new URL(p.url||'https://example.com').hostname.replace('www.','');
    const rawUrl = p.url||'';
    const _safeSchemes = ['https://','http://'];
    const _blockedPatterns = ['javascript:','data:text','vbscript:','file:','data:application','localhost','127.0.0.1','0.0.0.0'];
    const effectiveUrl = _safeSchemes.some(s=>rawUrl.startsWith(s)) && !_blockedPatterns.some(b=>rawUrl.toLowerCase().includes(b)) ? rawUrl : null;
    const cardClass = p.dimmed?'dimmed':(p.beginner && p.cat!=='f2f'?'beginner-pick':'');
    return `
    <div class="card ${cardClass}" role="button" aria-label="${_xss(p.name)}" data-domain="${_xss(domain)}" data-url="${_xss(effectiveUrl||'')}" tabindex="0" style="animation-delay:${Math.min(i,16)*.025}s">
      <div class="card-top">
        <div class="card-ico" aria-hidden="true" style="${[...p.icon||'📌'].length>=2?'font-size:13px;flex-wrap:wrap;overflow:hidden;':''}">${_xss(p.icon||'📌')}</div>
        <div class="card-meta-top">
          <div class="card-name">${_xss(p.name)}</div>
          <div class="card-cats">
            <span class="chip ch-${_xss(p.cat)}">${_xss(catLabel[p.cat]||p.cat)}</span>
          </div>
        </div>
      </div>
      <div class="card-desc">${_xss(currentLang==='en' && p.descEn ? p.descEn : p.desc)}</div>
      ${renderRatings(p)}
      <div class="card-row">
        <span style="font-weight:600;color:var(--ink);font-size:13px">${_genericEarn(p.cat)}</span>
      </div>
      <div class="card-foot">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="fav-btn" data-name="${_xss(p.name)}" title="${favs.includes(p.name)?(currentLang==='en'?'Remove favourite':'Remover favorito'):(currentLang==='en'?'Add favourite':'Adicionar favorito')}" style="background:${favs.includes(p.name)?'var(--gold-pale)':'transparent'};border:1px solid ${favs.includes(p.name)?'rgba(201,168,76,.3)':'var(--border-md)'};border-radius:20px;width:32px;height:32px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s">${favs.includes(p.name)?'★':'☆'}</button>
          ${effectiveUrl ? `<a href="${_xss(effectiveUrl)}" target="_blank" rel="noopener noreferrer" class="open-btn">` : `<span class="open-btn" style="opacity:.5;cursor:not-allowed">`}
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
  // easy >= 3 guard: even if a platform is flagged as beginner-friendly in the DB,
  // it must not appear in this filter if entry is genuinely hard (easy <= 2).
  beginners: p => (p.beginner === true || (p.ratings && p.ratings.beginner === true)) && p.easy >= 3,
  bestpay: p => p.earnN >= 15,
  fastest: p => p.ratings && p.ratings.payout >= 4,
  // easy >= 4: quick/open registration. Also exclude platforms with unrealistic earnings
  // (realistic <= 2) to avoid recommending bait platforms to people with no experience.
  noexp: p => p.easy >= 4 && !(p.ratings && p.ratings.realistic <= 1),
};

function setCuration(key) {
  activeCuration = key;
  // Reset tab when a curation is selected — prevents stacked zero-result confusion
  activeTab = '';
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.v===''));
  document.querySelectorAll('.curation-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.curation === key);
  });
  render();
}

// ── LANGUAGE TOGGLE ──
let currentLang = (function(){ try { const v = localStorage.getItem('gh_lang'); return (v === 'pt' || v === 'en') ? v : 'pt'; } catch(e){ return 'pt'; } })();
const translations = {
  pt: {
    navFavs: '⭐ Favoritos',
    navCalc: 'Calcular ganhos',
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
    heroTag: '✅ +100 plataformas verificadas · Atualizado',
    heroH1: 'Ganha dinheiro<br>online, <em>de verdade.</em>',
    heroDesc: 'Surveys académicos, freelance, micro-tarefas de IA, testes de apps, criação de conteúdo e gigs físicos. Cada plataforma verificada manualmente.',
    statPt: 'Disponíveis PT',
    statCats: 'Categorias',
    statAvgEarn: 'Sugeridas',
    statTotal: 'Plataformas',
    tabAll: 'Todas',
    openBtn: 'Abrir',
    secVerify: '✅ Plataformas verificadas',
    barTitle: 'Todas as plataformas',
    // Lock screen
    lockSub: 'Acesso Privado · Área Exclusiva',
    lockHeadline: '+100 plataformas<br><em>verificadas</em> num só lugar',
    lockTagline: 'Surveys, freelance, treino de IA, gigs físicos e muito mais — curado e testado, em português.',
    lstat1: 'Plataformas verificadas',
    lstat2: 'Categorias diferentes',
    lstat3: 'Acesso único, sem subscrição',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 Treino IA',
    lockCatCreative: '📸 Criativo',
    lockCatContent: '✍️ Conteúdo',
    lockPayText: 'Para obter acesso envia 24,99€ por MB Way ou transferência para<br><a href="https://wa.me/351938556803" target="_blank" rel="noopener noreferrer" style="color:#25D166;text-decoration:none">WhatsApp → 938 556 803</a>',
    lockVerifying: 'A verificar acesso…',
    lockEnter: 'Entrar →',
    lockStep1Label: 'Como obter acesso',
    lockStep1Desc: 'Envia <strong>24,99€ via MB Way</strong> para <strong>938 556 803</strong> e clica no botão. Recebes a tua chave de acesso em minutos.',
    lockWaBtn: 'Pedir Acesso via WhatsApp',
    lockStep2: 'Já tens a tua chave de acesso?',
    lockEnterBtn: 'Entrar →',
    tabTranscricao: 'Transcrição',
    tabTutoring: 'Tutoria',
    tabPassive: 'Renda Passiva',
    tabRemote: 'Emprego Remoto',
    lockHintText: 'Chave enviada após confirmação de pagamento',
    lockAccessCode: 'Chave de acesso',
    lockRevoked: '🚫 Acesso revogado',
    lockRevokedMsg: 'Esta chave foi desativada. Contacta o suporte.',
    // Guide
    guideH2: 'Como começar<br><em style="font-style:italic;color:var(--gold)">em 3 passos.</em>',
    welcomeTitle: 'Bem-vindo ao GigHub',
    welcomeBody: 'Tens acesso a <strong style="color:var(--ink)">+100 plataformas verificadas</strong> para ganhar dinheiro online — surveys, freelance, IA, gigs físicos e muito mais.<br><br>Usa os filtros para encontrar o que funciona para ti. Começa pelas marcadas como <strong style="color:#8a6820">⭐ Recomendado</strong>.',
    welcomeTip: '⭐ <strong>Dica de membro:</strong> Marca os teus favoritos com o botão ★ em cada card. Calcula quanto podes ganhar com a calculadora no topo.',
    welcomeClose: 'Explorar plataformas →',
    guideSub: 'Sem investimentos, sem riscos. Só tempo e acesso à internet.',
    guideStep1H: 'Regista-te gratuitamente',
    guideStep2H: 'Configura o pagamento',
    guideStep3H: 'Diversifica as fontes',
    guideStep1P: 'Clica "Abrir", cria conta com email. <strong>Nunca pagues para te registar</strong> — todas as plataformas aqui listadas são 100% gratuitas.',
    guideStep2P: 'PayPal (mais comum), transferência bancária ou gift cards. Configura no painel da conta. Levantamentos a partir de 5–25€ consoante a plataforma.',
    guideStep3P: 'Muitos utilizadores combinam 4–6 plataformas. Diversificar entre surveys, IA e freelance ajuda a estabilizar o rendimento ao longo do mês.',
    guideTip: '<strong>★ Top 3 para Portugal em 2026 —</strong> <strong>AttaPoll</strong> (app de surveys, simples, paga por PayPal, disponível em PT) · <strong>Clickworker</strong> (micro-tarefas de IA, boa disponibilidade PT, entrada fácil) · <strong>Netsonda</strong> (estudos de mercado em PT, fácil de começar, sem requisitos)',
    // Monetization
    monoTitle: 'Queres acesso ao GigHub?',
    monoDesc: 'Envia 24,99€ por MB Way para <strong>938 556 803</strong> e envia o comprovativo via WhatsApp. Recebes a chave de acesso em minutos. Os recibos partilhados podem conter dados pessoais — ver <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.6)">Política de Privacidade</a>.',
    monoPayLabel: 'Alternativa — Transferência bancária',
    monoPayNote: 'Após transferência, envia comprovativo para WhatsApp',
    monoWaBtn: 'Pedir acesso via WhatsApp →',
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
    boostPayInstr: 'Envia <strong>4,99€</strong> via <strong>MB Way</strong> para <strong>938 556 803</strong> e envia o comprovativo no WhatsApp.<br>O acesso é enviado após confirmação do pagamento.',
    boostPayBtn: 'Enviar comprovativo via WhatsApp →',
    boostCodeLabel: 'Já tens chave de acesso? Insere aqui:',
    boostCodeBtn: 'Verificar →',
    boostOpenFormBtn: 'Verificar código e preencher perfil →',
    boostCodeErr: 'Chave inválida ou já utilizada.',
    // Calculator
    calcTitle: '💰 Calculadora de Ganhos',
    calcDesc: 'Estimativa orientativa — os ganhos reais dependem da disponibilidade, perfil e plataforma.',
    calcTypeLabel: 'Tipo de trabalho preferido',
    calcHoursLabel: 'Horas por semana disponíveis',
    calcOpt2: 'Surveys & Get-Paid-To',
    calcOpt6: 'Entregas & Condução',
    calcOpt7: 'Treino de IA & Microtarefas',
    calcOpt10: 'Tutoria, Freelance & Biscates',
    calcOpt8: 'Pet Sitting & Babysitting',
    calcOpt18: 'Testes de Usabilidade & Entrevistas UX (vagas limitadas)',
    calcResult: 'Estimativa orientativa',
  },
  en: {
    navFavs: '⭐ Favourites',
    navCalc: 'Earnings calc',
    navGuia: 'Guide',
    footerText: '<strong>GigHub</strong> · Curated work opportunities · No paid affiliations',
    navStart: 'Get started ↗',
    searchPlaceholder: 'Search platform…',
    geoAll: '🌍 All countries',
    geoPt: '🇵🇹 Portugal',
    geoEu: '🇪🇺 European Union',
    sortEarn: '↑ Highest earn',
    sortEasy: '✓ Easiest first',
    sortName: 'A–Z Name',
    heroTag: '✅ +100 verified platforms · Updated',
    heroH1: 'Earn money<br>online, <em>for real.</em>',
    heroDesc: 'Academic surveys, freelance, AI micro-tasks, app testing, content creation and physical gigs. Every platform manually verified.',
    statPt: 'Available PT',
    statCats: 'Categories',
    statAvgEarn: 'Suggested',
    statTotal: 'Platforms',
    tabAll: 'All',
    openBtn: 'Open',
    secVerify: '✅ Verified platforms',
    barTitle: 'All platforms',
    // Lock screen
    lockSub: 'Private Access · Exclusive Area',
    lockHeadline: '+100 verified<br><em>platforms</em> in one place',
    lockTagline: 'Surveys, freelance, AI training, physical gigs and much more — curated and tested.',
    lstat1: 'Verified platforms',
    lstat2: 'Different categories',
    lstat3: 'One-time access, no subscription',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 AI Training',
    lockCatCreative: '📸 Creative',
    lockCatContent: '✍️ Content',
    lockPayText: 'To get access send €24.99 via MB Way to <strong>938 556 803</strong> or by bank transfer — then click the button below.',
    lockVerifying: 'Verifying access…',
    lockEnter: 'Enter →',
    lockHintText: 'Access key sent after payment confirmation',
    lockAccessCode: 'Access key',
    lockRevoked: '🚫 Access revoked',
    lockRevokedMsg: 'This access key has been deactivated. Contact support.',
    // Guide
    guideH2: 'How to start<br><em style="font-style:italic;color:var(--gold)">in 3 steps.</em>',
    welcomeTitle: 'Welcome to GigHub',
    welcomeBody: 'You have access to <strong style="color:var(--ink)">+100 verified platforms</strong> to earn money online — surveys, freelance, AI, physical gigs and much more.<br><br>Use the filters to find what works for you. Start with those marked as <strong style="color:#8a6820">⭐ Recommended</strong>.',
    welcomeTip: '⭐ <strong>Member tip:</strong> Save your favourites with the ★ button on each card. Calculate how much you can earn with the calculator at the top.',
    welcomeClose: 'Explore platforms →',
    guideSub: 'No investments, no risks. Just time and internet access.',
    guideStep1H: 'Register for free',
    guideStep1P: 'Click "Open", create an account with your email. <strong>Never pay to register</strong> — all platforms listed here are 100% free.',
    guideStep2H: 'Set up your payment method',
    guideStep2P: 'PayPal (most common), bank transfer or gift cards. Set up in your account dashboard. Withdrawals from €5–25 depending on the platform.',
    guideStep3H: 'Diversify your income sources',
    guideStep3P: 'Many users combine 4–6 platforms. Diversifying across surveys, AI and freelance helps stabilise income throughout the month.',
    guideTip: '<strong>★ Top 3 for 2026 —</strong> <strong>AttaPoll</strong> (survey app, simple, pays via PayPal, available in PT) · <strong>Clickworker</strong> (AI micro-tasks, good PT availability, easy entry) · <strong>Netsonda</strong> (market research in PT, easy to start, no requirements)',
    // Monetization
    monoTitle: 'Get access to GigHub',
    monoDesc: 'Send €24.99 via MB Way to <strong>938 556 803</strong> and share the receipt via WhatsApp. You\'ll receive the access key in minutes. Receipts shared may contain personal data — see <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.6)">Privacy Policy</a>.',
    monoPayLabel: 'Alternative — Bank transfer',
    monoPayNote: 'After the transfer, send the receipt via WhatsApp',
    monoWaBtn: 'Request access via WhatsApp →',
    lockStep1Label: 'How to get access',
    lockStep1Desc: 'Send <strong>€24.99 via MB Way</strong> to <strong>938 556 803</strong> and click the button. You will receive your access key in minutes.',
    lockWaBtn: 'Request Access via WhatsApp',
    lockStep2: 'Already have your access key?',
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
    boostPayInstr: 'Send <strong>€4.99</strong> via <strong>MB Way</strong> to <strong>938 556 803</strong> and send the receipt on WhatsApp.<br>Access is sent after payment confirmation.',
    boostPayBtn: 'Send receipt via WhatsApp →',
    boostCodeLabel: 'Already have an access key? Enter here:',
    boostCodeBtn: 'Verify →',
    boostOpenFormBtn: 'Verify code and fill profile →',
    boostCodeErr: 'Invalid or already used access key.',
    lockHintText: 'Access key sent after payment confirmation',
    // Calculator
    calcTitle: '💰 Earnings Calculator',
    calcDesc: 'Indicative estimate — actual earnings depend on availability, profile and platform.',
    calcTypeLabel: 'Preferred work type',
    calcHoursLabel: 'Hours per week available',
    calcOpt2: 'Surveys & Get-Paid-To',
    calcOpt6: 'Deliveries & Driving',
    calcOpt7: 'AI Training & Micro-tasks',
    calcOpt10: 'Tutoring, Freelance & Local Gigs',
    calcOpt8: 'Pet Sitting & Babysitting',
    calcOpt18: 'Usability Testing & UX Interviews (limited slots)',
    calcResult: 'Indicative estimate',

  }
};

function toggleLang(){
  currentLang = currentLang === 'pt' ? 'en' : 'pt';
  try { localStorage.setItem('gh_lang', currentLang); } catch(e) {}
  document.documentElement.lang = currentLang; // update <html lang> for accessibility
  const btn = document.getElementById('langToggle');
  btn.textContent = currentLang === 'pt' ? 'EN' : 'PT';
  applyLang();
}

// Lock screen language toggle (before unlock)
function toggleLockLang(){
  currentLang = currentLang === 'pt' ? 'en' : 'pt';
  try { localStorage.setItem('gh_lang', currentLang); } catch(e) {}
  const btn = document.getElementById('lockLangBtn');
  btn.textContent = currentLang === 'pt' ? 'EN' : 'PT';
  applyLockLang();
}

function applyLockLang(){
  const t = translations[currentLang] || translations['pt'];
  const isEn = currentLang === 'en';
  const set = (id, html) => { const el = document.getElementById(id); if(el && html) el.innerHTML = html; };
  const setText = (id, pt, en) => { const el = document.getElementById(id); if(el) el.textContent = isEn ? en : pt; };
  // Update lock screen WA href so price matches constant and correct language
  const waCta = document.querySelector('.wa-cta-btn');
  if(waCta) waCta.href = _waAccessUrl(currentLang);
  // Original elements
  set('lockSubText', t.lockSub);
  set('lockHeadline', t.lockHeadline);
  set('lockTagline', t.lockTagline);
  set('lstatLabel1', t.lstat1);
  set('lstatLabel2', t.lstat2);
  set('lstatLabel3', t.lstat3);
  if(t.lockFlagGlobal) set('lockFlagGlobal', t.lockFlagGlobal);
  if(t.lockPayText) set('lockPayText', t.lockPayText);
  // Lock-cat badges — 13 tab-group categories
  setText('lockCatSurveys',    '📝 Inquéritos e Estudos',  '📝 Surveys & Studies');
  setText('lockCatTesting',    '🔬 Testes de Usabilidade', '🔬 Usability Testing');
  setText('lockCatAI',         '🤖 Treino de IA',          '🤖 AI Training');
  setText('lockCatMystery',    '🕵️ Cliente Mistério',      '🕵️ Mystery Shopping');
  setText('lockCatGPT',        '🎁 Get-Paid-To',           '🎁 Get-Paid-To');
  setText('lockCatDeliveries', '🚗 Entregas & Condução',   '🚗 Deliveries & Driving');
  setText('lockCatSkills',     '🧑‍🏫 Ensino & Tutorias',    '🧑‍🏫 Teaching & Tutoring');
  setText('lockCatCriativo',   '🎨 Stock & Design',        '🎨 Stock & Design');
  setText('lockCatContent',    '📱 Criação de Conteúdo',   '📱 Content Creation');
  setText('lockCatGigs',       '🛠️ Biscates & Eventos',    '🛠️ Local Gigs & Events');
  setText('lockCatCaregiving', '🫶 Caregiving',             '🫶 Caregiving');
  setText('lockCatF2F',        '🤝 Trabalho Presencial',    '🤝 In-Person Work');
  setText('lockCatOther',      '💚 Outros & Nicho',         '💚 Other & Niche');
  const lockInputEl = document.getElementById('lockInput');
  if(lockInputEl) lockInputEl.placeholder = isEn ? 'Paste your key here' : 'Cola aqui a chave';
  // Step labels
  setText('lockStep1Label', 'Como obter acesso', 'How to get access');
  const desc1 = document.getElementById('lockStep1Desc');
  if(desc1) desc1.innerHTML = isEn
    ? 'Send <strong>€24.99 via MB Way</strong> to <strong>938 556 803</strong> and click the button. You will receive your access key in minutes.'
    : 'Envia <strong>24,99€ via MB Way</strong> para <strong>938 556 803</strong> e clica no botão. Recebes a tua chave de acesso em minutos.';
  setText('lockWaBtn', 'Pedir Acesso via WhatsApp', 'Request Access via WhatsApp');
  setText('lockLabel', 'Já tens a tua chave de acesso?', 'Already have your access key?');
  setText('lockBtn', 'Entrar →', 'Enter →');
  setText('lockHint', t.lockHintText || 'Chave enviada após confirmação de pagamento', t.lockHintText || 'Access key sent after payment confirmation');
  // Disclaimer anti-phishing (lockscreen)
  const ageEl = document.getElementById('lockDisclaimerAge');
  if(ageEl) ageEl.innerHTML = isEn
    ? '🔞 This service is intended for users aged 18 and over. Listed platforms may have their own eligibility requirements.'
    : '🔞 Este serviço destina-se a utilizadores com 18 ou mais anos. As plataformas listadas podem ter requisitos de elegibilidade próprios.';
  const secEl = document.getElementById('lockDisclaimerSecurity');
  if(secEl) secEl.innerHTML = isEn
    ? '🔒 <strong style="color:rgba(247,245,240,.5)">Security notice:</strong> We will never ask for your password, tax number, full banking details or your access key. We only ask for proof of payment. If you receive a message asking for these, it is fraud.'
    : '🔒 <strong style="color:rgba(247,245,240,.5)">Aviso de segurança:</strong> Nunca te pedimos a tua palavra-passe, NIF, dados bancários completos ou a tua chave de acesso. Pedimos apenas comprovativo de pagamento. Se receberes uma mensagem a pedir esses dados, é fraude.';
  const privEl = document.getElementById('lockDisclaimerPrivacy');
  if(privEl) privEl.innerHTML = isEn
    ? '📲 <strong style="color:rgba(247,245,240,.5)">GigBoost:</strong> Profile data for GigBoost (optional add-on) is transmitted via WhatsApp (Meta Platforms). See <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.45);text-decoration:underline">Privacy Policy</a>.'
    : '📲 <strong style="color:rgba(247,245,240,.5)">GigBoost:</strong> Os dados de perfil do GigBoost (opcional) são enviados via WhatsApp (Meta Platforms). Ver <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.45);text-decoration:underline">Política de Privacidade</a>.';
  const abuseEl = document.getElementById('lockDisclaimerAbuse');
  if(abuseEl) abuseEl.innerHTML = isEn
    ? '🛡️ Access is personal and non-transferable. Sharing or misusing your access key may result in permanent revocation without refund. See <a href="#" data-modal="terms" style="color:rgba(247,245,240,.45);text-decoration:underline">Terms of Use</a>.'
    : '🛡️ O acesso é pessoal e intransmissível. A partilha ou uso indevido da chave pode resultar em revogação permanente sem reembolso. Ver <a href="#" data-modal="terms" style="color:rgba(247,245,240,.45);text-decoration:underline">Termos de Utilização</a>.';
  const withdrawalEl = document.getElementById('lockDisclaimerWithdrawal');
  if(withdrawalEl) withdrawalEl.innerHTML = isEn
    ? '⚖️ <strong style="color:rgba(247,245,240,.5)">No refund:</strong> By purchasing access, you acknowledge that digital content is made available immediately and expressly waive the right of withdrawal (EU Directive 2011/83, Art. 16(m), transposed by DL 24/2014). See <a href="#" data-modal="terms" style="color:rgba(247,245,240,.45);text-decoration:underline">Terms</a>.'
    : '⚖️ <strong style="color:rgba(247,245,240,.5)">Sem reembolso:</strong> Ao adquirir acesso, reconheces que o conteúdo digital fica disponível imediatamente e renuncias expressamente ao direito de livre resolução (Diretiva 2011/83/UE, art. 16.º al. m, transposta pelo DL 24/2014). Ver <a href="#" data-modal="terms" style="color:rgba(247,245,240,.45);text-decoration:underline">Termos</a>.';
  // Sync boost token section label
  const btsl = document.getElementById('boostTokenSectionLabel');
  if(btsl) btsl.textContent = isEn ? 'Already have your GigBoost code?' : 'Já recebeste o teu código GigBoost?';
  const boostTokenInput = document.getElementById('boostTokenInput');
  if(boostTokenInput) boostTokenInput.placeholder = 'BOOST-XXXX-XXXX';
  const boostOpenFormBtnEl = document.getElementById('boostOpenFormBtn');
  if(boostOpenFormBtnEl) boostOpenFormBtnEl.textContent = isEn ? 'Verify code and fill profile →' : 'Verificar código e preencher perfil →';
  // Sync nav lang button
  const navBtn = document.getElementById('langToggle');
  if(navBtn) navBtn.textContent = isEn ? 'PT' : 'EN';
}

function applyLang(){
  catLabel = catLabels[currentLang] || catLabels['pt'];
  const isEn = currentLang === 'en';
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
  // Work type select
  const fWorkType = document.getElementById('fWorkType');
  if(fWorkType){
    fWorkType.options[0].text = isEn ? '💼 Any Format' : '💼 Qualquer formato';
    fWorkType.options[1].text = isEn ? '🖥️ Remote / Online' : '🖥️ Remoto / Online';
    fWorkType.options[2].text = isEn ? '🤝 Face-to-Face' : '🤝 Presencial';
  }
  // Security btn
  const secBtn = document.querySelector('.check-all-security-btn');
  if(secBtn) secBtn.textContent = t.secVerify;
  // Tabs — short pill labels (TAB_GROUP_LABELS is only used for the bar title)
  const _TAB_SHORT = {
    pt:{'':'Todas','surveys':'📝 Inquéritos','testing':'🔬 Testes','micro':'🤖 Treino IA',
      'mystery':'🕵️ Cliente Mistério','gpt':'🎁 Get-Paid-To','deliveries':'🚗 Entregas',
      'skills':'🧑‍🏫 Ensino & Skills','criativo':'🎨 Stock & Design','creative':'📱 Conteúdo & UGC',
      'gigs_events':'🛠️ Biscates & Eventos','caregiving':'🫶 Caregiving',
      'f2f':'🤝 Trabalho Presencial','other':'💚 Outros'},
    en:{'':'All','surveys':'📝 Surveys','testing':'🔬 Testing','micro':'🤖 AI Training',
      'mystery':'🕵️ Mystery Shopping','gpt':'🎁 Get-Paid-To','deliveries':'🚗 Deliveries',
      'skills':'🧑‍🏫 Teaching & Skills','criativo':'🎨 Stock & Design','creative':'📱 Content & UGC',
      'gigs_events':'🛠️ Gigs & Events','caregiving':'🫶 Caregiving',
      'f2f':'🤝 In-Person Work','other':'💚 Other'}
  };
  const _tabShort = _TAB_SHORT[currentLang] || _TAB_SHORT.pt;
  document.querySelectorAll('.tab[data-v]').forEach(tab => {
    const v = tab.dataset.v;
    const label = _tabShort[v];
    if(label !== undefined) {
      const dot = tab.querySelector('.cdot');
      const count = tab.querySelector('.tab-count');
      tab.textContent = label;
      if(dot) tab.insertBefore(dot, tab.firstChild);
      if(count) tab.appendChild(count);
    }
  });
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
  if(statLabels[1]) statLabels[1].textContent = t.statCats;
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
  // Footer lock badge + monetização WhatsApp button
  const _isEn2 = currentLang === 'en';
  // Sync monetization WA link
  const monoWaLink = document.querySelector('#monetizacao a[href*="wa.me"]');
  if(monoWaLink) monoWaLink.href = _waAccessUrl(currentLang);
  const footerLockEl = document.getElementById('footerLock');
  if(footerLockEl) footerLockEl.textContent = _isEn2 ? '🔐 Private access' : '🔐 Acesso privado';
  const monoWaBtnEl = document.getElementById('monoWaBtn');
  if(monoWaBtnEl) monoWaBtnEl.textContent = t.monoWaBtn || (_isEn2 ? 'Request access via WhatsApp →' : 'Pedir acesso via WhatsApp →');
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
  set2('boostOpenFormBtn', 'boostOpenFormBtn', false);
  set2('boostPayInstrEl', 'boostPayInstr', true);
  const _boostTokenLbl = document.getElementById('boostTokenSectionLabel');
  if(_boostTokenLbl) _boostTokenLbl.textContent = currentLang==='en'
    ? 'Already have your GigBoost code?'
    : 'Já recebeste o teu código GigBoost?';
  // Guide steps
  set2('guideStep1P', 'guideStep1P', true);
  set2('guideStep2P', 'guideStep2P', false);
  // Calculator
  set2('calcTitleEl', 'calcTitle', false);
  set2('calcDescEl', 'calcDesc', false);
  set2('calcHoursLabelEl', 'calcHoursLabel', false);
  set2('calcResultLabelEl', 'calcResult', false);
  // Also update modals if open
  if(document.getElementById('calcModal').style.display==='flex') _applyCalcLang();
  if(document.getElementById('boostPayModal').style.display==='flex') _applyBoostPayLang();
  updateFooterLang();
  const set3 = (id, key, html) => { const el=document.getElementById(id); if(el && t[key]){ if(html) el.innerHTML=t[key]; else el.textContent=t[key]; } };
  set3('welcomeTitle','welcomeTitle',false);
  set3('welcomeBody','welcomeBody',true);
  set3('welcomeTip','welcomeTip',true);
  set3('welcomeCloseBtn','welcomeClose',false);
  set('monoTitle', t.monoTitle);
  set('monoDesc', t.monoDesc);
  set('monoPayLabel', t.monoPayLabel);
  // Re-render GigBoost form if open
  const bfm = document.getElementById('boostFormModal');
  if(bfm && bfm.style.display !== 'none' && typeof renderBoostStep === 'function') {
    boostSteps = (boostStepsData[currentLang] || boostStepsData['pt']).slice();
    renderBoostStep();
  }
  // Refresh GDPR notice text if it is still visible
  if(typeof window._updateGdprText === 'function') window._updateGdprText();
  // Also sync lock screen lang button
  applyLockLang();

  // ── Curation pills translation ──
  const _curationLabels = {
    pt: { '':'Todas', portugal:'Top picks Portugal 🇵🇹', beginners:'Boas para iniciantes 🌱',
          bestpay:'Melhores pagamentos 💰', fastest:'Ganhos estáveis ⚡',
          noexp:'Sem experiência necessária 🚀' },
    en: { '':'All',   portugal:'Top picks Portugal 🇵🇹', beginners:'Good for beginners 🌱',
          bestpay:'Best payouts 💰',          fastest:'Stable earnings ⚡',
          noexp:'No experience needed 🚀' }
  };
  const _cl = _curationLabels[currentLang] || _curationLabels.pt;
  document.querySelectorAll('.curation-pill[data-curation]').forEach(pill => {
    const lbl = pill.querySelector('.curation-pill-label');
    if(lbl && _cl[pill.dataset.curation] !== undefined) lbl.textContent = _cl[pill.dataset.curation];
  });
  const curationTitleEl = document.getElementById('curationTitle');
  if(curationTitleEl) curationTitleEl.textContent = isEn ? 'Curated lists' : 'Curadoria';
  // Re-render cards with updated language (called once here, after all translations are applied)
  if(typeof render === 'function') render();
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
  const pct = ((boostStep + 1) / boostSteps.length) * 100;
  const isLast = boostStep === boostSteps.length - 1;

  let fieldsHtml = step.fields.map(f => {
    if(f.type === 'select'){
      const val = boostAnswers[f.key] || '';
      return `<div class="boost-field">
        <label class="boost-label">${f.label}</label>
        <select class="boost-select" data-key="${f.key}">
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
            return `<div class="boost-chip ${isSelected?'selected':''}" data-field="${escHtml(f.key)}" data-val="${escHtml(o)}" data-multi="${multi}">${escHtml(o)}</div>`;
          }).join('')}
        </div>
      </div>`;
    }
    return '';
  }).join('');

  const _hpId = '_f' + Math.random().toString(36).slice(2,8);
  document.getElementById('boostFormBox').innerHTML = `
    <input id="${_hpId}" tabindex="-1" style="position:absolute;opacity:0;height:0;pointer-events:none" autocomplete="off" name="${_hpId}">
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

// Required fields per step (keys that must have a non-empty answer to proceed)
const _BOOST_REQUIRED = [
  ['pais'],             // step 1: country minimum
  ['horas','ingles'],   // step 2: hours + english level
  ['experiencia'],      // step 3: experience level
  ['objetivo'],         // step 4: main goal
];

function boostCheckNext(){
  const required = _BOOST_REQUIRED[boostStep] || [];
  const allFilled = required.every(key => {
    const val = boostAnswers[key];
    return val && (Array.isArray(val) ? val.length > 0 : val !== '');
  });
  const btn = document.getElementById('boostNextBtn') || document.getElementById('boostSubmitBtn');
  if(btn) btn.disabled = !allFilled;
}

function boostNext(){
  const required = _BOOST_REQUIRED[boostStep] || [];
  const missing = required.filter(key => {
    const val = boostAnswers[key];
    return !val || (Array.isArray(val) ? val.length === 0 : val === '');
  });
  if(missing.length > 0){
    const isEn = currentLang === 'en';
    const step = boostSteps[boostStep];
    const missingLabel = step?.fields.find(f => f.key === missing[0])?.label || missing[0];
    const btn = document.getElementById('boostNextBtn');
    if(btn){
      const origText = btn.textContent;
      btn.textContent = isEn ? '⚠ Required field' : '⚠ Campo obrigatório';
      btn.style.background = 'var(--red)';
      setTimeout(()=>{ btn.textContent = origText; btn.style.background = ''; }, 1800);
    }
    return;
  }
  boostStep++;
  renderBoostStep();
}

function boostBack(){
  if(boostStep > 0){ boostStep--; renderBoostStep(); }
}

// ── AI ANALYSIS ──
function _sanitize(s){ 
  if(!s) return ''; 
  // Strip null bytes, HTML tags, and dangerous characters
  const str = String(s).replace(/\0/g,'').replace(/<[^>]*>/g,'').replace(/[&<>"'\\`]/g,'').trim();
  // Block suspicious patterns (XSS, injection, prompt injection, JS proto attacks)
  if(/script|javascript|onclick|onerror|eval\s*\(|document\.|window\.|vbscript:|data:text|__proto__|constructor\s*\[|prototype\s*\[/i.test(str)) return '';
  return str.substring(0, 300); 
}
function _boostShowError(msg){
  const box = document.getElementById('boostFormBox');
  if(!box) return;
  let err = box.querySelector('.boost-inline-err');
  if(!err){ err=document.createElement('div'); err.className='boost-inline-err'; err.style.cssText='background:var(--red-pale);border:1px solid rgba(192,57,43,.25);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--red);margin-top:12px'; box.appendChild(err); }
  err.textContent=msg;
  setTimeout(()=>{ if(err.parentNode) err.remove(); }, 3500);
}

function submitBoostForm(){
  // Honeypot: find the hidden field by its tabindex/style pattern and check if filled
  const _hpEl = document.querySelector('#boostFormBox input[tabindex="-1"]');
  if(_hpEl && _hpEl.value) return; // bot detected
  // Session-level dedup
  if(sessionStorage.getItem('gh_boost_submitted')) {
    _boostShowError(currentLang==='en'?'You have already submitted GigBoost in this session.':'Já submeteste o teu perfil GigBoost nesta sessão.');
    return;
  }
  // Cross-session rate limit: max 3 submissions per 24h (stored in localStorage)
  try {
    const _brl = JSON.parse(localStorage.getItem('_boost_rl')||'{"c":0,"t":0}');
    const _now = Date.now();
    if(_now - _brl.t > 86400000){ _brl.c = 0; _brl.t = _now; }
    if(_brl.c >= 3){
      _boostShowError(currentLang==='en'?'Too many requests. Please try again tomorrow.':'Demasiados pedidos. Tenta novamente amanhã.');
      return;
    }
    _brl.c++; localStorage.setItem('_boost_rl', JSON.stringify(_brl));
  } catch(e) {}
  if(Object.keys(boostAnswers).length === 0) {
    _boostShowError(currentLang==='en'?'Please fill in at least one field.':'Por favor preenche pelo menos um campo.');
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
          ? 'Your profile is being reviewed and a personalised selection of platforms will be sent to you — matched to your experience, goals and availability.'
          : 'O teu perfil está a ser revisto e vais receber uma seleção personalizada de plataformas — adaptada à tua experiência, objetivos e disponibilidade.'}
      </p>
      <p style="font-size:14px;color:var(--grey);line-height:1.75;margin-bottom:28px">
        ${isEn
          ? 'You will receive a response via WhatsApp within 24 hours.'
          : 'Recebes a resposta via WhatsApp em até 24 horas.'}
      </p>
      <button class="boost-explore-btn" style="height:44px;padding:0 36px;border-radius:10px;border:none;background:var(--ink);color:var(--paper);font-family:'Instrument Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer">
        ${isEn ? 'Close' : 'Fechar'}
      </button>
    </div>`;
  // Open WhatsApp — delayed to allow thank-you render first
  // Only open if the link points to the expected wa.me domain (defense against URL manipulation)
  setTimeout(() => {
    if(waLink.startsWith('https://wa.me/351938556803?')) {
      const w=window.open(waLink,'_blank','noopener,noreferrer'); if(w)w.opener=null;
    }
  }, 500);
}

// ── GigBoost submit flow: profile data is sent to WhatsApp for manual review.
// AI analysis via Edge Function (runBoostAnalysis) is not currently active.


// ── GigBoost AI results renderer — reserved for future use if Edge Function is re-enabled ──


// ── XSS sanitization helper ──────────────────────────────────────────────────
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Alias for contexts that require single-quote escaping for inline attributes
const _xss = escHtml;
// ─────────────────────────────────────────────────────────────────────────────

// ── SUPABASE SECURITY REQUIREMENTS (must be configured server-side) ─────────────
// Supabase anon key is intentionally public (protected by Row Level Security server-side).
// REQUIRED Supabase-side safeguards:
//   1. RLS enabled on ALL tables: platforms, tokens, boost_tokens.
//      - `tokens`       → SELECT: DENY anon; anon can only call unlock_with_token RPC.
//      - `boost_tokens` → SELECT/INSERT: DENY anon; anon can only call validate_boost_token RPC.
//      - `platforms`    → SELECT: DENY anon directly; data only returned via unlock_with_token RPC.
//   2. unlock_with_token RPC: enforce server-side rate limit per IP/token (pg_sleep + attempt counter).
//      Example policy: reject if > 10 attempts in 1 hour per ip_hash.
//   3. validate_boost_token RPC: mark token as used (used_at timestamp) on first valid call.
//   4. verify_admin_token RPC: constant-time comparison; never expose admin tokens to anon role.
//   5. Edge Functions (if re-enabled): verify Authorization header; reject unauthenticated calls.
// ─────────────────────────────────────────────────────────────────────────────────
if(!window.supabase) {
  // SDK failed to load — show a visible error on the lock screen
  document.addEventListener('DOMContentLoaded', function() {
    const lockErr = document.getElementById('lockErr');
    if(lockErr) lockErr.textContent = 'Erro de ligação. Recarrega a página.';
  });
}
const _SB = window.supabase && window.supabase.createClient(
  'https://fosdgukysnryznsywpmp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvc2RndWt5c25yeXpuc3l3cG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDMwNDUsImV4cCI6MjA5MzkxOTA0NX0.arArVMWoSZMQOzAf75SoLZKXthhw0bbZoWE1yoAjngA'
);


const _DIMMED_SET = new Set([]);

// ── Platforms that must NEVER appear in the listing ──────────────────────────
// These are removed client-side after Supabase returns the platform list.
const _BLOCKED_PLATFORMS = new Set([
  // Removed by user request
  'Medium',
  'Medium Partner Program',
  // Duplicate name variants — canonical form kept, alias blocked
  'Qualidade21',               // canonical: 'Qualidade 21'
  'New Europe Tour',           // canonical: 'New Europe Tours'
  'New Europe Tours (walking)',// canonical: 'New Europe Tours'
  'CourseHero',                // canonical: 'Course Hero'
  'Hotjar',                    // canonical: 'Hotjar Engage'
  'NannyPortugal',             // canonical: 'Nanny Portugal'
  'HomeFromCollege',           // canonical: 'Home From College'
  'Home from College',         // canonical: 'Home From College'
  'DataAnnotation',            // canonical: 'DataAnnotation.tech'
  'PaidViewpoint',             // canonical: 'Paid Viewpoint'
  'ZapSurveys',                // canonical: 'Zap Surveys'
  'Respondent',                // canonical: 'Respondent.io'
  'Wearetesters',              // canonical: 'WearTesters'
  // Remote job boards
  'Dynamite Jobs',
  'FlexJobs',
  'Wellfound',
  'Working Nomads',
  'Arc.dev',
  'Remotive',
  'We Work Remotely',
  'Jobspresso',
  'Remote OK',
  'Support Driven Jobs',
  // Freelance marketplaces removed
  'Fiverr',
  'Freelancer',
  'Freelancer.com',
  'Upwork',
  'Braintrust',
  'Remote.com',
  'Malt',
  'Contra',
  'PeoplePerHour',
  'Toptal',
  // Surveys / market research removed
  'Toluna',
  'Kantar',
  'Influenster',
  'Ipsos iShopForIpsos',
  'Ipsos i-Say',
  'IPSOS iSay',
  'Ipsos iSay',
  'Branded Surveys',
  // AI / data labelling removed
  'Appen',
  'Alignerr',
  'Surge AI',
  'Welocalize',
  'DataForce',
  'DataForce (TransPerfect)',
  'RWS',
  // Tutoring removed
  'italki',
  'Wyzant',
  // Creative / gig removed
  'Redbubble',
  'Gumroad',
  'BeMyEye',
  'JoinBrands',
  'Trend.io',
  'Pearpop',
  // Previously blocked — keep for safety
  'Telus',
  'Telus International',
  'OneForma',
  'GoTranscript',
  'TranscribeMe',
  'BuyMeACoffee',
  'Buy Me a Coffee',
  'Teachable',
  'Neevo',
  'Usertesting',
  'UserTesting',
  'Trymata',
  // Removed May 2026
  'Hostbreak',
  'Pinecone Research',
  'Zintellect',
  'EarnApp',
  'Billo',
  // Removed — full hard-block
  'Userlytics',
  'UberTesters',
  'Ubertesters',
  'TestBirds',
  'Testbirds',
  'Roam',
  'WalkTask',
  'Walktask',
  'Roamler',
  'Scribie',
  'Rev',
  'JustPlay',
  'Justplay',
  'Backspin',
  'Operação Nariz Vermelho',
  'Operacao Nariz Vermelho',
  // Removidas por pedido do utilizador
  'Stuart', 'Shippr',
  // Duplicate — casamentos.pt is the canonical entry (see _CAT_OVERRIDES)
  'Casamentos',
]);

// ── Suggested starters — shown with a subtle inline tag, no corner badge ──
// Only add platforms that truly exist in the DB and are consistently available in PT.
const _SUGGESTED_SET = new Set([
  // 📝 Inquéritos
  'AttaPoll','Netsonda','YouGov',
  // 🔬 Testes de Usabilidade
  'Prolific','UserInterviews','Respondent.io',
  // 🤖 Treino de IA
  'DataAnnotation.tech','Outlier','Clickworker',
  // 🕵️ Cliente Mistério
  'Qualidade 21','More Results',
  // 🎁 Get-Paid-To
  'Freecash','ySense',
  // 🚗 Entregas
  'Uber Eats (Courier)','Glovo','Bolt Food (Courier)',
  // 🧑‍🏫 Tutoria
  'Superprof','Preply','Cambly',
  // 🎨 Stock & Design
  'Etsy','Shutterstock','Adobe Stock',
  // 📱 Conteúdo
  'Substack','Ko-fi','Insense',
  // 🛠️ Biscates
  'TaskRabbit','Merytu','Moço de Recados',
  // 🫶 Caregiving
  'Rover','PetBacker','Babysits','Yoopies',
  // 🤝 ONGs
  'Amnistia Internacional','WWF Portugal',
  // 💚 Nicho
  'TransPerfect','Worldpackers','iVidador',
]);


const _EARN_N_DEFAULT = {
  surveys:4, micro:8, freelance:10, testing:10, criativo:8, conteudo:6,
  tasks:9, transcricao:6, tutoring:15, ugc:8, passive:3, remote:25,
  petsitting:9, babysitting:9, gigs:7, f2f:9, mystery:6
};

// Reduced-expectation overrides — full description replacements
const _REDUCED_EXPECTATIONS = {
  // ── Tutoring ──────────────────────────────────────────────────────────────
  'Cambly': {
    desc: 'Ganha por cada minuto de conversa! Ganhas $0.17/min ($10.2/hora) no Cambly e $0.20/min ($12/hora) no Cambly Kids. Lista de espera para novos tutores.',
    descEn: 'Earn for every minute you spend chatting! You make $0.17/min ($10.2/hour) on Cambly and $0.20/min ($12/hour) on Cambly Kids. Waiting list for new tutors.'
  },
  'Preply': {
    desc: 'Define o teu próprio horário e tarifa. Ganhos variáveis consoante o número de alunos e horas disponíveis. Para tutores recém-registados: começa com uma taxa mais baixa para conseguir alunos mais rápido.',
    descEn: 'Set your own schedule and rate. Earnings vary depending on the number of students and hours available. New tutors: start with a lower rate to attract students faster.'
  },
  'CourseHero': {
    desc: 'Tutorado online a qualquer hora. É necessário ser licenciado para te candidatares.',
    descEn: 'Tutor online anytime. You need to be a college grad. to apply.'
  },
  'Course Hero': {
    desc: 'Tutorado online a qualquer hora. É necessário ser licenciado para te candidatares.',
    descEn: 'Tutor online anytime. You need to be a college grad. to apply.'
  },
  'Superprof': {
    desc: 'Os novos professores são obrigados a oferecer uma primeira aula gratuita.',
    descEn: 'New teachers are required to offer a free first lesson.'
  },
  // ── Research / UX ─────────────────────────────────────────────────────────
  'dscout': {
    desc: 'Quanto mais extensa a tarefa, maior o pagamento (média de 1$ por minuto).',
    descEn: 'The longer the task, the higher the pay (average $1 per minute).'
  },
  '99designs': {
    desc: 'Plataforma para designers profissionais — portfólio sólido obrigatório. Não é adequado para quem não tem experiência em design.',
    descEn: 'Platform for professional designers, solid portfolio required. Not suitable for those without design experience.'
  },
  'Hotjar Engage': {
    desc: 'Partilha a tua opinião e ganha dinheiro. Em média €30 por entrevista.',
    descEn: 'Get paid to share your opinion. Earn €30 on average for each interview.'
  },
  'Hotjar': {
    desc: 'Partilha a tua opinião e ganha dinheiro. Em média €30 por entrevista.',
    descEn: 'Get paid to share your opinion. Earn €30 on average for each interview.'
  },
  'Tryber': {
    desc: 'Ganha para testar websites e apps mobile; os pagamentos variam conforme a complexidade das tarefas e os bugs encontrados.',
    descEn: 'Get paid to test websites and mobile apps; payouts vary based on task complexity and bugs found.'
  },
  'TestingTime': {
    desc: 'Convites de estudo ocasionais. Os ganhos correspondem ao tipo e duração do teste.',
    descEn: 'Occasional study invites. Earnings match the test type and duration.'
  },
  'WearTesters': {
    desc: 'Ganha para responder a surveys online, testar apps e avaliar marcas ou anúncios. Os ganhos acumulam-se em pontos que podem ser trocados por dinheiro ou vouchers de compras.',
    descEn: 'Get paid to take online surveys, test apps, and review brands or ads. Earnings are accumulated as points that can be exchanged for cash or shopping vouchers.'
  },
  'Wearetesters': {
    desc: 'Ganha para responder a surveys online, testar apps e avaliar marcas ou anúncios. Os ganhos acumulam-se em pontos que podem ser trocados por dinheiro ou vouchers de compras.',
    descEn: 'Get paid to take online surveys, test apps, and review brands or ads. Earnings are accumulated as points that can be exchanged for cash or shopping vouchers.'
  },
  'PlaytestCloud': {
    desc: 'Geralmente um teste de 15 minutos dá $9; consulta o email de convite para o valor específico.',
    descEn: 'Generally a 15min test gives $9; check the invitation email for the specific amount.'
  },
  'UserInterviews': {
    desc: 'Estudos de investigação presenciais e online, focus groups online, entrevistas 1-1, estudos de diário, surveys e testes de utilizador. O estudo médio paga mais de $45.',
    descEn: 'In-person and online research studies, online focus groups, 1-1 interviews, diary studies, surveys and user testing. The average study pays over $45.'
  },
  // ── Pet Sitting ───────────────────────────────────────────────────────────
  'Zoowish': {
    desc: 'Teste de admissão obrigatório. Pet Sitting (visita de 30 min.): Entre 6€ e 9€ por visita. Estadia Familiar (Cão): Entre 10€ e 15€ por dia (para pedidos até 5 dias).',
    descEn: 'Admission test required. Pet Sitting (30 min. visit): Between €6 and €9 per visit. Family Boarding (Dog): Between €10 and €15 per day (for requests up to 5 days).'
  },
  'PetBacker': {
    desc: 'Lista os teus serviços, escolhe o teu horário e preços, e serás alocado a donos de animais próximos.',
    descEn: 'List your services, choose your schedule and prices, you will be allocated to near by pet parents.'
  },
  'Rover': {
    desc: 'Serviços: Hospedagem (cuidar de um cão/gato durante a noite), Passeio de Cão, Creche Canina, Cuidado da Casa, Treino de Cão. Os pagamentos ficam disponíveis para levantamento dois dias após a conclusão de um serviço.',
    descEn: 'Services: Boarding (Care for a dog/cat overnight), Dog Walking, Doggy Day Care, House Sitting, Dog Training. Payments are ready for withdrawal two days after you have completed a service.'
  },
  // ── Babysitting ───────────────────────────────────────────────────────────
  'Babysits': {
    desc: 'Plataforma de babysitting; o custo horário médio cobrado ronda os 7€ a 9€ por hora.',
    descEn: 'Babysitting platform; the average hourly rate charged is around €7 to €9 per hour.'
  },
  'NannyPortugal': {
    desc: 'Candidata-te para te tornares nanny; processo de seleção rigoroso.',
    descEn: 'Apply to become a nanny; rigorous selection process.'
  },
  'Nanny Portugal': {
    desc: 'Candidata-te para te tornares nanny; processo de seleção rigoroso.',
    descEn: 'Apply to become a nanny; rigorous selection process.'
  },
  'Yoopies': {
    desc: 'Cuidados infantis Cuidados domiciliários Limpeza Explicadores Petsitter',
    descEn: 'Childcare, home care, cleaning, tutoring, pet sitting'
  },
  // ── Remote Jobs ───────────────────────────────────────────────────────────
  'HomeFromCollege': {
    desc: 'Testes de produtos, surveys e programas de embaixador — não precisas de ser estudante universitário para te candidatares.',
    descEn: 'product testing, surveys and ambassador programs; you do not need to be a college student or have gone to college to apply to GIGs.'
  },
  'Home From College': {
    desc: 'Testes de produtos, surveys e programas de embaixador — não precisas de ser estudante universitário para te candidatares.',
    descEn: 'product testing, surveys and ambassador programs; you do not need to be a college student or have gone to college to apply to GIGs.'
  },
  // ── Micro-tasks / AI ──────────────────────────────────────────────────────
  'Clickworker': {
    desc: 'Micro-tarefas: escrita, categorização, pesquisa web. Os ganhos variam entre $0.02 e vários euros por tarefa.',
    descEn: 'Micro-tasks: writing, categorisation, web research. Earnings range from $0.02 to several euros per task.'
  },
  'DataAnnotation': {
    desc: 'Trabalha em projetos pagos, por hora e remotos, que correspondem às tuas competências. Trabalha quando e onde quiseres. Inclui centenas de projetos gerais, de programação, saúde, finanças e direito.',
    descEn: 'Work on paid, hourly, remote projects that match your skills. Work whenever and wherever you want. Including hundreds of general, coding, health, finance, and legal projects.'
  },
  'DataAnnotation.tech': {
    desc: 'Trabalha em projetos pagos, por hora e remotos, que correspondem às tuas competências. Trabalha quando e onde quiseres. Inclui centenas de projetos gerais, de programação, saúde, finanças e direito.',
    descEn: 'Work on paid, hourly, remote projects that match your skills. Work whenever and wherever you want. Including hundreds of general, coding, health, finance, and legal projects.'
  },
  'Helion Research': {
    desc: 'Ganha entre $10 e $30 por tarefa consoante a duração da missão; reembolsos de compras totalmente cobertos.',
    descEn: 'Earn $10 to $30 per task based on assignment length; fully covered purchase reimbursements.'
  },
  'Outlier': {
    desc: 'As tarefas incluem criar e avaliar respostas de modelos de linguagem, anotação complexa de dados e refinamento de outputs. É necessário ter pelo menos um curso técnico superior para trabalhar na Outlier. Processo de seleção rigoroso.',
    descEn: 'Tasks include creating and evaluating language model responses, complex data annotation and output refinement. You need at least an associate degree to work on Outlier. Selective screening process.'
  },
  // ── Surveys ───────────────────────────────────────────────────────────────
  'PaidViewpoint': {
    desc: 'Surveys curtos com recompensas estáveis entre $0.30 e $0.60.',
    descEn: 'Short surveys, steady cash rewards ranging from $0.30 to $0.60.'
  },
  'Paid Viewpoint': {
    desc: 'Surveys curtos com recompensas estáveis entre $0.30 e $0.60.',
    descEn: 'Short surveys, steady cash rewards ranging from $0.30 to $0.60.'
  },
  'Mundo de Opiniões': {
    desc: 'Responde a surveys e escolhe uma de várias recompensas.',
    descEn: 'Answer surveys and choose one of several rewards.'
  },
  'Opiniões de Valor': {
    desc: 'Partilha a tua opinião e ganha pontos convertíveis em dinheiro ou prémios.',
    descEn: 'Share your opinion and earn points convertible to cash or prizes.'
  },
  'Voissy': {
    desc: 'Ganha pontos ao completar inquéritos online e troca-os por recompensas (pagamento PayPal, vales de oferta Amazon e muito mais).',
    descEn: 'Earn points by completing online surveys and exchange them for rewards (PayPal payment, Amazon gift vouchers and much more).'
  },
  'Opinionz': {
    desc: 'Disponível para utilizadores de todo o mundo. Pagamentos via transferência ou códigos digitais. A maioria das recompensas é enviada no momento.',
    descEn: 'Available to users worldwide. Payments via transfer or digital codes. Most rewards are sent immediately.'
  },
  'OnePulse': {
    desc: 'Responde a surveys curtos. Mantém-te informado. Ganha dinheiro extra.',
    descEn: 'Take short surveys. Stay informed. Earn extra money.'
  },
  'SurveyTime': {
    desc: 'Quando os teus ganhos atingem $10 e escolhes levantar o valor total, recebes um bónus de $0.50.',
    descEn: 'Once your earnings reach $10 and you choose to cashout the full amount, you will be rewarded $0.50.'
  },
  'ySense': {
    desc: 'Surveys pagos online; os ganhos são em dólares americanos e podem demorar até 10 dias úteis a ser processados.',
    descEn: 'Paid online surveys; earnings are in US dollars and can take as long as 10 business days to process.'
  },
  'NiceQuest': {
    desc: 'Atividades e questionários; junta korus e troca-os por presentes, sorteios e doações.',
    descEn: 'Activities and questionnaires; collect korus and exchange them for gifts, draws and donations.'
  },
  'Respondent': {
    desc: 'Explora projetos de investigação pagos que correspondem ao teu perfil e interesses. Completa um questionário de seleção (não remunerado) para verificar a tua adequação.',
    descEn: 'Browse paid research projects that match your background and interests. Complete a screener (unpaid) to check your fit.'
  },
  'Swagbucks': {
    desc: 'Ganha recompensas, cashback e gift cards ao comprar online, digitalizar recibos, jogar e responder a surveys. Maximiza os ganhos com a extensão Swagbucks, pesquisando na web, resgatando códigos e participando em sorteios.',
    descEn: 'Earn rewards, cash back, and gift cards by shopping online, scanning receipts, playing games, and completing surveys. Maximize earnings by using the Swagbucks browser extension, searching the web, redeeming codes, and entering sweepstakes.'
  },
  'LifePoints': {
    desc: 'Completa surveys, partilha a tua opinião e ganha pontos (LPs) que podem ser trocados por recompensas das tuas marcas favoritas. Regista-te gratuitamente e ganha 10 LPs.',
    descEn: 'Complete surveys, share your opinion and earn points (LPs) that can be redeemed for rewards from your favourite brands. Register for free and gain 10 LPs.'
  },
  'YouGov': {
    desc: 'Sondagens remuneradas, partilha a tua opinião sobre política, desporto, entretenimento e muito mais.',
    descEn: 'Paid polls, share your opinion on politics, sport, entertainment and much more.'
  },
  'AttaPoll': {
    desc: 'Ganha por completar surveys curtos de mercado, jogar jogos mobile e testar apps. Podes levantar os teus ganhos a partir de um valor muito baixo (cerca de 3$) via PayPal, gift cards digitais ou transferência bancária direta.',
    descEn: 'Get paid for completing short market surveys, playing mobile games and testing apps. You can withdraw your earnings once you reach a very low threshold (around 3$) via PayPal, digital gift cards, or direct bank transfer.'
  },
  'Triaba': {
    desc: 'Ganha até 3.50€ por cada inquérito (PayPal, Bitcoin ou vale-presente).',
    descEn: 'Earn up to €3.50 per survey (PayPal, Bitcoin or gift card).'
  },
  'ZapSurveys': {
    desc: 'Ganha $2 no teu primeiro survey.',
    descEn: 'Earn $2 on your first survey.'
  },
  'Zap Surveys': {
    desc: 'Ganha $2 no teu primeiro survey.',
    descEn: 'Earn $2 on your first survey.'
  },
  // ── Gigs / Other ─────────────────────────────────────────────────────────
  'Merytu': {
    desc: 'Gigs com pagamento justo, transparência e cobertura de seguro.',
    descEn: 'Gigs with fair pay, transparency, and insurance coverage.'
  },
  // ── Face to Face ──────────────────────────────────────────────────────────
  'WWF Portugal': {
    desc: 'Dá a conhecer a missão da WWF, em Lisboa. Trabalho de equipa, por objetivos (valor base + variável em função dos resultados; subsídio de transporte mensal).',
    descEn: 'Promote the WWF mission in Lisbon. Team work, target-based (base rate + variable based on results; monthly transport allowance).'
  },
  'Operação Nariz Vermelho': {
    desc: 'Até Dezembro de 2026, Lisboa, Aveiro e Porto, divulga o trabalho da ONV, angaria Doadores; remuneração base + variáveis em função dos resultados (Valor médio mensal: 550–600 euros).',
    descEn: 'Until December 2026, Lisbon, Aveiro and Porto, promote ONV\'s work, recruit Donors; base salary + variable based on results (Average monthly: €550–600).'
  },
  // ── Medium / Prolific — keep existing descriptions ────────────────────────
  'Medium': {
    desc: 'Escreve e monetiza artigos no Medium Partner Program. ⚠️ Tem requisitos de entrada: mínimo de seguidores e publicações no Medium. Ganhos dependem do número de leitores pagos que consomem os teus artigos.',
    descEn: 'Write and monetise articles on the Medium Partner Program. ⚠️ Has entry requirements: minimum followers and publications on Medium. Earnings depend on the number of paying readers who consume your articles.'
  },
  'Prolific': {
    desc: 'Surveys académicos de alta qualidade com pagamentos justos. ⚠️ Lista de espera — novos utilizadores podem ter de aguardar aprovação. Muito fiável uma vez aceite.',
    descEn: 'High-quality academic surveys with fair pay. ⚠️ Waiting list — new users may have to wait for approval. Very reliable once accepted.'
  },
  // ── Face to Face ──────────────────────────────────────────────────────────
  'ACNUR': {
    desc: 'Projetos Face to Face e Door to Door em Lisboa, Porto e Braga; Valor base desde 5€ por hora + incentivos de desempenho',
    descEn: 'Face to Face and Door to Door projects in Lisbon, Porto and Braga; base rate from €5/hour + performance incentives'
  },
  'Aldeias SOS': {
    desc: 'Projetos Face to Face e Door to Door em Lisboa, Porto e Braga; entrada imediata; remuneração composta por valor fixo + bónus por cada Amigo SOS angariado. Os recrutadores F2F ganham em média 500€/ 600€ por mês, em regime de prestação de serviços / recibos verdes.',
    descEn: 'Face to Face and Door to Door projects in Lisbon, Porto and Braga; immediate start; pay composed of a fixed amount + bonus per SOS Friend recruited. F2F recruiters earn on average €500–600/month as self-employed.'
  },
  'Amnistia Internacional': {
    desc: 'Projeto F2F e D2D; Part-time 500-700€/mês; subsídio de alimentação, subsídio de transportes, progressão de carreira',
    descEn: 'F2F and D2D project; part-time €500–700/month; meal allowance, transport allowance, career progression'
  },
  'APDES': {
    desc: 'F2F no Porto, part-time salário base acrescido de componente variável',
    descEn: 'F2F in Porto, part-time base salary plus variable component'
  },
  // ── Get-Paid-To ───────────────────────────────────────────────────────────
  'Lootup': {
    desc: 'Partilha a tua opinião, joga, completa ofertas, vê vídeos e ganha cashback. Resgata por PayPal, gift cards ou criptomoeda via BitPay.',
    descEn: 'Share your opinion, play games, complete offers, watch videos, shop & earn cash back, enter giveaways, and more. Redeem your rewards as you earn, for cash via PayPal, gift cards, or cryptocurrency via BitPay.'
  },
  'Earnlab': {
    desc: 'Ganhos por tarefas e jogos interativos. Ganha moedas a responder a surveys, a descarregar apps e a participar em ofertas de parceiros.',
    descEn: 'traditional task-based earning and interactive games. Users can earn Coins by completing surveys, downloading apps, and engaging with partner offers.'
  },
  'Freecash': {
    desc: 'Testa aplicativos e jogos; a maioria leva cerca de 5–10 minutos para completar; cada tarefa = 1000 moedas = $1.',
    descEn: 'Test apps and games; most tasks take around 5–10 minutes; each task = 1000 coins = $1.'
  },
  // ── Gigs ──────────────────────────────────────────────────────────────────
  'Eloquence Events': {
    desc: 'Trabalha como embaixador de marca, promotor, empregado de mesa, assistente de festival, ator, músico, dançarino, etc.',
    descEn: 'work as a brand ambassador, promoter, waiter, assembler, festival assistant, instructor, actor, musician, dancer, etc'
  },
  'Guia Tuk Tuk': {
    desc: 'Necessário mais de 2 anos de experiência com uma carteira de motorista válida e em vigor, inglês avançado (nível mínimo B2) e domínio bilíngue de português (para posições em Lisboa).',
    descEn: 'Requires over 2 years of experience with a valid driver\'s licence, advanced English (minimum B2) and bilingual Portuguese proficiency (for Lisbon positions).'
  },
  // ── Nicho / Doação ────────────────────────────────────────────────────────
  'iVidador': {
    desc: 'Programa de doação de espermatozoides em Portugal. Remuneração por doação em clínicas certificadas.',
    descEn: 'Sperm donation programme in Portugal. Compensation per donation at certified clinics.'
  },
  'iVidoa': {
    desc: 'Programa de doação de óvulos em Portugal. Remuneração por doação em clínicas certificadas.',
    descEn: 'Egg donation programme in Portugal. Compensation per donation at certified clinics.'
  },
  // ── User-specified description overrides ─────────────────────────────────
  'Ordo Events': {
    desc: 'Inscreve-te como DJ e arranja gigs.',
    descEn: 'Register as a DJ and find gig opportunities.'
  },
  'Acclaro': {
    desc: 'Regista-te, passa num teste de competências linguísticas e começa a traduzir.',
    descEn: 'Sign up, pass language skills test, start translating.'
  },
  'TransPerfect': {
    desc: 'Plataforma para tradutores, intérpretes, revisores ou especialistas numa área técnica, gravação de voz, transcrição, anotação de dados ou avaliação de IA',
    descEn: 'Platform for translators, interpreters, reviewers or specialists in a technical area, voice recording, transcription, data annotation or AI evaluation'
  }
};

// ── Append text to Supabase description (does not replace — adds at end) ──────
const _DESC_SUFFIX = {
};

// ── Substring patch within Supabase description ────────────────────────────────
const _DESC_PATCH = {
  'Associação Salvador': {
    from: 'part-time available',
    to:   'Base salary plus performance-based fees with training and support.'
  },
  'Associacao Salvador': {
    from: 'part-time available',
    to:   'Base salary plus performance-based fees with training and support.'
  },
};

// ── URL overrides (replaces the URL that comes from Supabase) ──────────────────
const _URL_OVERRIDES = {
  'NannyPortugal':        'https://www.nannyportugal.com/nanny-registration-form/',
  'Nanny Portugal':       'https://www.nannyportugal.com/nanny-registration-form/',
  'ySense':               'https://www.ysense.com/',
  'More Results':         'https://moresults.pt/en/be-more/',
  'More results':         'https://moresults.pt/en/be-more/',
  'HomeFromCollege':      'https://homefromcollege.com/gigs',
  'Home From College':    'https://homefromcollege.com/gigs',
  'Home from College':    'https://homefromcollege.com/gigs',
  'Cambly':               'https://www.cambly.com/english/tutors',
  'CourseHero':           'https://www.coursehero.com/become-a-tutor/',
  'Course Hero':          'https://www.coursehero.com/become-a-tutor/',
  'Preply':               'https://preply.com/en/teach',
  'dscout':               'https://dscout.com/participate-in-research-studies',
  'Hotjar Engage':        'https://www.hotjar.com/engage/participant-pool/',
  'Hotjar':               'https://www.hotjar.com/engage/participant-pool/',
  'ACNUR':                'https://pacnur.org/pt/f2f-d2d',
  'Aldeias SOS':          'https://www.aldeias-sos.org/quem-somos/trabalhe-connosco/vagas-abertas/servicos-centrais/part-time-recrutador-face-2-face',
  'Amnistia Internacional': 'https://www.amnistia.pt/projeto-face-to-face/',
  'APDES':                'https://apdes.pt/pt/face-to-face-vagas/',
  'Associação Salvador':  'https://associacaosalvador.com/projeto/face-to-face/',
  'Associacao Salvador':  'https://associacaosalvador.com/projeto/face-to-face/',
  'Guia Tuk Tuk':         'https://ecotuktuk.com/pt/trabalhe-connosco/',
  'Rover':                'https://www.rover.com/become-a-sitter/',
  'Storewards':           'https://play.google.com/store/apps/details?id=co.storewards&hl=pt_PT',
  'WWF Portugal':         'https://apoia.wwf.pt/donativos/vagas-face-to-face',
  'Zoowish':              'https://zoowish.com/torna-te-zoowi/',
  'Clickworker':          'https://www.clickworker.com/clickworker/',
  'Skeepers':             'https://community.skeepers.io/',
  'Toloka':               'https://toloka.ai/tolokers',
  'Bolt Driver':          'https://bolt.eu/pt-pt/driver/',
  'Bolt Courier':         'https://bolt.eu/pt-pt/food/courier/',
  'Carteiro CTT':         'https://www.ctt.pt/grupo-ctt/carreiras/bolsa-de-carteiros?srsltid=AfmBOopHi-AvYW8feoZI3AgT4DGP99uG4C0JGVj47j8czem25RLETLYG',
  'Eloquence Events':     'https://eloquence.es/en/lisboa/',
  // ── User-specified overrides ───────────────────────────────────────────────
  'Glovo':                'https://riderhub.glovoapp.com/pt/',
  'Uber Eats (Courier)':  'https://www.uber.com/pt/en/deliver/?uclick_id=af25bafa-7c30-4831-9d6d-36167c004d47',
  'Ordo Events':          'https://www.ordo.events/join',
  'Acclaro':              'https://www.acclaro.com/linguist-wordsonline/',
  'Helion Research':      'https://shoppers.helionresearch.com/',
  'Boutique Opiniões':    'https://boutique-opinioes.pt/',
  'Boutique opinioes':    'https://boutique-opinioes.pt/',
  'Boutique Opinioes':    'https://boutique-opinioes.pt/',
  'CLSBE PEO (Católica)': 'https://clsbe-peo.sona-systems.com/Default.aspx?ReturnUrl=%2f',
  'CLSBE PEO (Catolica)': 'https://clsbe-peo.sona-systems.com/Default.aspx?ReturnUrl=%2f',
  'CLSBE PEO':            'https://clsbe-peo.sona-systems.com/Default.aspx?ReturnUrl=%2f',
  'Mundo de Opiniões':    'https://www.mundodeopinioes.com.pt/',
  'Mundo de opinioes':    'https://www.mundodeopinioes.com.pt/',
  'Mundo de Opinioes':    'https://www.mundodeopinioes.com.pt/',
  'OnePulse':             'https://www.onepulse.com/onepulse-app/',
  // ── User-specified overrides (2026-05) ─────────────────────────────────────
  'Opiniões de Valor':    'https://www.opinioesdevalor.com/',
  'Opinioes de Valor':    'https://www.opinioesdevalor.com/',
  'Opinionz':             'https://www.opinionz.io/index.php/pt/',
  'Questionários Online': 'https://questionarios-online.com/landing',
  'Questionarios Online': 'https://questionarios-online.com/landing',
  'TGM Panel':            'https://tgmpanel.com/',
  'Voissy':               'https://voissy.com/pt_PT',
  'YouGov':               'https://account.yougov.com/pt-pt/join/main',
};

// ── Category overrides (overrides the category that comes from Supabase) ───────
const _CAT_OVERRIDES = {
  // HomeFromCollege: remote job board, not face-to-face
  'HomeFromCollege':    'remote',
  'Home From College':  'remote',
  'Home from College':  'remote',
  // Mystery shopping — these come from the DB as f2f but belong in mystery tab
  'More Results':       'mystery',
  'More results':       'mystery',
  'Pontis':             'mystery',
  'Qualidade 21':       'mystery',
  'SmartSpotter':       'mystery',
  'Smartspotter':       'mystery',
  // Other / Nicho — donation programmes, not in-person work
  'iVidador':           'passive',
  'iVidoa':             'passive',
  // Gigs & Events
  'Casamentos.pt':      'gigs',    // canonical entry — in gigs_events tab
  'Guia Tuk Tuk':       'f2f',
  'New Europe Tours':   'f2f',
  'Worldpackers':       'f2f',
  // Deliveries & Driving — ensure cat=gigs so _DELIVERY_NAMES filter works
  'Bolt Driver':        'gigs',
  'Uber Driver':        'gigs',
  // FeetFinder — force ugc so it never gets lost if DB cat changes
  'FeetFinder':         'ugc',
  'Feetfinder':         'ugc',
};

// ── Icon overrides (replaces the icon that comes from Supabase) ───────────────
const _ICON_OVERRIDES = {
  'FeetFinder':  '📸🦶',
  'Feetfinder':  '📸🦶',
  'feetfinder':  '📸🦶',
};

function _fmt(r){
  // Hard-block: never render platforms that are not supposed to be listed
  if(_BLOCKED_PLATFORMS.has(r.name)) return null;
  // Apply category override (client-side correction)
  const _catOv = _CAT_OVERRIDES[r.name];
  if(_catOv) r = Object.assign({}, r, { cat: _catOv });
  const ov = _REDUCED_EXPECTATIONS[r.name];
  const isDimmed = _DIMMED_SET.has(r.name) || r.dimmed || false;
  let basePt = (ov && ov.desc) ? ov.desc : (r.desc_pt||'');
  let baseEn = (ov && ov.descEn) ? ov.descEn : (r.desc_en||'');
  // ── Append suffix (only when _REDUCED_EXPECTATIONS does not already replace the desc)
  if(!ov) {
    const sfx = _DESC_SUFFIX[r.name];
    if(sfx){ basePt += sfx; baseEn += sfx; }
    // ── Substring patch
    const patch = _DESC_PATCH[r.name];
    if(patch){
      basePt = basePt.replace(patch.from, patch.to);
      baseEn = baseEn.replace(patch.from, patch.to);
    }
  }
  // ── URL override
  const urlOv = _URL_OVERRIDES[r.name];
  const iconOv = _ICON_OVERRIDES[r.name];
  return {
    name:r.name, cat:r.cat, icon: iconOv || r.icon,
    desc: basePt,
    descEn: baseEn,
    earn: r.earn||'',
    earnN: (r.earn_n != null && r.earn_n > 0) ? r.earn_n : (_EARN_N_DEFAULT[r.cat]||5),
    minPay: r.min_pay||'Variável',
    pt: true, eu:r.eu, url: urlOv || r.url||'',
    easy: r.easy||3, geo: r.geo||'🌍 Global',
    top: isDimmed ? false : (r.top || false),
    dimmed: isDimmed,
    beginner: r.beginner||false,
    ratings:r.ratings||{}, aff:{has:false}
  };
}

// Returns a generic earn display string based on category (no specific €/h amounts)
function _genericEarn(cat){
  const isEn = currentLang === 'en';
  const map = {
    pt:{
      surveys:'Varia por estudo', micro:'Varia por tarefa',
      freelance:'Varia por projeto/cliente', testing:'Varia por teste',
      criativo:'Varia por projeto', conteudo:'Varia por conteúdo',
      tasks:'Variável', transcricao:'Varia por áudio',
      tutoring:'Varia por aula/plataforma', ugc:'Varia por campanha',
      passive:'Varia por utilização', remote:'Varia por função',
      petsitting:'Varia por serviço', babysitting:'Varia por família/horas',
      gigs:'Varia por entrega', f2f:'Taxa horária',
      mystery:'Varia por visita/auditoria'
    },
    en:{
      surveys:'Varies by study', micro:'Varies by task',
      freelance:'Varies by project/client', testing:'Varies by test',
      criativo:'Varies by project', conteudo:'Varies by content',
      tasks:'Variable', transcricao:'Varies by audio',
      tutoring:'Varies by lesson/platform', ugc:'Varies by campaign',
      passive:'Varies by usage', remote:'Varies by role',
      petsitting:'Varies by service', babysitting:'Varies by family/hours',
      gigs:'Varies by delivery', f2f:'Hourly rate',
      mystery:'Varies by visit/audit'
    }
  };
  const lang = isEn ? 'en' : 'pt';
  return map[lang][cat] || (isEn ? 'Variable' : 'Variável');
}



// ── Rate limiting do lado do cliente (UX apenas — a proteção real está no Supabase).
async function validarTokenSupabase(token, fromUrl) {
  const lockErr = document.getElementById('lockErr');
  const lockBtn = document.getElementById('lockBtn');
  // ── Client-side rate limiting (UX + friction only — real protection is server-side in Supabase) ──
  // Two layers: sessionStorage (per tab, hard reset on close) + localStorage (cross-tab, 1h window).
  // IMPORTANT: Both can be cleared from DevTools; the Supabase RPC enforces the real server-side limit.
  if(!fromUrl) {
    const _ss = parseInt(sessionStorage.getItem('_rlc')||'0');
    if(_ss >= 5){
      if(lockErr) lockErr.textContent = currentLang==='en'
        ? 'Too many attempts. Please restart your browser.'
        : 'Demasiadas tentativas. Reinicia o browser.';
      return;
    }
    sessionStorage.setItem('_rlc', String(_ss+1));
    const _rl = (() => { try { const v = JSON.parse(localStorage.getItem('_rl')||'{"c":0,"t":0}'); return (v && typeof v.c==='number' && typeof v.t==='number') ? v : {c:0,t:0}; } catch(e){ return {c:0,t:0}; } })();
    const now = Date.now();
    if(now - _rl.t > 3600000){ _rl.c = 0; _rl.t = now; }
    if(_rl.c >= 5){
      const wait = Math.ceil((3600000-(now-_rl.t))/60000);
      if(lockErr) lockErr.textContent = currentLang==='en'
        ? `Too many attempts. Try again in ${wait} min.`
        : `Demasiadas tentativas. Tenta em ${wait} min.`;
      return;
    }
    _rl.c++; localStorage.setItem('_rl', JSON.stringify(_rl));
  }
  if(!_SB) {
    if(lockErr) lockErr.textContent = currentLang==='en'
      ? 'Connection error. Please reload the page.'
      : 'Erro de ligação. Recarrega a página.';
    return false;
  }
  try {
    if(lockErr) lockErr.textContent = '';
    // Compute a pseudonymous client fingerprint for server-side rate limiting.
    // This is NOT the real IP — the actual IP is available server-side in Supabase.
    // We send a hash of UA+time-bucket so the RPC can group attempts without trusting client input.
    let _clientFp = '';
    try {
      const _fpRaw = (navigator.userAgent||'') + '|' + Math.floor(Date.now()/3600000);
      _clientFp = await _sha256hex(_fpRaw);
    } catch(e) {}
    const { data, error } = await _SB.rpc('unlock_with_token', { p_token: token.trim(), p_ip_hash: _clientFp });
    if(error) {
      console.error('Supabase error:', error);
      const inp=document.getElementById('lockInput');
      if(inp){inp.classList.add('shake');setTimeout(()=>inp.classList.remove('shake'),400);}
      if(lockErr) lockErr.textContent = currentLang==='en'
        ? 'Verification failed. Please try again.'
        : 'Erro na verificação. Tenta novamente.';
      return false;
    }
    if(!data || data.valid === false) {
      const inp=document.getElementById('lockInput');
      if(inp){inp.classList.add('shake');setTimeout(()=>inp.classList.remove('shake'),400);}
      const t2 = translations[currentLang] || translations['pt'];
      if(data && data.revoked === true) {
        if(lockErr) lockErr.textContent = t2.lockRevoked || '🚫 Acesso revogado';
      } else {
        if(lockErr) lockErr.textContent = currentLang==='en'
          ? 'Invalid or unrecognised access key.'
          : 'Chave de acesso inválida ou não reconhecida.';
      }
      return false;
    }
    // SUCESSO
    hasAccess = true;
    // Generate a random nonce so render() can verify auth happened through this function
    // (not via a trivial DevTools console `hasAccess=true` override)
    try { _sessionNonce = (crypto.randomUUID ? crypto.randomUUID() : null) || Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join(''); } catch(e){ _sessionNonce = Date.now().toString(36) + Math.random().toString(36).slice(2); }
    _startSessionTimeout(); // start idle-timeout only after authenticated
    localStorage.removeItem('_rl');
    sessionStorage.removeItem('_rlc');
    if(data.platforms && data.platforms.length > 0) {
      P = data.platforms.map(_fmt).filter(Boolean); // filter(Boolean) removes blocked platforms
      // Deduplicate by name (case-insensitive, whitespace-normalised, parenthetical suffix stripped)
      // e.g. "New Europe Tours (walking)" and "New Europe Tours" → same key → keeps first occurrence
      const _seen = new Set();
      P = P.filter(p => {
        const k = p.name.toLowerCase().trim().replace(/\s+/g,' ').replace(/\s*\([^)]*\)\s*$/, '');
        if(_seen.has(k)) return false;
        _seen.add(k);
        return true;
      });
    }
    // else keep local P array
    // Remove token from URL bar after successful login (prevents token in browser history & referrer headers)
    try{
      const cleanPath = window.location.pathname + (window.location.search || '');
      window.history.replaceState({}, '', cleanPath);
    }catch(e){}
    // Reveal app content to screen readers now that access is granted
    const _appContent = document.getElementById('appContent');
    if(_appContent) _appContent.removeAttribute('aria-hidden');
    if(lockErr) lockErr.textContent = '';
    const ls = document.getElementById('lockScreen');
    if(ls) { ls.classList.add('unlocked'); setTimeout(() => { ls.style.display='none'; }, 600); }
    document.body.style.overflow = 'auto';
    if(typeof render === 'function') render();
    // Show GDPR notice now that the user has unlocked access
    setTimeout(() => { if(typeof window._showGdprNotice === 'function') window._showGdprNotice(); }, 800);
    // Move focus to main content for screen reader users
    setTimeout(() => { const h1 = document.querySelector('.hero h1'); if(h1) { h1.setAttribute('tabindex','-1'); h1.focus(); } }, 650);
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
  const t = translations[currentLang] || translations['pt'];
  if(btn) {
    btn.textContent = t.lockVerifying || 'A verificar…';
    btn.disabled = true;
    btn.style.opacity = '.7';
  }
  inp.disabled = true;
  // Sanitise: only alphanumeric, dash, underscore; 6–64 chars
  const cleanToken = inp.value.trim().replace(/[^a-zA-Z0-9_\-]/g,'').substring(0,64);
  if(!cleanToken || cleanToken.length < 6) {
    if(btn){ btn.textContent = t.lockEnter || 'Entrar →'; btn.disabled=false; btn.style.opacity=''; }
    inp.disabled = false;
    const lockErr = document.getElementById('lockErr');
    if(lockErr) lockErr.textContent = currentLang==='en' ? 'Invalid access key format.' : 'Formato de chave inválido.';
    return;
  }
  await validarTokenSupabase(cleanToken);
  if(btn) { btn.textContent = t.lockEnter || 'Entrar →'; btn.disabled=false; btn.style.opacity=''; }
  inp.disabled = false;
};


function openLegalModal(type) {
  // Validate type against known values to prevent prototype pollution / unexpected access
  const VALID_TYPES = ['privacy', 'terms', 'disclaimer'];
  if (!VALID_TYPES.includes(type)) return;
  const isEn = currentLang === 'en';
  const modal = document.getElementById('legalModal');
  const content = document.getElementById('legalContent');
  const pages = {
    privacy: {
      pt: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Política de Privacidade</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Última atualização: Maio 2026</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Dados que recolhemos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Recolhemos apenas os dados necessários para fornecer o serviço, incluindo informação de contacto e respostas ao formulário GigBoost enviadas voluntariamente.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Porque recolhemos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Os dados são usados exclusivamente para fornecer o serviço adquirido — acesso à plataforma e/ou recomendações personalizadas GigBoost. Base legal: execução de contrato (Art. 6.º n.º 1 al. b) do RGPD).</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Processamento via WhatsApp / Meta</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O serviço GigBoost utiliza o WhatsApp (operado pela Meta Platforms, Inc.) para receber comprovativo de pagamento e enviar recomendações personalizadas. Ao submeteres o formulário GigBoost, os dados do teu perfil (país, faixa etária, objetivos, skills) são transmitidos via WhatsApp e ficam sujeitos à <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Política de Privacidade da Meta</a>. Não utilizamos esses dados para fins de marketing. Se preferires não utilizar o WhatsApp, contacta-nos por e-mail.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Cookies e analytics</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Não usamos cookies de rastreamento nem ferramentas de analytics de terceiros. O acesso é gerido por tokens únicos sem identificação pessoal; esses tokens são verificados em tempo real via Supabase e não são armazenados em localStorage. As fontes tipográficas são carregadas a partir do serviço Google Fonts, o que implica uma ligação aos servidores da Google. Consulta a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Política de Privacidade da Google</a>.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Pagamentos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Os pagamentos são efetuados via MB Way ou transferência bancária. Não armazenamos dados de pagamento. Os recibos partilhados via WhatsApp podem conter dados pessoais (nome, IBAN) que são tratados exclusivamente para confirmação do pedido.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Segurança e prevenção de abuso</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Para proteger a integridade do serviço e prevenir a partilha não autorizada ou uso abusivo de acessos, os nossos sistemas registam metadados de autenticação associados a cada token — incluindo timestamps de validação e endereço IP da ligação. Esta recolha tem como base legal o interesse legítimo do responsável pelo tratamento (Art. 6.º n.º 1 al. f) do RGPD), nomeadamente a segurança do serviço e a prevenção de fraude. Estes dados não são partilhados com terceiros e são retidos apenas pelo tempo necessário para fins de segurança.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Segurança</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Nunca te pedimos o teu código de acesso de volta, NIF, palavras-passe ou dados bancários completos. Se receberes uma mensagem a solicitar esses dados em nome da GigHub, trata-se de fraude.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">RGPD</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Nos termos do RGPD, tens direito a aceder, corrigir, portabilizar ou eliminar os teus dados. Para exercer estes direitos, contacta-nos em gighubpro@gmail.com. Tens ainda o direito de apresentar queixa à CNPD (Comissão Nacional de Proteção de Dados).</p>`,
      en: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Privacy Policy</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Last updated: May 2026</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Data we collect</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We only collect the data necessary to provide the service, including contact information and GigBoost form responses submitted voluntarily.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Why we collect it</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Data is used solely to provide the purchased service — platform access and/or personalised GigBoost recommendations. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Processing via WhatsApp / Meta</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">The GigBoost service uses WhatsApp (operated by Meta Platforms, Inc.) to receive proof of payment and deliver personalised recommendations. By submitting the GigBoost form, your profile data (country, age range, goals, skills) is transmitted via WhatsApp and is subject to <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Meta's Privacy Policy</a>. We do not use this data for marketing purposes. If you prefer not to use WhatsApp, contact us by email.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Cookies &amp; analytics</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We do not use advertising trackers or invasive third-party analytics tools. Access is managed by unique tokens without personal identification; these tokens are verified in real-time via Supabase and are not stored in localStorage. Typefaces are loaded from Google Fonts, which involves a connection to Google's servers. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Google's Privacy Policy</a>.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Payments</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Payments are made via MB Way or bank transfer. We do not store payment data. Payment receipts shared via WhatsApp may contain personal data (name, IBAN) which is processed solely for order confirmation.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Security &amp; abuse prevention</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">To protect the integrity of the service and prevent unauthorised sharing or abusive use of access tokens, our systems log authentication metadata associated with each token — including validation timestamps and connection IP address. This processing is based on the legitimate interests of the data controller (Art. 6(1)(f) GDPR), specifically service security and fraud prevention. This data is not shared with third parties and is retained only for as long as necessary for security purposes.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Security notice</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We will never ask for your password, tax number, full banking details or your access code back. We only ask for proof of payment. If you receive a message requesting those details in GigHub's name, it is fraud.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Your rights (GDPR)</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Under GDPR, you have the right to access, rectify, port or erase your data, and to object to or restrict certain processing. To exercise these rights, contact us at gighubpro@gmail.com. You also have the right to lodge a complaint with a supervisory authority (in Portugal: CNPD — Comissão Nacional de Proteção de Dados).</p>`
    },
    terms: {
      pt: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Termos de Utilização</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Ao adquirir acesso ao GigHub, aceitas os seguintes termos.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">O que é o GigHub</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O GigHub é uma plataforma de curadoria de oportunidades de rendimento online. Organizamos, verificamos e apresentamos plataformas legítimas num só lugar.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Sem garantia de ganhos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O GigHub não garante quaisquer ganhos, resultados ou disponibilidade de trabalho. Os valores apresentados são estimativas baseadas em médias reportadas por utilizadores.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Responsabilidade do utilizador</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O utilizador é responsável pelo uso que faz das plataformas listadas, pelo cumprimento dos respetivos termos de serviço, e pelas obrigações fiscais decorrentes dos seus ganhos.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Acesso digital</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">O acesso adquirido é pessoal, intransmissível e de utilização única. Não pode ser partilhado, revendido ou transferido.</p>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Por razões de segurança e prevenção de fraude, a atividade de acesso associada a cada token pode ser monitorizada. Tokens com padrões de utilização suspeitos, partilhados ou abusivos poderão ser revogados permanentemente, sem direito a reembolso.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Sem reembolsos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Dado o caráter digital do serviço e o início imediato do acesso após confirmação, o utilizador aceita renunciar ao direito de livre resolução previsto na legislação aplicável. Após a entrega do acesso, não são efetuados reembolsos.</p>`,
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
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">For security and anti-abuse purposes, access activity associated with each token may be monitored. Tokens showing suspicious, shared or abusive usage patterns may be permanently revoked, without refund.</p>
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
  // IBAN copy button
  const copyIban = document.getElementById('copyIbanBtn');
  if(copyIban) copyIban.textContent = isEn ? 'Copy' : 'Copiar';
  // Monetization section labels
  const monoPayLabelEl = document.getElementById('monoPayLabel');
  if(monoPayLabelEl) monoPayLabelEl.textContent = isEn ? 'Alternative — Bank transfer' : 'Alternativa — Transferência bancária';
}


  // session timeout moved to _bindEvents()

// auto-unlock moved to _bindEvents()
// scroll handler lives in _bindEvents() below

// ── Session timeout — global scope so validarTokenSupabase can call it ──
let _sessionTimeoutInterval = null;
function _startSessionTimeout(){
  if(_sessionTimeoutInterval) return; // prevent double-start
  let _lastActivity = Date.now();
  let _timeoutWarned = false;
  let _activityThrottle = null;
  const _updateActivity = () => { _lastActivity = Date.now(); _timeoutWarned = false; };
  document.addEventListener('click', _updateActivity);
  document.addEventListener('keydown', () => {
    if(_activityThrottle) return;
    _activityThrottle = setTimeout(()=>{ _updateActivity(); _activityThrottle=null; }, 5000);
  });
  _sessionTimeoutInterval = setInterval(() => {
    const idle = Date.now() - _lastActivity;
    if(idle > 6600000 && !_timeoutWarned) { // 110 min — warn 10 min before
      _timeoutWarned = true;
      const msg = currentLang==='en'
        ? 'Your session expires in 10 minutes due to inactivity.'
        : 'A tua sessão expira em 10 minutos por inatividade.';
      let toast = document.getElementById('_sessionToast');
      if(!toast) {
        toast = document.createElement('div');
        toast.id = '_sessionToast';
        toast.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);font-family:\'Instrument Sans\',sans-serif;font-size:13px;padding:10px 20px;border-radius:10px;z-index:960;box-shadow:0 4px 20px rgba(0,0,0,.4);border:1px solid rgba(201,168,76,.3);white-space:nowrap;';
        document.body.appendChild(toast);
      }
      toast.textContent = '⏱ ' + msg;
      toast.style.display = 'block';
      setTimeout(() => { if(toast) toast.style.display = 'none'; }, 9000);
    }
    if(idle > 7200000) {
      // Show a clear "session expired" message before reloading so the user isn't confused
      let expiredToast = document.getElementById('_sessionToast');
      if(!expiredToast) {
        expiredToast = document.createElement('div');
        expiredToast.id = '_sessionToast';
        expiredToast.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);font-family:\'Instrument Sans\',sans-serif;font-size:13px;padding:10px 20px;border-radius:10px;z-index:960;box-shadow:0 4px 20px rgba(0,0,0,.4);border:1px solid rgba(201,168,76,.3);white-space:nowrap;';
        document.body.appendChild(expiredToast);
      }
      expiredToast.textContent = currentLang==='en' ? '🔐 Session expired. Reloading…' : '🔐 Sessão expirada. A recarregar…';
      expiredToast.style.display = 'block';
      setTimeout(() => location.reload(), 2000);
    }
  }, 60000);
}

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

  // ── Lock screen privacy link handled by global [data-modal] delegation below ──

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
  if(searchEl){ let _st; searchEl.addEventListener('input', () => { clearTimeout(_st); _st = setTimeout(render, 150); }); }
  const fWorkType = document.getElementById('fWorkType');
  if(fWorkType) fWorkType.addEventListener('change', e => { activeWorkType = e.target.value; render(); });

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
      const _wtEl = document.getElementById('fWorkType'); if(_wtEl) _wtEl.value = '';
      activeTab = ''; activeCuration = ''; activeWorkType = '';
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.v === ''));
      document.querySelectorAll('.curation-pill').forEach(p => p.classList.toggle('active', p.dataset.curation === ''));
      render();
      return;
    }
    // Open platform URL when clicking card body (not buttons or links)
    if(!e.target.closest('a') && !e.target.closest('button')) {
      const card = e.target.closest('.card[data-url]');
      if(card && card.dataset.url) {
        // Validate URL scheme before opening (defense in depth against data: / javascript:)
        const _u = card.dataset.url;
        if(_u.startsWith('https://') || _u.startsWith('http://')) {
          const w = window.open(_u, '_blank', 'noopener,noreferrer');
          if(w) w.opener = null;
        }
      }
    }
  });
  // Keyboard: Enter key on card opens URL
  if(grid) grid.addEventListener('keydown', function(e) {
    if(e.key === 'Enter') {
      const card = e.target.closest('.card[data-url]');
      if(card && card.dataset.url) {
        const _u = card.dataset.url;
        if(_u.startsWith('https://') || _u.startsWith('http://')) {
          const w = window.open(_u, '_blank', 'noopener,noreferrer');
          if(w) w.opener = null;
        }
      }
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
  // Backdrop click closes boost modals
  ['boostPayModal','boostFormModal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', e => { if(e.target === el) el.style.display = 'none'; });
  });
  const boostOpenFormBtn = document.getElementById('boostOpenFormBtn');
  if(boostOpenFormBtn) boostOpenFormBtn.addEventListener('click', async () => {
    const tokenInput = document.getElementById('boostTokenInput');
    const tokenErr   = document.getElementById('boostTokenErr');
    if(!tokenInput) { document.getElementById('boostPayModal').style.display = 'none'; openBoostForm(); return; }
    const raw = tokenInput.value.trim().replace(/[^A-Za-z0-9\-]/g,'').substring(0,20).toUpperCase();
    if(!raw || raw.length < 8) {
      if(tokenErr) tokenErr.textContent = currentLang==='en' ? 'Enter your GigBoost code.' : 'Insere o teu código GigBoost.';
      tokenInput.focus();
      return;
    }
    boostOpenFormBtn.disabled = true;
    boostOpenFormBtn.textContent = currentLang==='en' ? 'Verifying…' : 'A verificar…';
    if(tokenInput) tokenInput.disabled = true;
    if(tokenErr) tokenErr.textContent = '';
    try {
      const { data, error } = await _SB.rpc('validate_boost_token', { p_token: raw });
      if(error || !data || data.valid === false) {
        if(tokenErr) tokenErr.textContent = currentLang==='en'
          ? 'Invalid or already used code.'
          : 'Código inválido ou já utilizado.';
        boostOpenFormBtn.disabled = false;
        if(tokenInput) tokenInput.disabled = false;
        boostOpenFormBtn.textContent = currentLang==='en'
          ? 'Verify code and fill profile →'
          : 'Verificar código e preencher perfil →';
        return;
      }
    } catch(e) {
      // Network or unexpected error: fail CLOSED — never bypass token validation
      if(tokenErr) tokenErr.textContent = currentLang==='en'
        ? 'Connection error. Please try again.'
        : 'Erro de ligação. Tenta novamente.';
      boostOpenFormBtn.disabled = false;
      if(tokenInput) tokenInput.disabled = false;
      boostOpenFormBtn.textContent = currentLang==='en'
        ? 'Verify code and fill profile →'
        : 'Verificar código e preencher perfil →';
      return;
    }
    document.getElementById('boostPayModal').style.display = 'none';
    openBoostForm();
    boostOpenFormBtn.disabled = false;
    if(tokenInput) tokenInput.disabled = false;
    boostOpenFormBtn.textContent = currentLang==='en'
      ? 'Verify code and fill profile →'
      : 'Verificar código e preencher perfil →';
  });

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

  // ── Copy IBAN button (monetização section) ──
  const copyIbanBtn = document.getElementById('copyIbanBtn');
  if(copyIbanBtn) copyIbanBtn.addEventListener('click', function() {
    navigator.clipboard.writeText('PT500023000045' + '69719247094').then(() => {
      this.textContent = currentLang === 'en' ? '✓ Copied' : '✓ Copiado';
      setTimeout(() => { this.textContent = currentLang === 'en' ? 'Copy' : 'Copiar'; }, 1800);
    });
  });

  // ── Admin panel static buttons ──
  const admAddBoostTokenBtn = document.getElementById('admAddBoostTokenBtn');
  if(admAddBoostTokenBtn) admAddBoostTokenBtn.addEventListener('click', admAddBoostToken);
  const admCopyBoostCodeBtn = document.getElementById('boostCopyBtn');
  if(admCopyBoostCodeBtn) admCopyBoostCodeBtn.addEventListener('click', admCopyBoostCode);
  // admDownloadBoostBtn: not implemented — Supabase dashboard handles token exports

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

  // ── Escape key closes any open overlay modal ──
  document.addEventListener('keydown', function(e) {
    if(e.key !== 'Escape') return;
    const modals = [
      {id:'calcModal',      prop:'display'},
      {id:'welcomeModal',   prop:'display'},
      {id:'legalModal',     prop:'display'},
      {id:'boostPayModal',  prop:'display'},
      {id:'boostFormModal', prop:'display'},
    ];
    for(const m of modals) {
      const el = document.getElementById(m.id);
      if(el && el.style.display !== 'none' && el.style.display !== '') {
        el.style.display = 'none';
        return;
      }
    }
  });


  // ── Scroll: back-to-top only (tabs are always visible) ──
  window.addEventListener('scroll', function(){
    const btn = document.getElementById('backToTop');
    if(btn) btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
  }, {passive:true});

  // ── GDPR / localStorage notice ──
  (function(){
    try {
      const noticeEl = document.getElementById('gdprNotice');
      const okBtn = document.getElementById('gdprOkBtn');
      const textEl = document.getElementById('gdprText');
      if(!noticeEl) return;
      // Always hide while lock screen is visible
      const _ls = document.getElementById('lockScreen');
      if(_ls && !_ls.classList.contains('unlocked')) {
        noticeEl.classList.add('hidden');
      }
      // Hide immediately if already acknowledged
      if(localStorage.getItem('gh_gdpr_ok')) { noticeEl.classList.add('hidden'); return; }
      // Update text to current language
      function _updateGdprText(){
        if(textEl){
          textEl.innerHTML = currentLang === 'en'
            ? 'This site uses localStorage for preferences and favourites — no tracking cookies or third-party analytics. <a href="#" data-modal="privacy">Privacy Policy</a>'
            : 'Este site usa localStorage para preferências e favoritos — sem cookies de rastreamento nem analytics de terceiros. <a href="#" data-modal="privacy">Política de Privacidade</a>';
        }
        if(okBtn) okBtn.textContent = currentLang === 'en' ? 'OK, got it' : 'OK, entendi';
      }
      _updateGdprText();
      // Expose so applyLang / toggleLang can refresh text when language changes
      window._updateGdprText = _updateGdprText;
      if(okBtn) {
        okBtn.addEventListener('click', function(){
          try { localStorage.setItem('gh_gdpr_ok','1'); } catch(e){}
          noticeEl.classList.add('hidden');
        });
      }
      // Expose function to reveal notice after unlock
      window._showGdprNotice = function(){
        if(localStorage.getItem('gh_gdpr_ok')) return;
        _updateGdprText();
        noticeEl.classList.remove('hidden');
      };
    } catch(e) {}
  })();

  // ── Init ──
  document.getElementById('favCount').textContent = favs.length;
  // Sync <html lang> with persisted language preference
  document.documentElement.lang = currentLang;
  // Lock body scroll while lock screen is visible (prevents background scroll on mobile)
  const _ls0 = document.getElementById('lockScreen');
  if(_ls0 && !_ls0.classList.contains('unlocked')) document.body.style.overflow = 'hidden';
  const yearEl = document.getElementById('heroYear');
  if(yearEl) yearEl.textContent = new Date().getFullYear();
  // Set initial active state for curation pills ('Todas' pill)
  document.querySelectorAll('.curation-pill').forEach(el=>
    el.classList.toggle('active', el.dataset.curation===''));
  // Initialize lock screen text to current language
  applyLockLang();
  // Apply full language to main UI (ensures tabs, labels, translations are correct on first load)
  if(typeof applyLang === 'function') applyLang();
  render();

  // ── Auto-unlock from URL hash ──
  // Handles: #key=TOKEN (normal access) and #admin=SECRET (admin UI, hash-protected)
  (async function() {
    const _rawHash = window.location.hash;
    const urlParams = new URLSearchParams(_rawHash.slice(1));
    const t = urlParams.get('key');
    const adminParam = urlParams.get('admin');

    // Strip the hash from the URL bar immediately — before any async work —
    // so the token never lingers in the URL or browser history, whether
    // validation succeeds or fails.
    if(_rawHash && _rawHash.length > 1) {
      try {
        window.history.replaceState(
          null, '',
          window.location.pathname + (window.location.search || '')
        );
      } catch(e) {}
    }

    // fromUrl=true skips client-side rate limiting — paying customers must be
    // able to open their link freely without hitting brute-force counters.
    if(t) { await validarTokenSupabase(t, true); return; }

    // Admin UI: verified server-side via Supabase RPC only — never store hashes client-side.
    if(adminParam && _SB) {
      try {
        const { data: _adData, error: _adErr } = await _SB.rpc('verify_admin_token', { p_token: adminParam });
        if(!_adErr && _adData && _adData.valid === true) { showAdminLogin(); return; }
      } catch(e) { /* RPC unavailable — fail closed */ }
    }

    // No URL token — show password mode
    showPasswordMode();
    applyLockLang();
  })();

  } catch(e) { console.error('[GigHub] _bindEvents error:', e); }
})();
