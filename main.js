if(location.hostname!=="localhost"){
  console.log=()=>{};
  console.warn=()=>{};
  // Note: console.error intentionally NOT suppressed — allows Supabase/runtime errors to surface
}

// ── Set footer year ──────────────────────────────────────────────────────────
(function _setFooterYear(){
  const el = document.getElementById('footerYear');
  if(el) el.textContent = '© ' + new Date().getFullYear();
})();

const PRICE_PER_ACCESS = 8.99;
const PRICE_PER_BOOST  = 16.99;

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
let P = [];

// Session state — set to true after successful Supabase token validation
let hasAccess = false;
// Session integrity nonce — generated server-side during validarTokenSupabase().
// render() requires this to be set; typing `hasAccess=true` in DevTools alone
// leaves _sessionNonce null, so render() will not display content.
let _sessionNonce = null;
// Session token — stored after successful auth, used for server-side favorites sync
let _sessionToken = null;

// Note: DevTools protection is already handled by _sessionNonce check in render().
// Setting hasAccess=true in console without a valid nonce has no effect on content.

// ── Hero / stat counter — updated once platforms are loaded from Supabase ─────
function _updateHeroCount(){
  const displayTotal = P.length;
  if(!displayTotal) return;

  // Round down to nearest 10, show with "+" prefix (e.g. 87 → "+80", 159 → "+150")
  const rounded = displayTotal >= 100 ? '+' + (Math.floor(displayTotal / 10) * 10) : ('+' + (Math.floor(displayTotal / 10) * 10));
  const isEn = currentLang === 'en';
  // Hero tag (inside the app, post-auth)
  const heroTag = document.querySelector('.hero-tag');
  if(heroTag) heroTag.innerHTML = '✅ ' + rounded + (isEn
    ? ' verified platforms · Updated '
    : ' plataformas verificadas · Atualizado ')
    + '<span id="heroYear">' + new Date().getFullYear() + '</span>';
  // Hero stat block (dynamic total) — animated counter
  const sTotalEl = document.getElementById('s-total');
  if(sTotalEl && sTotalEl.textContent === '—') {
    const _start = Date.now();
    const _dur = 600;
    const _tick = () => {
      const _pct = Math.min(1, (Date.now() - _start) / _dur);
      const _ease = 1 - Math.pow(1 - _pct, 3);
      sTotalEl.textContent = Math.round(_ease * displayTotal);
      if(_pct < 1) requestAnimationFrame(_tick);
      else sTotalEl.textContent = displayTotal;
    };
    requestAnimationFrame(_tick);
  } else if(sTotalEl) {
    sTotalEl.textContent = displayTotal;
  }
  // Cat explorer count badge
  const _cecEl = document.getElementById('catExplorerCount');
  if(_cecEl) {
    _cecEl.textContent = displayTotal + (isEn ? ' platforms' : ' plataformas');
    _cecEl.style.display = '';
  }
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

// ══ UTILS ═══════════════════════════════════════════════════════


// ── Favorites cookie backup (iOS Safari ITP workaround) ──────────────────────
// Safari clears localStorage after 7 days of inactivity. Cookies with explicit
// expiry survive longer. We write to both; on load, prefer localStorage but fall
// back to the cookie if localStorage is empty (e.g. after ITP clearing).
function _saveFavsCookie(arr) {
  try {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    const val = encodeURIComponent(JSON.stringify(arr));
    if (val.length < 3500) // stay within 4KB cookie limit
      document.cookie = 'gh_favs=' + val + ';expires=' + d.toUTCString() + ';path=/;SameSite=Strict;Secure';
  } catch(e) {}
}
function _loadFavsCookie() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)gh_favs=([^;]*)/);
    if (!m) return [];
    const v = JSON.parse(decodeURIComponent(m[1]));
    return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length < 200) : [];
  } catch(e) { return []; }
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Favorites URL bookmark — alternative persistence that survives localStorage/cookie clears ──
// Encodes the current favorites list as a compact, bookmarkable URL hash.
function _getFavsBookmarkUrl() {
  if(!favs.length) return window.location.origin + window.location.pathname;
  try {
    const encoded = btoa(JSON.stringify(favs))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    return window.location.origin + window.location.pathname + '#f=' + encoded;
  } catch(e) { return ''; }
}
// Imports favorites from URL hash (#f=…). Called early before the hash is stripped.
function _importFavsFromUrl(rawHash) {
  try {
    const m = (rawHash||'').match(/[#&]f=([A-Za-z0-9_\-]+)/);
    if(!m) return;
    // Sanity-cap: a base64-encoded list of 50 short names ≈ 2KB; reject anything larger
    if(m[1].length > 4096) return;
    const decoded = JSON.parse(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(!Array.isArray(decoded) || !decoded.length) return;
    const cleaned = decoded.filter(x => typeof x === 'string' && x.length > 0 && x.length < 200);
    if(!cleaned.length) return;
    const merged = [...new Set([...favs, ...cleaned])];
    favs = merged;
    try { localStorage.setItem('gh_favs', JSON.stringify(favs)); _saveFavsCookie(favs); } catch(e) {}
  } catch(e) {}
}
// ── Server-side favorites — synced to Supabase per token ────────────────────

// Load favorites from Supabase after login. Merges with any local favorites.
async function _loadServerFavs(token) {
  if(!_SB || !token) return;
  try {
    const { data, error } = await _SB.rpc('load_favorites', { p_token: token });
    if(error || !data || !Array.isArray(data.favorites)) return;
    const serverFavs = data.favorites.filter(x => typeof x === 'string' && x.length > 0 && x.length < 200);
    if(!serverFavs.length && !favs.length) return;
    // Merge: union of server + local (server is source of truth, local catches any race)
    const merged = [...new Set([...serverFavs, ...favs])];
    if(merged.length === favs.length && merged.every((v,i) => v === favs[i])) return; // no change
    favs = merged;
    try { localStorage.setItem('gh_favs', JSON.stringify(favs)); _saveFavsCookie(favs); } catch(e) {}
    const _fcEl = document.getElementById('favCount');
    if(_fcEl) _fcEl.textContent = favs.length;
    if(typeof render === 'function') render();
    if(hasAccess) renderCatExplorer();
  } catch(e) {}
}

// Debounced save of favorites to Supabase. Called from toggleFav.
let _saveFavsTimer = null;
function _saveServerFavs() {
  if(!_SB || !_sessionToken) return;
  clearTimeout(_saveFavsTimer);
  _saveFavsTimer = setTimeout(async () => {
    try {
      if(!Array.isArray(favs)) return;
      await _SB.rpc('save_favorites', {
        p_token:     _sessionToken,
        p_favorites: favs   // JS array → jsonb (Supabase client handles serialization)
      });
    } catch(e) {}
  }, 1500); // 1.5 s debounce — no spam on rapid star-clicking
}
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

let favs = (() => {
  try {
    const ls = JSON.parse(localStorage.getItem('gh_favs') || '[]');
    const ck = _loadFavsCookie();
    const lsOk = Array.isArray(ls) && ls.length > 0;
    const ckOk = Array.isArray(ck) && ck.length > 0;
    let result;
    if(lsOk && ckOk) {
      // Both have data — union merge (keeps all, deduped)
      result = [...new Set([...ls, ...ck])];
    } else if(lsOk) {
      result = ls;
    } else if(ckOk) {
      // Cookie has data but localStorage is empty (cleared by browser/ITP)
      // Write back to localStorage so both sources are in sync
      result = ck;
      try { localStorage.setItem('gh_favs', JSON.stringify(result)); } catch(e) {}
    } else {
      result = [];
    }
    return result.filter(x => typeof x === 'string' && x.length < 200);
  } catch(e) { return _loadFavsCookie(); }
})();
let showFavsOnly=false;
function toggleFav(name,e){
  e.stopPropagation();
  const _wasAdding = !favs.includes(name);
  if(favs.includes(name)) favs=favs.filter(f=>f!==name); else favs.push(name);
  // Toast feedback
  if(typeof _showToast === 'function') {
    const _shortName = name.length > 22 ? name.slice(0,22)+'…' : name;
    _showToast(_wasAdding ? ('★ '+_shortName+(currentLang==='en'?' saved':' guardado')) : ('☆ '+_shortName+(currentLang==='en'?' removed':' removido')), 1800);
  }
  try { localStorage.setItem('gh_favs',JSON.stringify(favs)); _saveFavsCookie(favs); } catch(err) { console.warn('[GigHub] localStorage write failed (favs):', err); }
  _saveServerFavs(); // sync to Supabase (debounced)
  const fcEl = document.getElementById('favCount');
  if(fcEl) fcEl.textContent=favs.length;
  render();
  if(hasAccess) renderCatExplorer();
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
  // Show/hide the favorites export button
  const _febEl = document.getElementById('favExportBtn');
  if(_febEl) _febEl.style.display = showFavsOnly ? 'inline-flex' : 'none';
  render();
  if(hasAccess) renderCatExplorer();
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
  ['2','3','4','5','7','8','9','10','12','777','888','999'].forEach(v=>{
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
  _openModalTrapped('calcModal');
  const _hrEl = document.getElementById('hoursRange');
  if(_hrEl) _hrEl.setAttribute('aria-valuenow', _hrEl.value);
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
  const _optIds = ['2','3','4','5','7','8','9','10','12','777','888','999'];
  const _updateLabels = () => {
    _optIds.forEach(v=>{const el=document.getElementById('calcOpt'+v);if(el&&t['calcOpt'+v])el.textContent=t['calcOpt'+v];});
    const tl=document.getElementById('calcTypeLabel');if(tl&&t.calcTypeLabel)tl.textContent=t.calcTypeLabel;
  };
  const _s=(id,key)=>{const el=document.getElementById(id);if(el&&t[key])el.textContent=t[key];};
  _s('calcTitleEl','calcTitle'); _s('calcDescEl','calcDesc'); _s('calcHoursLabelEl','calcHoursLabel');
  _updateLabels();

  // ── ATENDIMENTO & SUPORTE: salário fixo, contrato de trabalho ─────────────────
  if(rateRaw === '777'){
    document.getElementById('calcResult').textContent = '820€–1100€';
    const rlEl=document.getElementById('calcResultLabelEl');
    if(rlEl) rlEl.textContent = isEn ? 'Monthly gross salary estimate' : 'Estimativa mensal bruta';
    const estLabel = isEn ? 'Employment contract · rotating shifts · no guarantees' : 'Contrato de trabalho · turnos rotativos · sem garantias';
    document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+(isEn?'Examples':'Exemplos')+': <span style="font-weight:400;color:var(--grey)">Teleperformance · Concentrix · Foundever</span></div>';
    return;
  }

  // ── OPERAÇÕES & RETALHO: salário fixo mensal, não depende de horas ────────────
  if(rateRaw === '888'){
    document.getElementById('calcResult').textContent = isEn ? '820€–980€' : '820€–980€';
    const rlEl=document.getElementById('calcResultLabelEl');
    if(rlEl) rlEl.textContent = isEn ? 'Monthly gross salary estimate' : 'Estimativa mensal bruta';
    const estLabel = isEn ? 'Employment contract · fixed schedule · no guarantees' : 'Contrato de trabalho · horário fixo · sem garantias';
    document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+(isEn?'Examples':'Exemplos')+': <span style="font-weight:400;color:var(--grey)">WWF · Amnistia Internacional · ACNUR · APDES</span></div>';
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
    3:  0.25,   // Passivo: very low — requires setup, depends on assets
    4:  0.20,   // Conteúdo: slow to monetise, audience needed
    5:  0.65,   // Entregas: reliable but after fuel/wear costs
    7:  0.55,   // Biscates: variable demand, setup time
    8:  0.55,   // Caregiving: seasonal, trust-building takes time
    9:  0.65,   // F2F presencial: good demand for shifts/events
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

  const s={
    2:  'Attapoll · Prime Opinion',
    3:  'DHL ServicePoints · Radical Storage',
    4:  'Adobe Stock · Etsy · Shutterstock',
    5:  'Glovo · Uber Eats · Bolt Food',
    7:  'TaskRabbit · Merytu',
    8:  'Rover · Babysits · PetBacker',
    9:  'Securitas · Salesland · Mercadona',
    10: 'Preply · Acclaro',
    12: 'More Results · Pontis · SmartSpotter',
  };
  const sugLabel = isEn ? 'Suggested' : 'Sugestões';
  const estLabel = isEn ? 'Conservative estimate · no guarantees' : 'Estimativa conservadora · sem garantias';
  document.getElementById('calcSuggest').innerHTML='<div style="margin-bottom:6px;color:var(--grey)">'+estLabel+'</div><div style="font-size:13px;font-weight:600;color:var(--ink)">💡 '+sugLabel+': <span style="font-weight:400;color:var(--grey)">'+(s[rate]||'—')+'</span></div>';
  const rlEl=document.getElementById('calcResultLabelEl');
  if(rlEl) rlEl.textContent = isEn ? 'Monthly estimate' : 'Estimativa mensal';
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
  _openModalTrapped('boostPayModal');
  _applyBoostPayLang();
}

// ── DATA ──
const catLabels = {
  pt: {surveys:'Inquéritos & Microtasks',gigs:'Gigs',freelance:'Freelance',micro:'Inquéritos & Microtasks',testing:'Inquéritos & Microtasks',criativo:'Conteúdo & Criativo',conteudo:'Conteúdo & Criativo',tasks:'Inquéritos & Microtasks',mystery:'Cliente Mistério',transcricao:'Transcrição',tutoring:'Tutoria',ugc:'Conteúdo & Criativo',passive:'Rendimento Passivo',remote:'Emprego Remoto',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'Trabalho Presencial',clinical:'Clínica & Investigação',retail:'Angariação de Fundos',support:'Atendimento & Suporte'},
  en: {surveys:'Surveys & Microtasks',gigs:'Gigs',freelance:'Freelance',micro:'Surveys & Microtasks',testing:'Surveys & Microtasks',criativo:'Content & Creative',conteudo:'Content & Creative',tasks:'Surveys & Microtasks',mystery:'Mystery Shopping',transcricao:'Transcription',tutoring:'Tutoring',ugc:'Content & Creative',passive:'Passive Income',remote:'Remote Jobs',petsitting:'Pet Sitting',babysitting:'Babysitting',f2f:'In-Person Work',clinical:'Clinical & Research',retail:'Fundraising',support:'Customer Support'}
};
let catLabel = catLabels['pt'];

// ── TAXONOMY — sistema de três pilares ───────────────────────────────────────
//
// Todos os dados por plataforma (entry_level, earnings_type, tier, suggested,
// direct_hire, is_delivery, no_curation_tag) vêm agora da DB via _fmt().
// Os fallbacks por categoria abaixo são usados apenas quando o campo é NULL na DB.
// ─────────────────────────────────────────────────────────────────────────────


// Fallback por categoria — GANHOS (quando earnings_type é NULL na DB)
const _CAT_EARNINGS_FALLBACK = {
  gigs:'variavel', petsitting:'variavel', babysitting:'variavel', f2f:'estavel', micro:'variavel',
  surveys:'variavel', testing:'variavel', criativo:'variavel',
  conteudo:'variavel', tasks:'variavel', ugc:'variavel',
  passive:'variavel', transcricao:'variavel', mystery:'variavel',
  tutoring:'variavel', freelance:'variavel', remote:'variavel',
  clinical:'variavel', retail:'estavel', support:'estavel',
};

// Fallback por categoria — TIPO DE TRABALHO (quando work_type é NULL na DB)
// Todas as plataformas são obrigatoriamente f2f ou remote (sem categoria neutral)
const _CAT_WORK_TYPE_FALLBACK = {
  // Presencial por natureza
  f2f:'f2f', gigs:'f2f', petsitting:'f2f', babysitting:'f2f',
  retail:'f2f', clinical:'f2f', mystery:'f2f',
  // Remoto por natureza
  surveys:'remote', tasks:'remote', micro:'remote', testing:'remote',
  passive:'remote', transcricao:'remote', tutoring:'remote',
  freelance:'remote', remote:'remote', ugc:'remote',
  conteudo:'remote', criativo:'remote', support:'remote',
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


function _discoveryNote(p){
  if(_getTier(p) !== 4) return '';
  const isEn = currentLang === 'en';
  return `<div class="discovery-note">${isEn
    ? '🟣 Discovery tool — use this to find opportunities, not to earn directly'
    : '🟣 Canal de descoberta — usa para encontrar oportunidades, não para ganhar directamente'}</div>`;
}

// direct_hire flag comes from DB via p.direct_hire — set in migration_platform_metadata.sql

function renderRatings(p){
  const isEn = currentLang === 'en';
  const tags = [];

  // Work type tag
  const _wt = p.work_type || _CAT_WORK_TYPE_FALLBACK[p.cat];
  if(_wt === 'f2f') tags.push(`<span class="rtag rtag-f2f">${isEn?'🤝 In-person':'🤝 Presencial'}</span>`);
  else if(_wt === 'remote') tags.push(`<span class="rtag rtag-remote-tag">${isEn?'🖥️ Remote':'🖥️ Remoto'}</span>`);

  // Direct-hire tag
  if(p.direct_hire) tags.push(`<span class="rtag rtag-direct">${isEn?'🏢 Employer':'🏢 Empregador'}</span>`);

  // Delivery tag
  if(p.is_delivery) tags.push(`<span class="rtag rtag-delivery">${isEn?'🚗 Delivery':'🚗 Entregas'}</span>`);

  return `<div class="ratings-row">${tags.join('')}</div>`;
}



// ══ TABS & RENDER ══
let activeTab = '';
// is_delivery flag comes from DB via p.is_delivery — set in migration_platform_metadata.sql

// ── New tab group filters (maps tab data-v → predicate on platform)
const TAB_CAT_FILTERS = {
  '':           () => true,
  'surveys':    p => ['surveys', 'tasks', 'testing', 'micro'].includes(p.cat),
  'mystery':    p => p.cat === 'mystery',
  'deliveries': p => p.cat === 'gigs' && p.is_delivery,
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
    'gigs_events':'🛠️ Tarefas Locais, Eventos e Hotelaria',
    'caregiving': '🫶 Caregiving',
    'f2f':        '🤝 Trabalho Presencial',
    'clinical':   '🩺 Clínica, Ensaios e Investigação',
    'retail':     '🫶 Angariação de Fundos e ONGs',
    'passive':    '💰 Rendimento Passivo',
    'support':    '🎧 Atendimento ao Cliente & Suporte',
  },
  en: {
    '':           'All platforms',
    'surveys':    '📝 Surveys, Micro-tasks, Testing & Get-Paid-To',
    'mystery':    '🕵️ Mystery Shopping & Quality Auditing',
    'deliveries': '🚗 Deliveries, Couriers & Driving',
    'gigs_events':'🛠️ Local Tasks, Events & Hospitality',
    'caregiving': '🫶 Caregiving',
    'f2f':        '🤝 In-Person Work',
    'clinical':   '🩺 Clinical, Trials & Research',
    'retail':     '🫶 Fundraising & NGOs',
    'passive':    '💰 Passive Income',
    'support':    '🎧 Customer Support & Service',
  },
};
function setTab(v){
  activeTab=v;
  // Reset curation when a tab is explicitly selected — prevents stacked zero-result confusion
  activeCuration='';
  document.querySelectorAll('.curation-pill').forEach(el=>el.classList.toggle('active',el.dataset.curation===''));
  // Reset all curation filter boxes
  const _FBOX_KEYS_T = { fboxAll: '', fboxF2f: 'work_f2f', fboxRemote: 'work_remote', fboxStable: 'earnings_stable', fboxVariable: 'earnings_variable' };
  Object.keys(_FBOX_KEYS_T).forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', id === 'fboxAll');
  });

  const _tabsWrapEl = document.getElementById('tabsWrap');
  if(_tabsWrapEl) _tabsWrapEl.classList.remove('collapsed');
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.v === v;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  render();
  if(hasAccess) renderCatExplorer();
}



// XSS sanitisation for platform data — escHtml() is declared below (hoisted) and aliased as _xss



// ── TOAST SYSTEM ─────────────────────────────────────────────────────────────
function _showToast(msg, durationMs = 2800) {
  let container = document.getElementById('_toastContainer');
  if(!container) {
    container = document.createElement('div');
    container.id = '_toastContainer';
    container.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9990;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'gh-toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s,transform .3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(4px)';
    setTimeout(() => toast.remove(), 350);
  }, durationMs);
}
// ─────────────────────────────────────────────────────────────────────────────

function render(){
  const _catSrEl = document.getElementById('catSearch');
  const _searchEl = document.getElementById('search');
  // Prefer catSearch (visible) value; fall back to hidden #search
  const q = (_catSrEl ? _catSrEl.value : (_searchEl ? _searchEl.value : '')).toLowerCase();
  if(!_searchEl && !_catSrEl) return; // neither element in DOM yet
  const cat=activeTab;
  const curationFn = activeCuration ? curationFilters[activeCuration] : null;

  let list=P.filter(p=>{
    if(curationFn && !curationFn(p)) return false;
    if(showFavsOnly && !favs.includes(p.name)) return false;
    if(q && !p.name.toLowerCase().includes(q) && !(currentLang==='en'&&p.descEn?p.descEn:p.desc).toLowerCase().includes(q) && !(catLabel[p.cat]||'').toLowerCase().includes(q)) return false;
    // New tab group filter
    if(cat) { const _tf = TAB_CAT_FILTERS[cat]; if(!_tf || !_tf(p)) return false; }
    return true;
  });

  list.sort((a,b)=>b.earnN-a.earnN);

  const _sTotalEl=document.getElementById('s-total');
  const _sCatsEl=document.getElementById('s-cats');
  const _isFiltered = cat !== '' || activeCuration !== '' || q !== '' || showFavsOnly;
  if(_sTotalEl) _sTotalEl.textContent = _isFiltered ? list.length : (P.length || '—');
  const _barCountEl=document.getElementById('barCount'); if(_barCountEl) _barCountEl.textContent=list.length+(currentLang==='en'?' result'+(list.length!==1?'s':''):(` resultado${list.length!==1?'s':''}`));
  if(_barCountEl) { _barCountEl.classList.remove('pulse'); void _barCountEl.offsetWidth; _barCountEl.classList.add('pulse'); }

  // ── Update tab counts (based on current curation/search/workType, ignoring category filter) ──
  const _tabBase = P.filter(p=>{
    if(curationFn && !curationFn(p)) return false;
    if(showFavsOnly && !favs.includes(p.name)) return false;
    if(q && !p.name.toLowerCase().includes(q) && !(currentLang==='en'&&p.descEn?p.descEn:p.desc).toLowerCase().includes(q) && !(catLabel[p.cat]||'').toLowerCase().includes(q)) return false;
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
      if(activeTab===v){ activeTab=''; document.querySelectorAll('.tab').forEach(t=>{ const isAll=t.dataset.v===''; t.classList.toggle('active',isAll); t.setAttribute('aria-selected',isAll?'true':'false'); t.setAttribute('tabindex',isAll?'0':'-1'); }); }
    } else {
      tab.style.display='';
    }
  });
  // barTitle: curation > tab > default
  const _curationTitles={
    pt:{
      portugal:'Top picks Portugal 🇵🇹',
      stable:'Ganhos estáveis ⚡', variable:'Ganhos variáveis 🎲',
      noexp:'Sem experiência necessária 🚀',
      earnings_stable:'⚡ Ganhos estáveis', earnings_variable:'🎲 Ganhos variáveis',
      work_f2f:'🤝 Trabalho presencial', work_remote:'🖥️ Trabalho remoto',
    },
    en:{
      portugal:'Top picks Portugal 🇵🇹',
      stable:'Stable earnings ⚡', variable:'Variable earnings 🎲',
      noexp:'No experience needed 🚀',
      earnings_stable:'⚡ Stable earnings', earnings_variable:'🎲 Variable earnings',
      work_f2f:'🤝 In-person work', work_remote:'🖥️ Remote work',
    }
  };
  const _curationTitle = activeCuration ? (_curationTitles[currentLang]||_curationTitles.pt)[activeCuration] : null;
  const _tabGroupLabel = (TAB_GROUP_LABELS[currentLang]||TAB_GROUP_LABELS.pt)[cat];
  const _barTitleEl=document.getElementById('barTitle'); if(_barTitleEl) _barTitleEl.textContent= _curationTitle || _tabGroupLabel || translations[currentLang].barTitle;
  // ── Category note (shown below bar title for specific tabs) ──
  const _CAT_NOTES = {
    surveys: { pt: '☕ Pagam pouco, mas servem para o café.', en: '☕ Low pay, but good enough for a coffee.' }
  };
  const _catNoteEl = document.getElementById('catNote');
  if(_catNoteEl) {
    const _noteData = _CAT_NOTES[cat];
    if(_noteData && !activeCuration) {
      _catNoteEl.textContent = _noteData[currentLang] || _noteData.pt;
      _catNoteEl.style.display = '';
    } else {
      _catNoteEl.style.display = 'none';
    }
  }

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
    // Skeleton loading — 6 placeholder cards
    grid.innerHTML = Array(6).fill(0).map(() => `
      <div class="card skeleton-card" style="pointer-events:none;animation:none">
        <div class="card-top">
          <div class="card-ico skel"></div>
          <div class="card-meta-top" style="flex:1">
            <div class="skel" style="height:14px;width:60%;border-radius:4px;margin-bottom:8px"></div>
            <div class="skel" style="height:11px;width:40%;border-radius:4px"></div>
          </div>
        </div>
        <div class="skel" style="height:32px;width:100%;border-radius:6px;margin:14px 0"></div>
        <div class="card-foot" style="border-top:1px solid var(--border);padding-top:12px">
          <div class="skel" style="height:32px;width:80px;border-radius:20px;margin-left:auto"></div>
        </div>
      </div>`).join('');
    return;
  }
  if(window._loadWatchdog) { clearTimeout(window._loadWatchdog); window._loadWatchdog = null; }
  if(!list.length){
    const _eLang = currentLang === 'en';
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-ico">🔍</div>
        <div class="empty-state-title">${_eLang ? 'No platforms found.' : 'Nenhuma plataforma encontrada.'}</div>
        <div class="empty-state-sub">${_eLang ? 'Try adjusting your filters or search term.' : 'Tenta ajustar os filtros ou a pesquisa.'}</div>
        <button class="clear-filters-btn" style="height:36px;padding:0 20px;border-radius:20px;border:1.5px solid var(--border-md);background:transparent;cursor:pointer;font-size:12px;font-weight:600;color:var(--grey);font-family:'Instrument Sans',sans-serif">${_eLang ? 'Clear filters' : 'Limpar filtros'}</button>
      </div>`;
    return;
  }

  grid.innerHTML=list.map((p,i)=>{
    let domain = '';
    try { domain = new URL(p.url||'https://example.com').hostname.replace('www.',''); } catch(e) { domain = ''; }
    const rawUrl = p.url||'';
    const _safeSchemes = ['https://','http://'];
    const _blockedPatterns = ['javascript:','data:','vbscript:','file:','localhost','127.0.0.1','0.0.0.0'];
    const effectiveUrl = _safeSchemes.some(s=>rawUrl.startsWith(s)) && !_blockedPatterns.some(b=>rawUrl.toLowerCase().includes(b)) ? rawUrl : null;
    const tier = _getTier(p);
    const tierSafe = Math.max(1, Math.min(4, parseInt(tier) || 2));
    const cardClass = [
      p.dimmed ? 'dimmed' : (p.beginner && p.cat!=='f2f' ? 'beginner-pick' : ''),
      `card-t${tierSafe}`
    ].filter(Boolean).join(' ');
    return `
    <div class="card ${cardClass}" role="button" aria-label="${_xss(p.name)}" data-domain="${_xss(domain)}" data-url="${_xss(effectiveUrl||'')}" tabindex="0" style="animation-delay:${Math.min(i,16)*.025}s">
      <div class="card-top">
        <div class="card-ico" aria-hidden="true" style="${[...p.icon||'📌'].length>=2?'font-size:13px;flex-wrap:wrap;overflow:hidden;':''}">${_xss(p.icon||'📌')}</div>
        <div class="card-meta-top">
          <div class="card-name">
            ${q ? _highlightMatch(_xss(p.name), q) : _xss(p.name)}

          </div>
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
  'freelance',
  'tutoring','transcricao',
]);

// Top picks Portugal — hardcoded fallback so the curation always shows results
// even when the DB suggested field is not populated.
const _PT_TOP_PICKS = new Set([
  'glovo','attapoll','freecash',
  'taskrabbit',
  'amnistia internacional','acnur','aldeias sos',
  'apdes','associação salvador','associação salvador','wwf portugal',
  'prime opinion','dhl','babysits',
  'blueclinical',
]);

const curationFilters = {
  portugal: p => !p.no_curation_tag && (p.suggested || _PT_TOP_PICKS.has(p.name.toLowerCase())),

  // Ganhos estáveis: DB earnings_type tem prioridade; fallback de categoria só quando NULL.
  // is_delivery excluído sempre — entregas são por natureza ganhos variáveis.
  stable: p => {
    if(p.no_curation_tag || _NO_TAG_CATS.has(p.cat)) return false;
    if(p.is_delivery) return false;
    if(['surveys','tasks','micro','testing','mystery','passive','clinical'].includes(p.cat)) return false;
    if(['TaskRabbit','Merytu','Worldpackers','Casamentos.pt'].includes(p.name)) return false;
    return (p.earnings_type || _CAT_EARNINGS_FALLBACK[p.cat]) === 'estavel';
  },

  // Ganhos variáveis: DB earnings_type tem prioridade; fallback de categoria só quando NULL.
  variable: p => {
    if(p.no_curation_tag) return false;
    if(_getTier(p) === 4) return false;
    // Overrides explícitos para gigs excluídos do stable mas com ganhos variáveis
    if(['Merytu','TaskRabbit','Worldpackers','Casamentos.pt'].includes(p.name)) return true;
    return (p.earnings_type || _CAT_EARNINGS_FALLBACK[p.cat]) === 'variavel';
  },

  // ── Filtros de ganhos para os filter-boxes — cobrem TODAS as plataformas sem excluir categorias
  // Cada plataforma tem obrigatoriamente um tipo de ganho (DB ou fallback de categoria)
  earnings_stable: p => {
    if(_getTier(p) === 4) return false; // canais de descoberta: não são plataformas de ganho
    return (p.earnings_type || _CAT_EARNINGS_FALLBACK[p.cat]) === 'estavel';
  },

  earnings_variable: p => {
    if(_getTier(p) === 4) return false; // canais de descoberta: não são plataformas de ganho
    return (p.earnings_type || _CAT_EARNINGS_FALLBACK[p.cat]) === 'variavel';
  },

  // ── Filtros de formato de trabalho — cobrem TODAS as plataformas sem excluir categorias
  // Cada plataforma tem obrigatoriamente um tipo (DB work_type ou fallback de categoria)
  work_f2f: p => {
    if(_getTier(p) === 4) return false;
    return (p.work_type || _CAT_WORK_TYPE_FALLBACK[p.cat]) === 'f2f';
  },

  work_remote: p => {
    if(_getTier(p) === 4) return false;
    return (p.work_type || _CAT_WORK_TYPE_FALLBACK[p.cat]) === 'remote';
  },

  noexp: p => {
    if(p.no_curation_tag || _NO_TAG_CATS.has(p.cat)) return false;
    if(p.cat === 'clinical' || p.cat === 'passive' || p.cat === 'retail') return true;
    // Explicit noexp overrides (belt-and-suspenders)
    if(['Radical Storage','Bounce'].includes(p.name)) return true;
    if(['Uber Driver','Bolt Driver'].includes(p.name)) return true;
    return p.easy >= 4 || (p.easy >= 3 && p.beginner === true);
  },
};

function setCuration(key) {
  activeCuration = key;
  // Reset tab when a curation is selected — prevents stacked zero-result confusion
  activeTab = '';
  document.querySelectorAll('.tab').forEach(t => {
    const isAll = t.dataset.v === '';
    t.classList.toggle('active', isAll);
    t.setAttribute('aria-selected', isAll ? 'true' : 'false');
    t.setAttribute('tabindex', isAll ? '0' : '-1');
  });
  document.querySelectorAll('.curation-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.curation === key);
  });
  // Update all 5 filter boxes + aria-pressed
  const _FBOX_KEYS = { fboxAll: '', fboxF2f: 'work_f2f', fboxRemote: 'work_remote', fboxStable: 'earnings_stable', fboxVariable: 'earnings_variable' };
  Object.entries(_FBOX_KEYS).forEach(([id, k]) => {
    const el = document.getElementById(id);
    if(!el) return;
    const isActive = id === 'fboxAll' ? key === '' : key === k;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  render();
  if(hasAccess) renderCatExplorer();
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
    heroH1: 'Ganha dinheiro<br><em>à tua medida.</em>',
    heroDesc: 'Emprego, gigs, surveys, rendimento passivo — +100 formas de ganhar em Portugal.',
    statPt: 'Disponíveis PT',
    statCats: 'Categorias',
    statAvgEarn: 'Sugeridas',
    statTotal: 'Plataformas',
    tabAll: 'Todas',
    openBtn: 'Abrir',
    secVerify: '✅ Plataformas verificadas',
    barTitle: 'Todas as plataformas',
    // Lock screen
    lockStep1Label: 'Acesso completo',
    lockHeadline: '+100 formas de<br>ganhar <em>dinheiro</em> online',
    lockTagline: 'Emprego, gigs, surveys, rendimento passivo e muito mais — curado, verificado e atualizado.',
    lstat1: 'Plataformas verificadas',
    lstat2: 'Categorias diferentes',
    lstat3: 'Acesso único, sem subscrição',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 Treino IA',
    lockCatCreative: '📸 Criativo',
    lockCatContent: '✍️ Conteúdo',
    lockPayText: 'Para obter acesso, transfere 8,99€ por MB Way ou transferência bancária e envia o comprovativo para <a href="mailto:gighubpt@gmail.com" style="color:var(--gold);text-decoration:none">gighubpt@gmail.com</a>',
    lockVerifying: 'A verificar acesso…',
    lockEnter: 'Entrar →',
    lockStep1Desc: 'Transfere <strong style="color:rgba(247,245,240,.8)">8,99€</strong> via <strong style="color:rgba(247,245,240,.8)">MB Way ou IBAN</strong> e envia o comprovativo para <strong style="color:rgba(247,245,240,.8)">gighubpt@gmail.com</strong>. Recebes a chave em minutos.',
    lockWaBtn: 'Enviar Comprovativo por Email →',
    lockStep2: 'Já tens a tua chave de acesso?',
    tabTranscricao: 'Transcrição',
    tabTutoring: 'Tutoria',
    tabPassive: 'Renda Passiva',
    tabRemote: 'Emprego Remoto',
    lockHintText: 'Chave enviada após confirmação de pagamento',
    heroSearchBtnTxt: 'Pesquisar plataformas…',
    catExplorerHint: 'Clica numa categoria para ver as plataformas',
    pwaInstallTxt: 'Instalar App',
    lockAccessCode: 'Chave de acesso',
    lockRevoked: '🚫 Acesso revogado',
    lockRevokedMsg: 'Esta chave foi desativada. Contacta o suporte.',
    // Guide
    guideH2: '🧭 Como começar<br><em style="font-style:italic;color:var(--gold)">em 4 passos.</em>',
    welcomeTitle: 'Bem-vindo ao GigHub',
    welcomeBody: 'Tens acesso a <strong style="color:var(--ink)">+100 plataformas verificadas</strong> para ganhar dinheiro online — emprego, gigs, surveys, rendimento passivo e muito mais.',
    welcomeTip: '⭐ <strong>Dica de membro:</strong> Marca os teus favoritos com o botão ★ em cada card. Calcula quanto podes ganhar com a calculadora no topo.',
    welcomeClose: 'Explorar plataformas →',
    guideSub: 'Sem investimentos, sem riscos. Remoto, presencial ou híbrido.',
    guideStep1H: 'Explora as categorias',
    guideStep2H: 'Regista-te gratuitamente',
    guideStep3H: 'Diversifica as fontes',
    guideStep4H: 'Vai além das plataformas',
    guideStep1P: 'Explora as categorias disponíveis e escolhe o que melhor se adapta ao teu tempo e perfil.',
    guideStep2P: 'Nunca pagues para aceder a nenhuma destas plataformas — todas as que aqui listamos são 100% gratuitas.',
    guideStep3P: 'Muitos utilizadores combinam 3–5 plataformas. Diversificar entre IA, freelance e trabalhos presenciais ajuda a estabilizar o rendimento ao longo do mês — a chave é combinar diferentes tipos de trabalho.',
    guideStep4P: 'Muitos gigs informais nunca chegam às plataformas — circulam em grupos Facebook, WhatsApp e sites de classificados. <a href="#canais" style="color:var(--gold);font-weight:600;text-decoration:none">Ver Canais de Descoberta →</a>',
    guideTip: '<strong>★ Top 3 para Portugal em 2026 —</strong> <strong>Teleperformance</strong> (customer support, rendimento estável, entrada relativamente fácil) · <strong>Lisbon Pub Crawl</strong> (guia/staff noturno em Lisboa, salário base + comissões, gig divertido e flexível) · <strong>Amnistia Internacional</strong> (angariação de fundos paga, entrada fácil, ótima para começar)',
    guideCommunityTip: '<strong style="color:#0e64b4">💬 Canais informais —</strong> Muitos gigs remotos não aparecem em nenhuma plataforma. Junta-te a grupos Facebook de teletrabalho e remote work PT, grupos WhatsApp de freelancers e acompanha o Sapo Emprego e BEP regularmente. <a href="#canais" style="color:#0e64b4;font-weight:600;text-decoration:none">Ver todos os canais →</a>',
    canaisBadge: '💬 Canais de Descoberta',
    canaisH2: 'Onde estão os gigs<br><em style="font-style:italic;color:var(--gold)">que não aparecem online.</em>',
    canaisSub: 'A maioria dos gigs informais circula fora das plataformas — em grupos privados, classificados e redes sociais. Estes canais complementam o que encontras aqui.',
    canaisDisclaimer: 'ℹ️ Estes não são parceiros do GigHub — são canais públicos ou comunidades independentes. Verifica sempre a legitimidade das oportunidades antes de responder.',
    // Monetization
    monoTitle: 'Queres acesso ao GigHub?',
    monoDesc: 'Transfere 8,99€ por MB Way ou IBAN e envia o comprovativo para <strong>gighubpt@gmail.com</strong>. Recebes a chave de acesso em minutos. Os recibos podem conter dados pessoais — ver <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.6)">Política de Privacidade</a>. Nunca partilhes a tua chave de acesso.',
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
    boostPayInstr: 'Transfere <strong>16,99€</strong> via <strong>MB Way</strong> ou IBAN e envia o comprovativo para <strong>gighubpt@gmail.com</strong>.<br>O acesso GigBoost é enviado após confirmação.',
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
    calcOpt3:   '💰 Rendimento Passivo',
    calcOpt4:   '🎨 Conteúdo & Criativo',
    calcOpt5:   '🚗 Entregas & Condução',
    calcOpt7:   '🛠️ Biscates & Eventos',
    calcOpt8:   '🫶 Caregiving (Pet/Babysitting)',
    calcOpt9:   '🤝 Trabalho Presencial',
    calcOpt10:  '🧑‍🏫 Ensino & Skills',
    calcOpt12:  '🕵️ Cliente Mistério',
    calcOpt777: '🎧 Atendimento & Suporte (salário fixo)',
    calcOpt888: '🫶 Angariação de Fundos (salário fixo)',
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
    heroTag: '✅ +100 verified platforms · Updated',
    heroH1: 'Earn money<br><em>on your terms.</em>',
    heroDesc: 'Jobs, gigs, surveys, passive income — 100+ ways to earn in Portugal.',
    statPt: 'Available PT',
    statCats: 'Categories',
    statAvgEarn: 'Suggested',
    statTotal: 'Platforms',
    tabAll: 'All',
    openBtn: 'Open',
    secVerify: '✅ Verified platforms',
    barTitle: 'All platforms',
    // Lock screen
    lockStep1Label: 'Full access',
    lockHeadline: '+100 ways to<br>earn <em>money</em> online',
    lockTagline: 'Jobs, gigs, surveys, passive income and more — curated, verified and regularly updated.',
    lstat1: 'Verified platforms',
    lstat2: 'Different categories',
    lstat3: 'One-time access, no subscription',
    lockFlagGlobal: 'Global',
    lockCatAI: '🧠 AI Training',
    lockCatCreative: '📸 Creative',
    lockCatContent: '✍️ Content',
    lockPayText: 'To get access, transfer €8.99 via MB Way or bank transfer and email your receipt to <a href="mailto:gighubpt@gmail.com" style="color:var(--gold);text-decoration:none">gighubpt@gmail.com</a>',
    lockVerifying: 'Verifying access…',
    lockEnter: 'Enter →',
    lockHintText: 'Access key sent after payment confirmation',
    heroSearchBtnTxt: 'Search platforms…',
    catExplorerHint: 'Click a category to see platforms',
    pwaInstallTxt: 'Install App',
    lockAccessCode: 'Access key',
    lockRevoked: '🚫 Access revoked',
    lockRevokedMsg: 'This access key has been deactivated. Contact support.',
    // Guide
    guideH2: '🧭 How to start<br><em style="font-style:italic;color:var(--gold)">in 4 steps.</em>',
    welcomeTitle: 'Welcome to GigHub',
    welcomeBody: 'You have access to <strong style="color:var(--ink)">+100 verified platforms</strong> to earn money online — surveys, freelance, AI, physical gigs and much more.',
    welcomeTip: '⭐ <strong>Member tip:</strong> Save your favourites with the ★ button on each card. Calculate how much you can earn with the calculator at the top.',
    welcomeClose: 'Explore platforms →',
    guideSub: 'No investments, no risks. Remote, in-person or hybrid.',
    guideStep1H: 'Explore the categories',
    guideStep1P: 'Browse the available categories and choose what best fits your time and profile.',
    guideStep2H: 'Register for free',
    guideStep2P: 'Never pay to access any of these platforms — all the ones we list here are 100% free.',
    guideStep3H: 'Diversify your sources',
    guideStep3P: 'Many users combine 3–5 platforms. Diversifying between AI, freelance and in-person work helps stabilise income throughout the month — the key is combining different types of work.',
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
    monoDesc: 'Transfer €8.99 via MB Way or IBAN and email your receipt to <strong>gighubpt@gmail.com</strong>. You\'ll receive the access key in minutes. Receipts may contain personal data — see <a href="#" data-modal="privacy" style="color:rgba(247,245,240,.6)">Privacy Policy</a>. Never share your access key.',
    monoPayLabel: 'Alternative — Bank transfer',
    monoPayNote: 'After the transfer, email the receipt to gighubpt@gmail.com',
    monoWaBtn: 'Request access by Email →',
    lockStep1Desc: 'Transfer <strong style="color:rgba(247,245,240,.8)">€8.99</strong> via <strong style="color:rgba(247,245,240,.8)">MB Way or IBAN</strong> to <strong style="color:rgba(247,245,240,.8)">gighubpt@gmail.com</strong> and send your receipt. You\'ll receive your key within minutes.',
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
    boostPayInstr: 'Transfer <strong>€16.99</strong> via <strong>MB Way</strong> or IBAN and email your receipt to <strong>gighubpt@gmail.com</strong>.<br>Access is sent after payment confirmation.',
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
    calcOpt3:   '💰 Passive Income',
    calcOpt4:   '🎨 Content & Creative',
    calcOpt5:   '🚗 Deliveries & Driving',
    calcOpt7:   '🛠️ Local Gigs & Events',
    calcOpt8:   '🫶 Caregiving (Pet/Babysitting)',
    calcOpt9:   '🤝 In-Person Work',
    calcOpt10:  '🧑‍🏫 Teaching & Skills',
    calcOpt12:  '🕵️ Mystery Shopping',
    calcOpt777: '🎧 Customer Support (fixed salary)',
    calcOpt888: '🫶 Fundraising (fixed salary)',
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
  document.documentElement.lang = currentLang; // keep <html lang> in sync for screen readers
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
  // lockSubText removed
  set('lockHeadline', t.lockHeadline);
  set('lockTagline', t.lockTagline);
  set('lstatLabel1', t.lstat1);
  set('lstatLabel2', t.lstat2);
  set('lstatLabel3', t.lstat3);
  if(t.lockFlagGlobal) set('lockFlagGlobal', t.lockFlagGlobal);
  if(t.lockPayText) set('lockPayText', t.lockPayText);
  // Lock-cat badges — 10 tab-group categories
  setText('lockCatSurveys',    '📝 Inquéritos & Microtasks', '📝 Surveys & Microtasks');
  setText('lockCatMystery',    '🕵️ Cliente Mistério',        '🕵️ Mystery Shopping');
  setText('lockCatDeliveries', '🚗 Entregas & Condução',     '🚗 Deliveries & Driving');
  setText('lockCatGigs',       '🛠️ Biscates & Eventos',      '🛠️ Local Gigs & Events');
  setText('lockCatCaregiving', '🫶 Caregiving',               '🫶 Caregiving');
  setText('lockCatF2F',        '🤝 Trabalho Presencial',      '🤝 In-Person Work');
  setText('lockCatClinical',   '🩺 Clínica & Investigação',  '🩺 Clinical & Research');
  setText('lockCatRetail',     '🫶 Angariação de Fundos',     '🫶 Fundraising');
  setText('lockCatPassive',    '💰 Rendimento Passivo',       '💰 Passive Income');
  setText('lockCatSupport',    '🎧 Atendimento & Suporte',    '🎧 Customer Support');
  const lockInputEl = document.getElementById('lockInput');
  if(lockInputEl) {
    lockInputEl.placeholder = isEn ? 'Access key' : 'Chave de acesso';
    lockInputEl.setAttribute('aria-label', isEn ? 'Access key' : 'Chave de acesso');
  }
  // Step labels
  setText('lockStep1Label', 'Acesso completo', 'Full access');
  const desc1 = document.getElementById('lockStep1Desc');
  if(desc1) desc1.innerHTML = isEn
    ? `Transfer via <strong style="color:rgba(247,245,240,.8)">MB Way or IBAN</strong> to <strong style="color:rgba(247,245,240,.8)">gighubpt@gmail.com</strong> and send your receipt. You'll receive your key within minutes.`
    : `Transfere via <strong style="color:rgba(247,245,240,.8)">MB Way ou IBAN</strong> para <strong style="color:rgba(247,245,240,.8)">gighubpt@gmail.com</strong> e envia o comprovativo. Recebes a chave em minutos.`;
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
  // Translate the collapsible legal summary label
  const legalSummaryEl = document.getElementById('lockLegalSummary');
  if(legalSummaryEl) {
    const summarySpan = legalSummaryEl.querySelector('span:first-child');
    if(summarySpan) summarySpan.textContent = isEn ? 'ℹ️ Legal notices & security' : 'ℹ️ Avisos legais e segurança';
  }
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
  const catSearchEl2 = document.getElementById('catSearch');
  if(catSearchEl2) catSearchEl2.placeholder = t.searchPlaceholder;
  // Work type select

  // Security btn
  const secBtn = document.querySelector('.check-all-security-btn');
  if(secBtn) secBtn.textContent = t.secVerify;
  // Tabs — short pill labels (TAB_GROUP_LABELS is only used for the bar title)
  const _TAB_SHORT = {
    pt:{'':'Todas','surveys':'📝 Inquéritos & Microtasks',
      'mystery':'🕵️ Cliente Mistério','deliveries':'🚗 Entregas',
      'gigs_events':'🛠️ Biscates & Eventos','caregiving':'🫶 Caregiving',
      'f2f':'🤝 Trabalho Presencial',
      'clinical':'🩺 Clínica & Investigação',
      'retail':'🫶 Angariação de Fundos',
      'passive':'💰 Rendimento Passivo',
      'support':'🎧 Atendimento & Suporte'},
    en:{'':'All','surveys':'📝 Surveys & Microtasks',
      'mystery':'🕵️ Mystery Shopping','deliveries':'🚗 Deliveries',
      'gigs_events':'🛠️ Gigs & Events','caregiving':'🫶 Caregiving',
      'f2f':'🤝 In-Person Work',
      'clinical':'🩺 Clinical & Research',
      'retail':'🫶 Fundraising',
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
  const heroDesc = document.getElementById('heroDescMain') || document.querySelector('.hero-desc');
  if(heroDesc) heroDesc.innerHTML = t.heroDesc;
  // Stat labels
  const statLabels = document.querySelectorAll('.hstat-label');
  if(statLabels[0]) statLabels[0].textContent = t.statTotal;
  if(statLabels[1]) statLabels[1].textContent = isEn ? 'Categories' : 'Categorias';
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
  setInner2('canaisEnglishJobsDesc', 'Portal de emprego especializado em vagas que requerem inglês em Portugal — empresas internacionais, call centres, tech e turismo.',
                                     'Jobs portal specialising in English-language vacancies in Portugal — international companies, call centres, tech and tourism.');
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
  if(_wbPriceOrig) _wbPriceOrig.textContent = isEn ? '€19.99' : '19,99€';

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
  const _fbTr = {
    fboxAll:      [isEn ? '💼 All' : '💼 Todas',    ''],
    fboxF2f:      [isEn ? '🤝 In-Person' : '🤝 Presencial', 'work_f2f'],
    fboxRemote:   [isEn ? '🖥️ Remote' : '🖥️ Remoto',         'work_remote'],
    fboxStable:   [isEn ? '⚡ Stable' : '⚡ Estáveis',          'earnings_stable'],
    fboxVariable: [isEn ? '🎲 Variable' : '🎲 Variáveis',        'earnings_variable'],
  };
  const _catClearLbl = document.getElementById('catSearchClear');
  if(_catClearLbl) _catClearLbl.setAttribute('aria-label', isEn ? 'Clear search' : 'Limpar pesquisa');
  Object.entries(_fbTr).forEach(([id, [label, key]]) => {
    const el = document.getElementById(id);
    if(el) {
      el.textContent = label;
      el.classList.toggle('active', id === 'fboxAll' ? activeCuration === '' : activeCuration === key);
    }
  });
  // ── Welcome modal quick-start buttons ──
  const _wqR = document.getElementById('welcomeQuickRemoto');
  if(_wqR) {
    const _spans = _wqR.querySelectorAll('span');
    if(_spans[0]) _spans[0].textContent = isEn ? '🖥️ Start with' : '🖥️ Começar com';
    if(_spans[1]) _spans[1].textContent = isEn ? 'Remote work' : 'Trabalho remoto';
  }
  const _wqP = document.getElementById('welcomeQuickPresencial');
  if(_wqP) {
    const _spans = _wqP.querySelectorAll('span');
    if(_spans[0]) _spans[0].textContent = isEn ? '🤝 Start with' : '🤝 Começar com';
    if(_spans[1]) _spans[1].textContent = isEn ? 'In-person work' : 'Trabalho presencial';
  }
  // ── New UI elements translation ──
  const _catExpTitle = document.getElementById('catExplorerTitle');
  if(_catExpTitle) _catExpTitle.textContent = isEn ? 'Explore by category' : 'Explora por categoria';
  const _heroStatTotalLbl = document.getElementById('heroStatTotal');
  if(_heroStatTotalLbl) _heroStatTotalLbl.textContent = isEn ? 'Platforms' : 'Plataformas';
  const _heroStatCatsLbl = document.getElementById('heroStatCats');
  if(_heroStatCatsLbl) _heroStatCatsLbl.textContent = isEn ? 'Categories' : 'Categorias';
  const _hsbTxt = document.getElementById('heroSearchBtnTxt');
  if(_hsbTxt) _hsbTxt.textContent = t.heroSearchBtnTxt || (isEn ? 'Search platforms…' : 'Pesquisar plataformas…');
  const _cehTxt = document.getElementById('catExplorerHint');
  if(_cehTxt) _cehTxt.textContent = t.catExplorerHint || (isEn ? 'Click a category to see platforms' : 'Clica numa categoria para ver as plataformas');
  const _pwaBtn = document.getElementById('pwaInstallTxt');
  if(_pwaBtn) _pwaBtn.textContent = t.pwaInstallTxt || (isEn ? 'Install App' : 'Instalar App');
  // Keyboard panel
  // Re-render cards with updated language (called once here, after all translations are applied)
  if(typeof render === 'function') render();
  if(hasAccess) renderCatExplorer();
  // Re-sync hero count text if platforms already loaded
  if(P.length) _updateHeroCount();
  // Sync navCanaisLink text (post-auth nav link)
  const _nc = document.getElementById('navCanaisLink');
  if(_nc) _nc.textContent = isEn ? '💬 Channels' : '💬 Canais';
  // Sync favExportBtn text
  const _feb = document.getElementById('favExportBtn');
  if(_feb) _feb.innerHTML = '🔗 ' + (isEn ? 'Save list' : 'Guardar lista');
}

const boostStepsData = {
  pt: [
    {
      id:'s1', label:'1 / 6',
      title:'Onde estás e como trabalhas?',
      sub:'Começa pelo teu contexto — leva menos de 1 minuto.',
      fields:[
        { key:'pais', type:'select', label:'País de residência', placeholder:'Seleciona…', options:['🇵🇹 Portugal','🇧🇷 Brasil','🇪🇸 Espanha','🇬🇧 Reino Unido','🌍 Outro'] },
        { key:'idade', type:'chips1', label:'Idade', options:['18–24','25–34','35–44','45–54','55+'] },
        { key:'dispositivo', type:'chips1', label:'Trabalhas principalmente em...', options:['💻 Computador','📱 Telemóvel','💻 + 📱 Ambos'] }
      ]
    },
    {
      id:'s2', label:'2 / 6',
      title:'Disponibilidade e idiomas',
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
        ]},
        { key:'outros_idiomas', type:'chips', label:'Outros idiomas que dominas (opcional)', optional:true, options:['🇪🇸 Espanhol','🇫🇷 Francês','🇩🇪 Alemão','🇮🇹 Italiano','🌍 Outro'] }
      ]
    },
    {
      id:'s3', label:'3 / 6',
      title:'A tua situação atual',
      sub:'Ajuda-nos a personalizar ainda melhor as recomendações.',
      fields:[
        { key:'situacao', type:'radio', label:'Situação profissional', options:[
          {val:'empregado', label:'Empregado a tempo inteiro', sub:'Procuro renda extra ao lado do trabalho'},
          {val:'empregado_part', label:'Empregado a part-time', sub:'Tenho algumas horas disponíveis'},
          {val:'desempregado', label:'Desempregado / À procura', sub:'Preciso de rendimento urgente'},
          {val:'estudante', label:'Estudante', sub:'Gig work a encaixar no horário escolar'},
          {val:'freelancer', label:'Freelancer / Independente', sub:'Já trabalho por conta própria'},
          {val:'reformado', label:'Reformado / Outro', sub:'Tempo disponível, procuro complemento'},
        ]},
        { key:'viatura', type:'chips1', label:'Tens viatura disponível?', options:['🚗 Carro','🛵 Moto / Scooter','🚲 Bicicleta','❌ Não tenho'] },
        { key:'nif', type:'chips1', label:'Tens NIF / CNPJ ativo?', options:['✅ Sim','❌ Não','🔄 Em processo'] }
      ]
    },
    {
      id:'s4', label:'4 / 6',
      title:'Experiência e competências',
      sub:'Seleciona tudo o que se aplica a ti.',
      fields:[
        { key:'experiencia', type:'radio', label:'Experiência com gig platforms', options:[
          {val:'zero', label:'Sou iniciante', sub:'Nunca usei nenhuma plataforma'},
          {val:'some', label:'Já experimentei', sub:'Usei 1–3 plataformas, pouco consistente'},
          {val:'regular', label:'Uso regularmente', sub:'Já tenho rotina com 3+ plataformas'},
          {val:'pro', label:'Tenho experiência real', sub:'Faz parte da minha renda atual'},
        ]},
        { key:'skills', type:'chips', label:'As tuas competências (seleciona todas)', options:['✍️ Escrita','💻 Programação','🎨 Design','🗣️ Idiomas','📱 Redes Sociais','📣 Marketing','📸 Foto / Vídeo','🔢 Excel / Dados','🎵 Música / Áudio','🧑‍🍳 Cozinha / Eventos','🐾 Cuidado de animais','👶 Cuidado de crianças','Nenhuma em particular'] }
      ]
    },
    {
      id:'s5', label:'5 / 6',
      title:'Objetivos e ganhos',
      sub:'O que esperas conseguir — seremos realistas contigo.',
      fields:[
        { key:'objetivo', type:'radio', label:'O teu objetivo principal', options:[
          {val:'extra', label:'Rendimento extra', sub:'100–400€/mês ao lado do emprego'},
          {val:'main', label:'Substituir o emprego', sub:'Quero viver disto a prazo'},
          {val:'explore', label:'Explorar e aprender', sub:'Sem pressão, só quero descobrir'},
          {val:'save', label:'Poupar para algo específico', sub:'Férias, carro, casa, etc.'},
        ]},
        { key:'meta_mensal', type:'radio', label:'Meta de ganhos mensais', options:[
          {val:'<100', label:'Menos de 100€/mês', sub:'Um complemento simbólico'},
          {val:'100-300', label:'100 – 300€/mês', sub:'Renda extra relevante'},
          {val:'300-600', label:'300 – 600€/mês', sub:'Part-time a sério'},
          {val:'600+', label:'600€+/mês', sub:'Substituição total ou quase'},
        ]},
        { key:'urgencia', type:'radio', label:'Urgência', options:[
          {val:'agora', label:'Preciso de ganhar já', sub:'Esta semana ou no próximo mês'},
          {val:'medio', label:'A médio prazo', sub:'Nos próximos 2–3 meses'},
          {val:'longo', label:'Explorar sem pressão', sub:'Sem prazo definido'},
        ]}
      ]
    },
    {
      id:'s6', label:'6 / 6',
      title:'Preferências e detalhes finais',
      sub:'Última etapa — personaliza ao máximo o teu plano.',
      fields:[
        { key:'prefs', type:'chips', label:'Preferes trabalhar em... (seleciona todas)', options:['📝 Inquéritos & Surveys','🕵️ Cliente Mistério','🚗 Entregas & Condução','🧑‍🏫 Ensino & Skills','🎨 Conteúdo & Criativo','🛠️ Biscates & Eventos','🫶 Caregiving (Pet / Babysitting)','🤝 Trabalho Presencial','🩺 Clínica & Investigação','🫶 Angariação de Fundos','💰 Rendimento Passivo','🎧 Atendimento & Suporte'] },
        { key:'pagamento', type:'chips', label:'Métodos de pagamento que tens disponíveis', options:['📱 MB Way','🅿️ PayPal','💳 Revolut','🏦 Transferência bancária','₿ Crypto'] },
        { key:'notas', type:'textarea', label:'Algo mais que queiras partilhar?', optional:true, placeholder:'Ex: tenho disponibilidade só ao fim de semana, tenho experiência em X, quero evitar Y…' }
      ]
    }
  ],
  en: [
    {
      id:'s1', label:'1 / 6',
      title:'Where are you and how do you work?',
      sub:'Start with your context — takes less than 1 minute.',
      fields:[
        { key:'pais', type:'select', label:'Country of residence', placeholder:'Select…', options:['🇵🇹 Portugal','🇧🇷 Brazil','🇪🇸 Spain','🇬🇧 United Kingdom','🌍 Other'] },
        { key:'idade', type:'chips1', label:'Age', options:['18–24','25–34','35–44','45–54','55+'] },
        { key:'dispositivo', type:'chips1', label:'You mainly work on...', options:['💻 Computer','📱 Mobile','💻 + 📱 Both'] }
      ]
    },
    {
      id:'s2', label:'2 / 6',
      title:'Availability and languages',
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
        ]},
        { key:'outros_idiomas', type:'chips', label:'Other languages you speak (optional)', optional:true, options:['🇪🇸 Spanish','🇫🇷 French','🇩🇪 German','🇮🇹 Italian','🌍 Other'] }
      ]
    },
    {
      id:'s3', label:'3 / 6',
      title:'Your current situation',
      sub:'Helps us personalise recommendations even further.',
      fields:[
        { key:'situacao', type:'radio', label:'Professional situation', options:[
          {val:'empregado', label:'Full-time employed', sub:'Looking for extra income alongside my job'},
          {val:'empregado_part', label:'Part-time employed', sub:'I have some hours available'},
          {val:'desempregado', label:'Unemployed / Job-seeking', sub:'I need income urgently'},
          {val:'estudante', label:'Student', sub:'Gig work to fit around my schedule'},
          {val:'freelancer', label:'Freelancer / Self-employed', sub:'Already working independently'},
          {val:'reformado', label:'Retired / Other', sub:'Time available, looking for a supplement'},
        ]},
        { key:'viatura', type:'chips1', label:'Do you have a vehicle available?', options:['🚗 Car','🛵 Motorbike / Scooter','🚲 Bicycle','❌ None'] },
        { key:'nif', type:'chips1', label:'Do you have an active tax ID (NIF / VAT)?', options:['✅ Yes','❌ No','🔄 In progress'] }
      ]
    },
    {
      id:'s4', label:'4 / 6',
      title:'Experience and skills',
      sub:'Select everything that applies to you.',
      fields:[
        { key:'experiencia', type:'radio', label:'Experience with gig platforms', options:[
          {val:'zero', label:'Complete beginner', sub:'Never used any platform'},
          {val:'some', label:'Tried a few', sub:'Used 1–3 platforms, not consistent'},
          {val:'regular', label:'Use them regularly', sub:'I have a routine with 3+ platforms'},
          {val:'pro', label:'Experienced', sub:'It is part of my current income'},
        ]},
        { key:'skills', type:'chips', label:'Your skills (select all that apply)', options:['✍️ Writing','💻 Coding','🎨 Design','🗣️ Languages','📱 Social Media','📣 Marketing','📸 Photo / Video','🔢 Excel / Data','🎵 Music / Audio','🧑‍🍳 Cooking / Events','🐾 Pet care','👶 Childcare','None in particular'] }
      ]
    },
    {
      id:'s5', label:'5 / 6',
      title:'Goals and earnings',
      sub:'What do you expect to achieve — we will be realistic with you.',
      fields:[
        { key:'objetivo', type:'radio', label:'Your main goal', options:[
          {val:'extra', label:'Extra income', sub:'€100–400/month alongside a job'},
          {val:'main', label:'Replace my job', sub:'I want to live from this eventually'},
          {val:'explore', label:'Explore and learn', sub:'No pressure, just want to discover'},
          {val:'save', label:'Save for something specific', sub:'Holiday, car, house, etc.'},
        ]},
        { key:'meta_mensal', type:'radio', label:'Monthly earnings target', options:[
          {val:'<100', label:'Less than €100/month', sub:'A symbolic supplement'},
          {val:'100-300', label:'€100 – €300/month', sub:'Meaningful extra income'},
          {val:'300-600', label:'€300 – €600/month', sub:'Serious part-time'},
          {val:'600+', label:'€600+/month', sub:'Full or near-full replacement'},
        ]},
        { key:'urgencia', type:'radio', label:'Urgency', options:[
          {val:'agora', label:'I need to earn now', sub:'This week or next month'},
          {val:'medio', label:'Medium term', sub:'Over the next 2–3 months'},
          {val:'longo', label:'No rush', sub:'No fixed deadline'},
        ]}
      ]
    },
    {
      id:'s6', label:'6 / 6',
      title:'Preferences and final details',
      sub:'Last step — maximise your personalised plan.',
      fields:[
        { key:'prefs', type:'chips', label:'You prefer to work in... (select all)', options:['📝 Surveys & Microtasks','🕵️ Mystery Shopping','🚗 Deliveries & Driving','🧑‍🏫 Teaching & Skills','🎨 Content & Creative','🛠️ Gigs & Events','🫶 Caregiving (Pet / Babysitting)','🤝 In-Person Work','🩺 Clinical & Research','🫶 Fundraising','💰 Passive Income','🎧 Customer Support'] },
        { key:'pagamento', type:'chips', label:'Payment methods you have available', options:['📱 MB Way','🅿️ PayPal','💳 Revolut','🏦 Bank transfer','₿ Crypto'] },
        { key:'notas', type:'textarea', label:'Anything else you would like to share?', optional:true, placeholder:'E.g. only available on weekends, experience in X, want to avoid Y…' }
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
  _openModalTrapped('boostFormModal');
  renderBoostStep();
}

function renderBoostStep(){
  if(boostStep < 0 || boostStep >= boostSteps.length) return;
  const step = boostSteps[boostStep];
  const pct = ((boostStep + 1) / boostSteps.length) * 100;
  const isLast = boostStep === boostSteps.length - 1;

  let fieldsHtml = step.fields.map(f => {
    if(f.type === 'select'){
      const val = boostAnswers[f.key] || '';
      return `<div class="boost-field">
        <label class="boost-label">${escHtml(f.label)}</label>
        <select class="boost-select" data-key="${f.key}">
          <option value="">${f.placeholder||(currentLang==='en'?'Select…':'Seleciona…')}</option>
          ${f.options.map(o=>`<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>`;
    }
    if(f.type === 'radio'){
      const val = boostAnswers[f.key] || '';
      return `<div class="boost-field">
        <label class="boost-label">${escHtml(f.label)}</label>
        <div class="boost-radio-group">
          ${f.options.map(o=>`
          <div class="boost-radio ${val===o.val?'selected':''}" data-key="${f.key}" data-val="${o.val}">
            <div class="boost-radio-dot"></div>
            <div class="boost-radio-text">
              <div class="boost-radio-label">${escHtml(o.label)}</div>
              ${o.sub?`<div class="boost-radio-sub">${escHtml(o.sub)}</div>`:''}
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }
    if(f.type === 'chips' || f.type === 'chips1'){
      const sel = boostAnswers[f.key] || (f.type==='chips'?[]:'');
      const multi = f.type === 'chips';
      return `<div class="boost-field">
        <label class="boost-label">${escHtml(f.label)}${multi?` <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--grey)">${currentLang==='en'?'(select multiple)':'(escolhe várias)'}</span>`:''}</label>
        <div class="boost-chips">
          ${f.options.map(o=>{
            const isSelected = multi ? (Array.isArray(sel) && sel.includes(o)) : sel===o;
            return `<div class="boost-chip ${isSelected?'selected':''}" data-field="${escHtml(f.key)}" data-val="${escHtml(o)}" data-multi="${multi}">${escHtml(o)}</div>`;
          }).join('')}
        </div>
      </div>`;
    }
    if(f.type === 'textarea'){
      const val = boostAnswers[f.key] || '';
      const optLabel = f.optional ? ` <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--grey)">${currentLang==='en'?'(optional)':'(opcional)'}</span>` : '';
      return `<div class="boost-field">
        <label class="boost-label">${escHtml(f.label)}${optLabel}</label>
        <textarea class="boost-textarea" data-key="${escHtml(f.key)}" placeholder="${escHtml(f.placeholder||'')}" rows="3" maxlength="1000" style="width:100%;background:var(--cream);border:1.5px solid var(--border-md);border-radius:10px;color:var(--ink);font-family:'Instrument Sans',sans-serif;font-size:14px;padding:12px 14px;outline:none;resize:vertical;transition:border-color .15s;line-height:1.5;min-height:80px;max-height:300px">${escHtml(val)}</textarea>
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
    <div class="boost-step-title" id="boostFormTitle">${step.title}</div>
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
  ['pais'],               // step 1: country minimum
  ['horas','ingles'],     // step 2: hours + english level
  ['situacao'],           // step 3: professional situation
  ['experiencia'],        // step 4: experience level
  ['objetivo','meta_mensal','urgencia'], // step 5: goals + target + urgency
  [],                     // step 6: all optional (prefs, pagamento, notas)
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
  if(boostStep < boostSteps.length - 1) boostStep++;
  renderBoostStep();
}

function boostBack(){
  if(boostStep > 0){ boostStep--; renderBoostStep(); }
}

// ── AI ANALYSIS ──
function _sanitize(s){ 
  if(!s) return ''; 
  // Truncate first to prevent ReDoS on large inputs
  const raw = String(s).substring(0, 600);
  // Strip null bytes and HTML tags, then dangerous characters
  const str = raw.replace(/\0/g,'').replace(/<[^>]*>?/g,'').replace(/[&<>"'\\`]/g,'').trim();
  // Block suspicious patterns (XSS, injection, prompt injection, JS proto attacks)
  if(/javascript:|onclick|onerror|eval\s*\(|document\.|window\.|vbscript:|data:text|__proto__|constructor\s*\[|prototype\s*\[|Object\.prototype/i.test(str)) return '';
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
    const _brlRaw = localStorage.getItem('gh_boost_rl');
    let _brl = { c: 0, t: 0 };
    try {
      const _parsed = JSON.parse(_brlRaw || '{}');
      if(_parsed && typeof _parsed.c === 'number' && typeof _parsed.t === 'number' && isFinite(_parsed.c) && isFinite(_parsed.t)) {
        _brl = _parsed;
      }
    } catch(_) {}
    const _now = Date.now();
    if(_now - _brl.t > 86400000){ _brl.c = 0; _brl.t = _now; }
    if(_brl.c >= 3){
      _boostShowError(currentLang==='en'?'Too many requests. Please try again tomorrow.':'Demasiados pedidos. Tenta novamente amanhã.');
      return;
    }
    _brl.c = Math.min((_brl.c || 0) + 1, 99); localStorage.setItem('gh_boost_rl', JSON.stringify(_brl));
  } catch(e) {}
  if(Object.keys(boostAnswers).length === 0) {
    _boostShowError(currentLang==='en'?'Please fill in at least one field.':'Por favor preenche pelo menos um campo.');
    return;
  }
  const isEn = currentLang === 'en';
  const a = Object.fromEntries(Object.entries(boostAnswers).map(([k,v])=>[k, Array.isArray(v)?v.map(_sanitize):_sanitize(v)]));
  const skills = Array.isArray(a.skills) ? a.skills.join(', ') : (a.skills||'');
  const prefs = Array.isArray(a.prefs) ? a.prefs.join(', ') : (a.prefs||'');
  const outrosIdiomas = Array.isArray(a.outros_idiomas) ? a.outros_idiomas.join(', ') : (a.outros_idiomas||'');
  const pagamento = Array.isArray(a.pagamento) ? a.pagamento.join(', ') : (a.pagamento||'');
  const msg = encodeURIComponent(
    `GigBoost — Novo perfil 🚀\n\n` +
    `País: ${a.pais||'-'}\nIdade: ${a.idade||'-'}\nDispositivo: ${a.dispositivo||'-'}\n` +
    `Horas/semana: ${a.horas||'-'}\nInglês: ${a.ingles||'-'}\nOutros idiomas: ${outrosIdiomas||'-'}\n` +
    `Situação profissional: ${a.situacao||'-'}\nViatura: ${a.viatura||'-'}\nNIF ativo: ${a.nif||'-'}\n` +
    `Experiência: ${a.experiencia||'-'}\nSkills: ${skills||'-'}\n` +
    `Objetivo: ${a.objetivo||'-'}\nMeta mensal: ${a.meta_mensal||'-'}\nUrgência: ${a.urgencia||'-'}\n` +
    `Preferências: ${prefs||'-'}\nPagamento: ${pagamento||'-'}\nNotas: ${a.notas||'-'}`
  );
  try { sessionStorage.setItem('gh_boost_submitted', '1'); } catch(_) {}
  const subjectLine = isEn ? 'GigBoost Profile' : 'Perfil GigBoost';
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

// Highlight search matches in text (already escaped)
function _highlightMatch(escapedText, query) {
  if(!query || query.length < 2) return escapedText;
  try {
    const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
    return escapedText.replace(re, '<mark class="search-highlight">$1</mark>');
  } catch(e) { return escapedText; }
}
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


// ── Platforms that must NEVER appear in the listing ──────────────────────────
// Blocking is now handled server-side via is_active=false in the DB.
// This set is kept as an empty defence-in-depth fallback only.
const _BLOCKED_PLATFORMS = new Set(['Marktest', 'Multidados']);

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
  'iVidador': {
    desc: 'A compensação económica por doar sémen situa-se entre os 780€ e os 1.040€. O processo dura entre 15 a 20 semanas, o que dá aproximadamente uma quantia de 52€ por semana.',
    descEn: 'Sperm donation programme at IVI Lisboa clinic. Confidential process with prior medical screening. Compensation is legally stipulated and quite low — suited for those who want to help others start a family, rather than as an income source.',
  },
  'SalvaMais': {
    desc: 'Plataforma de recrutamento de nadadores-salvadores para praias e piscinas em Portugal. É obrigatório ter cartão de nadador-salvador válido (emitido pela FPN ou Cruz Vermelha). Trabalho sazonal bem remunerado, com maior procura no verão.',
    descEn: 'Lifeguard recruitment platform for beaches and swimming pools in Portugal. A valid lifeguard certificate (issued by FPN or Red Cross) is required. Well-paid seasonal work, with peak demand in summer.',
  },
  'iVidoa': {
    desc: 'Programa de doação de óvulos da Clínica IVI Lisboa. Portugal paga uma compensação estipulada por lei (cerca de €900+), mas o processo envolve semanas de injeções diárias de hormonas e uma cirurgia de extração sob sedação. Pesa bem antes de decidir.',
    descEn: 'Egg donation programme at IVI Lisboa clinic. Portugal pays a legally stipulated compensation (around €900+), but the process involves weeks of daily hormone injections and an extraction procedure under sedation. Consider carefully before deciding.',
  },
  'Campanha do Tomate Portugal': {
    desc: 'Trabalho agrícola braçal sazonal no Ribatejo durante o verão — colheita de tomate debaixo de 40°C, ou turnos de 12 horas em linha de produção numa fábrica da Guloso/Compal. Trabalho físico intenso, mas com contrato e alojamento frequentemente incluído.',
    descEn: 'Seasonal manual agricultural work in Ribatejo during summer — tomato harvesting in 40°C heat, or 12-hour factory shifts at Guloso/Compal. Physically demanding, but with a contract and accommodation often included.',
  },
  'Ava Clinic': {
    desc: 'Clínica especializada em doação de esperma e óvulos em Portugal. Dadores de esperma recebem compensação por deslocação; dadoras de óvulos recebem compensação estipulada por lei. Ambos os processos incluem triagem médica prévia.',
    descEn: 'Clinic specialising in sperm and egg donation in Portugal. Sperm donors receive compensation for travel; egg donors receive legally stipulated compensation. Both processes include prior medical screening.',
  },

};


// _DESC_PATCH, _URL_OVERRIDES, _CAT_OVERRIDES, _ICON_OVERRIDES, _NAME_OVERRIDES removed.
// All platform data (name, url, icon, cat, description) is now canonical in Supabase.


// ── _ALLOWED_PLATFORMS removed — filtering now done server-side in Supabase.
// All rows returned by unlock_with_token RPC are authorised. ──────────────────

// Conjunto de categorias válidas — qualquer cat fora desta lista é "órfã"
// (aparece em "Todas" mas não em nenhuma tab de categoria).
const _VALID_CATS = new Set([
  'surveys','tasks','testing','micro',
  'mystery',
  'gigs',
  'freelance','tutoring','transcricao','remote',
  'criativo','conteudo','ugc',
  'petsitting','babysitting',
  'f2f','clinical','retail','passive','support',
]);

function _fmt(r){
  // Blocklist: safety net for any platform that should never appear
  if(_BLOCKED_PLATFORMS.has(r.name)) return null;
  // Orphan category guard — if cat is null/unknown, fallback to 'gigs' and warn
  if(!r.cat || !_VALID_CATS.has(r.cat)) {
    console.error('[GigHub] Plataforma órfã — categoria inválida/nula:', r.name, '| cat:', JSON.stringify(r.cat));
    r = Object.assign({}, r, { cat: 'gigs' });
  }
  const ov = _REDUCED_EXPECTATIONS[r.name];
  const isDimmed = r.dimmed || false;
  const basePt = (ov && ov.desc)   ? ov.desc   : (r.description||'');
  const baseEn = (ov && ov.descEn) ? ov.descEn : (r.desc_en||'');
  return {
    name:    r.name,
    cat:     r.cat,
    icon:    r.icon,
    desc:    basePt,
    descEn:  baseEn,
    earn:    r.earn||'',
    earnN:   (r.earn_n != null && r.earn_n > 0) ? r.earn_n : (_EARN_N_DEFAULT[r.cat]||5),
    minPay:  r.min_pay||'Variável',
    url:     r.url||'',
    easy:    r.easy||3,
    dimmed:  isDimmed,
    beginner:       r.beginner       || false,
    earnings_type:  r.earnings_type  || null,
    tier:           r.tier           || null,
    suggested:      r.suggested      || false,
    direct_hire:    r.direct_hire    || false,
    is_delivery:    r.is_delivery    || false,
    no_curation_tag:r.no_curation_tag|| false,
    work_type:      r.work_type      || null,
  };
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
    const _rl = (() => { try { const v = JSON.parse(localStorage.getItem('gh_rl')||'{"c":0,"t":0}'); return (v && typeof v.c==='number' && typeof v.t==='number') ? v : {c:0,t:0}; } catch(e){ return {c:0,t:0}; } })();
    const now = Date.now();
    if(now - _rl.t > 3600000){ _rl.c = 0; _rl.t = now; }
    if(_rl.c >= 5){
      const wait = Math.ceil((3600000-(now-_rl.t))/60000);
      if(lockErr) lockErr.textContent = currentLang==='en'
        ? `Too many attempts. Try again in ${wait} min.`
        : `Demasiadas tentativas. Tenta em ${wait} min.`;
      return;
    }
    _rl.c++; localStorage.setItem('gh_rl', JSON.stringify(_rl));
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
      console.error('[GigHub] Token validation failed');
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
        try { localStorage.removeItem('gh_cached_token'); } catch(e) {}
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
    // Re-sync favs from localStorage now that auth is confirmed — ensures count is fresh
    // even if the page was opened before any favourites were added in a prior session.
    try {
      const _lsFavs = JSON.parse(localStorage.getItem('gh_favs') || '[]');
      const _ckFavs = _loadFavsCookie();
      const _lsOk = Array.isArray(_lsFavs) && _lsFavs.length > 0;
      const _ckOk = Array.isArray(_ckFavs) && _ckFavs.length > 0;
      let _storedFavs;
      if(_lsOk && _ckOk) {
        _storedFavs = [...new Set([..._lsFavs, ..._ckFavs])];
      } else if(_lsOk) {
        _storedFavs = _lsFavs;
      } else if(_ckOk) {
        _storedFavs = _ckFavs;
        try { localStorage.setItem('gh_favs', JSON.stringify(_storedFavs)); } catch(e) {}
      } else {
        _storedFavs = [];
      }
      if(Array.isArray(_storedFavs)) {
        favs = _storedFavs.filter(x => typeof x === 'string' && x.length < 200);
        const _fcEl = document.getElementById('favCount');
        if(_fcEl) _fcEl.textContent = favs.length;
      }
    } catch(_) {}
    // Cache token so the user is auto-logged in on next visit (persists across sessions)
    try { localStorage.setItem('gh_cached_token', token.trim()); } catch(e) {}
    _sessionToken = token.trim(); // keep in memory for server favorites sync
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
    localStorage.removeItem('gh_rl');
    
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
      // Re-render cat explorer now that P is filled (ensures static platforms without DB match still show)
      setTimeout(() => { if(typeof renderCatExplorer === 'function') renderCatExplorer(); }, 100);
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
    // Show keyboard hint button in footer (desktop only hint)
    // navCanaisLink is always visible (no show needed)
    if(lockErr) lockErr.textContent = '';
    const ls = document.getElementById('lockScreen');
    if(ls) { ls.classList.add('unlocked'); setTimeout(() => { ls.style.display='none'; }, 600); }
    document.body.style.overflow = 'auto';
    if(typeof render === 'function') render();
    // Load server-side favorites (fire-and-forget — won't block the UI)
    _loadServerFavs(token.trim());
    // Show GDPR notice now that the user has unlocked access
    setTimeout(() => { if(typeof window._showGdprNotice === 'function') window._showGdprNotice(); }, 800);
    // Move focus to main content for screen reader users
    setTimeout(() => { const h1 = document.querySelector('.hero h1'); if(h1) { h1.setAttribute('tabindex','-1'); h1.focus(); } }, 650);
    // Trigger scroll reveal animations (guide cards, tip box)
    setTimeout(() => { if(typeof window._observeScrollReveal === 'function') window._observeScrollReveal(); }, 700);
    if(!localStorage.getItem('gh_welcomed')) {
      localStorage.setItem('gh_welcomed','1');
      _openModalTrapped('welcomeModal');
      if(typeof applyLang==='function') applyLang();
    }
    return true;
  } catch(e) {
    console.error('[GigHub] Unexpected auth error');
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
  // Sanitise: strip control chars, whitespace, and HTML/injection-relevant chars
  // Preserves alphanumeric, dash, underscore, and special chars valid in tokens
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
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">Não usamos cookies de rastreamento nem ferramentas de analytics de terceiros. O acesso é gerido por tokens únicos sem identificação pessoal; os tokens de acesso são verificados em tempo real via Supabase e <strong>guardados localmente para restauração automática de sessão</strong>. O localStorage é usado exclusivamente para preferências locais (idioma, favoritos, token de sessão, confirmação do aviso RGPD). As fontes tipográficas são carregadas a partir do serviço Google Fonts, o que implica uma ligação aos servidores da Google. Consulta a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Política de Privacidade da Google</a>.</p>
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
<p style="font-size:13px;color:var(--grey);line-height:1.7;margin-bottom:12px">We do not use advertising trackers or invasive third-party analytics tools. Access is managed by unique tokens without personal identification; access tokens are verified in real-time via Supabase and <strong>stored locally for automatic session restoration</strong>. localStorage is used exclusively for local preferences (language, favourites, session token, GDPR notice acknowledgement). Typefaces are loaded from Google Fonts, which involves a connection to Google's servers. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Google's Privacy Policy</a>.</p>
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
  _openModalTrapped('legalModal');
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



// ── Session timeout — global scope so validarTokenSupabase can call it ──
let _sessionTimeoutInterval = null;
function _startSessionTimeout(){
  if(_sessionTimeoutInterval) return; // prevent double-start
  let _lastActivity = Date.now();
  let _timeoutWarned = false;
  let _activityThrottle = null;
  const _updateActivity = () => { _lastActivity = Date.now(); _timeoutWarned = false; };
  const _kdownActivity = () => {
    if(_activityThrottle) return;
    _activityThrottle = setTimeout(()=>{ _updateActivity(); _activityThrottle=null; }, 5000);
  };
  document.addEventListener('click', _updateActivity);
  document.addEventListener('keydown', _kdownActivity);
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
  // Warn at 110 min (10 min before 2h timeout = 120 min)
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
      _sessionToken = null; // clear in-memory token on session expiry
      _sessionTimeoutInterval = null;
      if(_saveFavsTimer) { clearTimeout(_saveFavsTimer); _saveFavsTimer = null; }
      document.removeEventListener('click', _updateActivity);
      document.removeEventListener('keydown', _kdownActivity);
      if(_activityThrottle) { clearTimeout(_activityThrottle); _activityThrottle = null; }
      setTimeout(() => location.reload(), 2000);
    }
  }, 60000);
}

// ── MODAL FOCUS TRAP ─────────────────────────────────────────────────────────
// Keeps keyboard focus inside an open modal. Returns a cleanup function.
function _trapFocus(modalEl) {
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const getFocusable = () => Array.from(modalEl.querySelectorAll(FOCUSABLE)).filter(el => !el.closest('[style*="display:none"]'));
  function _handler(e) {
    if(e.key !== 'Tab') return;
    const items = getFocusable();
    if(!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if(e.shiftKey) {
      if(document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if(document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  modalEl.addEventListener('keydown', _handler);
  const items = getFocusable();
  if(items.length) setTimeout(() => items[0].focus(), 50);
  return () => modalEl.removeEventListener('keydown', _handler);
}
const _trapCleanups = {};
const _trapPrevFocus = {};
function _openModalTrapped(id) {
  const el = document.getElementById(id);
  if(!el) return;
  _trapPrevFocus[id] = document.activeElement; // save focus for restoration
  el.style.display = 'flex';
  if(_trapCleanups[id]) _trapCleanups[id]();
  _trapCleanups[id] = _trapFocus(el);
}
function _closeModalTrapped(id) {
  const el = document.getElementById(id);
  if(!el) return;
  el.style.display = 'none';
  if(_trapCleanups[id]) { _trapCleanups[id](); delete _trapCleanups[id]; }
  // Restore focus to the element that opened the modal
  const prev = _trapPrevFocus[id];
  if(prev && typeof prev.focus === 'function') { try { prev.focus(); } catch(e) {} }
  delete _trapPrevFocus[id];
}
// ─────────────────────────────────────────────────────────────────────────────

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
  // Hero search button → focus catSearch
  const heroSearchBtn = document.getElementById('heroSearchBtn');
  if(heroSearchBtn) heroSearchBtn.addEventListener('click', () => {
    const cs = document.getElementById('catSearch');
    if(cs) { cs.focus(); cs.select(); cs.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
  });
  const calcIconBtn = document.getElementById('calcIconBtn');
  if(calcIconBtn) calcIconBtn.addEventListener('click', openCalc);
  const boostNavBtn = document.getElementById('boostNavBtn');
  if(boostNavBtn) boostNavBtn.addEventListener('click', openBoostPay);

  // ── Calculator inputs ──
  const hoursRangeEl = document.getElementById('hoursRange');
  if(hoursRangeEl) hoursRangeEl.addEventListener('input', () => {
    hoursRangeEl.setAttribute('aria-valuenow', hoursRangeEl.value);
    calcEarnings();
  });
  const calcTypeEl = document.getElementById('calcType');
  if(calcTypeEl) calcTypeEl.addEventListener('change', calcEarnings);

  // ── Modal close buttons ──
  const calcModalCloseBtn = document.getElementById('calcModalCloseBtn');
  if(calcModalCloseBtn) calcModalCloseBtn.addEventListener('click', () => _closeModalTrapped('calcModal'));
  const welcomeCloseBtn = document.getElementById('welcomeCloseBtn');
  if(welcomeCloseBtn) welcomeCloseBtn.addEventListener('click', () => _closeModalTrapped('welcomeModal'));
  const boostCtaEl = document.getElementById('boostCtaEl');
  if(boostCtaEl) boostCtaEl.addEventListener('click', () => { _closeModalTrapped('welcomeModal'); openBoostPay(); });
  const boostPayModalCloseBtn = document.getElementById('boostPayModalCloseBtn');
  if(boostPayModalCloseBtn) boostPayModalCloseBtn.addEventListener('click', () => _closeModalTrapped('boostPayModal'));
  const legalModalCloseBtn = document.getElementById('legalModalCloseBtn');
  if(legalModalCloseBtn) legalModalCloseBtn.addEventListener('click', () => _closeModalTrapped('legalModal'));

  // ── Backdrop click closes modals ──
  ['welcomeModal','calcModal','boostPayModal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', e => { if(e.target === el) _closeModalTrapped(id); });
  });
  const legalModal = document.getElementById('legalModal');
  if(legalModal) legalModal.addEventListener('click', e => { if(e.target === legalModal) _closeModalTrapped('legalModal'); });

  // ── Escape key closes any open modal ──
  document.addEventListener('keydown', function(e) {
    if(e.key !== 'Escape') return;
    const modals = ['calcModal','welcomeModal','legalModal','boostPayModal','boostFormModal'];
    for(const id of modals) {
      const el = document.getElementById(id);
      if(el && el.style.display !== 'none' && el.style.display !== '') {
        _closeModalTrapped(id);
        return;
      }
    }
  });

  // ── Legal modal data-modal delegation ──
  document.addEventListener('click', function(e) {
    const link = e.target.closest('[data-modal]');
    if(link) { e.preventDefault(); openLegalModal(link.dataset.modal); return; }
  });

  // ── Back to top ──
  const backToTop = document.getElementById('backToTop');
  if(backToTop) backToTop.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
  const navLogo = document.getElementById('navLogo');
  if(navLogo) {
    navLogo.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
    navLogo.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});} });
  }

  // ── Back to top scroll show/hide ──
  window.addEventListener('scroll', function(){
    const btn = document.getElementById('backToTop');
    if(!btn) return;
    btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
  }, {passive:true});

  // ── Favorites export button ──
  const favExportBtn = document.getElementById('favExportBtn');
  if(favExportBtn) favExportBtn.addEventListener('click', () => {
    const isEn = currentLang === 'en';
    if(!favs.length) return;
    const bookmarkUrl = _getFavsBookmarkUrl();
    const _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(12,12,13,.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px';
    const _box = document.createElement('div');
    _box.style.cssText = 'background:var(--paper);border-radius:16px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 8px 40px rgba(12,12,13,.18)';
    const nameList = favs.map(n => '• ' + n).join('\n');
    _box.innerHTML = `
      <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:900;letter-spacing:-.4px;margin-bottom:6px">
        ${isEn ? '⭐ My Favourites' : '⭐ Os Meus Favoritos'}
      </div>
      <div style="font-size:12px;color:var(--grey);margin-bottom:14px">
        ${isEn ? favs.length + ' platforms saved' : favs.length + ' plataformas guardadas'}
      </div>
      <textarea id="_favListTextarea" readonly style="width:100%;height:130px;background:var(--cream);border:1px solid var(--border-md);border-radius:10px;color:var(--ink);font-family:'Instrument Sans',sans-serif;font-size:12px;padding:12px 14px;resize:none;outline:none;line-height:1.7"></textarea>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="_favCopyListBtn" style="flex:1;height:40px;border-radius:10px;border:1px solid var(--border-md);background:transparent;color:var(--ink);font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer">
          📋 ${escHtml(isEn ? 'Copy list' : 'Copiar lista')}
        </button>
        <button id="_favExportCloseBtn" style="height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--border-md);background:transparent;color:var(--grey);font-family:'Instrument Sans',sans-serif;font-size:13px;cursor:pointer">✕</button>
      </div>`;
    const _favTa = _box.querySelector('#_favListTextarea');
    if(_favTa) _favTa.value = nameList;
    _overlay.appendChild(_box);
    document.body.appendChild(_overlay);
    _overlay.querySelector('#_favCopyListBtn').addEventListener('click', function() {
      navigator.clipboard.writeText(nameList).catch(()=>{});
      this.textContent = isEn ? '✓ Copied!' : '✓ Copiado!';
      this.style.color = 'var(--green)';
    });
    const _close = () => { if(_overlay.parentNode) _overlay.remove(); };
    _overlay.querySelector('#_favExportCloseBtn').addEventListener('click', _close);
    _overlay.addEventListener('click', e => { if(e.target === _overlay) _close(); });
    document.addEventListener('keydown', function _esc(e) { if(e.key==='Escape'){_close();document.removeEventListener('keydown',_esc);} });
  });

  // ── Boost form close on backdrop click ──
  const boostFormModal = document.getElementById('boostFormModal');
  if(boostFormModal) boostFormModal.addEventListener('click', e => { if(e.target === boostFormModal) _closeModalTrapped('boostFormModal'); });

  // ── PWA install ──
  (function(){
    let _deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredPrompt = e;
      const btn = document.getElementById('pwaInstallBtn');
      if(btn) btn.style.display = 'inline-flex';
    });
    window.addEventListener('appinstalled', () => {
      _deferredPrompt = null;
      const btn = document.getElementById('pwaInstallBtn');
      if(btn) btn.style.display = 'none';
      _showToast('🎉 GigHub instalado com sucesso!');
    });
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#pwaInstallBtn');
      if(!btn || !_deferredPrompt) return;
      _deferredPrompt.prompt();
      const { outcome } = await _deferredPrompt.userChoice;
      _deferredPrompt = null;
      if(outcome === 'accepted') btn.style.display = 'none';
    });
  })();

  // ── GDPR notice ──
  (function(){
    try {
      const noticeEl = document.getElementById('gdprNotice');
      const okBtn = document.getElementById('gdprOkBtn');
      const textEl = document.getElementById('gdprText');
      if(!noticeEl) return;
      const _ls = document.getElementById('lockScreen');
      if(_ls && !_ls.classList.contains('unlocked')) noticeEl.classList.add('hidden');
      if(localStorage.getItem('gh_gdpr_ok')) { noticeEl.classList.add('hidden'); return; }
      function _updateGdprText(){
        if(textEl){
          textEl.innerHTML = currentLang === 'en'
            ? 'This site uses localStorage for preferences (language, favourites, session token) — no tracking cookies or third-party analytics. <a href="#" data-modal="privacy">Privacy Policy</a>'
            : 'Este site usa localStorage para preferências locais (idioma, favoritos, token de sessão) — sem cookies de rastreamento nem analytics de terceiros. <a href="#" data-modal="privacy">Política de Privacidade</a>';
        }
        if(okBtn) okBtn.textContent = currentLang === 'en' ? 'OK, got it' : 'OK, entendi';
      }
      _updateGdprText();
      window._updateGdprText = _updateGdprText;
      if(okBtn) {
        okBtn.addEventListener('click', function(){
          try { localStorage.setItem('gh_gdpr_ok','1'); } catch(e){}
          noticeEl.classList.add('hidden');
          setTimeout(() => { noticeEl.style.display = 'none'; }, 350);
          window.dispatchEvent(new Event('scroll'));
        });
      }
      window._showGdprNotice = function(){
        if(localStorage.getItem('gh_gdpr_ok')) return;
        _updateGdprText();
        noticeEl.classList.remove('hidden');
      };
    } catch(e) {}
  })();

  // ── Boost token validation ──
  const boostOpenFormBtn = document.getElementById('boostOpenFormBtn');
  if(boostOpenFormBtn) boostOpenFormBtn.addEventListener('click', async function() {
    const tokenInput = document.getElementById('boostTokenInput');
    const tokenErr = document.getElementById('boostTokenErr');
    const raw = tokenInput ? tokenInput.value.trim().toUpperCase().replace(/[^A-Z0-9\-]/g,'').substring(0,20) : '';
    if(!raw || raw.length < 4) {
      if(tokenErr) tokenErr.textContent = currentLang==='en' ? 'Please enter your GigBoost code.' : 'Insere o teu código GigBoost.';
      return;
    }
    boostOpenFormBtn.disabled = true;
    if(tokenInput) tokenInput.disabled = true;
    boostOpenFormBtn.textContent = currentLang==='en' ? 'Verifying…' : 'A verificar…';
    if(tokenErr) tokenErr.textContent = '';
    try {
      const { data, error } = await _SB.rpc('validate_boost_token', { p_token: raw });
      if(error || !data || data.valid === false) {
        if(tokenErr) tokenErr.textContent = currentLang==='en'
          ? (translations.en.boostCodeErr || 'Invalid or already used access key.')
          : (translations.pt.boostCodeErr || 'Chave inválida ou já utilizada.');
        boostOpenFormBtn.disabled = false;
        if(tokenInput) tokenInput.disabled = false;
        boostOpenFormBtn.textContent = currentLang==='en' ? 'Verify code and fill profile →' : 'Verificar código e preencher perfil →';
        return;
      }
    } catch(e) {
      if(tokenErr) tokenErr.textContent = currentLang==='en' ? 'Connection error. Please try again.' : 'Erro de ligação. Tenta novamente.';
      boostOpenFormBtn.disabled = false;
      if(tokenInput) tokenInput.disabled = false;
      boostOpenFormBtn.textContent = currentLang==='en' ? 'Verify code and fill profile →' : 'Verificar código e preencher perfil →';
      return;
    }
    _closeModalTrapped('boostPayModal');
    openBoostForm();
    boostOpenFormBtn.disabled = false;
    if(tokenInput) tokenInput.disabled = false;
    boostOpenFormBtn.textContent = currentLang==='en' ? 'Verify code and fill profile →' : 'Verificar código e preencher perfil →';
  });

  // ── GigBoost form delegation ──
  const boostFormBox = document.getElementById('boostFormBox');
  if(boostFormBox){
    boostFormBox.addEventListener('change', function(e) {
      const sel = e.target.closest('select.boost-select');
      if(sel) { boostAnswers[sel.dataset.key] = sel.value; boostCheckNext(); }
      const ta = e.target.closest('textarea.boost-textarea');
      if(ta) { boostAnswers[ta.dataset.key] = ta.value.trim().substring(0, 1000); boostCheckNext(); }
    });
    boostFormBox.addEventListener('input', function(e) {
      const ta = e.target.closest('textarea.boost-textarea');
      if(ta) { boostAnswers[ta.dataset.key] = ta.value.trim().substring(0, 1000); }
    });
    boostFormBox.addEventListener('click', function(e) {
      if(e.target.closest('.boost-radio')) { const r = e.target.closest('.boost-radio'); boostSelectRadio(r.dataset.key, r.dataset.val, r); return; }
      if(e.target.closest('.boost-chip')) { boostToggleChip(e.target.closest('.boost-chip')); return; }
      if(e.target.closest('.boost-btn-back')) { boostBack(); return; }
      if(e.target.closest('.boost-btn-next')) { boostNext(); return; }
      if(e.target.closest('.boost-btn-ai')) { submitBoostForm(); return; }
      if(e.target.closest('.boost-close-modal-btn')) { _closeModalTrapped('boostFormModal'); return; }
      if(e.target.closest('.boost-redo-btn')) { boostStep = 0; renderBoostStep(); return; }
      if(e.target.closest('.boost-explore-btn')) { _closeModalTrapped('boostFormModal'); return; }
      if(e.target.closest('.boost-retry-btn')) { openBoostForm(); return; }
    });
  }

  // ── Filter boxes (Presencial / Remoto / Estáveis / Variáveis) ──
  document.querySelectorAll('.fbox[data-fbox]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.fbox;
      // Toggle off if already active (click again → back to All)
      if(activeCuration === key) setCuration('');
      else setCuration(key || '');
    });
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  });

  // ── Curation pills ──
  document.querySelectorAll('.curation-pill[data-curation]').forEach(el => {
    el.addEventListener('click', () => setCuration(el.dataset.curation));
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCuration(el.dataset.curation); }
    });
  });

  // ── Tab buttons ──
  document.querySelectorAll('.tab[data-v]').forEach(el => {
    el.addEventListener('click', () => setTab(el.dataset.v));
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(el.dataset.v); }
    });
  });

  // ── catSearch input ──
  const catSearchInputEl = document.getElementById('catSearch');
  if(catSearchInputEl) {
    catSearchInputEl.addEventListener('input', () => {
      const cs = catSearchInputEl;
      const clearBtn = document.getElementById('catSearchClear');
      if(clearBtn) clearBtn.style.display = cs.value ? '' : 'none';
      const s = document.getElementById('search');
      if(s) s.value = cs.value;
      render();
      renderCatExplorer();
    });
  }
  const catSearchClearEl = document.getElementById('catSearchClear');
  if(catSearchClearEl) {
    catSearchClearEl.addEventListener('click', () => {
      const cs = document.getElementById('catSearch');
      const s = document.getElementById('search');
      if(cs) cs.value = '';
      if(s) s.value = '';
      catSearchClearEl.style.display = 'none';
      render();
      renderCatExplorer();
    });
  }

  // ── Cat explorer guide step 1 ──
  const _gs1Card = document.getElementById('guideStep1Card');
  if(_gs1Card) {
    _gs1Card.classList.add('clickable');
    _gs1Card.addEventListener('click', () => {
      const ce = document.getElementById('catExplorer');
      if(ce) ce.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }

  // ── Init ──
  const _fcInit = document.getElementById('favCount');
  if(_fcInit) _fcInit.textContent = favs.length;
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
    // Import favorites from bookmark URL (#f=…) BEFORE the hash is stripped
    _importFavsFromUrl(_rawHash);
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

    // No URL token — try cached token first (auto-login across sessions)
    const _cached = (() => {
      try { const v = localStorage.getItem('gh_cached_token'); return (v && typeof v === 'string' && v.length > 3 && v.length < 200) ? v : null; } catch(e) { return null; }
    })();
    if(_cached) {
      // Sanitise cached token (same rules as manual entry) — defense-in-depth against tampered localStorage
      const _cleanCached = _cached.replace(/[\x00-\x1f\x7f\s<>"'`\\]/g,'').substring(0,64);
      if(!_cleanCached || _cleanCached.length < 4) {
        try { localStorage.removeItem('gh_cached_token'); } catch(e) {}
        showPasswordMode();
        applyLockLang();
        return;
      }
      // Show subtle loading state while silently re-authenticating
      const _cLockBtn   = document.getElementById('lockBtn');
      const _cLockInput = document.getElementById('lockInput');
      const _cLockHint  = document.getElementById('lockHint');
      if(_cLockInput) _cLockInput.style.display = 'none';
      if(_cLockHint)  _cLockHint.style.display  = 'none';
      if(_cLockBtn) {
        _cLockBtn.style.display = 'block';
        _cLockBtn.disabled      = true;
        _cLockBtn.style.opacity = '.7';
        _cLockBtn.textContent   = currentLang === 'en' ? '⏳ Restoring session…' : '⏳ A restaurar sessão…';
      }
      const _cOk = await validarTokenSupabase(_cleanCached, true);
      if(!_cOk) {
        // Cached token invalid or revoked — clear and show normal login
        try { localStorage.removeItem('gh_cached_token'); } catch(e) {}
        if(_cLockInput) _cLockInput.style.display = '';
        if(_cLockHint)  _cLockHint.style.display  = '';
        if(_cLockBtn) { _cLockBtn.disabled = false; _cLockBtn.style.opacity = ''; }
        showPasswordMode();
        applyLockLang();
      }
      return;
    }
    // No cached token — show normal password mode
    showPasswordMode();
    applyLockLang();
  })();

  } catch(e) { console.error('[GigHub] _bindEvents error:', e); }
})();

// ══ CATEGORY EXPLORER ══════════════════════════════════════════════
// Renders clickable category cards after unlock. Each card expands
// to show the platforms in that group.

const CAT_EXPLORER_DEFS = [
  {
    id: 'independente',
    emoji: '💻',
    titlePt: 'Quero trabalhar por minha conta',
    titleEn: 'I want to be my own boss',
    descPt: 'Para quem quer ligar e desligar a app quando quer — biscates, entregas, gigs e muito mais.',
    descEn: 'For those who want flexible, on-demand work — gigs, deliveries and local services.',
    color: '#2d7a4f',
    subgroups: [
      { labelPt:'🚗 Se tens veículo (Carro, Mota ou Bicicleta)', labelEn:'🚗 If you have a vehicle (Car, Moto or Bike)',
        cats:['gigs'], filter: p => p.is_delivery },
      { labelPt:'📋 Sem veículo (Contrato / Prestação de Serviços)', labelEn:'📋 No vehicle needed (Contract / Service)',
        cats:['gigs'], filter: p => !p.is_delivery && ['Food Delivery Brands (Telepizza)','Carteiro CTT'].includes(p.name) },
      { labelPt:'🔧 Serviços locais (Biscates)', labelEn:'🔧 Local service gigs',
        cats:['gigs','petsitting','babysitting'], filter: p => !p.is_delivery && !['Food Delivery Brands (Telepizza)','Carteiro CTT'].includes(p.name) && p.cat !== 'f2f' && p.cat !== 'support' },
      { labelPt:'💻 Trabalho a partir de casa (Online)', labelEn:'💻 Work from home (Online)',
        cats:['tutoring','transcricao'], filter: p => true },
      { labelPt:'🎭 Eventos & Audiovisual', labelEn:'🎭 Events & Audiovisual',
        cats:['gigs'], filter: p => ['Quickcasting','Kria Eventos','Aporfest','Spring Events','Cloe Events','Casamentos.pt','Crowd'].includes(p.name) },
    ]
  },
  {
    id: 'ativos',
    emoji: '💰',
    titlePt: 'Quero Rentabilizar Ativos',
    titleEn: 'I want to monetise what I already have',
    descPt: 'Ganha dinheiro sem um "emprego clássico" — usa o teu espaço, a tua rede ou o teu corpo.',
    descEn: 'Earn without a traditional job — monetise your space, network or digital audience.',
    color: '#0e64b4',
    subgroups: [
      { labelPt:'🏠 Espaço Físico ou Loja', labelEn:'🏠 Physical space or shop',
        cats:['passive'], filter: p => !['Revolut Affiliate','XTB Partnerships','Booking Affiliate','Amazon Affiliate','Shopify Affiliate','Trade Republic Affiliate','Temu Affiliate','Letyshops'].includes(p.name) },
      { labelPt:'🧪 Estudos Científicos & Médicos', labelEn:'🧪 Scientific & medical studies',
        cats:['clinical'], filter: p => true },
      { labelPt:'🔗 Tráfego / Redes Sociais (Afiliados)', labelEn:'🔗 Traffic / social media (Affiliates)',
        cats:['passive'], filter: p => ['Revolut Affiliate','XTB Partnerships','Booking Affiliate','Amazon Affiliate','Shopify Affiliate','Trade Republic Affiliate','Temu Affiliate','Letyshops'].includes(p.name) },
    ]
  },
  {
    id: 'microtarefas',
    emoji: '🎯',
    titlePt: 'Quero Uns Trocados Fáceis',
    titleEn: 'I want some easy extra cash',
    descPt: '⚠️ Pagam pouco e de forma inconsistente — dá para o café, não para o salário. Podes passar meses sem nada.',
    descEn: '⚠️ Low and inconsistent pay — good for a coffee, not a salary. You may go months earning nothing.',
    color: '#7a3e00',
    subgroups: [
      { labelPt:'🤳 No Telemóvel / Computador', labelEn:'🤳 On your phone / computer',
        cats:['surveys','tasks','testing','micro'], filter: p => true },
      { labelPt:'🕵️ Na Rua (Cliente Mistério & Auditorias)', labelEn:'🕵️ On the street (Mystery Shopping & Audits)',
        cats:['mystery'], filter: p => true },
    ]
  },
  {
    id: 'emprego',
    emoji: '🏢',
    titlePt: 'Quero um Emprego com Contrato',
    titleEn: 'I want a job with a contract',
    descPt: 'Para quem quer a segurança de um ordenado ao fim do mês, turnos definidos e contrato de trabalho.',
    descEn: 'For those who want a steady monthly salary, defined shifts and an employment contract.',
    color: '#6428b4',
    subgroups: [
      { labelPt:'📞 Escritório, Call Center & Apoio Remoto', labelEn:'📞 Office, Call Center & Remote Support',
        cats:['support'], filter: p => true },
      { labelPt:'🏪 Lojas, Retalho & Logística Comercial', labelEn:'🏪 Stores, Retail & Commercial Logistics',
        cats:['f2f'], filter: p => !['Prosegur','Securitas','Trablisa ESEgur','Servilusa','RGIS','Ecoambiente','Prezero','Junta de Freguesia Ajuda','Parques de Sintra','Luz Saúde','Lusíadas Saúde','Residências Montepio','Blue & Green Hotels','Procme','Carris','Metro de Lisboa','Ascendi','Brisa','Ryanair','Portway','DHL','Torrestir','Mota-Engil','Infraestruturas de Portugal','Transdev','Barraqueiro','Aldi Campanha Verão','Campanha Tomate','Douro Azul','Lisbon Boats','Lisbon Pub Crawl','City Sightseeing','Solverde','Pestana Group (Carreiras)','Badoca Safari Park','Zoomarine','Aqualand','Aquashow','Sirius Park','Quantum Parks','Orbitur','INATEL','Ritmos Fortes','SalvaMais','Guia Tuk Tuk','Oeiras Monitores','Living Tours','Pitagórica','ACNUR','Aldeias SOS','APDES','Associação Salvador','Amnistia Internacional','WWF Portugal','Ponto Verde','MetLife','ERA Portugal','Boost Portugal'].includes(p.name) },
      { labelPt:'🚚 Transportes, Indústria & Infraestruturas', labelEn:'🚚 Transport, Industry & Infrastructure',
        cats:['f2f'], filter: p => ['Carris','Metro de Lisboa','Ascendi','Brisa','Ryanair','Portway','DHL','Torrestir','Mota-Engil','Infraestruturas de Portugal','Transdev','Barraqueiro'].includes(p.name) },
      { labelPt:'🎪 Sazonal, Turismo & Parques', labelEn:'🎪 Seasonal, Tourism & Parks',
        cats:['f2f','gigs'], filter: p => ['Aldi Campanha Verão','Campanha Tomate','Douro Azul','Lisbon Boats','Lisbon Pub Crawl','City Sightseeing','GuruWalk','New Europe Tours','Worldpackers','Solverde','Pestana Group (Carreiras)','Badoca Safari Park','Zoomarine','Aqualand','Aquashow','Sirius Park','Quantum Parks','Orbitur','INATEL','Ritmos Fortes','SalvaMais','Guia Tuk Tuk','Oeiras Monitores','Living Tours'].includes(p.name) },
      { labelPt:'🧹 Limpeza, Segurança & Suporte Operacional', labelEn:'🧹 Cleaning, Security & Operational Support',
        cats:['f2f'], filter: p => ['Prosegur','Securitas','Trablisa ESEgur','Servilusa','RGIS','Ecoambiente','Prezero','Junta de Freguesia Ajuda','Parques de Sintra','Luz Saúde','Lusíadas Saúde','Residências Montepio','Blue & Green Hotels','Procme'].includes(p.name) },
      { labelPt:'🤝 Angariação Face-to-Face (Causas / Rua)', labelEn:'🤝 Face-to-Face Fundraising (Causes / Street)',
        cats:['retail','f2f'], filter: p => ['ACNUR','Aldeias SOS','APDES','Associação Salvador','Amnistia Internacional','WWF Portugal','Ponto Verde','MetLife','ERA Portugal','Boost Portugal'].includes(p.name) },
    ]
  },
];

// ── State: which category card is currently open
let _catOpenId = null;

function renderCatExplorer() {
  const grid = document.getElementById('catGrid');
  if(!grid) return;

  const isEn = currentLang === 'en';
  const labelPlatforms = (n) => isEn ? `${n} platform${n!==1?'s':''}` : `${n} plataforma${n!==1?'s':''}`;

  const q = (document.getElementById('catSearch')?.value || document.getElementById('search')?.value || '').toLowerCase().trim();
  const curationFn = activeCuration ? curationFilters[activeCuration] : null;

  // Update count badge
  const _cecEl = document.getElementById('catExplorerCount');
  if(_cecEl && P.length) {
    const _vis = curationFn ? P.filter(curationFn).length : P.length;
    _cecEl.textContent = (_vis < P.length)
      ? _vis + ' ' + (isEn ? 'of ' : 'de ') + P.length + (isEn ? ' platforms' : ' plataformas')
      : P.length + (isEn ? ' platforms' : ' plataformas');
    _cecEl.style.display = '';
  }

  // Index P by name for fast lookup
  const _pByName = {};
  P.forEach(p => { _pByName[p.name.toLowerCase().trim()] = p; });

  // Given a subgroup def, return matching platforms from P
  function _sgPlatforms(sg) {
    const catSet = new Set(sg.cats);
    return P.filter(p => {
      if(!catSet.has(p.cat)) return false;
      if(!sg.filter(p)) return false;
      if(curationFn && !curationFn(p)) return false;
      if(q && !p.name.toLowerCase().includes(q) && !(isEn && p.descEn ? p.descEn : p.desc||'').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // Platform item renderer
  const _renderPlatformItem = (p, i) => {
    const _safeUrl = (p.url && (p.url.startsWith('https://') || p.url.startsWith('http://'))) ? p.url : '#';
    const _desc = isEn && p.descEn ? p.descEn : p.desc;
    return `
    <a class="cat-platform-item" href="${escHtml(_safeUrl)}" target="_blank" rel="noopener noreferrer"
       style="animation-delay:${i * 0.03}s">
      <div class="cat-platform-item-ico">${escHtml(p.icon||'📌')}</div>
      <div class="cat-platform-item-body">
        <div class="cat-platform-item-name">${escHtml(p.name)}</div>
        <div class="cat-platform-item-desc">${escHtml(_desc)}</div>
      </div>
      <div class="cat-platform-item-arrow">↗</div>
    </a>`;
  };

  const html = CAT_EXPLORER_DEFS.map(cat => {
    const title = isEn ? cat.titleEn : cat.titlePt;
    const desc  = isEn ? cat.descEn  : cat.descPt;
    const isOpen = _catOpenId === cat.id;

    // Count total platforms across all subgroups for this cat
    let globalIdx = 0;
    const subgroupsHtml = cat.subgroups.map(sg => {
      const sgPlatforms = _sgPlatforms(sg);
      if(sgPlatforms.length === 0) return '';
      const sgLabel = isEn ? sg.labelEn : sg.labelPt;
      const itemsHtml = sgPlatforms.map(p => _renderPlatformItem(p, globalIdx++)).join('');
      return `
      <div class="cat-subgroup">
        <div class="cat-subgroup-label">${escHtml(sgLabel)}</div>
        ${itemsHtml}
      </div>`;
    }).join('');

    const count = globalIdx; // total items rendered
    if((curationFn || q) && count === 0) return '';

    const badgeLabel = labelPlatforms(count);

    const cardHtml = `
      <div class="cat-card${isOpen?' open':''}" data-catid="${cat.id}"
           style="--cat-color:${cat.color}"
           role="button" tabindex="0"
           aria-expanded="${isOpen}"
           aria-label="${escHtml(title)}">
        <div class="cat-card-header">
          <div class="cat-card-emoji">${escHtml(cat.emoji)}</div>
          <div class="cat-card-body">
            <div class="cat-card-title">${escHtml(title)}</div>
            <span class="cat-card-count">${badgeLabel}</span>
          </div>
          <div class="cat-card-chevron">▾</div>
        </div>
      </div>`;

    const expandHtml = `
      <div class="cat-expand-row${isOpen?' open':''}" data-expandid="${cat.id}" style="--cat-color:${cat.color}">
        <div class="cat-expand-header">
          <span class="cat-expand-header-emoji">${escHtml(cat.emoji)}</span>
          <div>
            <div class="cat-expand-header-title">${escHtml(title)}</div>
            <div class="cat-expand-header-sub">${escHtml(desc)}</div>
          </div>
        </div>
        <div class="cat-platform-list">${subgroupsHtml || `<div style="padding:16px;text-align:center;color:var(--grey);font-size:13px">${isEn?'No results for this filter.':'Sem resultados para este filtro.'}</div>`}</div>
      </div>`;

    return cardHtml + expandHtml;
  }).join('');

  const _emptyMsg = isEn ? 'No categories match your search.' : 'Nenhuma categoria encontrada.';
  const _emptyHint = isEn ? 'Try a different keyword or clear the search.' : 'Tenta outra palavra-chave ou limpa a pesquisa.';
  grid.innerHTML = html || `
    <div class="cat-empty-state">
      <div class="cat-empty-ico">🔍</div>
      <div class="cat-empty-title">${_emptyMsg}</div>
      <div class="cat-empty-sub">${_emptyHint}</div>
      <button class="clear-filters-btn" style="margin-top:14px;height:36px;padding:0 20px;border-radius:20px;border:1.5px solid var(--border-md);background:transparent;cursor:pointer;font-size:12px;font-weight:600;color:var(--grey);font-family:'Instrument Sans',sans-serif">${isEn?'Clear search':'Limpar pesquisa'}</button>
    </div>`;
  const _emptyBtn = grid.querySelector('.clear-filters-btn');
  if(_emptyBtn) _emptyBtn.addEventListener('click', () => {
    const cs = document.getElementById('catSearch'); if(cs) cs.value = '';
    const s = document.getElementById('search'); if(s) s.value = '';
    setCuration('');
    renderCatExplorer();
  });

  // Bind click/keyboard on cat cards
  grid.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => _toggleCatCard(card.dataset.catid));
    card.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggleCatCard(card.dataset.catid); }
    });
  });
}

function _toggleCatCard(id) {
  const wasOpen = _catOpenId === id;
  _catOpenId = wasOpen ? null : id;

  // Hide/show the explorer hint
  const _hint = document.getElementById('catExplorerHint');
  if(_hint) { _hint.style.opacity = _catOpenId ? '0' : ''; _hint.setAttribute('aria-hidden', _catOpenId ? 'true' : 'false'); }

  document.querySelectorAll('.cat-card').forEach(card => {
    const open = card.dataset.catid === _catOpenId;
    card.classList.toggle('open', open);
    card.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.cat-expand-row').forEach(row => {
    const open = row.dataset.expandid === _catOpenId;
    row.classList.toggle('open', open);
    if(open) {
      setTimeout(() => {
        const card = document.querySelector(`.cat-card[data-catid="${_catOpenId}"]`);
        if(card) {
          const rect = card.getBoundingClientRect();
          // On mobile: scroll so the expanded content is visible
          if(window.innerWidth < 760) {
            card.scrollIntoView({ behavior:'smooth', block:'start' });
          } else {
            card.scrollIntoView({ behavior:'smooth', block:'nearest' });
          }
        }
      }, 80);
    }
  });
}




// ── SCROLL REVEAL ANIMATIONS ─────────────────────────────────────────────────
(function _initScrollReveal() {
  if(!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if(e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  // Observe guide cards and tip-box once they exist
  function _observe() {
    document.querySelectorAll('.guide-card, .tip-box, .guide-tools').forEach(el => {
      if(!el.classList.contains('visible')) {
        el.classList.add('fade-in-up');
        io.observe(el);
      }
    });
  }
  // Run once on DOMContentLoaded and again after unlock
  document.addEventListener('DOMContentLoaded', _observe);
  window._observeScrollReveal = _observe;
})();
// ─────────────────────────────────────────────────────────────────────────────

// ── ESCAPE KEY: clear search / filters ───────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if(!hasAccess) return;
  const tag = (document.activeElement || {}).tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if(inInput) {
    if(e.key === 'Escape') {
      const cs = document.getElementById('catSearch');
      const s = document.getElementById('search');
      if(cs && cs.value) { cs.value = ''; if(s) s.value = ''; render(); renderCatExplorer(); cs.blur(); }
      else if(s && s.value) { s.value = ''; render(); }
    }
    return;
  }
  if(e.key === 'Escape') {
    const cs = document.getElementById('catSearch');
    const s = document.getElementById('search');
    if(cs && cs.value) { cs.value = ''; if(s) s.value = ''; render(); renderCatExplorer(); return; }
    if(activeCuration || activeTab) { setCuration(''); activeTab = ''; render(); renderCatExplorer(); }
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// Hook into render so cat explorer re-renders on language switch too.
// We patch the existing render function to also refresh the explorer.
// ── Alias window.render to the real render function so external callers and
// any code using window.render() get the canonical implementation.
window.render = render;
