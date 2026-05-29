if(location.hostname!=="localhost"){
  console.log=()=>{};
  console.warn=()=>{};
  // Note: console.error intentionally NOT suppressed — allows Supabase/runtime errors to surface
}

const PRICE_PER_ACCESS = 19.99;
const PRICE_PER_BOOST  = 7.99;

// Build WA URLs using constants so price is always consistent
function _waAccessUrl(lang) {
  const amt = lang === 'en'
    ? `\u20AC${PRICE_PER_ACCESS.toFixed(2)}`
    : `${PRICE_PER_ACCESS.toFixed(2).replace('.', ',')}\u20AC`;
  const subPT = encodeURIComponent(`Pedido de Acesso GigHub — Comprovativo MB Way (${amt})`);
  const subEN = encodeURIComponent(`GigHub Access Request — MB Way Receipt (${amt})`);
  const bodyPT = encodeURIComponent(`Olá,\n\nAcabei de enviar ${amt} por MB Way.\nSegue em anexo o comprovativo.\n\nObrigado!`);
  const bodyEN = encodeURIComponent(`Hi,\n\nI just sent ${amt} via MB Way.\nAttaching the receipt.\n\nThank you!`);
  return lang === 'en'
    ? `mailto:gighubpt@gmail.com?subject=${subEN}&body=${bodyEN}`
    : `mailto:gighubpt@gmail.com?subject=${subPT}&body=${bodyPT}`;
}
function _waBoostUrl(lang) {
  const _lang = (lang === 'en' || lang === 'pt') ? lang : (typeof currentLang !== 'undefined' ? currentLang : 'pt');
  const amt = _lang === 'en'
    ? `\u20AC${PRICE_PER_BOOST.toFixed(2)}`
    : `${PRICE_PER_BOOST.toFixed(2).replace('.', ',')}\u20AC`;
  const subPT = encodeURIComponent(`Pedido GigBoost — Comprovativo MB Way (${amt})`);
  const subEN = encodeURIComponent(`GigBoost Request — MB Way Receipt (${amt})`);
  const bodyPT = encodeURIComponent(`Olá,\n\nAcabei de enviar ${amt} por MB Way para o GigBoost.\nSegue em anexo o comprovativo.\n\nObrigado!`);
  const bodyEN = encodeURIComponent(`Hi,\n\nI just sent ${amt} via MB Way for GigBoost.\nAttaching the receipt.\n\nThank you!`);
  return _lang === 'en'
    ? `mailto:gighubpt@gmail.com?subject=${subEN}&body=${bodyEN}`
    : `mailto:gighubpt@gmail.com?subject=${subPT}&body=${bodyPT}`;
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

// Note: DevTools protection is already handled by _sessionNonce check in render().
// Setting hasAccess=true in console without a valid nonce has no effect on content.

// ── Hero / stat counter — updated once platforms are loaded from Supabase ─────
function _updateHeroCount(){
  const total = P.length;
  if(!total) return;
  // Round down to nearest 10, show with "+" prefix (e.g. 87 → "+80")
  const rounded = total >= 100 ? '+100' : ('+' + (Math.floor(total / 10) * 10));
  const isEn = currentLang === 'en';
  // Hero tag (inside the app, post-auth)
  const heroTag = document.querySelector('.hero-tag');
  if(heroTag) heroTag.innerHTML = '✅ ' + rounded + (isEn
    ? ' verified platforms · Updated '
    : ' plataformas verificadas · Atualizado ')
    + '<span id="heroYear">' + new Date().getFullYear() + '</span>';
  // Hero stat block (dynamic total)
  const sTotalEl = document.getElementById('s-total');
  if(sTotalEl) sTotalEl.textContent = total;
}


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
  const _admTotal = document.getElementById('adm-total');
  const _admRevenue = document.getElementById('adm-revenue');
  const _admRevoked = document.getElementById('adm-revoked');
  const container=document.getElementById('adm-list');
  if(!_admTotal || !container) return; // admin panel not in this page
  _admTotal.textContent='—';
  _admRevenue.textContent='—';
  _admRevoked.textContent='—';
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
  if(favBtn){
    favBtn.innerHTML='⭐<span class="fav-txt"> '+t.navFavs.replace(/^⭐\s*/,'')+' (<span id="favCount">'+favs.length+'</span>)';
    favBtn.style.background=showFavsOnly?'var(--ink)':'';
    favBtn.style.color=showFavsOnly?'var(--paper)':'';
    favBtn.style.borderColor=showFavsOnly?'var(--ink)':'';
  }
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
  ['2','4','5','7','8','10','12','888','999'].forEach(v=>{
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
  // Sync boost pay modal badge price display
  const _boostPayBadge = document.getElementById('boostPayBadgeEl');
  if(_boostPayBadge) {
    const _bPrice = currentLang === 'en' ? ('€' + PRICE_PER_BOOST.toFixed(2)) : (PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€');
    _boostPayBadge.textContent = '✨ GigBoost · ' + _bPrice;
  }
  // Sync boost token section label in modal
  const _btslModal = document.getElementById('boostTokenSectionLabel');
  if(_btslModal) _btslModal.textContent = currentLang === 'en' ? 'Already have your GigBoost code?' : 'Já recebeste o teu código GigBoost?';
  // Update price display in payment box
  const _bModal2 = document.getElementById('boostPayModal');
  if(_bModal2) {
    const _priceDisp = _bModal2.querySelector('[style*="font-size:26px"]');
    if(_priceDisp) _priceDisp.textContent = currentLang === 'en' ? ('€' + PRICE_PER_BOOST.toFixed(2)) : (PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€');
  }
  // Sync email link href so EN users get an EN email subject/body
  const _bModal = document.getElementById('boostPayModal');
  if(_bModal) { const _el = _bModal.querySelector('a[href*="mailto"]'); if(_el) _el.href = _waBoostUrl(currentLang); }
  // Always rebuild instruction from PRICE_PER_BOOST constant (prevents translation string drift)
  const _boostInstrEl = document.getElementById('boostPayInstrEl');
  if(_boostInstrEl) {
    const _bAmt = currentLang === 'en'
      ? '€' + PRICE_PER_BOOST.toFixed(2)
      : PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€';
    _boostInstrEl.innerHTML = currentLang === 'en'
      ? `Transfer <strong>${_bAmt}</strong> via <strong>MB Way</strong> or IBAN and email your receipt to <strong>gighubpt@gmail.com</strong>.<br>Access is sent after payment confirmation.`
      : `Transfere <strong>${_bAmt}</strong> via <strong>MB Way</strong> ou IBAN e envia o comprovativo para <strong>gighubpt@gmail.com</strong>.<br>O acesso GigBoost é enviado após confirmação.`;
  }
}

function openCalc(){
  document.getElementById('calcModal').style.display='flex';
  _applyCalcLang();
}
function calcEarnings(){
  const h=parseInt(document.getElementById('hoursRange').value);
  const rateRaw=document.getElementById('calcType').value;
  const rate=parseInt(rateRaw);
  const t = translations[currentLang]||translations['pt'];
  const isEn = currentLang === 'en';
  document.getElementById('hoursVal').textContent=h+'h';

  // Options loop used in multiple branches
  const _optIds = ['2','4','5','7','8','10','12','888','999'];
  const _updateLabels = () => {
    _optIds.forEach(v=>{const el=document.getElementById('calcOpt'+v);if(el&&t['calcOpt'+v])el.textContent=t['calcOpt'+v];});
    const tl=document.getElementById('calcTypeLabel');if(tl&&t.calcTypeLabel)tl.textContent=t.calcTypeLabel;
  };
  const _s=(id,key)=>{const el=document.getElementById(id);if(el&&t[key])el.textContent=t[key];};
  _s('calcTitleEl','calcTitle'); _s('calcDescEl','calcDesc'); _s('calcHoursLabelEl','calcHoursLabel');
  _updateLabels();

  // ── OPERAÇÕES & RETALHO: salário fixo mensal, não depende de horas ────────────
  if(rateRaw === '888'){
    document.getElementById('calcResult').textContent = isEn ? '820€–980€' : '820€–980€';
    const rlEl=document.getElementById('calcResultLabelEl');
    if(rlEl) rlEl.textContent = isEn ? 'Monthly gross salary estimate' : 'Estimativa mensal bruta';
    const estLabel = isEn ? 'Direct employment · fixed schedule · no guarantees' : 'Emprego directo · horário fixo · sem garantias';
    document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+(isEn?'Examples':'Exemplos')+': <span style="font-weight:400;color:var(--grey)">DHL · Mercadona · Securitas · Eurest</span></div>';
    return;
  }

  // ── CLÍNICA & INVESTIGAÇÃO: por projeto ───────────────────────────────────────
  if(rateRaw === '999'){
    document.getElementById('calcResult').textContent='300€–2000€';
    const rlEl=document.getElementById('calcResultLabelEl');
    if(rlEl) rlEl.textContent = isEn ? 'Per project · very limited availability' : 'Por projeto · disponibilidade muito limitada';
    const estLabel = isEn ? 'Conservative estimate · no guarantees' : 'Estimativa conservadora · sem garantias';
    document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+(isEn?'Examples':'Exemplos')+': <span style="font-weight:400;color:var(--grey)">BlueClinical · iVidador · iVidoa</span></div>';
    return;
  }

  // ── HOURLY-BASED TYPES ────────────────────────────────────────────────────────
  // Conservative availability factors — how many of your available hours
  // actually earn in Portugal given real supply/demand constraints.
  const _AVAIL = {
    2:  0.35,   // Surveys: limited PT supply, many disqualifications
    4:  0.20,   // Conteúdo: slow to monetise, audience needed
    5:  0.65,   // Entregas: reliable but after fuel/wear costs
    7:  0.55,   // Biscates: variable demand, setup time
    8:  0.55,   // Caregiving: seasonal, trust-building takes time
    10: 0.45,   // Ensino: student acquisition takes weeks
    12: 0.10,   // Cliente Mistério: very few slots in PT
  };
  const _availFactor = _AVAIL[rate] || 0.50;
  const _base = Math.round(h * 4 * rate * _availFactor);
  const _low  = Math.round(_base * 0.75 / 5) * 5;
  const _high = Math.round(_base * 1.25 / 5) * 5;
  document.getElementById('calcResult').textContent = _low + '€–' + _high + '€';

  const rl=document.getElementById('calcResultLabelEl');
  if(rl && t.calcResult) rl.textContent = t.calcResult;

  const sPT={
    2:  'AttaPoll · Netsonda · Freecash',
    4:  'Adobe Stock · Etsy · Shutterstock',
    5:  'Glovo · Uber Eats · Bolt Food',
    7:  'TaskRabbit · Merytu · Eloquence Events',
    8:  'Rover · Babysits · PetBacker',
    10: 'Superprof · Preply · Acclaro',
    12: 'More Results · Pontis · SmartSpotter',
  };
  const sEN={
    2:  'AttaPoll · Netsonda · Freecash',
    4:  'Adobe Stock · Etsy · Shutterstock',
    5:  'Glovo · Uber Eats · Bolt Food',
    7:  'TaskRabbit · Merytu · Eloquence Events',
    8:  'Rover · Babysits · PetBacker',
    10: 'Superprof · Preply · Acclaro',
    12: 'More Results · Pontis · SmartSpotter',
  };
  const s = isEn ? sEN : sPT;
  const sugLabel = isEn ? 'Suggested' : 'Sugestões';
  const estLabel = isEn ? 'Conservative estimate · no guarantees' : 'Estimativa conservadora · sem garantias';
  document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+sugLabel+': <span style="font-weight:400;color:var(--grey)">'+(s[rate]||'—')+'</span></div>';
  const rlEl=document.getElementById('calcResultLabelEl');
  if(rlEl) rlEl.textContent = isEn ? 'Monthly estimate' : 'Estimativa mensal';
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
  const arr=new Uint8Array(8); crypto.getRandomValues(arr);
  let t='BOOST-';
  for(let i=0;i<4;i++) t+=c[arr[i]%c.length];
  t+='-';
  for(let i=4;i<8;i++) t+=c[arr[i]%c.length];
  return t;
}
function openBoostPay(){
  const modal = document.getElementById('boostPayModal');
  if(modal) {
    // Update email link href dynamically so price is always from the constant
    const waLink = modal.querySelector('a[href*="mailto"]');
    if(waLink) waLink.href = _waBoostUrl(currentLang);
    // Update badge price display from constant (localized format)
    const badge = modal.querySelector('.boost-badge');
    const priceStr = currentLang === 'en'
      ? '€' + PRICE_PER_BOOST.toFixed(2)
      : PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€';
    if(badge) badge.textContent = '✨ GigBoost · ' + priceStr;
    // Update displayed price in payment box and instructions
    const priceEl = modal.querySelector('[style*="font-size:26px"]');
    if(priceEl) priceEl.textContent = priceStr;
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
  const _abt = document.getElementById('adm-boost-total');
  const _abr = document.getElementById('adm-boost-revenue');
  const _abu = document.getElementById('adm-boost-used');
  const c=document.getElementById('adm-boost-list');
  if(!_abt || !c) return; // admin panel not in this page
  _abt.textContent='(Supabase)';
  _abr.textContent='—';
  _abu.textContent='—';
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
  pt: {surveys:'Inquéritos & Microtasks',gigs:'Gigs',freelance:'Freelance',micro:'Inquéritos & Microtasks',testing:'Inquéritos & Microtasks',criativo:'Conteúdo & Criativo',conteudo:'Conteúdo & Criativo',tasks:'Inquéritos & Microtasks',mystery:'Cliente Mistério',transcricao:'Transcrição',tutoring:'Tutoria',ugc:'Conteúdo & Criativo',passive:'Rendimento Passivo',remote:'Emprego Remoto',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'Trabalho Presencial',clinical:'Clínica & Investigação',retail:'Operações & Retalho',support:'Atendimento & Suporte'},
  en: {surveys:'Surveys & Microtasks',gigs:'Gigs',freelance:'Freelance',micro:'Surveys & Microtasks',testing:'Surveys & Microtasks',criativo:'Content & Creative',conteudo:'Content & Creative',tasks:'Surveys & Microtasks',mystery:'Mystery Shopping',transcricao:'Transcription',tutoring:'Tutoring',ugc:'Content & Creative',passive:'Passive Income',remote:'Remote Jobs',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'In-Person Work',clinical:'Clinical & Research',retail:'Operations & Retail',support:'Customer Support'}
};
let catLabel = catLabels['pt'];

// ── TAXONOMY — sistema de três pilares ───────────────────────────────────────
//
// Todos os dados por plataforma (entry_level, earnings_type, tier, suggested,
// direct_hire, is_delivery, no_curation_tag) vêm agora da DB via _fmt().
// Os fallbacks por categoria abaixo são usados apenas quando o campo é NULL na DB.
// ─────────────────────────────────────────────────────────────────────────────

// Fallback por categoria — ENTRADA (quando entry_level é NULL na DB)
const _CAT_ENTRY_FALLBACK = {
  surveys:'facil', tasks:'facil', micro:'facil', gigs:'facil',
  f2f:'facil', petsitting:'facil', babysitting:'facil',
  mystery:'facil', passive:'facil', conteudo:'facil', transcricao:'facil',
  testing:'moderado', criativo:'moderado', ugc:'moderado',
  freelance:'moderado', tutoring:'moderado', remote:'moderado',
  clinical:'facil', retail:'moderado', support:'moderado',
};

// Fallback por categoria — GANHOS (quando earnings_type é NULL na DB)
const _CAT_EARNINGS_FALLBACK = {
  gigs:'estavel', petsitting:'estavel', babysitting:'estavel', f2f:'estavel', micro:'variavel',
  surveys:'variavel', testing:'variavel', criativo:'variavel',
  conteudo:'variavel', tasks:'variavel', ugc:'variavel',
  passive:'variavel', transcricao:'variavel', mystery:'variavel',
  tutoring:'variavel', freelance:'variavel', remote:'variavel',
  clinical:'variavel', retail:'estavel', support:'estavel',
};

// Fallback por categoria — TIER (quando tier é NULL na DB)
const _TIER_CAT_DEFAULT = {
  f2f:1, gigs:1, retail:1, clinical:1, support:1,
  mystery:2, freelance:2, remote:2, ugc:2, criativo:2,
  conteudo:2, transcricao:2, tutoring:2, petsitting:2, babysitting:2,
  passive:2,
  surveys:3, micro:3, tasks:3, testing:3,
  canal:4,
};

function _getTier(p){
  if(p.tier) return p.tier;
  return _TIER_CAT_DEFAULT[p.cat] || 2;
}

function _tierBadge(p){ return ''; } // tier badges removed from card header — see _discoveryNote()

function _discoveryNote(p){
  if(_getTier(p) !== 4) return '';
  const isEn = currentLang === 'en';
  return `<div class="discovery-note">${isEn
    ? '🟣 Discovery tool — use this to find opportunities, not to earn directly'
    : '🟣 Canal de descoberta — usa para encontrar oportunidades, não para ganhar directamente'}</div>`;
}

// direct_hire flag comes from DB via p.direct_hire — set in migration_platform_metadata.sql

function renderRatings(p){
  const r = p.ratings || {};
  const isEn = currentLang === 'en';

  // ── DIRECT-HIRE: fixed tags for employers ────────────────────────────────────
  if(p.direct_hire){
    return `<div class="ratings-row"></div>`;
  }

  // ── PILAR 1: Dificuldade de Entrada — removido do display ────────────────────

  // ── Destaque (opcional) ───────────────────────────────────────────────────────

  return `<div class="ratings-row"></div>`;
}

// NOTE: no-cors fetch blocks all response inspection, so this function
// cannot actually detect downtime or issues. It always resolves to 'safe'.
// Kept only because checkAllSecurity is referenced in the admin panel;
// no sec-badge is inserted by render() so no misleading indicator reaches users.
async function checkSecurity(domain){
  if(!window.secStatus) window.secStatus = {};
  if(window.secStatus[domain]) return window.secStatus[domain];
  window.secStatus[domain]={status:'safe',label:'✓ Online'};
  return window.secStatus[domain];
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

// is_delivery flag comes from DB via p.is_delivery — set in migration_platform_metadata.sql

// ── Inherently face-to-face categories
const _F2F_CATS = new Set(['f2f', 'gigs', 'petsitting', 'babysitting', 'retail', 'clinical', 'mystery', 'support']);
// Grabr is gigs but can be done remotely (traveller buys & ships abroad)
const _REMOTE_EXCEPTION_NAMES = new Set(['grabr']);
// Sonder People is passive but requires physical presence for castings — NOT remote
const _NOT_REMOTE_NAMES = new Set(['sonder','sonder people']);

// ── New tab group filters (maps tab data-v → predicate on platform)
const TAB_CAT_FILTERS = {
  '':           () => true,
  'surveys':    p => ['surveys', 'tasks', 'testing', 'micro'].includes(p.cat),
  'mystery':    p => p.cat === 'mystery',
  'deliveries': p => p.cat === 'gigs' && p.is_delivery,
  'skills':     p => ['freelance', 'tutoring', 'transcricao', 'remote'].includes(p.cat),
  'criativo':   p => ['criativo', 'conteudo', 'ugc'].includes(p.cat),
  'gigs_events':p => p.cat === 'gigs' && !p.is_delivery,
  'caregiving': p => ['petsitting', 'babysitting'].includes(p.cat),
  'f2f':        p => p.cat === 'f2f',
  'clinical':   p => p.cat === 'clinical',
  'retail':     p => p.cat === 'retail',
  'passive':    p => p.cat === 'passive',
  'support':    p => p.cat === 'support',
};

// ── Display labels for each tab group
const TAB_GROUP_LABELS = {
  pt: {
    '':           'Todas as plataformas',
    'surveys':    '📝 Inquéritos, Microtasks, Testes e Get-Paid-To',
    'mystery':    '🕵️ Cliente Mistério e Auditoria de Qualidade',
    'deliveries': '🚗 Entregas, Estafetas e Condução',
    'skills':     '🧑‍🏫 Ensino, Tutorias e Apoio Académico',
    'criativo':   '🎨 Conteúdo, Criativo, Stock e E-commerce',
    'gigs_events':'🛠️ Tarefas Locais, Eventos e Hotelaria',
    'caregiving': '🫶 Caregiving',
    'f2f':        '🤝 Trabalho Presencial',
    'clinical':   '🩺 Clínica, Ensaios e Investigação',
    'retail':     '🏭 Operações, Retalho e Serviços',
    'passive':    '💰 Rendimento Passivo',
    'support':    '🎧 Atendimento ao Cliente & Suporte',
  },
  en: {
    '':           'All platforms',
    'surveys':    '📝 Surveys, Micro-tasks, Testing & Get-Paid-To',
    'mystery':    '🕵️ Mystery Shopping & Quality Auditing',
    'deliveries': '🚗 Deliveries, Couriers & Driving',
    'skills':     '🧑‍🏫 Teaching, Tutoring & Academic Support',
    'criativo':   '🎨 Content, Creative, Stock & E-commerce',
    'gigs_events':'🛠️ Local Tasks, Events & Hospitality',
    'caregiving': '🫶 Caregiving',
    'f2f':        '🤝 In-Person Work',
    'clinical':   '🩺 Clinical, Trials & Research',
    'retail':     '🏭 Operations, Retail & Services',
    'passive':    '💰 Passive Income',
    'support':    '🎧 Customer Support & Service',
  },
};
function setTab(v){
  activeTab=v;
  // Reset curation when a tab is explicitly selected — prevents stacked zero-result confusion
  activeCuration='';
  document.querySelectorAll('.curation-pill').forEach(el=>el.classList.toggle('active',el.dataset.curation===''));
  // Reset filter boxes
  ['fboxAll','fboxStable','fboxVariable'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('active', el.dataset.fbox === '');
  });
  // Show work-type sub-filter (reset to "all formats" mode)
  const _wtDropTab = document.getElementById('wtDropdown');
  if(_wtDropTab) { _wtDropTab.style.display = 'none'; }
  const fboxAllEl = document.getElementById('fboxAll');
  if(fboxAllEl) fboxAllEl.setAttribute('aria-expanded','false');
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
    if(_workType === 'remote' && (_NOT_REMOTE_NAMES.has(p.name.toLowerCase()) || (_F2F_CATS.has(p.cat) && !_REMOTE_EXCEPTION_NAMES.has(p.name.toLowerCase())))) return false;
    if(geo==='pt' && !p.pt) return false;
    if(geo==='eu' && !p.eu) return false;
    return true;
  });

  if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='easy') list.sort((a,b)=>b.easy-a.easy);
  else list.sort((a,b)=>b.earnN-a.earnN);

  const _sTotalEl=document.getElementById('s-total');
  const _sCatsEl=document.getElementById('s-cats');
  const _isFiltered = cat !== '' || activeCuration !== '' || activeWorkType !== '' || q !== '' || showFavsOnly;
  if(_sTotalEl) _sTotalEl.textContent = _isFiltered ? list.length : (P.length || '—');
  if(_sCatsEl) {
    if(_isFiltered && list.length > 0) {
      // Count unique tab groups represented in the filtered list
      const _activeGroups = new Set();
      for (const p of list) {
        for (const [tv, tf] of Object.entries(TAB_CAT_FILTERS)) {
          if (tv !== '' && tf(p)) { _activeGroups.add(tv); break; }
        }
      }
      _sCatsEl.textContent = _activeGroups.size || '—';
    } else {
      _sCatsEl.textContent = '12';
    }
  }
  const _barCountEl=document.getElementById('barCount'); if(_barCountEl) _barCountEl.textContent=list.length+(currentLang==='en'?' result'+(list.length!==1?'s':''):(` resultado${list.length!==1?'s':''}`));

  // ── Update tab counts (based on current geo/curation/search/workType, ignoring category filter) ──
  const _tabBase = P.filter(p=>{
    if(curationFn && !curationFn(p)) return false;
    if(showFavsOnly && !favs.includes(p.name)) return false;
    if(q && !p.name.toLowerCase().includes(q) && !(currentLang==='en'&&p.descEn?p.descEn:p.desc).toLowerCase().includes(q) && !(catLabel[p.cat]||'').toLowerCase().includes(q)) return false;
    if(_workType === 'f2f' && !_F2F_CATS.has(p.cat)) return false;
    if(_workType === 'remote' && (_NOT_REMOTE_NAMES.has(p.name.toLowerCase()) || (_F2F_CATS.has(p.cat) && !_REMOTE_EXCEPTION_NAMES.has(p.name.toLowerCase())))) return false;
    if(geo==='pt' && !p.pt) return false;
    if(geo==='eu' && !p.eu) return false;
    return true;
  });
  document.querySelectorAll('.tab[data-v]').forEach(tab=>{
    const countEl=tab.querySelector('.tab-count');
    if(!countEl) return;
    const v=tab.dataset.v;
    if(v===''){countEl.textContent='';tab.style.display='';return;}
    const f=TAB_CAT_FILTERS[v];
    if(!f){countEl.textContent='';return;}
    const cnt=_tabBase.filter(f).length;
    countEl.textContent=cnt>0?cnt:'';
    if(cnt===0){
      tab.style.display='none';
      if(activeTab===v){ activeTab=''; document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.v==='')); }
    } else {
      tab.style.display='';
    }
  });
  // barTitle: curation > tab > default
  const _curationTitles={
    pt:{portugal:'Top picks Portugal 🇵🇹',stable:'Ganhos estáveis ⚡',variable:'Ganhos variáveis 🎲',noexp:'Sem experiência necessária 🚀'},
    en:{portugal:'Top picks Portugal 🇵🇹',stable:'Stable earnings ⚡',variable:'Variable earnings 🎲',noexp:'No experience needed 🚀'}
  };
  const _curationTitle = activeCuration ? (_curationTitles[currentLang]||_curationTitles.pt)[activeCuration] : null;
  const _tabGroupLabel = (TAB_GROUP_LABELS[currentLang]||TAB_GROUP_LABELS.pt)[cat];
  const _barTitleEl=document.getElementById('barTitle'); if(_barTitleEl) _barTitleEl.textContent= _curationTitle || _tabGroupLabel || translations[currentLang].barTitle;

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
    const _blockedPatterns = ['javascript:','data:','vbscript:','file:','localhost','127.0.0.1','0.0.0.0'];
    const effectiveUrl = _safeSchemes.some(s=>rawUrl.startsWith(s)) && !_blockedPatterns.some(b=>rawUrl.toLowerCase().includes(b)) ? rawUrl : null;
    const tier = _getTier(p);
    const cardClass = [
      p.dimmed ? 'dimmed' : (p.beginner && p.cat!=='f2f' ? 'beginner-pick' : ''),
      `card-t${tier}`
    ].filter(Boolean).join(' ');
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
      ${_discoveryNote(p)}
      ${renderRatings(p)}
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

// Platforms and categories that must never appear in any curation tag
// no_curation_tag comes from DB; _NO_TAG_CATS stays in JS (category-level, not per-platform)
const _NO_TAG_CATS = new Set([
  'conteudo','criativo','ugc','freelance',
  'tutoring','transcricao',
]);

// Top picks Portugal — hardcoded fallback so the curation always shows results
// even when the DB suggested field is not populated.
const _PT_TOP_PICKS = new Set([
  'glovo','attapoll','freecash',
  'taskrabbit','toloka ai',
  'amnistia internacional','acnur','aldeias sos',
  'apdes','associação salvador','associacao salvador','wwf portugal',
  'prime opinion','dhl','babysits',
  'blueclinical',
]);

const curationFilters = {
  portugal: p => !p.no_curation_tag && (p.suggested || _PT_TOP_PICKS.has(p.name.toLowerCase())),

  // Ganhos estáveis: earnings_type = 'estavel' ou fallback de categoria
  stable: p => {
    if(p.no_curation_tag || _NO_TAG_CATS.has(p.cat)) return false;
    if(['surveys','tasks','micro','testing','mystery','passive','clinical'].includes(p.cat)) return false;
    if(['TaskRabbit','Merytu','Grabr','Worldpackers','Casamentos.pt','Eloquence Events'].includes(p.name)) return false;
    return (p.earnings_type === 'estavel') || _CAT_EARNINGS_FALLBACK[p.cat] === 'estavel';
  },

  // Ganhos variáveis: earnings_type = 'variavel' ou fallback de categoria
  variable: p => {
    if(p.no_curation_tag) return false;
    if(_getTier(p) === 4) return false;
    // Explicit variable overrides (gigs platforms excluded from stable but with variable earnings)
    if(['Merytu','Grabr','TaskRabbit','Worldpackers','Casamentos.pt','Eloquence Events'].includes(p.name)) return true;
    return (p.earnings_type === 'variavel') || _CAT_EARNINGS_FALLBACK[p.cat] === 'variavel';
  },

  noexp: p => {
    if(p.no_curation_tag || _NO_TAG_CATS.has(p.cat)) return false;
    if(p.cat === 'clinical' || p.cat === 'passive' || p.cat === 'retail') return true;
    // Explicit noexp overrides (belt-and-suspenders)
    if(['Yescapa','Radical Storage','Bounce'].includes(p.name)) return true;
    if(['Uber Driver','Bolt Driver','Grabr','CLSBE PEO (Católica)'].includes(p.name)) return true;
    if(p.ratings && p.ratings.realistic <= 1) return false;
    return p.easy >= 4 || (p.easy >= 3 && (p.beginner === true || (p.ratings && p.ratings.beginner === true)));
  },
};

function setCuration(key) {
  activeCuration = key;
  // Reset tab when a curation is selected — prevents stacked zero-result confusion
  activeTab = '';
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.v===''));
  document.querySelectorAll('.curation-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.curation === key);
  });
  // Update filter boxes visual state
  ['fboxAll','fboxStable','fboxVariable'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    const boxKey = el.dataset.fbox;
    el.classList.toggle('active', boxKey === key);
  });
  // Close dropdown if open
  const _wtDrop = document.getElementById('wtDropdown');
  if(_wtDrop) { _wtDrop.style.display = 'none'; const fa = document.getElementById('fboxAll'); if(fa) fa.setAttribute('aria-expanded','false'); }
  render();
}

function setWorkType(val) {
  activeWorkType = val;
  const fwt = document.getElementById('fWorkType');
  if(fwt) fwt.value = val;
  // Update fboxAll label to reflect selection
  const _fa = document.getElementById('fboxAll');
  if(_fa) {
    const isEn = currentLang === 'en';
    if(val === 'remote')      _fa.textContent = '🖥️ ' + (isEn ? 'Remote' : 'Remoto');
    else if(val === 'f2f')    _fa.textContent = '🤝 ' + (isEn ? 'In-Person' : 'Presencial');
    else                      _fa.textContent = '💼 ' + (isEn ? 'All formats' : 'Qualquer formato');
    _fa.classList.toggle('active', val === '' || activeCuration === '');
  }
  // Update dropdown option active states
  document.querySelectorAll('.wt-opt[data-wt]').forEach(el => {
    el.classList.toggle('active', el.dataset.wt === val);
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
    heroTag: '✅ +90 plataformas verificadas · Atualizado',
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
    lockHeadline: '+90 plataformas<br><em>verificadas</em> num só lugar',
    lockTagline: 'Surveys, freelance, treino de IA, gigs físicos e muito mais — curado e testado, em português.',
    lstat1: 'Plataformas verificadas',
    lstat2: 'Categorias diferentes',
    lstat3: 'Acesso único, sem subscrição',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 Treino IA',
    lockCatCreative: '📸 Criativo',
    lockCatContent: '✍️ Conteúdo',
    lockPayText: 'Para obter acesso, transfere 19,99€ por MB Way ou transferência bancária e envia o comprovativo para <a href="mailto:gighubpt@gmail.com" style="color:var(--gold);text-decoration:none">gighubpt@gmail.com</a>',
    lockVerifying: 'A verificar acesso…',
    lockEnter: 'Entrar →',
    lockStep1Label: 'Como obter acesso',
    lockStep1Desc: 'Transfere <span style="white-space:nowrap"><span style="font-size:11px;opacity:.4;text-decoration:line-through;margin-right:3px">29,99€</span><strong>19,99€ via MB Way ou IBAN</strong></span> e envia o comprovativo para <strong>gighubpt@gmail.com</strong>. Recebes a tua chave em minutos.',
    lockWaBtn: 'Enviar Comprovativo por Email →',
    lockStep2: 'Já tens a tua chave de acesso?',
    tabTranscricao: 'Transcrição',
    tabTutoring: 'Tutoria',
    tabPassive: 'Renda Passiva',
    tabRemote: 'Emprego Remoto',
    lockHintText: 'Chave enviada após confirmação de pagamento',
    lockAccessCode: 'Chave de acesso',
    lockRevoked: '🚫 Acesso revogado',
    lockRevokedMsg: 'Esta chave foi desativada. Contacta o suporte.',
    // Guide
    guideH2: '🧭 Como começar<br><em style="font-style:italic;color:var(--gold)">em 4 passos.</em>',
    welcomeTitle: 'Bem-vindo ao GigHub',
    welcomeBody: 'Tens acesso a <strong style="color:var(--ink)">+90 plataformas verificadas</strong> para ganhar dinheiro online — surveys, freelance, IA, gigs físicos e muito mais.<br><br>Usa os filtros para encontrar o que funciona para ti. Começa pelas marcadas como <strong style="color:#8a6820">⭐ Recomendado</strong>.',
    welcomeTip: '⭐ <strong>Dica de membro:</strong> Marca os teus favoritos com o botão ★ em cada card. Calcula quanto podes ganhar com a calculadora no topo.',
    welcomeClose: 'Explorar plataformas →',
    guideSub: 'Sem investimentos, sem riscos. Remoto, presencial ou híbrido.',
    guideStep1H: 'Explora as categorias',
    guideStep2H: 'Regista-te gratuitamente',
    guideStep3H: 'Diversifica as fontes',
    guideStep4H: 'Vai além das plataformas',
    guideStep1P: 'Explora as categorias disponíveis e escolhe o que melhor se adapta ao teu tempo e perfil.',
    guideStep2P: 'Nunca pagues para aceder a nenhuma destas plataformas — todas as que aqui listamos são 100% gratuitas.',
    guideStep3P: 'Muitos utilizadores combinam 3–5 plataformas. Diversificar entre IA, freelance e trabalhos presenciais ajuda a estabilizar o rendimento ao longo do mês → a chave para a estabilidade é combinar diferentes tipos de trabalho.',
    guideStep4P: 'Muitos gigs informais nunca chegam às plataformas — circulam em grupos Facebook, WhatsApp e sites de classificados. <a href="#canais" style="color:var(--gold);font-weight:600;text-decoration:none">Ver Canais de Descoberta →</a>',
    guideTip: '<strong>★ Top 3 para Portugal em 2026 —</strong> <strong>Teleperformance</strong> (customer support, rendimento estável, entrada relativamente fácil) · <strong>Lisbon Pub Crawl</strong> (guia/staff noturno em Lisboa, salário base + comissões, gig divertido e flexível) · <strong>Amnistia Internacional</strong> (angariação de fundos paga, entrada fácil, ótima para começar)',
    guideCommunityTip: '<strong style="color:#0e64b4">💬 Canais informais —</strong> Muitos gigs remotos não aparecem em nenhuma plataforma. Junta-te a grupos Facebook de teletrabalho e remote work PT, grupos WhatsApp de freelancers e acompanha o Sapo Emprego e BEP regularmente. <a href="#canais" style="color:#0e64b4;font-weight:600;text-decoration:none">Ver todos os canais →</a>',
    canaisBadge: '💬 Canais de Descoberta',
    canaisH2: 'Onde estão os gigs<br><em style="font-style:italic;color:var(--gold)">que não aparecem online.</em>',
    canaisSub: 'A maioria dos gigs informais circula fora das plataformas — em grupos privados, classificados e redes sociais. Estes canais complementam o que encontras aqui.',
    canaisDisclaimer: 'ℹ️ Estes não são parceiros do GigHub — são canais públicos ou comunidades independentes. Verifica sempre a legitimidade das oportunidades antes de responder.',
    // Monetization
    monoTitle: 'Queres acesso ao GigHub?',
    monoDesc: 'Transfere 19,99€ por MB Way ou IBAN e envia o comprovativo para <strong>gighubpt@gmail.com</strong>. Recebes a chave de acesso em minutos. Os recibos podem conter dados pessoais — ver <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.6)">Política de Privacidade</a>. Nunca partilhes a tua chave de acesso.',
    monoPayLabel: 'Alternativa — Transferência bancária',
    monoPayNote: 'Após transferência, envia comprovativo para gighubpt@gmail.com',
    monoWaBtn: 'Pedir acesso por Email →',
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
    boostPayInstr: 'Transfere <strong>7,99€</strong> via <strong>MB Way</strong> ou IBAN e envia o comprovativo para <strong>gighubpt@gmail.com</strong>.<br>O acesso GigBoost é enviado após confirmação.',
    boostPayBtn: 'Enviar comprovativo por Email →',
    boostCodeLabel: 'Já tens chave de acesso? Insere aqui:',
    boostCodeBtn: 'Verificar →',
    boostOpenFormBtn: 'Verificar código e preencher perfil →',
    boostCodeErr: 'Chave inválida ou já utilizada.',
    // Calculator
    calcTitle: '💰 Calculadora de Ganhos',
    calcDesc: 'Estimativa orientativa — os ganhos reais dependem da disponibilidade, perfil e plataforma.',
    calcTypeLabel: 'Tipo de trabalho preferido',
    calcHoursLabel: 'Horas por semana disponíveis',
    calcOpt2:   '📝 Inquéritos & Microtasks',
    calcOpt4:   '🎨 Conteúdo & Criativo',
    calcOpt5:   '🚗 Entregas & Condução',
    calcOpt7:   '🛠️ Biscates & Eventos',
    calcOpt8:   '🫶 Caregiving (Pet/Babysitting)',
    calcOpt10:  '🧑‍🏫 Ensino & Skills',
    calcOpt12:  '🕵️ Cliente Mistério',
    calcOpt888: '🏭 Operações & Retalho (salário fixo)',
    calcOpt999: '🩺 Clínica & Investigação (por projeto)',
    calcResult: 'Estimativa mensal conservadora',
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
    heroTag: '✅ +90 verified platforms · Updated',
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
    lockHeadline: '+90 verified<br><em>platforms</em> in one place',
    lockTagline: 'Surveys, freelance, AI training, physical gigs and much more — curated and tested.',
    lstat1: 'Verified platforms',
    lstat2: 'Different categories',
    lstat3: 'One-time access, no subscription',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 AI Training',
    lockCatCreative: '📸 Creative',
    lockCatContent: '✍️ Content',
    lockPayText: 'To get access, transfer €19.99 via MB Way or bank transfer and email your receipt to <a href="mailto:gighubpt@gmail.com" style="color:var(--gold);text-decoration:none">gighubpt@gmail.com</a>',
    lockVerifying: 'Verifying access…',
    lockEnter: 'Enter →',
    lockHintText: 'Access key sent after payment confirmation',
    lockAccessCode: 'Access key',
    lockRevoked: '🚫 Access revoked',
    lockRevokedMsg: 'This access key has been deactivated. Contact support.',
    // Guide
    guideH2: '🧭 How to start<br><em style="font-style:italic;color:var(--gold)">in 4 steps.</em>',
    welcomeTitle: 'Welcome to GigHub',
    welcomeBody: 'You have access to <strong style="color:var(--ink)">+90 verified platforms</strong> to earn money online — surveys, freelance, AI, physical gigs and much more.<br><br>Use the filters to find what works for you. Start with those marked as <strong style="color:#8a6820">⭐ Recommended</strong>.',
    welcomeTip: '⭐ <strong>Member tip:</strong> Save your favourites with the ★ button on each card. Calculate how much you can earn with the calculator at the top.',
    welcomeClose: 'Explore platforms →',
    guideSub: 'No investments, no risks. Remote, in-person or hybrid.',
    guideStep1H: 'Explore the categories',
    guideStep1P: 'Browse the available categories and choose what best fits your time and profile.',
    guideStep2H: 'Register for free',
    guideStep2P: 'Never pay to access any of these platforms — all the ones we list here are 100% free.',
    guideStep3H: 'Diversify your sources',
    guideStep3P: 'Many users combine 3–5 platforms. Diversifying between AI, freelance and in-person work helps stabilise income throughout the month → the key to stability is combining different types of work.',
    guideStep4H: 'Go beyond the platforms',
    guideStep4P: 'Many informal gigs never reach platforms — they circulate in Facebook groups, WhatsApp and classifieds. <a href="#canais" style="color:var(--gold);font-weight:600;text-decoration:none">See Discovery Channels →</a>',
    guideTip: '<strong>★ Top 3 for Portugal in 2026 —</strong> <strong>Teleperformance</strong> (customer support, stable income, relatively easy entry) · <strong>Lisbon Pub Crawl</strong> (guide/nightlife staff in Lisbon, base salary + commissions, fun and flexible gig) · <strong>Amnistia Internacional</strong> (paid fundraising, easy entry, great to get started)',
    guideCommunityTip: '<strong style="color:#0e64b4">💬 Informal channels —</strong> Many gigs don\'t appear on any platform. Join Facebook groups in your city, Portuguese freelancer WhatsApp groups and regularly check Sapo Emprego and BEP. <a href="#canais" style="color:#0e64b4;font-weight:600;text-decoration:none">See all channels →</a>',
    canaisBadge: '💬 Discovery Channels',
    canaisH2: 'Where the gigs are<br><em style="font-style:italic;color:var(--gold)">that don\'t appear online.</em>',
    canaisSub: 'Most informal gigs circulate outside platforms — in private groups, classifieds and social networks. These channels complement what you find here.',
    canaisDisclaimer: 'ℹ️ These are not GigHub partners — they are public channels or independent communities. Always verify the legitimacy of opportunities before responding.',
    // Monetization
    monoTitle: 'Get access to GigHub',
    monoDesc: 'Transfer €19.99 via MB Way or IBAN and email your receipt to <strong>gighubpt@gmail.com</strong>. You\'ll receive the access key in minutes. Receipts may contain personal data — see <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.6)">Privacy Policy</a>. Never share your access key.',
    monoPayLabel: 'Alternative — Bank transfer',
    monoPayNote: 'After the transfer, email the receipt to gighubpt@gmail.com',
    monoWaBtn: 'Request access by Email →',
    lockStep1Label: 'How to get access',
    lockStep1Desc: 'Transfer <span style="white-space:nowrap"><span style="font-size:11px;opacity:.4;text-decoration:line-through;margin-right:3px">€29.99</span><strong>€19.99 via MB Way or IBAN</strong></span> and email your receipt to <strong>gighubpt@gmail.com</strong>. You will receive your access key in minutes.',
    lockWaBtn: 'Send Receipt by Email →',
    lockStep2: 'Already have your access key?',
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
    boostPayInstr: 'Transfer <strong>€7.99</strong> via <strong>MB Way</strong> or IBAN and email your receipt to <strong>gighubpt@gmail.com</strong>.<br>Access is sent after payment confirmation.',
    boostPayBtn: 'Send receipt by Email →',
    boostCodeLabel: 'Already have an access key? Enter here:',
    boostCodeBtn: 'Verify →',
    boostOpenFormBtn: 'Verify code and fill profile →',
    boostCodeErr: 'Invalid or already used access key.',
    // Calculator
    calcTitle: '💰 Earnings Calculator',
    calcDesc: 'Indicative estimate — actual earnings depend on availability, profile and platform.',
    calcTypeLabel: 'Preferred work type',
    calcHoursLabel: 'Hours per week available',
    calcOpt2:   '📝 Surveys & Microtasks',
    calcOpt4:   '🎨 Content & Creative',
    calcOpt5:   '🚗 Deliveries & Driving',
    calcOpt7:   '🛠️ Local Gigs & Events',
    calcOpt8:   '🫶 Caregiving (Pet/Babysitting)',
    calcOpt10:  '🧑‍🏫 Teaching & Skills',
    calcOpt12:  '🕵️ Mystery Shopping',
    calcOpt888: '🏭 Operations & Retail (fixed salary)',
    calcOpt999: '🩺 Clinical & Research (per project)',
    calcResult: 'Conservative monthly estimate',

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
  if(btn) btn.textContent = currentLang === 'pt' ? 'EN' : 'PT';
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
  // Lock-cat badges — 11 tab-group categories
  setText('lockCatSurveys',    '📝 Inquéritos & Microtasks', '📝 Surveys & Microtasks');
  setText('lockCatMystery',    '🕵️ Cliente Mistério',        '🕵️ Mystery Shopping');
  setText('lockCatDeliveries', '🚗 Entregas & Condução',     '🚗 Deliveries & Driving');
  setText('lockCatSkills',     '🧑‍🏫 Ensino & Tutorias',      '🧑‍🏫 Teaching & Tutoring');
  setText('lockCatCriativo',   '🎨 Conteúdo & Criativo',     '🎨 Content & Creative');
  setText('lockCatGigs',       '🛠️ Biscates & Eventos',      '🛠️ Local Gigs & Events');
  setText('lockCatCaregiving', '🫶 Caregiving',               '🫶 Caregiving');
  setText('lockCatF2F',        '🤝 Trabalho Presencial',      '🤝 In-Person Work');
  setText('lockCatClinical',   '🩺 Clínica & Investigação',  '🩺 Clinical & Research');
  setText('lockCatRetail',     '🏭 Operações & Retalho',      '🏭 Operations & Retail');
  setText('lockCatPassive',    '💰 Rendimento Passivo',       '💰 Passive Income');
  setText('lockCatSupport',    '🎧 Atendimento & Suporte',    '🎧 Customer Support');
  const lockInputEl = document.getElementById('lockInput');
  if(lockInputEl) {
    lockInputEl.placeholder = isEn ? 'Paste your key here' : 'Cola aqui a chave';
    lockInputEl.setAttribute('aria-label', isEn ? 'Access key' : 'Chave de acesso');
  }
  // Step labels
  setText('lockStep1Label', 'Como obter acesso', 'How to get access');
  const desc1 = document.getElementById('lockStep1Desc');
  if(desc1) desc1.innerHTML = isEn
    ? `Transfer <span style="white-space:nowrap"><span style="font-size:11px;opacity:.4;text-decoration:line-through;margin-right:3px">€29.99</span><strong>€${PRICE_PER_ACCESS.toFixed(2)} via MB Way or IBAN</strong></span> and email your receipt to <strong>gighubpt@gmail.com</strong>. You will receive your access key in minutes.`
    : `Transfere <span style="white-space:nowrap"><span style="font-size:11px;opacity:.4;text-decoration:line-through;margin-right:3px">29,99€</span><strong>${PRICE_PER_ACCESS.toFixed(2).replace('.',',')}€ via MB Way ou IBAN</strong></span> e envia o comprovativo para <strong>gighubpt@gmail.com</strong>. Recebes a tua chave em minutos.`;
  setText('lockWaBtn', 'Enviar Comprovativo por Email →', 'Send Receipt by Email →');
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
    ? '📩 <strong style="color:rgba(247,245,240,.5)">GigBoost:</strong> Profile data for GigBoost (optional add-on) is sent via email. See <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.45);text-decoration:underline">Privacy Policy</a>.'
    : '📩 <strong style="color:rgba(247,245,240,.5)">GigBoost:</strong> Os dados de perfil do GigBoost (opcional) são enviados via email. Ver <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.45);text-decoration:underline">Política de Privacidade</a>.';
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
  // Sync lock screen lang button
  const lockLangBtn2 = document.getElementById('lockLangBtn');
  if(lockLangBtn2) lockLangBtn2.textContent = isEn ? 'PT' : 'EN';
}

function applyLang(){
  catLabel = catLabels[currentLang] || catLabels['pt'];
  const isEn = currentLang === 'en';
  const t = translations[currentLang];
  // Nav
  const favBtn = document.getElementById('favBtn');
  if(favBtn) favBtn.innerHTML = '⭐<span class="fav-txt"> '+t.navFavs.replace(/^⭐\s*/,'')+'</span> (<span id="favCount">'+favs.length+'</span>)';
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
    pt:{'':'Todas','surveys':'📝 Inquéritos & Microtasks',
      'mystery':'🕵️ Cliente Mistério','deliveries':'🚗 Entregas',
      'skills':'🧑‍🏫 Ensino & Skills','criativo':'🎨 Conteúdo & Criativo',
      'gigs_events':'🛠️ Biscates & Eventos','caregiving':'🫶 Caregiving',
      'f2f':'🤝 Trabalho Presencial',
      'clinical':'🩺 Clínica & Investigação',
      'retail':'🏭 Operações & Retalho',
      'passive':'💰 Rendimento Passivo',
      'support':'🎧 Atendimento & Suporte'},
    en:{'':'All','surveys':'📝 Surveys & Microtasks',
      'mystery':'🕵️ Mystery Shopping','deliveries':'🚗 Deliveries',
      'skills':'🧑‍🏫 Teaching & Skills','criativo':'🎨 Content & Creative',
      'gigs_events':'🛠️ Gigs & Events','caregiving':'🫶 Caregiving',
      'f2f':'🤝 In-Person Work',
      'clinical':'🩺 Clinical & Research',
      'retail':'🏭 Operations & Retail',
      'passive':'💰 Passive Income',
      'support':'🎧 Customer Support'}
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
  // guideStep3P is set by set2 below — no duplicate needed here
  set('guideTip', t.guideTip);
  // Re-render dynamic guide parts on lang change
  // Footer & lock badge
  set('footerText', t.footerText);
  const _isEn2 = currentLang === 'en';
  const footerLockEl = document.getElementById('footerLock');
  if(footerLockEl) footerLockEl.textContent = _isEn2 ? '🔐 Private access' : '🔐 Acesso privado';
  // GigBoost nav button label
  const boostNavBtnEl = document.getElementById('boostNavBtn');
  if(boostNavBtnEl) boostNavBtnEl.innerHTML = '<span class="nb-ico">🚀</span><span class="nb-txt"> GigBoost</span>';
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
  // Override instruction with constant-based price to prevent drift
  (function(){
    const _el = document.getElementById('boostPayInstrEl');
    if(!_el) return;
    const _bAmt = currentLang === 'en'
      ? '€' + PRICE_PER_BOOST.toFixed(2)
      : PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€';
    _el.innerHTML = currentLang === 'en'
      ? `Transfer <strong>${_bAmt}</strong> via <strong>MB Way</strong> or IBAN and email your receipt to <strong>gighubpt@gmail.com</strong>.<br>Access is sent after payment confirmation.`
      : `Transfere <strong>${_bAmt}</strong> via <strong>MB Way</strong> ou IBAN e envia o comprovativo para <strong>gighubpt@gmail.com</strong>.<br>O acesso GigBoost é enviado após confirmação.`;
  })();
  const _boostTokenLbl = document.getElementById('boostTokenSectionLabel');
  if(_boostTokenLbl) _boostTokenLbl.textContent = currentLang==='en'
    ? 'Already have your GigBoost code?'
    : 'Já recebeste o teu código GigBoost?';
  // Guide steps
  set2('guideStep1P', 'guideStep1P', true);
  set2('guideStep2P', 'guideStep2P', false);
  set2('guideStep3P', 'guideStep3P', false);
  set2('guideStep4H', 'guideStep4H', false);
  set2('guideStep4P', 'guideStep4P', true);
  // Canais de Descoberta section
  set2('canaisBadge', 'canaisBadge', false);
  set2('canaisH2', 'canaisH2', true);
  set2('canaisSub', 'canaisSub', false);
  set2('canaisDisclaimer', 'canaisDisclaimer', false);
  // Canais — category headers
  const setText2 = (id, pt, en) => { const el = document.getElementById(id); if(el) el.textContent = isEn ? en : pt; };
  // canais category headers removed
  // Canais — tool descriptions
  const setInner2 = (id, pt, en) => { const el = document.getElementById(id); if(el) el.textContent = isEn ? en : pt; };
  setInner2('canaisSapoDesc',      'Portal de emprego com milhares de ofertas PT, incluindo part-time e trabalho temporário.',
                                   'Portuguese jobs portal with thousands of listings, including part-time and temporary work.');
  setInner2('canaisOlxDesc',       'Classificados de trabalho local — biscates, serviços, freelance informal por cidade.',
                                   'Local job classifieds — tasks, services and informal freelance by city.');
  setInner2('canaisCustoDesc',     'Alternativa ao OLX com boas ofertas de trabalho local e biscates em todo o país.',
                                   'OLX alternative with solid local work and gig listings nationwide.');
  setInner2('canaisLinkedinDesc',  'Essencial para freelance, remote e trabalho em empresas. Perfil activo abre portas.',
                                   'Essential for freelance, remote work and corporate roles. An active profile opens doors.');
  setInner2('canaisFbLisboaDesc',  'Pesquisa no Facebook por «Teletrabalho Portugal», «Remote Work Portugal», «Freelancers Portugal» ou «Trabalho Online PT». Grupos privados — pede para entrar diretamente.',
                                   'Search on Facebook for «Teletrabalho Portugal», «Remote Work Portugal», «Freelancers Portugal» or «Trabalho Online PT». Private groups — request to join directly.');
  setInner2('canaisRedditDesc',    'Tópicos sobre trabalho online, remote e dicas da comunidade portuguesa.',
                                   'Threads on online work, remote and tips from the Portuguese community.');
  setInner2('canaisWaDesc',        'Pesquisa no Facebook ou LinkedIn por "grupo WhatsApp freelance Portugal" — são partilhados regularmente por membros de grupos.',
                                   'Search on Facebook or LinkedIn for "WhatsApp group freelance Portugal" — they are regularly shared by group members.');
  setInner2('canaisNetEmpDesc',    'Portal de emprego PT com boa cobertura de part-time, estágios e trabalho temporário.',
                                   'Portuguese jobs portal with good coverage of part-time, internships and temporary work.');
  setInner2('canaisBepDesc',       'Portal do governo português para registo de candidatos e consulta de ofertas de emprego.',
                                   'Portuguese government portal for job seeker registration and vacancy search.');
  setInner2('canaisIefpDesc',      'Instituto do Emprego e Formação Profissional — apoio ao emprego, formações e ofertas públicas.',
                                   'Portuguese public employment and vocational training institute — jobs, training and support.');
  setInner2('canaisRandstadDesc',  'Agência de recrutamento com forte presença em Portugal — vagas permanentes e trabalho temporário.',
                                   'Recruitment agency with a strong presence in Portugal — permanent and temporary roles.');

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
  // Welcome modal boost prices — derived from PRICE_PER_BOOST constant
  const _wbPrice = document.getElementById('welcomeBoostPrice') || document.querySelector('#welcomeModal .boost-price');
  const _wbPriceOrig = document.getElementById('welcomeBoostPriceOrig') || document.querySelector('#welcomeModal .boost-price-orig');
  if(_wbPrice) _wbPrice.textContent = isEn ? ('€' + PRICE_PER_BOOST.toFixed(2)) : (PRICE_PER_BOOST.toFixed(2).replace('.', ',') + '€');
  if(_wbPriceOrig) _wbPriceOrig.textContent = isEn ? '€9.99' : '9,99€';

  // Close button aria-labels
  const _calcCloseBtn = document.getElementById('calcModalCloseBtn');
  if(_calcCloseBtn) _calcCloseBtn.setAttribute('aria-label', isEn ? 'Close' : 'Fechar');
  const _boostPayCloseBtn = document.getElementById('boostPayModalCloseBtn');
  if(_boostPayCloseBtn) _boostPayCloseBtn.setAttribute('aria-label', isEn ? 'Close' : 'Fechar');
  const _legalCloseBtn = document.getElementById('legalModalCloseBtn');
  if(_legalCloseBtn) _legalCloseBtn.setAttribute('aria-label', isEn ? 'Close' : 'Fechar');

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

  // ── Curation pills translation (kept for any remaining pill elements) ──
  const _curationLabels = {
    pt: { '':'Todas', portugal:'Top picks Portugal 🇵🇹', stable:'Ganhos estáveis ⚡', variable:'Ganhos variáveis 🎲', noexp:'Sem experiência necessária 🚀' },
    en: { '':'All',   portugal:'Top picks Portugal 🇵🇹', stable:'Stable earnings ⚡',  variable:'Variable earnings 🎲',  noexp:'No experience needed 🚀' }
  };
  const _cl = _curationLabels[currentLang] || _curationLabels.pt;
  document.querySelectorAll('.curation-pill[data-curation]').forEach(pill => {
    const lbl = pill.querySelector('.curation-pill-label');
    if(lbl && _cl[pill.dataset.curation] !== undefined) lbl.textContent = _cl[pill.dataset.curation];
  });
  const curationTitleEl = document.getElementById('curationTitle');
  if(curationTitleEl) curationTitleEl.textContent = isEn ? 'Curated lists' : 'Curadoria';
  // ── Filter boxes translation ──
  const fboxAll = document.getElementById('fboxAll');
  const fboxStable = document.getElementById('fboxStable');
  const fboxVariable = document.getElementById('fboxVariable');
  if(fboxAll) {
    if(activeWorkType === 'remote')   fboxAll.textContent = isEn ? '🖥️ Remote' : '🖥️ Remoto';
    else if(activeWorkType === 'f2f') fboxAll.textContent = isEn ? '🤝 In-Person' : '🤝 Presencial';
    else                              fboxAll.textContent = isEn ? '💼 All formats' : '💼 Qualquer formato';
  }
  if(fboxStable) fboxStable.textContent = isEn ? '⚡ Stable earnings' : '⚡ Ganhos estáveis';
  if(fboxVariable) fboxVariable.textContent = isEn ? '🎲 Variable earnings' : '🎲 Ganhos variáveis';
  // Re-render cards with updated language (called once here, after all translations are applied)
  if(typeof render === 'function') render();
  // Re-sync hero count text if platforms already loaded
  if(P.length) _updateHeroCount();
  // Sync navCanaisLink text (post-auth nav link)
  const _nc = document.getElementById('navCanaisLink');
  if(_nc) _nc.textContent = isEn ? '💬 Channels' : '💬 Canais';
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
        { key:'prefs', type:'chips', label:'Preferes trabalhar em... (seleciona todas)', options:['🔬 Surveys','🧠 AI Training','💼 Freelance','⚡ Micro-tarefas','🛵 Gigs físicos','🐾 Pet Sitting','👶 Babysitting','🩺 Ensaios Clínicos'] }
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
        { key:'prefs', type:'chips', label:'You prefer to work in... (select all)', options:['🔬 Surveys','🧠 AI Training','💼 Freelance','⚡ Micro-tasks','🛵 Physical Gigs','🐾 Pet Sitting','👶 Babysitting','🩺 Clinical Trials'] }
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
  const subjectLine = isEn ? 'GigBoost Profile' : 'Perfil GigBoost';
  const emailBody = decodeURIComponent(msg);
  const mailtoLink = `mailto:gighubpt@gmail.com?subject=${encodeURIComponent(subjectLine)}&body=${msg}`;
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
          ? 'You will receive a response by email within 24 hours.'
          : 'Recebes a resposta por email em até 24 horas.'}
      </p>
      <button class="boost-explore-btn" style="height:44px;padding:0 36px;border-radius:10px;border:none;background:var(--ink);color:var(--paper);font-family:'Instrument Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer">
        ${isEn ? 'Close' : 'Fechar'}
      </button>
    </div>`;
  // Open email client — delayed to allow thank-you render first
  // Use anchor click method for better mobile compatibility (window.open can fail for mailto:)
  setTimeout(() => {
    try {
      const _a = document.createElement('a');
      _a.href = mailtoLink; _a.rel = 'noopener noreferrer';
      document.body.appendChild(_a); _a.click();
      setTimeout(() => { if(_a.parentNode) _a.remove(); }, 300);
    } catch(_) {}
  }, 500);
}

// ── GigBoost submit flow: profile data is sent by email for manual review.
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
    if(lockErr) {
      const _lang = (function(){ try { const v = localStorage.getItem('gh_lang'); return (v === 'pt' || v === 'en') ? v : 'pt'; } catch(e){ return 'pt'; } })();
      lockErr.textContent = _lang === 'en' ? 'Connection error. Please reload the page.' : 'Erro de ligação. Recarrega a página.';
    }
  });
}
// SECURITY NOTE: The Supabase anon key below is safe to include in client-side code.
// It is a public key protected by Row Level Security (RLS) on all tables.
// Users can only access data via server-side RPCs (unlock_with_token, validate_boost_token).
// Direct table access is DENIED for the anon role via Supabase RLS policies.
const _SB = window.supabase && window.supabase.createClient(
  'https://fosdgukysnryznsywpmp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvc2RndWt5c25yeXpuc3l3cG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDMwNDUsImV4cCI6MjA5MzkxOTA0NX0.arArVMWoSZMQOzAf75SoLZKXthhw0bbZoWE1yoAjngA'
);


const _DIMMED_SET = new Set([]);

// ── Platforms that must NEVER appear in the listing ──────────────────────────
// Blocking is now handled server-side via is_active=false in the DB.
// This set is kept as an empty defence-in-depth fallback only.
const _BLOCKED_PLATFORMS = new Set([]);

// suggested, tier, entry_level, earnings_type, direct_hire, is_delivery, no_curation_tag
// are all DB columns — populated via migration_platform_metadata.sql
// _fmt() maps them through; JS fallbacks (category-based) handle NULL values.


const _EARN_N_DEFAULT = {
  surveys:4, micro:8, freelance:10, testing:10, criativo:8, conteudo:6,
  tasks:9, transcricao:6, tutoring:15, ugc:8, passive:3, remote:25,
  petsitting:9, babysitting:9, gigs:7, f2f:9, mystery:6, clinical:500, retail:900, support:900
};

// Reduced-expectation overrides — full description replacements
const _REDUCED_EXPECTATIONS = {
  'Securitas': {
    desc: 'Trabalha como segurança em superfícies comerciais, eventos ou edifícios. Oportunidades com e sem cartão profissional. Obrigatório não ter antecedentes criminais.',
    descEn: 'Work as a security guard in retail spaces, events or buildings. Opportunities with and without a professional security licence. No criminal record required.',
  },
  'Prosegur': {
    desc: 'Trabalha como segurança em superfícies comerciais, eventos ou edifícios. Oportunidades com e sem cartão profissional. Obrigatório não ter antecedentes criminais.',
    descEn: 'Work as a security guard in retail spaces, events or buildings. Opportunities with and without a professional security licence. No criminal record required.',
  },
};


// ── Append text to Supabase description (does not replace — adds at end) ──────
const _DESC_SUFFIX = {
};

// ── Substring patch within Supabase description ────────────────────────────────
const _DESC_PATCH = {
};


// ── URL overrides (replaces the URL that comes from Supabase) ──────────────────
const _URL_OVERRIDES = {
  'Prezero': 'https://jobs.prezero.com/Portugal/?locale=pt_PT',
  'New Europe Tours': 'https://www.neweuropetours.eu/guide-with-us/',
};


// ── Category overrides (overrides the category that comes from Supabase) ───────
const _CAT_OVERRIDES = {
};


// ── Icon overrides (replaces the icon that comes from Supabase) ───────────────
const _ICON_OVERRIDES = {
  'Ryanair Careers': '✈️',
};

// ── Name overrides (replaces the display name that comes from Supabase) ───────
const _NAME_OVERRIDES = {
  'Accenture Careers': 'Accenture',
  'NOS Cinemas Recrutamento': 'NOS Cinemas', // defensive — DB should also be updated via SQL
};

// _LOCAL_EXTRA_PLATFORMS migrated to Supabase (platforms table). See gighub_extra_platforms.sql.

// ── ALLOWLIST — only these platforms are shown. Anything else is silently dropped.
// Includes common DB name variants (different casing/spacing/punctuation).
const _ALLOWED_PLATFORMS = new Set([
  // 📝 Surveys
  'attapoll','boutique opiniões','boutique opinioes','boutique opinives',
  'clsbe peo (católica)','clsbe peo (catolica)','clsbe peo',
  'lifepoints','mobrog',
  'netsonda',
  'opiniões de valor','opinioes de valor',
  'suaopiniaoconta','suaopiniãoconta','sua opinião conta',
  'tgm panel','triaba',
  'voz do consumidor','yougov',
  'prime opinion','qmee',
  // 🔬 Testes
  'hotjar engage','hotjar','playtestcloud',
  'we are testers','wearetesters','weartesters',
  // 🤖 Treino IA
  'toloka','toloka ai',
  // 🕵️ Cliente Mistério
  'bemyeye','more results','more results (pt)','pontis','smartspotter',
  // 🎁 Get-Paid-To
  'freecash','storewards',
  'beruby',
  // 🚗 Entregas / Condução
  'bolt driver','bolt food (courier)','bolt courier',
  'carteiro ctt','glovo','grabr',
  'uber driver','uber eats (courier)',
  // 🛠️ Biscates & Eventos
  'casamentos.pt','casamentos','eloquence events',
  'merytu','new europe tours','taskrabbit',
  'guia tuk tuk',
  // 🧑‍🏫 Ensino & Skills
  'explicas.me','explicasme','preply','superprof',
  // 📝 Transcrição / Tradução
  'acclaro','transperfect',
  // 🎨 Stock & Design
  'adobe stock','etsy','pond5','shutterstock',
  // 📱 Conteúdo & UGC
  'ko-fi','kofi','substack',
  // 🫶 Caregiving
  'babysits','petbacker','rover',
  // 🤝 Trabalho Presencial / F2F
  'acnur','aldeias sos','amnistia internacional',
  'apdes','associação salvador','associacao salvador',
  'worldpackers','wwf portugal',
  // 💚 Outros / Nicho / Passivo
  'bookycar',
  'epal','ividador','ividoa',
  'oscar','óscar',
  'roamler',
  'radical storage','bounce','yescapa',
  'sonder','sonder people',
  // 🏭 Operações & Retalho
  'dhl','rgis','securitas','prosegur','salesland',
  'portway','mercadona','prezero',
  'jardim zoológico','jardim zoologico',
  'eurest',
  // 🇵🇹 Emprego PT — adicionados
  'ritmos fortes',
  'infraestruturas de portugal',
  'transdev portugal',
  'solverde recrutamento',
  'salvamais',
  'grupo nabeiro',
  // 🩺 Ensaios Clínicos
  'blueclinical',
  // 🎧 Atendimento & Suporte
  'teleperformance','concentrix','foundever','accenture careers','accenture','indiecampers',
  // 🤝 F2F / Emprego directo — adicionados
  'nos cinemas','nos cinemas recrutamento',
  'cinema city',
  'lisbon pub crawl',
  'nav portugal',
  'ryanair careers',
  'douro azul',
  'lisbon boats',
]);

function _fmt(r){
  // Allowlist: only render platforms in the approved set (case-insensitive)
  if(!_ALLOWED_PLATFORMS.has(r.name.toLowerCase().trim())) return null;
  // Explicit blocklist: safety net for platforms that should never appear
  // (e.g. duplicates, removed entries) even if accidentally added to the allowlist
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
  const nameOv = _NAME_OVERRIDES[r.name];
  return {
    name: nameOv || r.name, cat:r.cat, icon: iconOv || r.icon,
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
    ratings:r.ratings||{}, aff:{has:false},
    // DB metadata fields (populated via migration_platform_metadata.sql)
    entry_level:     r.entry_level     || null,
    earnings_type:   r.earnings_type   || null,
    tier:            r.tier            || null,
    suggested:       r.suggested       || false,
    direct_hire:     r.direct_hire     || false,
    is_delivery:     r.is_delivery     || false,
    no_curation_tag: r.no_curation_tag || false,
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
      mystery:'Varia por visita/auditoria', clinical:'Varia por projeto',
      retail:'Salário mensal fixo'
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
      mystery:'Varies by visit/audit', clinical:'Varies by project',
      retail:'Fixed monthly salary'
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
    // Registar acesso na tabela de logs (para monitorização de abuso)
    // Fire-and-forget — não bloqueia o unlock mesmo que falhe
    try {
      _SB.rpc('log_token_access', {
        p_token:   token.trim(),
        p_ip_hash: _clientFp  // já calculado acima — hash de UA+time-bucket
      }).catch(() => {}); // silencioso — não afeta o utilizador
    } catch(_) {}
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
      // Update hero tag and stat counter with real loaded count
      _updateHeroCount();
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
    // navCanaisLink is always visible (no show needed)
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

// Override unlock function — exposed on window so HTML elements can call it (CSP-safe)
window.unlock = async function() {
  const inp = document.getElementById('lockInput');
  const btn = document.getElementById('lockBtn');
  if(!inp || !inp.value.trim()) return;
  const t = translations[currentLang] || translations['pt'];
  if(btn) {
    btn.textContent = t.lockVerifying || (currentLang==='en' ? 'Verifying…' : 'A verificar…');
    btn.disabled = true;
    btn.style.opacity = '.7';
  }
  inp.disabled = true;
  // Sanitise: only alphanumeric, dash, underscore; 6–64 chars
  // Strip only XSS/injection-relevant chars; preserve special chars present in presencial tokens (!@#$%^&*)
  const cleanToken = inp.value.trim().replace(/[\x00-\x1f\x7f\s<>"'`\\]/g,'').substring(0,64);
  if(!cleanToken || cleanToken.length < 4) {
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
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Última atualização: ${new Date().toLocaleDateString('pt-PT',{month:'long',year:'numeric'})}</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Dados que recolhemos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Recolhemos apenas os dados necessários para fornecer o serviço, incluindo informação de contacto e respostas ao formulário GigBoost enviadas voluntariamente.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Porque recolhemos</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Os dados são usados exclusivamente para fornecer o serviço adquirido — acesso à plataforma e/ou recomendações personalizadas GigBoost. Base legal: execução de contrato (Art. 6.º n.º 1 al. b) do RGPD).</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Pagamentos e comunicações</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Os pagamentos são efetuados via MB Way ou transferência bancária. Não armazenamos dados de pagamento. Os recibos enviados por email podem conter dados pessoais (nome, IBAN) que são tratados exclusivamente para confirmação do pedido. O comprovativo e os dados do perfil GigBoost (opcional) são enviados por email para gighubpt@gmail.com. O email é processado pela Google (Gmail). Não utilizamos os dados para fins de marketing. Para exercer os teus direitos, contacta-nos por email.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Cookies e analytics</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Não usamos cookies de rastreamento nem ferramentas de analytics de terceiros. O acesso é gerido por tokens únicos sem identificação pessoal; os tokens de acesso são verificados em tempo real via Supabase e <strong>não são armazenados em localStorage</strong>. O localStorage é usado exclusivamente para preferências locais (idioma, favoritos, confirmação do aviso RGPD). As fontes tipográficas são carregadas a partir do serviço Google Fonts, o que implica uma ligação aos servidores da Google. Consulta a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Política de Privacidade da Google</a>.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Segurança e prevenção de abuso</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Para proteger a integridade do serviço e prevenir a partilha não autorizada ou uso abusivo de acessos, os nossos sistemas registam metadados de autenticação associados a cada token — incluindo timestamps de validação e endereço IP da ligação. Esta recolha tem como base legal o interesse legítimo do responsável pelo tratamento (Art. 6.º n.º 1 al. f) do RGPD), nomeadamente a segurança do serviço e a prevenção de fraude. Estes dados não são partilhados com terceiros e são retidos apenas pelo tempo necessário para fins de segurança.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Segurança</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Nunca te pedimos o teu código de acesso de volta, NIF, palavras-passe ou dados bancários completos. Se receberes uma mensagem a solicitar esses dados em nome da GigHub, trata-se de fraude.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">RGPD</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Nos termos do RGPD, tens direito a aceder, corrigir, portabilizar ou eliminar os teus dados. Para exercer estes direitos, contacta-nos em <a href="mailto:gighubpt@gmail.com" style="color:var(--gold)">gighubpt@gmail.com</a>. Tens ainda o direito de apresentar queixa à CNPD (Comissão Nacional de Proteção de Dados).</p>`,
      en: `<h2 style="font-family:'Fraunces',serif;font-size:22px;font-weight:900;margin-bottom:20px">Privacy Policy</h2>
<p style="font-size:13px;color:var(--grey);margin-bottom:16px">Last updated: ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Data we collect</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We only collect the data necessary to provide the service, including contact information and GigBoost form responses submitted voluntarily.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Why we collect it</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Data is used solely to provide the purchased service — platform access and/or personalised GigBoost recommendations. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Payments and communications</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Payments are made via MB Way or bank transfer. We do not store payment data. Payment receipts sent by email may contain personal data (name, IBAN) which is processed solely for order confirmation. Receipts and GigBoost profile data (optional) are sent by email to gighubpt@gmail.com. Email is processed by Google (Gmail). We do not use this data for marketing. To exercise your rights, contact us by email.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Cookies &amp; analytics</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We do not use advertising trackers or invasive third-party analytics tools. Access is managed by unique tokens without personal identification; access tokens are verified in real-time via Supabase and <strong>are not stored in localStorage</strong>. localStorage is used exclusively for local preferences (language, favourites, GDPR notice acknowledgement). Typefaces are loaded from Google Fonts, which involves a connection to Google's servers. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Google's Privacy Policy</a>.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Security &amp; abuse prevention</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">To protect the integrity of the service and prevent unauthorised sharing or abusive use of access tokens, our systems log authentication metadata associated with each token — including validation timestamps and connection IP address. This processing is based on the legitimate interests of the data controller (Art. 6(1)(f) GDPR), specifically service security and fraud prevention. This data is not shared with third parties and is retained only for as long as necessary for security purposes.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Security notice</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We will never ask for your password, tax number, full banking details or your access code back. We only ask for proof of payment. If you receive a message requesting those details in GigHub's name, it is fraud.</p>
<h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px">Your rights (GDPR)</h3>
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Under GDPR, you have the right to access, rectify, port or erase your data, and to object to or restrict certain processing. To exercise these rights, contact us at gighubpt@gmail.com. You also have the right to lodge a complaint with a supervisory authority (in Portugal: CNPD — Comissão Nacional de Proteção de Dados).</p>`
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
  if(fd) fd.textContent = 'Disclaimer'; // same in PT and EN
  if(fc) fc.textContent = isEn ? 'Contact' : 'Contacto';
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
    function _getOrCreateToast() {
      let t = document.getElementById('_sessionToast');
      if(!t) {
        t = document.createElement('div');
        t.id = '_sessionToast';
        t.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);font-family:\'Instrument Sans\',sans-serif;font-size:13px;padding:10px 20px;border-radius:10px;z-index:960;box-shadow:0 4px 20px rgba(0,0,0,.4);border:1px solid rgba(201,168,76,.3);white-space:nowrap;';
        document.body.appendChild(t);
      }
      return t;
    }
    if(idle > 6600000 && !_timeoutWarned) { // 110 min — warn 10 min before
      _timeoutWarned = true;
      const msg = currentLang==='en'
        ? 'Your session expires in 10 minutes due to inactivity.'
        : 'A tua sessão expira em 10 minutos por inatividade.';
      const toast = _getOrCreateToast();
      toast.textContent = '⏱ ' + msg;
      toast.style.display = 'block';
      setTimeout(() => { if(toast) toast.style.display = 'none'; }, 9000);
    }
    if(idle > 7200000) {
      const expiredToast = _getOrCreateToast();
      expiredToast.textContent = currentLang==='en' ? '🔐 Session expired. Reloading…' : '🔐 Sessão expirada. A recarregar…';
      expiredToast.style.display = 'block';
      clearInterval(_sessionTimeoutInterval);
      _sessionTimeoutInterval = null;
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

  // ── Filter boxes (stable / variable = curation; all = dropdown trigger) ──
  const _fboxAllEl = document.getElementById('fboxAll');
  const _wtDrop    = document.getElementById('wtDropdown');

  function _closeWtDrop() {
    if(_wtDrop) { _wtDrop.style.display = 'none'; }
    if(_fboxAllEl) _fboxAllEl.setAttribute('aria-expanded', 'false');
  }
  function _openWtDrop() {
    if(!_wtDrop) return;
    _wtDrop.style.display = 'block';
    if(_fboxAllEl) _fboxAllEl.setAttribute('aria-expanded', 'true');
  }

  if(_fboxAllEl) {
    _fboxAllEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const isOpen = _wtDrop && _wtDrop.style.display !== 'none';
      if(isOpen) {
        _closeWtDrop();
      } else {
        // If a work type is active, clear it instead of opening dropdown
        if(activeWorkType) {
          setWorkType('');
        } else {
          // Ensure curation is reset to '' first
          if(activeCuration !== '') setCuration('');
          _openWtDrop();
        }
      }
    });
    _fboxAllEl.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _fboxAllEl.click(); }
      if(e.key === 'Escape') _closeWtDrop();
    });
  }

  // wt-opt click inside dropdown
  if(_wtDrop) {
    _wtDrop.addEventListener('click', function(e) {
      e.stopPropagation();
      const opt = e.target.closest('.wt-opt[data-wt]');
      if(opt) { setWorkType(opt.dataset.wt); _closeWtDrop(); }
    });
    _wtDrop.addEventListener('keydown', function(e) {
      const opt = e.target.closest('.wt-opt');
      if(!opt) return;
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWorkType(opt.dataset.wt); _closeWtDrop(); }
      if(e.key === 'Escape') { _closeWtDrop(); if(_fboxAllEl) _fboxAllEl.focus(); }
    });
  }

  // Stable / Variable fboxes — setCuration (unchanged)
  ['fboxStable','fboxVariable'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('click', () => { _closeWtDrop(); setCuration(el.dataset.fbox); });
    el.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _closeWtDrop(); setCuration(el.dataset.fbox); } });
  });

  // Click-outside closes dropdown
  document.addEventListener('click', function _wtClickOutside(e) {
    if(_wtDrop && _wtDrop.style.display !== 'none') {
      if(!_wtDrop.contains(e.target) && e.target !== _fboxAllEl) _closeWtDrop();
    }
  });

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
      document.querySelectorAll('.wt-opt[data-wt]').forEach(el => el.classList.remove('active'));
      // Reset fboxAll label and close dropdown
      const _fa3 = document.getElementById('fboxAll');
      if(_fa3) _fa3.textContent = currentLang === 'en' ? '💼 All formats' : '💼 Qualquer formato';
      const _d3 = document.getElementById('wtDropdown'); if(_d3) _d3.style.display = 'none';
      // Reset filter boxes
      ['fboxAll','fboxStable','fboxVariable'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.toggle('active', el.dataset.fbox === '');
      });
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
          ? (translations.en.boostCodeErr || 'Invalid or already used access key.')
          : (translations.pt.boostCodeErr || 'Chave inválida ou já utilizada.');
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
  ['welcomeModal','calcModal','boostPayModal'].forEach(id => {
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
            ? 'This site uses localStorage for local preferences (language, favourites) — no tracking cookies or third-party analytics. <a href="#" data-modal="privacy">Privacy Policy</a>'
            : 'Este site usa localStorage para preferências locais (idioma, favoritos) — sem cookies de rastreamento nem analytics de terceiros. <a href="#" data-modal="privacy">Política de Privacidade</a>';
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
  // Note: applyLang() calls render() internally, so no additional render() needed here.
  if(typeof applyLang === 'function') applyLang();

  // ── Auto-unlock from URL hash ──
  // Handles: #key=TOKEN (normal access) and #admin=SECRET (admin UI, hash-protected)
  (async function() {
    const _rawHash = window.location.hash;
    // Use regex instead of URLSearchParams to avoid '&' in token breaking parsing.
    // e.g. #key=abc&XYZ would split at '&' causing URLSearchParams to miss 'XYZ'.
    const _keyMatch = _rawHash.match(/[#&]key=([^&]*)/);
    const t = _keyMatch ? decodeURIComponent(_keyMatch[1]) : null;
    const _adminMatch = _rawHash.match(/[#&]admin=([^&]*)/);
    const adminParam = _adminMatch ? decodeURIComponent(_adminMatch[1]) : null;

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
