/* Mis 6 Cuentas — app de presupuesto basada en el método de cuentas.
   Todo se guarda en localStorage de este dispositivo. */
(() => {
'use strict';

// ---------- Definición de cuentas ----------
const LEAVES = ['fixed', 'emerg', 'fund', 'prio', 'free', 'edu', 'fun', 'ltinv', 'give'];
const C1_KIDS = ['fixed', 'emerg', 'fund', 'prio'];
const TOPS = ['c1', 'free', 'edu', 'fun', 'ltinv', 'give'];
const RECOMMENDED = { fixed: 35, emerg: 5, fund: 5, prio: 5, free: 10, edu: 10, fun: 10, ltinv: 15, give: 5 };
const COLORS = {
  c1: '#3B6FE0', fixed: '#2F5BC4', emerg: '#5A88EE', fund: '#7FA3F2', prio: '#A9C1F6',
  free: '#E39B12', edu: '#8B5CF6', fun: '#E0508A', ltinv: '#12A37C', give: '#14AFC0',
};
const MEMBER_COLORS = ['#0E7C66', '#3B6FE0', '#E0508A', '#E39B12', '#8B5CF6', '#14AFC0', '#C2410C'];
const CURRENCIES = ['CLP', 'USD', 'EUR', 'MXN', 'ARS', 'PEN', 'COP'];
const ZERO_DEC = ['CLP', 'COP'];
const KEY = 'mis6cuentas.v1';
const PER_MEMBER = ['budget', 'expenses', 'debts']; // pestañas que se editan por miembro, no en la vista familiar

// ---------- Estado ----------
let S = load();
let ui = { tab: 'home', unlocked: false, onb: { step: 0, members: [''], mode: 'individual', income: '', pw: '' }, tut: null, expFilter: 'all' };

function blankState() {
  return {
    v: 1,
    settings: { lang: (navigator.language || 'es').startsWith('en') ? 'en' : 'es', currency: 'CLP', theme: 'auto', mode: 'individual', pw: null, onboarded: false, alertPct: 80, reminder: { on: false, freq: 'weekly', last: 0 } },
    profiles: [], active: null, month: monthKey(new Date()),
  };
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(blankState(), JSON.parse(raw)); } catch (e) {}
  return blankState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('No se pudo guardar', 'bad'); } }
function newProfile(name, i) {
  return { id: uid(), name: name || 'Yo', color: MEMBER_COLORS[i % MEMBER_COLORS.length], rule: { ...RECOMMENDED }, names: {}, months: {} };
}

// ---------- Utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function t(k, vars) {
  let s = (I18N[S.settings.lang] || I18N.es)[k] ?? I18N.es[k] ?? k;
  if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
  return s;
}
const locale = () => (S.settings.lang === 'en' ? 'en-US' : 'es-CL');
const dec = () => (ZERO_DEC.includes(S.settings.currency) ? 0 : 2);
function money(n) {
  const neg = (n || 0) < 0 ? '-' : '';
  try { return neg + new Intl.NumberFormat(locale(), { style: 'currency', currency: S.settings.currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: dec(), maximumFractionDigits: dec() }).format(Math.abs(n || 0)); }
  catch (e) { return neg + Math.abs(n || 0).toFixed(dec()); }
}
const plain = (n) => new Intl.NumberFormat(locale(), { minimumFractionDigits: 0, maximumFractionDigits: dec() }).format(n || 0);
const roundM = (n) => { const f = Math.pow(10, dec()); return Math.round(n * f) / f; };
function parseMoney(str) {
  let s = String(str || '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const m = dec() > 0 ? s.match(/[.,](\d{1,2})$/) : null;
  let n = m ? Number(s.slice(0, -m[0].length).replace(/[.,]/g, '') + '.' + m[1]) : Number(s.replace(/[.,]/g, ''));
  return isFinite(n) && n > 0 ? roundM(n) : 0;
}
const fmtPct = (p) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(p || 0);
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function shiftMonth(key, delta) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); }
function monthLabel(key, short) {
  const [y, m] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat(locale(), short ? { month: 'short', year: '2-digit' } : { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// ---------- Datos del modelo ----------
const isFamilyView = () => S.settings.mode === 'family' && S.active === 'family';
const profile = () => S.profiles.find((p) => p.id === S.active) || S.profiles[0];
function accName(id, p = profile()) { return (p && p.names[id] && p.names[id].name) || t('acc_' + id); }
function accDesc(id, p = profile()) { return (p && p.names[id] && p.names[id].desc) || t('acc_' + id + '_d'); }

function getMonth(p, key, create = true) {
  if (p.months[key]) return p.months[key];
  if (!create) return null;
  // copia ingreso y porcentajes del mes anterior más cercano (o el siguiente si no hay), o la regla del perfil
  const keys = Object.keys(p.months).filter((k) => p.months[k].income > 0).sort();
  const before = keys.filter((k) => k < key), after = keys.filter((k) => k > key);
  const src = before.length ? before[before.length - 1] : after[0];
  const prev = src ? p.months[src] : null;
  // los ingresos extraordinarios no se copian: son propios de cada mes
  const m = { income: prev ? prev.income : 0, extra: [], pct: { ...(prev ? prev.pct : p.rule) }, exp: [] };
  p.months[key] = m;
  return m;
}
function peekMonth(p, key) { return p.months[key] || null; }
const extraSum = (m) => roundM((m.extra || []).reduce((a, e) => a + e.amount, 0));
const totalIncome = (m) => roundM((m.income || 0) + extraSum(m));
const hasData = (m) => !!(m && (totalIncome(m) || m.exp.length));

function calc(p, m) {
  const total = totalIncome(m);
  const r = { base: m.income || 0, extra: extraSum(m), income: total, leaf: {}, top: {}, assigned: 0, spent: 0, pctSum: 0 };
  // Reparte con "mayor resto": redondear cada cuenta por separado hacía que la suma
  // quedara $1-$2 por encima o por debajo del ingreso y mostrara un falso faltante.
  const f = Math.pow(10, dec());
  const pcts = LEAVES.map((id) => Math.max(0, Number(m.pct[id]) || 0));
  const raw = pcts.map((pc) => (total * pc / 100) * f);
  const units = raw.map((x) => Math.floor(x + 1e-6));
  let rest = Math.round(total * pcts.reduce((a, b) => a + b, 0) / 100 * f) - units.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - units[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0 && pcts[i] > 0) { units[i]++; rest--; } });
  for (const [i, id] of LEAVES.entries()) {
    const pct = pcts[i];
    const amt = units[i] / f;
    const spent = m.exp.filter((e) => e.acc === id).reduce((a, e) => a + e.amount, 0);
    r.leaf[id] = { pct, amt, spent, left: amt - spent };
    r.assigned += amt; r.spent += spent; r.pctSum += pct;
  }
  for (const id of TOPS) {
    const kids = id === 'c1' ? C1_KIDS : [id];
    const o = { pct: 0, amt: 0, spent: 0, left: 0 };
    kids.forEach((k) => { o.pct += r.leaf[k].pct; o.amt += r.leaf[k].amt; o.spent += r.leaf[k].spent; o.left += r.leaf[k].left; });
    r.top[id] = o;
  }
  r.assigned = roundM(r.assigned); r.spent = roundM(r.spent);
  r.diff = roundM(r.income - r.assigned);
  r.available = roundM(r.income - r.spent);
  return r;
}
function familyCalc(key) {
  const agg = { income: 0, assigned: 0, spent: 0, available: 0, diff: 0, top: {}, leaf: {} };
  TOPS.forEach((id) => (agg.top[id] = { amt: 0, spent: 0, left: 0, pct: 0 }));
  LEAVES.forEach((id) => (agg.leaf[id] = { amt: 0, spent: 0, left: 0, pct: 0 }));
  const per = S.profiles.map((p) => {
    const m = peekMonth(p, key);
    const r = m ? calc(p, m) : null;
    if (r) {
      ['income', 'assigned', 'spent', 'available', 'diff'].forEach((k) => (agg[k] += r[k]));
      TOPS.forEach((id) => ['amt', 'spent', 'left'].forEach((k) => (agg.top[id][k] += r.top[id][k])));
      LEAVES.forEach((id) => ['amt', 'spent', 'left'].forEach((k) => (agg.leaf[id][k] += r.leaf[id][k])));
    }
    return { p, r };
  });
  TOPS.forEach((id) => (agg.top[id].pct = agg.income ? (agg.top[id].amt / agg.income) * 100 : 0));
  return { agg, per };
}
function alertsFor(r, p) {
  const out = [];
  const th = S.settings.alertPct;
  for (const id of LEAVES) {
    const l = r.leaf[id];
    if (l.amt <= 0 && l.spent <= 0) continue;
    const used = l.amt > 0 ? (l.spent / l.amt) * 100 : 999;
    const name = accName(id, p);
    if (l.spent > l.amt) out.push({ kind: 'bad', id, text: t('alertOver', { a: name, r: money(l.spent - l.amt) }) });
    else if (used >= th) out.push({ kind: 'warn', id, text: t('alertNear', { a: name, p: Math.round(used), r: money(l.left) }) });
  }
  return out;
}

// ---------- Contraseña (SHA-256 con sal) ----------
async function sha256(str) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256js(str);
}
function sha256js(ascii) { // respaldo para contextos sin crypto.subtle (http en red local)
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const bytes = [...new TextEncoder().encode(ascii)];
  const K = [], H = [];
  let n = 0;
  for (let c = 2; n < 64; c++) {
    let prime = true;
    for (let d = 2; d * d <= c; d++) if (c % d === 0) { prime = false; break; }
    if (prime) { if (n < 8) H[n] = (Math.pow(c, 1 / 2) * 4294967296) | 0; K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 255);
  for (let j = 0; j < bytes.length; j += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[j + i * 4] << 24) | (bytes[j + i * 4 + 1] << 16) | (bytes[j + i * 4 + 2] << 8) | bytes[j + i * 4 + 3];
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15], w2 = w[i - 2];
        w[i] = (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0;
      }
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
async function makePw(pw) { const salt = uid() + uid(); return { salt, hash: await sha256(salt + pw) }; }
async function checkPw(pw) { return S.settings.pw && (await sha256(S.settings.pw.salt + pw)) === S.settings.pw.hash; }

// ---------- Íconos ----------
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  budget: '<path d="M12 3v9l7.8 4.5A9 9 0 1 1 12 3z"/><path d="M15 3.5A9 9 0 0 1 20.5 13H15z"/>',
  exp: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  hist: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  debt: '<path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2M8 13h8M12 11v4"/>',
  left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', chev: '<path d="M6 9l6 6 6-6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// ---------- Gráficos SVG ----------
function donut(segs, center, sub) {
  const total = segs.reduce((a, s) => a + Math.max(0, s.value), 0);
  let acc = 0;
  const circles = total > 0 ? segs.filter((s) => s.value > 0).map((s) => {
    const pct = (s.value / total) * 100;
    const gap = segs.length > 1 ? 0.6 : 0;
    const c = `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${s.color}" stroke-width="6" stroke-dasharray="${Math.max(0, pct - gap)} ${100 - Math.max(0, pct - gap)}" stroke-dashoffset="${25 - acc}"><title>${esc(s.label)}: ${fmtPct(pct)}%</title></circle>`;
    acc += pct; return c;
  }).join('') : '<circle r="15.9155" cx="21" cy="21" fill="none" stroke="var(--surface-2)" stroke-width="6"/>';
  return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${esc(t('distribution'))}">${circles}
    <text x="21" y="20.5" text-anchor="middle" style="font-size:3.6px;font-weight:700;fill:var(--text)">${esc(center)}</text>
    <text x="21" y="25" text-anchor="middle" style="font-size:2.6px;fill:var(--muted)">${esc(sub)}</text></svg>`;
}
function barChart(groups, series) { // groups: [{label, values:[...]}], series: [{name,color}]
  // ancho según la cantidad de grupos: así el texto conserva un tamaño legible en el celular
  const W = Math.max(360, groups.length * 64), H = 200, padL = 4, padB = 24, padT = 10;
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const gw = (W - padL * 2) / Math.max(1, groups.length);
  const bw = Math.min(28, (gw - 10) / series.length);
  let out = '';
  [0.5, 1].forEach((f) => { const y = padT + (H - padB - padT) * (1 - f); out += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 4"/>`; });
  groups.forEach((g, i) => {
    const x0 = padL + i * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
    g.values.forEach((v, j) => {
      const h = ((H - padB - padT) * v) / max;
      out += `<rect x="${x0 + j * (bw + 2)}" y="${H - padB - h}" width="${bw}" height="${Math.max(0, h)}" rx="4" fill="${series[j].color}"><title>${esc(g.label)} · ${esc(series[j].name)}: ${esc(money(v))}</title></rect>`;
    });
    out += `<text x="${padL + i * gw + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(g.label)}</text>`;
  });
  out += `<line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="var(--border)"/>`;
  const legend = series.map((s) => `<span class="row small"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${out}</svg></div><div class="row wrap" style="gap:16px">${legend}</div>`;
}
function progress(spent, amt, color) {
  const pct = amt > 0 ? Math.min(100, (spent / amt) * 100) : spent > 0 ? 100 : 0;
  const over = spent > amt && spent > 0;
  const near = !over && amt > 0 && (spent / amt) * 100 >= S.settings.alertPct;
  return `<div class="bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%;background:${over ? 'var(--danger)' : near ? 'var(--warn)' : color}"></i></div>`;
}

// ---------- Render principal ----------
function applyTheme() {
  const th = S.settings.theme;
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
  document.documentElement.lang = S.settings.lang;
  document.title = t('appName');
}
let rendering = false, rerender = false;
function render() {
  // evita renders anidados: al reemplazar el DOM, el campo enfocado dispara blur/change
  if (rendering) { rerender = true; return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
  if (rerender) { rerender = false; render(); }
}
function renderNow() {
  applyTheme();
  const app = $('#app');
  if (!S.settings.onboarded) { app.innerHTML = viewOnboarding(); return; }
  if (S.settings.pw && !ui.unlocked) { app.innerHTML = viewLock(); if (!$('.alert.install')) setTimeout(() => $('#lock-pw') && $('#lock-pw').focus(), 50); return; }
  if (ui.tut !== null) { app.innerHTML = viewTutorial(); return; }
  if (!S.profiles.length) S.profiles.push(newProfile('Yo', 0));
  if (!S.active || (S.active !== 'family' && !profile())) S.active = S.profiles[0].id;
  if (S.active === 'family' && S.settings.mode !== 'family') S.active = S.profiles[0].id;
  if (isFamilyView() && PER_MEMBER.includes(ui.tab)) ui.tab = 'home';
  const views = { home: viewHome, budget: viewBudget, expenses: viewExpenses, debts: viewDebts, history: viewHistory, more: viewMore };
  app.innerHTML = `<div class="shell">${topbar()}<main class="content" id="main">${views[ui.tab]()}</main>${nav()}</div>`;
}
function topbar() {
  const prof = S.settings.mode === 'family'
    ? `<select class="pill" data-change="profile" aria-label="${esc(t('member'))}">
        ${S.profiles.map((p) => `<option value="${p.id}" ${S.active === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="family" ${S.active === 'family' ? 'selected' : ''}>👪 ${esc(t('family'))}</option></select>` : '';
  return `<header class="topbar">
    <div class="brand"><img src="icons/icon-192.png" alt=""><span>${esc(t('appName'))}</span></div>
    ${prof}
    <div class="monthnav"><button class="icon-btn" data-act="month" data-d="-1" aria-label="Mes anterior">${icon('left')}</button>
      <span>${esc(monthLabel(S.month))}</span>
      <button class="icon-btn" data-act="month" data-d="1" aria-label="Mes siguiente">${icon('right')}</button></div>
  </header>`;
}
function nav() {
  const fam = isFamilyView();
  const items = [['home', 'home', 'navHome'], ['budget', 'budget', 'navBudget'], ['expenses', 'exp', 'navExpenses'], ['debts', 'debt', 'navDebts'], ['history', 'hist', 'navHistory'], ['more', 'more', 'navMore']];
  return `<nav class="nav" aria-label="Principal">${items.map(([id, ic, k]) => `<button data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''} ${fam && PER_MEMBER.includes(id) ? 'disabled style="opacity:.35"' : ''}>${icon(ic)}<span>${esc(t(k))}</span></button>`).join('')}</nav>`;
}

// ---------- Inicio ----------
function reminderDue() {
  const r = S.settings.reminder;
  if (!r.on) return false;
  const span = { daily: 1, weekly: 7, monthly: 30 }[r.freq] * 864e5;
  return Date.now() - (r.last || 0) >= span;
}
function viewHome() {
  if (isFamilyView()) return viewFamilyHome();
  const p = profile(), m = getMonth(p, S.month), r = calc(p, m);
  const alerts = alertsFor(r, p);
  debtsDue(p, S.month).forEach((d) => alerts.unshift({ kind: 'warn', text: t('debtDueAlert', { n: d.name, r: money(Math.min(d.cuota, debtLeft(d))) }) }));
  const tipN = (Math.floor(Date.now() / 864e5) % 10) + 1;
  const segs = TOPS.map((id) => ({ value: r.top[id].amt, color: COLORS[id], label: accName(id, p) }));
  return `
  ${installBanner()}
  ${reminderDue() ? `<div class="alert info">${icon('info')}<div class="stack" style="flex:1"><span>${esc(t('reminderDue'))}</span><div><button class="btn sm primary" data-act="reminder-ok">${esc(t('reviewNow'))}</button></div></div></div>` : ''}
  <div class="grid-2">
    <section class="card">
      <label class="field" for="income">${esc(t('incomeFixed'))}
        <input id="income" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" data-change="income" value="${m.income ? plain(m.income) : ''}" placeholder="${esc(money(0))}" aria-describedby="income-hint">
      </label>
      <span id="income-hint" class="small muted">${esc(t('incomeHint'))} · ${esc(S.settings.currency)}</span>
      ${extraBlock(m, r)}
      <div class="stats">
        <div class="stat"><div class="label">${esc(t('assigned'))}</div><div class="value num">${money(r.assigned)}</div></div>
        <div class="stat"><div class="label">${esc(t('spent'))}</div><div class="value num">${money(r.spent)}</div></div>
        <div class="stat"><div class="label">${esc(t('available'))}</div><div class="value num ${r.available < 0 ? 'neg' : ''}">${money(r.available)}</div></div>
      </div>
      ${statusLine(r)}
    </section>
    <section class="card">
      <div class="card-head"><h2>${esc(t('distribution'))}</h2></div>
      ${r.income > 0 ? `<div class="donut-wrap">${donut(segs, money(r.assigned), fmtPct(r.pctSum) + '%')}
        <div class="legend">${TOPS.map((id) => `<div><i class="dot" style="background:${COLORS[id]}"></i><span>${esc(accName(id, p))} <span class="muted">${fmtPct(r.top[id].pct)}%</span></span><b class="num">${money(r.top[id].amt)}</b></div>`).join('')}</div></div>`
        : `<p class="muted">${esc(t('noIncome'))}</p>`}
    </section>
  </div>
  <div class="grid-2">
    <section class="card"><div class="card-head"><h2>${esc(t('byAccount'))}</h2><button class="btn sm" data-act="tab" data-tab="expenses">${icon('plus')}${esc(t('addExpense'))}</button></div>
      <div>${TOPS.map((id) => accRow(id, r, p)).join('')}</div></section>
    ${r.income > 0 ? planVsReal(r, p) : ''}
    <div class="stack" style="gap:16px">
      <section class="card"><h2>${esc(t('alerts'))}</h2>
        ${alerts.length ? alerts.map((a) => `<div class="alert ${a.kind}">${icon('warn')}<span>${esc(a.text)}</span></div>`).join('') : `<p class="muted small">${esc(t('noAlerts'))}</p>`}</section>
      <section class="card"><div class="card-head"><h2>${esc(t('recs'))}</h2></div><ul class="list">${recommendations(p).slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="card"><div class="row">${icon('bulb')}<h3>${esc(t('tipOfDay'))}</h3></div><p>${esc(t('tip' + tipN))}</p></section>
    </div>
  </div>`;
}
function statusLine(r) {
  if (!r.income) return '';
  if (Math.abs(r.diff) < (dec() ? 0.01 : 1)) return `<div class="status ok"><span>${esc(t('balanced'))}</span><span>${fmtPct(r.pctSum)}%</span></div>`;
  if (r.diff > 0) return `<div class="status warn"><span>${esc(t('unassigned'))}</span><span class="num">${money(r.diff)}</span></div>`;
  return `<div class="status bad"><span>${esc(t('overAssigned'))}</span><span class="num">${money(-r.diff)}</span></div>`;
}
function accRow(id, r, p) {
  const o = r.top[id];
  const head = `<div class="row between"><span class="acc-title"><i class="dot" style="background:${COLORS[id]}"></i><span class="name">${esc(accName(id, p))}</span>${badge(o)}</span><span class="small muted num">${fmtPct(o.pct)}%</span></div>
    ${progress(o.spent, o.amt, COLORS[id])}
    <div class="row between small"><span class="muted num">${esc(t('spent'))} ${money(o.spent)} ${esc(t('of'))} ${money(o.amt)}</span><b class="num ${o.left < 0 ? 'neg' : ''}">${money(o.left)}</b></div>`;
  if (id !== 'c1') return `<div class="acc">${head}</div>`;
  const kids = C1_KIDS.map((k) => { const l = r.leaf[k]; return `<div class="acc acc-sub"><div class="row between small"><span class="acc-title"><i class="dot" style="background:${COLORS[k]}"></i><span class="name">${esc(accName(k, p))}</span>${badge(l)}</span><span class="muted num">${fmtPct(l.pct)}%</span></div>${progress(l.spent, l.amt, COLORS[k])}<div class="row between small"><span class="muted num">${money(l.spent)} / ${money(l.amt)}</span><b class="num ${l.left < 0 ? 'neg' : ''}">${money(l.left)}</b></div></div>`; }).join('');
  return `<details class="acc" ${ui.c1open ? 'open' : ''} data-toggle="c1"><summary class="stack" style="gap:6px">${head}<span class="small muted row" style="gap:4px">${icon('chev').replace('<svg', '<svg width="14" height="14"')} ${esc(t('acc_c1_d'))}</span></summary>${kids}</details>`;
}
function badge(o) {
  if (o.spent > o.amt && o.spent > 0) return `<span class="badge bad">!</span>`;
  if (o.amt > 0 && (o.spent / o.amt) * 100 >= S.settings.alertPct) return `<span class="badge warn">${Math.round((o.spent / o.amt) * 100)}%</span>`;
  return '';
}
// ---------- Ingresos extraordinarios ----------
function extraBlock(m, r) {
  const n = (m.extra || []).length;
  return `<div class="extra-box">
    <div class="row between wrap">
      <span class="stack" style="gap:0"><span class="small muted">${esc(t('extraIncome'))}${n ? ` · ${n}` : ''}</span><b class="num pos">+${money(r.extra)}</b></span>
      <button class="btn sm" data-act="extras">${icon('plus')}${esc(t('extraIncome'))}</button>
    </div>
    ${r.extra > 0 ? `<div class="row between small extra-total"><span>${esc(t('incomeTotal'))}</span><b class="num">${money(r.income)}</b></div>` : ''}
  </div>`;
}
function openExtras() {
  const p = profile(), m = getMonth(p, S.month), list = (m.extra || []).slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const defDate = S.month === monthKey(new Date()) ? todayISO() : S.month + '-01';
  const rows = list.map((e) => `<div class="exp tappable" data-act="extra-menu" data-id="${e.id}" role="button" tabindex="0"><div class="stack" style="gap:0;min-width:0"><b style="overflow:hidden;text-overflow:ellipsis">${esc(e.desc || t('extraIncome'))}</b><span class="small muted">${esc(e.date)}</span></div>
    <b class="num pos">+${money(e.amount)}</b><span class="icon-btn" aria-hidden="true">${icon('more')}</span></div>`).join('');
  modal(`<div class="card-head"><h2>${esc(t('extraIncome'))}</h2><button type="button" class="icon-btn" data-act="modal-close" aria-label="${esc(t('close'))}">✕</button></div>
    <p class="small muted">${esc(t('extraHelp'))}</p>
    <label class="field">${esc(t('amount'))}<input name="amount" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" placeholder="${esc(money(0))}" required></label>
    <label class="field">${esc(t('expenseDesc'))}<input name="desc" class="input" maxlength="80" placeholder="${esc(t('extraDescPh'))}"></label>
    <label class="field">${esc(t('expenseDate'))}<input name="date" type="date" class="input" value="${defDate}" min="${S.month}-01" max="${S.month}-31"></label>
    <button class="btn primary block">${icon('plus')}${esc(t('add'))}</button>
    <div class="row between"><b>${esc(monthLabel(S.month))}</b><b class="num pos">+${money(extraSum(m))}</b></div>
    <div>${rows || `<p class="muted small">${esc(t('extraNone'))}</p>`}</div>`,
  (fd) => {
    const amount = parseMoney(fd.get('amount'));
    if (!amount) { toast(t('invalidAmount'), 'warn'); return true; }
    let date = String(fd.get('date') || todayISO());
    if (!date.startsWith(S.month)) date = S.month + '-01';
    if (!m.extra) m.extra = [];
    m.extra.push({ id: uid(), amount, desc: String(fd.get('desc') || '').trim(), date });
    save(); render(); openExtras();
    toast(t('extraAdded', { r: money(amount) }));
    return true;
  });
}

// ---------- Instalación en el celular ----------
let installPrompt = null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /android|mobile/i.test(navigator.userAgent);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (S.settings.onboarded) deferRender(); else render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('installed')); deferRender(); });
function installBanner(force) {
  if (isStandalone() || (!force && S.settings.installHide)) return '';
  let how = '';
  if (installPrompt) how = `<button type="button" class="btn sm primary" data-act="install">${esc(t('installBtn'))}</button>`;
  else if (isIOS()) how = `<span class="small">${esc(t('installIOS'))}</span>`;
  else if (isMobile()) how = `<span class="small">${esc(t('installAndroid'))}</span>`;
  else if (!force) return '';
  else how = `<span class="small">${esc(t('installDesktop'))}</span>`;
  return `<div class="alert info install">
    <img src="icons/icon-192.png" alt="" width="40" height="40" style="border-radius:10px;flex:none">
    <div class="stack" style="flex:1;gap:6px"><b>${esc(t('installTitle'))}</b><span class="small">${esc(t('installText'))}</span>
      <div class="row wrap">${how}${force ? '' : `<button type="button" class="btn sm ghost" data-act="install-later">${esc(t('installLater'))}</button>`}</div></div></div>`;
}

function viewFamilyHome() {
  const { agg, per } = familyCalc(S.month);
  const segs = TOPS.map((id) => ({ value: agg.top[id].amt, color: COLORS[id], label: t('acc_' + id) }));
  return `
  <div class="alert info">${icon('info')}<span>${esc(t('familyHint'))}</span></div>
  <div class="grid-2">
    <section class="card"><h2>${esc(t('familyView'))}</h2>
      <div class="stats">
        <div class="stat"><div class="label">${esc(t('income'))}</div><div class="value num">${money(agg.income)}</div></div>
        <div class="stat"><div class="label">${esc(t('spent'))}</div><div class="value num">${money(agg.spent)}</div></div>
        <div class="stat"><div class="label">${esc(t('available'))}</div><div class="value num ${agg.available < 0 ? 'neg' : ''}">${money(agg.available)}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>${esc(t('member'))}</th><th>${esc(t('income'))}</th><th>${esc(t('spent'))}</th><th>${esc(t('available'))}</th></tr></thead><tbody>
        ${per.map(({ p, r }) => `<tr><td><span class="row"><span class="member-chip" style="background:${p.color};width:24px;height:24px;font-size:.7rem">${esc(p.name.slice(0, 1).toUpperCase())}</span><button class="btn ghost sm" data-act="goto-profile" data-id="${p.id}">${esc(p.name)}</button></span></td><td class="num">${money(r ? r.income : 0)}</td><td class="num">${money(r ? r.spent : 0)}</td><td class="num ${r && r.available < 0 ? 'neg' : ''}">${money(r ? r.available : 0)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
    <section class="card"><h2>${esc(t('distribution'))}</h2>
      ${agg.income > 0 ? `<div class="donut-wrap">${donut(segs, money(agg.assigned), t('total'))}<div class="legend">${TOPS.map((id) => `<div><i class="dot" style="background:${COLORS[id]}"></i><span>${esc(t('acc_' + id))}</span><b class="num">${money(agg.top[id].amt)}</b></div>`).join('')}</div></div>` : `<p class="muted">${esc(t('noIncome'))}</p>`}
    </section>
  </div>
  <section class="card"><h2>${esc(t('byAccount'))}</h2>${barChart(TOPS.map((id) => ({ label: t('acc_' + id).split(' ')[0], values: [agg.top[id].amt, agg.top[id].spent] })), [{ name: t('assigned'), color: 'var(--primary)' }, { name: t('spent'), color: '#E39B12' }])}</section>`;
}

// ---------- Presupuesto ----------
function viewBudget() {
  const p = profile(), m = getMonth(p, S.month), r = calc(p, m);
  const row = (id, cls) => {
    const l = r.leaf[id];
    return `<div class="alloc ${cls}"><div class="stack" style="gap:0;min-width:0"><span class="acc-title"><i class="dot" style="background:${COLORS[id]}"></i><span class="name">${esc(accName(id, p))}</span></span><span class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(accDesc(id, p))}</span></div>
      <div class="pct-input"><input class="input num" inputmode="decimal" aria-label="% ${esc(accName(id, p))}" data-change="pct" data-id="${id}" value="${fmtPct(l.pct)}"></div>
      <input class="input num" inputmode="${dec() ? 'decimal' : 'numeric'}" aria-label="${esc(t('amount'))} ${esc(accName(id, p))}" data-change="amt" data-id="${id}" value="${plain(l.amt)}" ${r.income ? '' : 'disabled'}></div>`;
  };
  const c1 = r.top.c1;
  return `
  <section class="card">
    <div class="card-head"><h2>${esc(t('budgetTitle'))}</h2></div>
    <p class="small muted">${esc(t('budgetHelp'))}</p>
    <label class="field" for="income2">${esc(t('incomeFixed'))}<input id="income2" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" data-change="income" value="${m.income ? plain(m.income) : ''}" placeholder="${esc(money(0))}"></label>
    ${extraBlock(m, r)}
    ${statusLine(r)}
    <div class="row between small"><span class="muted">${esc(t('sumPct'))}</span><b class="num ${Math.abs(r.pctSum - 100) > 0.05 ? 'neg' : 'pos'}">${fmtPct(r.pctSum)}%</b></div>
  </section>
  <section class="card">
    <div class="alloc group"><b>${esc(accName('c1', p))}</b><b class="num" style="text-align:right">${fmtPct(c1.pct)}%</b><b class="num" style="text-align:right">${money(c1.amt)}</b></div>
    ${C1_KIDS.map((k) => row(k, 'child')).join('')}
    ${['free', 'edu', 'fun', 'ltinv', 'give'].map((k) => row(k, '')).join('')}
  </section>
  <section class="card">
    <div class="row wrap">
      <button class="btn" data-act="apply-rule">${esc(t('resetRule'))}</button>
      <button class="btn" data-act="save-rule">${esc(t('saveRule'))}</button>
      <button class="btn ghost" data-act="recommended">${esc(t('recommended'))}</button>
    </div>
    <p class="small muted">${LEAVES.map((k) => `${esc(accName(k, p))} ${fmtPct(p.rule[k])}%`).join(' · ')}</p>
  </section>`;
}

// ---------- Gastos ----------
function accOptions(p, sel) {
  return `<optgroup label="${esc(accName('c1', p))}">${C1_KIDS.map((k) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(accName(k, p))}</option>`).join('')}</optgroup>
    ${['free', 'edu', 'fun', 'ltinv', 'give'].map((k) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(accName(k, p))}</option>`).join('')}`;
}
function viewExpenses() {
  const p = profile(), m = getMonth(p, S.month), r = calc(p, m);
  const defDate = S.month === monthKey(new Date()) ? todayISO() : S.month + '-01';
  const list = m.exp.filter((e) => ui.expFilter === 'all' || e.acc === ui.expFilter).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  let lastDay = '', rows = '';
  for (const e of list) {
    if (e.date !== lastDay) {
      lastDay = e.date;
      const [y, mo, d] = e.date.split('-').map(Number);
      rows += `<div class="day">${esc(new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(y, mo - 1, d)))}</div>`;
    }
    rows += `<div class="exp tappable" data-act="exp-menu" data-id="${e.id}" role="button" tabindex="0"><div class="stack" style="gap:0;min-width:0"><b style="overflow:hidden;text-overflow:ellipsis">${e.debt ? '💳 ' : ''}${esc(e.desc || accName(e.acc, p))}</b><span class="small muted row"><i class="dot" style="background:${COLORS[e.acc]}"></i>${esc(accName(e.acc, p))}</span></div>
      <b class="num">${money(e.amount)}</b><span class="icon-btn" aria-hidden="true">${icon('more')}</span></div>`;
  }
  return `
  <div class="grid-2">
    <section class="card">
      <h2>${esc(t('addExpense'))}</h2>
      <form class="stack" data-form="expense" autocomplete="off">
        <label class="field">${esc(t('expenseAmount'))}<input name="amount" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" placeholder="${esc(money(0))}" required></label>
        <label class="field">${esc(t('expenseAcc'))}<select name="acc" class="input">${accOptions(p, ui.lastAcc || 'fixed')}</select></label>
        <label class="field">${esc(t('expenseDesc'))}<input name="desc" class="input" maxlength="80" placeholder="${esc(t('expenseDescPh'))}"></label>
        <label class="field">${esc(t('expenseDate'))}<input name="date" type="date" class="input" value="${defDate}" min="${S.month}-01" max="${S.month}-31"></label>
        <button class="btn primary block" type="submit">${icon('plus')}${esc(t('add'))}</button>
      </form>
      <div class="stats"><div class="stat"><div class="label">${esc(t('assigned'))}</div><div class="value num">${money(r.assigned)}</div></div><div class="stat"><div class="label">${esc(t('spent'))}</div><div class="value num">${money(r.spent)}</div></div><div class="stat"><div class="label">${esc(t('available'))}</div><div class="value num ${r.available < 0 ? 'neg' : ''}">${money(r.available)}</div></div></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>${esc(t('navExpenses'))}</h2>
        <select class="input" style="width:auto;min-height:36px" data-change="exp-filter" aria-label="Filtro"><option value="all">${esc(t('allAccounts'))}</option>${accOptions(p, ui.expFilter)}</select></div>
      <div>${rows || `<p class="muted">${esc(t('noExpenses'))}</p>`}</div>
    </section>
  </div>`;
}

// ---------- Editar / eliminar gastos e ingresos ----------
function findExpense(p, id) {
  for (const k of Object.keys(p.months)) { const e = p.months[k].exp.find((x) => x.id === id); if (e) return { e, k }; }
  return null;
}
function choiceModal(title, detail, editAct, delAct, id, note) {
  modal(`<h2>${esc(title)}</h2>${detail}${note ? `<p class="small muted">${esc(note)}</p>` : ''}
    <button type="button" class="btn primary block" data-act="${editAct}" data-id="${id}">${icon('pencil')}${esc(t('edit'))}</button>
    <button type="button" class="btn block danger" data-act="${delAct}" data-id="${id}">${icon('trash')}${esc(t('delete'))}</button>
    <button type="button" class="btn ghost block" data-act="modal-close">${esc(t('cancel'))}</button>`, () => {});
}
function expenseMenu(id) {
  const p = profile(), f = findExpense(p, id); if (!f) return;
  const e = f.e;
  choiceModal(t('whatToDo'), `<div class="exp" style="border:0"><div class="stack" style="gap:0"><b>${esc(e.desc || accName(e.acc, p))}</b><span class="small muted">${esc(accName(e.acc, p))} · ${esc(e.date)}</span></div><b class="num">${money(e.amount)}</b></div>`,
    'exp-edit', 'exp-del', id, e.debt ? t('debtLinkedNote') : '');
}
function deleteExpense(p, month, id) {
  const m = p.months[month]; if (!m) return;
  const e = m.exp.find((x) => x.id === id);
  if (e && e.debt) { const d = (p.debts || []).find((x) => x.id === e.debt); if (d) d.pays = d.pays.filter((x) => x.id !== e.pay); }
  m.exp = m.exp.filter((x) => x.id !== id);
}
function editExpense(id) {
  const p = profile(), f = findExpense(p, id); if (!f) return;
  const e = f.e;
  modal(`<h2>${esc(t('editExpense'))}</h2>
    <label class="field">${esc(t('expenseAmount'))}<input name="amount" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" value="${plain(e.amount)}" required></label>
    <label class="field">${esc(t('expenseAcc'))}<select name="acc" class="input">${accOptions(p, e.acc)}</select></label>
    <label class="field">${esc(t('expenseDesc'))}<input name="desc" class="input" maxlength="80" value="${esc(e.desc)}"></label>
    <label class="field">${esc(t('expenseDate'))}<input name="date" type="date" class="input" value="${e.date}" min="${f.k}-01" max="${f.k}-31"></label>
    <div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('save'))}</button></div>`,
  (fd) => {
    const amount = parseMoney(fd.get('amount'));
    if (!amount) { toast(t('invalidAmount'), 'warn'); return true; }
    e.amount = amount; e.acc = String(fd.get('acc')); e.desc = String(fd.get('desc') || '').trim();
    const date = String(fd.get('date') || e.date); if (date.startsWith(f.k)) e.date = date;
    if (e.debt) { const d = (p.debts || []).find((x) => x.id === e.debt), pay = d && d.pays.find((x) => x.id === e.pay); if (pay) { pay.amount = amount; pay.date = e.date; } }
    save(); render(); toast(t('expenseUpdated'));
  });
}
function extraMenu(id) {
  const m = getMonth(profile(), S.month), x = (m.extra || []).find((v) => v.id === id); if (!x) return;
  choiceModal(t('extraWhat'), `<div class="exp" style="border:0"><div class="stack" style="gap:0"><b>${esc(x.desc || t('extraIncome'))}</b><span class="small muted">${esc(x.date)}</span></div><b class="num pos">+${money(x.amount)}</b></div>`, 'extra-edit', 'extra-del', id);
}
function editExtra(id) {
  const m = getMonth(profile(), S.month), x = (m.extra || []).find((v) => v.id === id); if (!x) return;
  modal(`<h2>${esc(t('editExtra'))}</h2>
    <label class="field">${esc(t('amount'))}<input name="amount" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" value="${plain(x.amount)}" required></label>
    <label class="field">${esc(t('expenseDesc'))}<input name="desc" class="input" maxlength="80" value="${esc(x.desc)}"></label>
    <label class="field">${esc(t('expenseDate'))}<input name="date" type="date" class="input" value="${x.date}" min="${S.month}-01" max="${S.month}-31"></label>
    <div class="row"><button type="button" class="btn" data-act="extras" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('save'))}</button></div>`,
  (fd) => {
    const amount = parseMoney(fd.get('amount'));
    if (!amount) { toast(t('invalidAmount'), 'warn'); return true; }
    x.amount = amount; x.desc = String(fd.get('desc') || '').trim();
    const date = String(fd.get('date') || x.date); if (date.startsWith(S.month)) x.date = date;
    save(); render(); openExtras(); toast(t('extraUpdated')); return true;
  });
}

// ---------- Deudas ----------
const debtPaid = (d) => roundM(d.pays.reduce((a, x) => a + x.amount, 0));
const debtLeft = (d) => Math.max(0, roundM(d.total - debtPaid(d)));
const cuotaPaid = (d, month) => d.pays.some((x) => x.kind === 'cuota' && x.month === month);
const cuotaDue = (d, month) => d.cuota > 0 && debtLeft(d) > 0 && month >= d.start && !cuotaPaid(d, month);
function debtsDue(p, month) { return (p.debts || []).filter((d) => cuotaDue(d, month)); }
function removeDebt(p, id) {
  // los pagos ya hechos siguen siendo gastos reales: se conservan, pero sin vínculo
  Object.values(p.months).forEach((m) => m.exp.forEach((e) => { if (e.debt === id) { delete e.debt; delete e.pay; } }));
  p.debts = (p.debts || []).filter((d) => d.id !== id);
}
function deleteDebtPayment(p, debtId, payId) {
  const d = (p.debts || []).find((x) => x.id === debtId); if (!d) return;
  const pay = d.pays.find((x) => x.id === payId);
  if (pay && pay.expId && p.months[pay.month]) p.months[pay.month].exp = p.months[pay.month].exp.filter((e) => e.id !== pay.expId);
  d.pays = d.pays.filter((x) => x.id !== payId);
}
function editDebt(id) {
  const p = profile(); if (!p.debts) p.debts = [];
  const d = id ? p.debts.find((x) => x.id === id) : null;
  modal(`<h2>${esc(d ? t('editDebt') : t('addDebt'))}</h2>
    <label class="field">${esc(t('debtName'))}<input name="name" class="input" maxlength="40" value="${esc(d ? d.name : '')}" placeholder="${esc(t('debtNamePh'))}" required></label>
    <label class="field">${esc(t('debtTotal'))}<input name="total" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" value="${d ? plain(d.total) : ''}" placeholder="${esc(money(0))}" required></label>
    <label class="field">${esc(t('debtCuota'))}<input name="cuota" class="input num" inputmode="${dec() ? 'decimal' : 'numeric'}" value="${d && d.cuota ? plain(d.cuota) : ''}" placeholder="${esc(money(0))}"></label>
    <label class="field">${esc(t('debtAcc'))}<select name="acc" class="input">${accOptions(p, d ? d.acc : 'prio')}</select></label>
    <label class="field">${esc(t('debtStart'))}<input name="start" type="month" class="input" value="${d ? d.start : S.month}"></label>
    <div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('save'))}</button></div>`,
  (fd) => {
    const name = String(fd.get('name') || '').trim(), total = parseMoney(fd.get('total'));
    if (!name || !total) { toast(t('invalidAmount'), 'warn'); return true; }
    const data = { name, total, cuota: parseMoney(fd.get('cuota')), acc: String(fd.get('acc')), start: /^\d{4}-\d{2}$/.test(String(fd.get('start'))) ? String(fd.get('start')) : S.month };
    if (d) Object.assign(d, data); else p.debts.push({ id: uid(), pays: [], ...data });
    save(); render(); toast(t('debtSaved'));
  });
}
function payDebt(id, kind) {
  const p = profile(), d = (p.debts || []).find((x) => x.id === id); if (!d) return;
  const left = debtLeft(d), suggested = kind === 'cuota' ? Math.min(d.cuota || left, left) : '';
  const defDate = S.month === monthKey(new Date()) ? todayISO() : S.month + '-01';
  modal(`<h2>${esc(t(kind === 'cuota' ? 'payTitleCuota' : 'payTitleAbono', { n: d.name }))}</h2>
    <p class="small muted">${esc(t('balanceLeft'))}: <b class="num">${money(left)}</b> · ${esc(monthLabel(S.month))}</p>
    <label class="field">${esc(t('amount'))}<input name="amount" class="input big num" inputmode="${dec() ? 'decimal' : 'numeric'}" value="${suggested ? plain(suggested) : ''}" placeholder="${esc(money(0))}" required></label>
    <label class="field">${esc(t('expenseDate'))}<input name="date" type="date" class="input" value="${defDate}" min="${S.month}-01" max="${S.month}-31"></label>
    <label class="field">${esc(t('debtAcc'))}<select name="acc" class="input">${accOptions(p, d.acc)}</select></label>
    <div class="set-row" style="border:0;padding:0"><span class="small">${esc(t('alsoExpense'))}</span><label class="switch"><input type="checkbox" name="asExp" checked aria-label="${esc(t('alsoExpense'))}"><span></span></label></div>
    <div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t(kind === 'cuota' ? 'payCuota' : 'payAbono'))}</button></div>`,
  (fd) => {
    let amount = parseMoney(fd.get('amount'));
    if (!amount) { toast(t('invalidAmount'), 'warn'); return true; }
    if (amount > left) { amount = left; toast(t('capped', { r: money(left) }), 'warn'); }
    let date = String(fd.get('date') || todayISO()); if (!date.startsWith(S.month)) date = S.month + '-01';
    const pay = { id: uid(), amount, date, month: S.month, kind };
    if (fd.get('asExp')) {
      const acc = String(fd.get('acc')), m = getMonth(p, S.month);
      const e = { id: uid(), acc, amount, desc: `${d.name} · ${t(kind)}`, date, debt: d.id, pay: pay.id };
      m.exp.push(e); pay.expId = e.id;
    }
    d.pays.push(pay);
    save(); render();
    toast(debtLeft(d) <= 0 ? t('debtDone', { n: d.name }) : t('paymentAdded', { r: money(amount), n: d.name }));
  });
}
function debtPayMenu(debtId, payId) {
  const d = (profile().debts || []).find((x) => x.id === debtId), x = d && d.pays.find((v) => v.id === payId); if (!x) return;
  modal(`<h2>${esc(t('paymentWhat'))}</h2><div class="exp" style="border:0"><div class="stack" style="gap:0"><b>${esc(d.name)} · ${esc(t(x.kind))}</b><span class="small muted">${esc(x.date)}</span></div><b class="num">${money(x.amount)}</b></div>
    <p class="small muted">${esc(t('payDelNote'))}</p>
    <button type="button" class="btn block danger" data-act="debt-pay-del" data-id="${d.id}" data-pay="${x.id}">${icon('trash')}${esc(t('delete'))}</button>
    <button type="button" class="btn ghost block" data-act="modal-close">${esc(t('cancel'))}</button>`, () => {});
}
function viewDebts() {
  const p = profile(), debts = p.debts || [];
  const active = debts.filter((d) => debtLeft(d) > 0);
  const totalLeft = roundM(debts.reduce((a, d) => a + debtLeft(d), 0));
  const paidMonth = roundM(debts.reduce((a, d) => a + d.pays.filter((x) => x.month === S.month).reduce((b, x) => b + x.amount, 0), 0));
  const due = debtsDue(p, S.month), dueAmt = roundM(due.reduce((a, d) => a + Math.min(d.cuota, debtLeft(d)), 0));
  const card = (d) => {
    const left = debtLeft(d), paid = debtPaid(d), done = left <= 0;
    const pct = d.total ? Math.min(100, (paid / d.total) * 100) : 0;
    const monthsLeft = d.cuota > 0 && left > 0 ? Math.ceil(left / d.cuota) : 0;
    const firstDue = S.month < d.start ? d.start : cuotaPaid(d, S.month) ? shiftMonth(S.month, 1) : S.month;
    const endKey = monthsLeft ? shiftMonth(firstDue, monthsLeft - 1) : null;
    const status = done ? `<span class="badge ok">${esc(t('debtPaidOff'))}</span>`
      : cuotaDue(d, S.month) ? `<span class="badge warn">${esc(t('duePending'))}</span>`
      : d.cuota > 0 && cuotaPaid(d, S.month) ? `<span class="badge ok">✓ ${esc(t('cuota'))}</span>` : '';
    const pays = d.pays.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
    return `<section class="card">
      <div class="card-head"><span class="acc-title"><span class="name">${esc(d.name)}</span>${status}</span>
        <span class="row" style="gap:0"><button class="icon-btn" data-act="debt-edit" data-id="${d.id}" aria-label="${esc(t('editDebt'))}">${icon('pencil')}</button><button class="icon-btn" data-act="debt-del" data-id="${d.id}" aria-label="${esc(t('delete'))}">${icon('trash')}</button></span></div>
      <div class="row between"><span class="small muted">${esc(t('balanceLeft'))}</span><b class="num" style="font-size:1.4rem">${money(left)}</b></div>
      <div class="bar"><i style="width:${pct}%;background:var(--ok)"></i></div>
      <div class="row between small"><span class="muted num">${esc(t('paidOf', { a: money(paid), b: money(d.total) }))}</span><b class="num">${fmtPct(pct)}%</b></div>
      ${d.cuota > 0 ? `<div class="small muted">${esc(t('cuota'))}: <b class="num">${money(d.cuota)}</b>${monthsLeft ? ` · ${esc(t('monthsLeft', { n: monthsLeft, m: monthLabel(endKey) }))}` : ''}</div>` : ''}
      ${done ? '' : `<div class="row wrap">
        ${cuotaDue(d, S.month) ? `<button class="btn primary" data-act="debt-cuota" data-id="${d.id}">${esc(t('payCuota'))} · ${money(Math.min(d.cuota, left))}</button>` : ''}
        <button class="btn" data-act="debt-abono" data-id="${d.id}">${icon('plus')}${esc(t('payAbono'))}</button></div>`}
      ${pays.length ? `<button class="btn ghost sm" data-act="debt-toggle" data-id="${d.id}">${esc(t('payments'))} (${pays.length}) ${ui.debtOpen === d.id ? '▲' : '▼'}</button>
        ${ui.debtOpen === d.id ? `<div>${pays.map((x) => `<div class="exp tappable" data-act="debt-pay-menu" data-id="${d.id}" data-pay="${x.id}" role="button" tabindex="0"><div class="stack" style="gap:0"><b>${esc(t(x.kind))}</b><span class="small muted">${esc(x.date)}</span></div><b class="num">−${money(x.amount)}</b><span class="icon-btn" aria-hidden="true">${icon('more')}</span></div>`).join('')}</div>` : ''}` : ''}
    </section>`;
  };
  return `
  <section class="card">
    <div class="card-head"><h2>${esc(t('debtsTitle'))}</h2><button class="btn sm primary" data-act="debt-add">${icon('plus')}${esc(t('addDebt'))}</button></div>
    <div class="stats">
      <div class="stat"><div class="label">${esc(t('debtTotalLeft'))}</div><div class="value num">${money(totalLeft)}</div></div>
      <div class="stat"><div class="label">${esc(t('paidThisMonth'))}</div><div class="value num">${money(paidMonth)}</div></div>
      <div class="stat"><div class="label">${esc(t('duesPending'))}</div><div class="value num ${due.length ? 'neg' : ''}">${due.length ? money(dueAmt) : '✓'}</div></div>
    </div>
    <p class="small muted">${esc(t('debtsHelp'))}</p>
  </section>
  ${debts.length ? `<div class="grid-2">${[...active, ...debts.filter((d) => debtLeft(d) <= 0)].map(card).join('')}</div>` : `<section class="card"><p class="muted">${esc(t('noDebts'))}</p></section>`}`;
}

// ---------- Programado vs real ----------
function shortAcc(id, p) {
  const custom = p && p.names[id] && p.names[id].name;
  if (custom) return custom.length > 9 ? custom.slice(0, 8) + '…' : custom;
  return t('sh_' + id);
}
function planVsReal(r, p) {
  const execPct = r.assigned > 0 ? Math.round((r.spent / r.assigned) * 100) : 0;
  return `<section class="card"><div class="card-head"><h2>${esc(t('planVsReal'))}</h2><span class="small muted">${esc(t('executed', { p: execPct }))}</span></div>
    ${barChart(TOPS.map((id) => ({ label: shortAcc(id, p), values: [r.top[id].amt, r.top[id].spent] })), [{ name: t('planned'), color: 'var(--primary)' }, { name: t('real'), color: '#E39B12' }])}
  </section>`;
}

// ---------- Historial ----------
function monthsWithData(list) {
  const keys = new Set();
  list.forEach((p) => Object.keys(p.months).forEach((k) => { if (hasData(p.months[k])) keys.add(k); }));
  return [...keys].sort();
}
function viewHistory() {
  const fam = isFamilyView();
  const profs = fam ? S.profiles : [profile()];
  const keys = monthsWithData(profs).filter((k) => k <= S.month).slice(-12);
  if (!keys.length) return `<section class="card"><h2>${esc(t('historyTitle'))}</h2><p class="muted">${esc(t('noHistory'))}</p></section>`;
  const data = keys.map((k) => {
    if (fam) { const { agg } = familyCalc(k); return { k, r: agg }; }
    const m = peekMonth(profs[0], k); return { k, r: calc(profs[0], m) };
  });
  const chart = barChart(data.map((d) => ({ label: monthLabel(d.k, true), values: [d.r.income, d.r.spent] })), [{ name: t('income'), color: 'var(--primary)' }, { name: t('spent'), color: '#E39B12' }]);
  const table = `<div class="table-wrap"><table><thead><tr><th>${esc(t('month'))}</th><th>${esc(t('income'))}</th><th>${esc(t('spent'))}</th><th>${esc(t('balance'))}</th></tr></thead><tbody>
    ${data.slice().reverse().map((d) => `<tr><td>${esc(monthLabel(d.k))}</td><td class="num">${money(d.r.income)}</td><td class="num">${money(d.r.spent)}</td><td class="num ${d.r.available < 0 ? 'neg' : 'pos'}">${money(d.r.available)}</td></tr>`).join('')}</tbody></table></div>`;
  // comparación por cuenta vs mes anterior
  const cur = data.find((d) => d.k === S.month);
  const prevKey = shiftMonth(S.month, -1);
  const prev = data.find((d) => d.k === prevKey);
  let cmp = `<p class="muted small">${esc(t('noPrev'))}</p>`;
  if (cur && prev) {
    cmp = `<div class="table-wrap"><table><thead><tr><th></th><th>${esc(monthLabel(prevKey, true))}</th><th>${esc(monthLabel(S.month, true))}</th><th>Δ</th></tr></thead><tbody>
      ${TOPS.map((id) => { const a = prev.r.top[id].spent, b = cur.r.top[id].spent, d = b - a; return `<tr><td><span class="row"><i class="dot" style="background:${COLORS[id]}"></i>${esc(fam ? t('acc_' + id) : accName(id, profs[0]))}</span></td><td class="num">${money(a)}</td><td class="num">${money(b)}</td><td class="num ${d > 0 ? 'neg' : d < 0 ? 'pos' : ''}">${d > 0 ? '+' : ''}${money(d)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  return `<section class="card"><h2>${esc(t('historyTitle'))} · ${esc(t('incomeVsSpent'))}</h2>${chart}</section>
    <div class="grid-2"><section class="card">${table}</section><section class="card"><h2>${esc(t('vsPrev'))}</h2>${cmp}</section></div>`;
}

// ---------- Recomendaciones ----------
function recommendations(p) {
  const out = [];
  const m = getMonth(p, S.month), r = calc(p, m);
  if (!r.income) return [t('rec_noIncome'), t('tip1')];
  if (r.diff > 0 && Math.abs(r.diff) >= (dec() ? 0.01 : 1)) out.push(t('rec_unassigned', { r: money(r.diff) }));
  if (r.diff < 0) out.push(t('rec_over', { r: money(-r.diff) }));
  LEAVES.forEach((id) => { if (r.leaf[id].spent > r.leaf[id].amt && r.leaf[id].spent > 0) out.push(t('rec_overspent', { a: accName(id, p) })); });
  if (!r.leaf.emerg.pct) out.push(t('rec_noEmerg'));
  if (!r.leaf.ltinv.pct) out.push(t('rec_noInv'));
  if (r.leaf.fixed.pct > 50 || (r.leaf.fixed.spent > r.income * 0.5)) out.push(t('rec_fixedHigh'));
  if (r.extra > 0) out.push(t('rec_extra', { r: money(r.extra) }));
  const pm = peekMonth(p, shiftMonth(S.month, -1));
  if (pm && totalIncome(pm)) {
    const pr = calc(p, pm);
    ['free', 'fun', 'fixed'].forEach((id) => { const a = pr.leaf[id].spent, b = r.leaf[id].spent; if (a > 0 && b > a * 1.2) out.push(t('rec_rise', { a: accName(id, p), p: Math.round(((b - a) / a) * 100) })); });
    if (pr.leaf.free.left > 0 && pm.exp.length) out.push(t('rec_leftover', { r: money(pr.leaf.free.left), a: accName('free', p) }));
  }
  if (!m.exp.length) out.push(t('rec_noExpenses'));
  if (!out.length) out.push(t('rec_good'));
  return out;
}

// ---------- Más (ajustes) ----------
function viewMore() {
  const s = S.settings, fam = isFamilyView();
  const p = fam ? null : profile();
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  return `
  <div class="grid-2">
    <div class="stack" style="gap:16px">
      ${p ? `<section class="card"><h2>${esc(t('recs'))}</h2><ul class="list">${recommendations(p).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
      <section class="card"><h2>${esc(t('tips'))}</h2><ul class="list">${Array.from({ length: 10 }, (_, i) => `<li>${esc(t('tip' + (i + 1)))}</li>`).join('')}</ul>
        <button class="btn" data-act="tutorial">${esc(t('tutorial'))}</button></section>
    </div>
    <div class="stack" style="gap:16px">
      <section class="card"><h2>${esc(t('profiles'))}</h2>
        <div class="set-row"><span>${esc(t('modeLabel'))}</span><div class="seg" role="group">
          <button data-act="mode" data-v="individual" aria-pressed="${s.mode === 'individual'}">${esc(t('modeIndividual'))}</button>
          <button data-act="mode" data-v="family" aria-pressed="${s.mode === 'family'}">${esc(t('modeFamily'))}</button></div></div>
        ${S.profiles.map((pr) => `<div class="set-row"><span class="row"><span class="member-chip" style="background:${pr.color}">${esc(pr.name.slice(0, 1).toUpperCase())}</span><b>${esc(pr.name)}</b></span>
          <span class="row"><button class="icon-btn" data-act="rename-member" data-id="${pr.id}" aria-label="${esc(t('rename'))}">${icon('pencil')}</button>
          ${S.profiles.length > 1 ? `<button class="icon-btn" data-act="del-member" data-id="${pr.id}" aria-label="${esc(t('delete'))}">${icon('trash')}</button>` : ''}</span></div>`).join('')}
        ${s.mode === 'family' ? `<button class="btn" data-act="add-member">${icon('plus')}${esc(t('addMember'))}</button>` : ''}
      </section>
      ${p ? `<section class="card"><h2>${esc(t('accountsCfg'))}</h2><p class="small muted">${esc(p.name)}</p>
        ${['c1', ...LEAVES].map((id) => `<div class="set-row"><span class="row" style="min-width:0"><i class="dot" style="background:${COLORS[id]}"></i><span class="stack" style="gap:0"><b>${esc(accName(id, p))}</b><span class="small muted">${esc(accDesc(id, p))}</span></span></span><button class="icon-btn" data-act="rename-acc" data-id="${id}" aria-label="${esc(t('edit'))}">${icon('pencil')}</button></div>`).join('')}
        <button class="btn ghost" data-act="reset-names">${esc(t('restoreDefaults'))}</button></section>` : ''}
      <section class="card"><h2>${esc(t('prefs'))}</h2>
        <div class="set-row"><span>${esc(t('language'))}</span><div class="seg"><button data-act="lang" data-v="es" aria-pressed="${s.lang === 'es'}">Español</button><button data-act="lang" data-v="en" aria-pressed="${s.lang === 'en'}">English</button></div></div>
        <div class="set-row"><span>${esc(t('currency'))}</span><select class="input" style="width:auto" data-change="currency">${CURRENCIES.map((c) => opt(c, c, s.currency)).join('')}</select></div>
        <div class="set-row"><span>${esc(t('theme'))}</span><select class="input" style="width:auto" data-change="theme">${opt('auto', t('themeAuto'), s.theme)}${opt('light', t('themeLight'), s.theme)}${opt('dark', t('themeDark'), s.theme)}</select></div>
        <div class="set-row"><span style="flex:1">${esc(t('alertThreshold'))}</span><select class="input" style="width:auto" data-change="alertPct">${[70, 75, 80, 85, 90, 95].map((v) => opt(String(v), v + '%', String(s.alertPct))).join('')}</select></div>
      </section>
      <section class="card"><h2>${esc(t('reminders'))}</h2>
        <div class="set-row"><span>${esc(t('reminderOn'))}</span><label class="switch"><input type="checkbox" data-change="rem-on" ${s.reminder.on ? 'checked' : ''} aria-label="${esc(t('reminderOn'))}"><span></span></label></div>
        <div class="set-row"><span>${esc(t('freq'))}</span><select class="input" style="width:auto" data-change="rem-freq">${opt('daily', t('daily'), s.reminder.freq)}${opt('weekly', t('weekly'), s.reminder.freq)}${opt('monthly', t('monthly'), s.reminder.freq)}</select></div>
        <p class="small muted">${esc(t('reminderNote'))}</p>
        <button class="btn" data-act="ics">${esc(t('addToCalendar'))}</button>
      </section>
      <section class="card"><h2>${esc(t('security'))}</h2>
        <p class="small muted row">${icon('lock')}${esc(s.pw ? t('passwordOn') : t('passwordOff'))}</p>
        <div class="row wrap">${s.pw ? `<button class="btn" data-act="pw-set">${esc(t('changePassword'))}</button><button class="btn danger" data-act="pw-remove">${esc(t('removePassword'))}</button>` : `<button class="btn" data-act="pw-set">${esc(t('setPassword'))}</button>`}</div>
        <div class="set-row"><span>${esc(t('biometric'))}</span><span class="badge warn">${esc(t('soon'))}</span></div>
      </section>
      ${isStandalone() ? '' : `<section class="card"><h2>${esc(t('installSection'))}</h2>${installBanner(true)}</section>`}
      <section class="card"><h2>${esc(t('data'))}</h2>
        <button class="btn primary" data-act="excel">${esc(t('exportExcel'))}</button>
        <div class="row wrap"><button class="btn" data-act="backup">${esc(t('backup'))}</button><button class="btn" data-act="restore">${esc(t('restore'))}</button></div>
        <input type="file" id="restore-file" accept="application/json,.json" class="hidden">
        <p class="small muted">${esc(t('about'))}</p>
        <button class="btn danger" data-act="wipe">${esc(t('wipe'))}</button>
      </section>
    </div>
  </div>`;
}

// ---------- Onboarding ----------
const LOGO = `<img class="flow-logo" src="icons/icon-192.png" alt="">`;
function viewOnboarding() {
  const o = ui.onb, s = S.settings, step = o.step;
  const steps = `<div class="steps">${[0, 1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (step === 0) {
    body = `${LOGO}<h1>${esc(t('welcome'))}</h1><p class="muted">${esc(t('tagline'))}</p>
      ${installBanner(false)}
      <h2>${esc(t('chooseLang'))}</h2>
      <div class="stack"><button class="choice" data-act="lang" data-v="es" aria-pressed="${s.lang === 'es'}"><b>Español</b></button><button class="choice" data-act="lang" data-v="en" aria-pressed="${s.lang === 'en'}"><b>English</b></button></div>
      <button class="btn primary block" data-act="onb-next">${esc(t('next'))}</button>`;
  } else if (step === 1) {
    body = `<h1>${esc(t('chooseMode'))}</h1>
      <div class="stack"><button class="choice" data-act="onb-mode" data-v="individual" aria-pressed="${o.mode === 'individual'}"><b>${esc(t('modeIndividual'))}</b><span class="muted small">${esc(t('modeIndividualD'))}</span></button>
      <button class="choice" data-act="onb-mode" data-v="family" aria-pressed="${o.mode === 'family'}"><b>${esc(t('modeFamily'))}</b><span class="muted small">${esc(t('modeFamilyD'))}</span></button></div>
      <h2>${esc(o.mode === 'family' ? t('familyMembers') : t('yourName'))}</h2>
      <div class="stack">${(o.mode === 'family' ? o.members : o.members.slice(0, 1)).map((n, i) => `<input class="input" data-onb-member="${i}" value="${esc(n)}" placeholder="${esc(t('memberPh'))} ${o.mode === 'family' ? i + 1 : ''}" maxlength="30">`).join('')}
      ${o.mode === 'family' ? `<button class="btn ghost" data-act="onb-add-member">${esc(t('addAnother'))}</button>` : ''}</div>
      <div class="row"><button class="btn" data-act="onb-back">${esc(t('back'))}</button><button class="btn primary" style="flex:1" data-act="onb-next">${esc(t('next'))}</button></div>`;
  } else if (step === 2) {
    body = `<h1>${esc(t('setupMoney'))}</h1>
      <label class="field">${esc(t('currency'))}<select class="input" data-change="currency">${CURRENCIES.map((c) => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">${esc(t('income'))}${o.mode === 'family' ? ` · ${esc(o.members[0] || '')}` : ''}<input class="input big num" id="onb-income" inputmode="numeric" value="${esc(o.income)}" placeholder="${esc(money(0))}"></label>
      <p class="small muted">${esc(t('incomeHint'))}</p>
      <div class="row"><button class="btn" data-act="onb-back">${esc(t('back'))}</button><button class="btn primary" style="flex:1" data-act="onb-next">${esc(t('next'))}</button></div>`;
  } else {
    body = `<div class="row">${icon('lock')}<h1>${esc(t('setupPw'))}</h1></div><p class="muted small">${esc(t('pwHelp'))}</p>
      <label class="field">${esc(t('password'))}<input class="input" type="password" id="onb-pw" autocomplete="new-password"></label>
      <label class="field">${esc(t('password2'))}<input class="input" type="password" id="onb-pw2" autocomplete="new-password"></label>
      <p class="small neg hidden" id="onb-err"></p>
      <div class="row"><button class="btn" data-act="onb-back">${esc(t('back'))}</button><button class="btn primary" style="flex:1" data-act="onb-finish">${esc(t('start'))}</button></div>
      <button class="btn ghost" data-act="onb-finish" data-nopw="1">${esc(t('noPassword'))}</button>`;
  }
  return `<div class="flow"><div class="flow-card card">${steps}${body}</div></div>`;
}
function syncOnbInputs() {
  document.querySelectorAll('[data-onb-member]').forEach((el) => (ui.onb.members[+el.dataset.onbMember] = el.value.trim()));
  const inc = $('#onb-income'); if (inc) ui.onb.income = inc.value;
}
async function finishOnboarding(noPw) {
  const o = ui.onb;
  if (!noPw) {
    const a = $('#onb-pw').value, b = $('#onb-pw2').value, err = $('#onb-err');
    if (a || b) {
      if (a.length < 4) { err.textContent = t('pwShort'); err.classList.remove('hidden'); return; }
      if (a !== b) { err.textContent = t('pwMismatch'); err.classList.remove('hidden'); return; }
      S.settings.pw = await makePw(a);
    }
  }
  const names = (o.mode === 'family' ? o.members : o.members.slice(0, 1)).map((n) => n.trim()).filter(Boolean);
  if (!names.length) names.push(S.settings.lang === 'en' ? 'Me' : 'Yo');
  S.profiles = names.map((n, i) => newProfile(n, i));
  S.settings.mode = o.mode;
  S.active = S.profiles[0].id;
  S.month = monthKey(new Date());
  getMonth(S.profiles[0], S.month).income = parseMoney(o.income);
  S.settings.onboarded = true;
  ui.unlocked = true; ui.tut = 0; ui.tab = 'home';
  save(); render();
}

// ---------- Tutorial ----------
const TUT_ILLU = [
  `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="44" fill="none" stroke="var(--primary)" stroke-width="8"/><text x="60" y="72" text-anchor="middle" font-size="40" font-weight="700" fill="var(--primary)">$</text></svg>`,
  `<svg viewBox="0 0 42 42">${[['c1', 50], ['free', 10], ['edu', 10], ['fun', 10], ['ltinv', 15], ['give', 5]].reduce((a, [id, v]) => { a.s += `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${COLORS[id]}" stroke-width="7" stroke-dasharray="${v - 0.8} ${100 - v + 0.8}" stroke-dashoffset="${25 - a.o}"/>`; a.o += v; return a; }, { s: '', o: 0 }).s}</svg>`,
  `<svg viewBox="0 0 120 120"><rect x="16" y="30" width="88" height="14" rx="7" fill="var(--surface-2)"/><rect x="16" y="30" width="60" height="14" rx="7" fill="#3B6FE0"/><rect x="16" y="56" width="88" height="14" rx="7" fill="var(--surface-2)"/><rect x="16" y="56" width="30" height="14" rx="7" fill="#E39B12"/><rect x="16" y="82" width="88" height="14" rx="7" fill="var(--surface-2)"/><rect x="16" y="82" width="45" height="14" rx="7" fill="#12A37C"/></svg>`,
  `<svg viewBox="0 0 120 120"><g fill="var(--primary)"><rect x="18" y="64" width="16" height="36" rx="3"/><rect x="42" y="44" width="16" height="56" rx="3"/><rect x="66" y="54" width="16" height="46" rx="3"/><rect x="90" y="30" width="16" height="70" rx="3"/></g></svg>`,
];
function viewTutorial() {
  const i = ui.tut;
  return `<div class="flow"><div class="flow-card card">
    <div class="steps">${[0, 1, 2, 3].map((k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tut-illu">${TUT_ILLU[i]}</div>
    <h1>${esc(t('tut' + (i + 1) + 't'))}</h1><p>${esc(t('tut' + (i + 1)))}</p>
    <div class="row">${i > 0 ? `<button class="btn" data-act="tut" data-d="-1">${esc(t('back'))}</button>` : `<button class="btn ghost" data-act="tut-end">${esc(t('skip'))}</button>`}
      <button class="btn primary" style="flex:1" data-act="${i < 3 ? 'tut' : 'tut-end'}" data-d="1">${esc(i < 3 ? t('next') : t('done'))}</button></div>
  </div></div>`;
}

// ---------- Bloqueo ----------
function viewLock() {
  // antes de pedir la contraseña, sugiere instalar la app si se abrió desde el navegador
  return `<div class="flow"><form class="flow-card card" data-form="unlock">${installBanner(false)}${LOGO}<h1>${esc(t('locked'))}</h1>
    <input class="input" type="password" id="lock-pw" autocomplete="current-password" aria-label="${esc(t('password'))}">
    <p class="small neg hidden" id="lock-err">${esc(t('wrongPw'))}</p>
    <button class="btn primary block" type="submit">${icon('lock')}${esc(t('unlock'))}</button>
    <button class="btn ghost" type="button" data-act="forgot">${esc(t('forgot'))}</button></form></div>`;
}

// ---------- Modal / toast ----------
function modal(html, onSubmit) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back" data-act="modal-close"><form class="modal" role="dialog" aria-modal="true">${html}</form></div>`;
  const form = root.querySelector('form');
  form.addEventListener('submit', async (e) => { e.preventDefault(); const keep = await onSubmit(new FormData(form), form); if (keep !== true) closeModal(); });
  const first = form.querySelector('input,select,textarea,button'); if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('#modal-root').innerHTML = ''; }
function confirmModal(msg, okLabel, onOk, danger = true) {
  modal(`<p>${esc(msg)}</p><div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn ${danger ? 'primary' : 'primary'}" style="flex:1;${danger ? 'background:var(--danger);border-color:var(--danger)' : ''}">${esc(okLabel)}</button></div>`, onOk);
}
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toast-root').appendChild(el); setTimeout(() => el.remove(), kind ? 4200 : 2400);
}

// ---------- Exportación ----------
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = rej; document.head.appendChild(s);
  });
}
function reportRows() {
  const L = (k) => t(k);
  const summary = [[L('member'), L('month'), L('expenseAcc'), '%', L('assigned'), L('spent'), L('remaining')]];
  const expenses = [[L('member'), L('month'), L('expenseDate'), L('expenseAcc'), L('expenseDesc'), L('amount')]];
  const history = [[L('member'), L('month'), L('incomeFixed'), L('extraIncome'), L('incomeTotal'), L('assigned'), L('spent'), L('balance'), L('unassigned')]];
  const extras = [[L('member'), L('month'), L('expenseDate'), L('expenseDesc'), L('amount')]];
  S.profiles.forEach((p) => {
    Object.keys(p.months).sort().forEach((k) => {
      const m = p.months[k]; if (!hasData(m)) return;
      const r = calc(p, m);
      history.push([p.name, k, r.base, r.extra, r.income, r.assigned, r.spent, r.available, r.diff]);
      (m.extra || []).slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => extras.push([p.name, k, e.date, e.desc || '', e.amount]));
      LEAVES.forEach((id) => summary.push([p.name, k, (C1_KIDS.includes(id) ? accName('c1', p) + ' › ' : '') + accName(id, p), Math.round(r.leaf[id].pct * 10) / 10, r.leaf[id].amt, r.leaf[id].spent, r.leaf[id].left]));
      m.exp.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => expenses.push([p.name, k, e.date, accName(e.acc, p), e.desc || '', e.amount]));
    });
  });
  const debts = [[L('member'), L('debtWord'), L('debtTotal'), L('cuota'), L('paidThisTotal'), L('balanceLeft')]];
  const debtPays = [[L('member'), L('debtWord'), L('month'), L('expenseDate'), L('payType'), L('amount')]];
  S.profiles.forEach((p) => (p.debts || []).forEach((d) => {
    debts.push([p.name, d.name, d.total, d.cuota || 0, debtPaid(d), debtLeft(d)]);
    d.pays.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => debtPays.push([p.name, d.name, x.month, x.date, t(x.kind), x.amount]));
  }));
  return { summary, expenses, history, extras, debts, debtPays };
}
async function exportExcel() {
  const { summary, expenses, history, extras, debts, debtPays } = reportRows();
  const fname = 'mis-6-cuentas-' + S.month;
  try {
    const X = await loadXLSX();
    const wb = X.utils.book_new();
    const add = (rows, name, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map((w) => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
    const es = S.settings.lang === 'es';
    add(history, es ? 'Resumen mensual' : 'Monthly summary', [16, 10, 14, 16, 14, 14, 14, 14, 14]);
    add(summary, es ? 'Cuentas' : 'Accounts', [16, 10, 40, 8, 14, 14, 14]);
    add(expenses, es ? 'Gastos' : 'Expenses', [16, 10, 12, 28, 30, 14]);
    add(extras, es ? 'Ingresos extraordinarios' : 'Extra income', [16, 10, 12, 30, 14]);
    add(debts, es ? 'Deudas' : 'Debts', [16, 24, 14, 12, 14, 14]);
    add(debtPays, es ? 'Pagos de deudas' : 'Debt payments', [16, 24, 10, 12, 10, 14]);
    X.writeFile(wb, fname + '.xlsx');
    toast(t('exported'));
  } catch (e) {
    // sin internet la primera vez: exporta CSV, que Excel también abre
    const csv = [...history, [], ...summary, [], ...expenses, [], ...extras, [], ...debts, [], ...debtPays].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(fname + '.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    toast(t('exported') + ' (CSV)');
  }
}
function exportICS() {
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[S.settings.reminder.freq];
  const d = new Date(); d.setDate(d.getDate() + 1);
  const ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mis6Cuentas//ES', 'BEGIN:VEVENT', 'UID:' + uid() + '@mis6cuentas', 'DTSTAMP:' + ds + 'T090000',
    'DTSTART:' + ds + 'T200000', 'DURATION:PT15M', 'RRULE:FREQ=' + freq, 'SUMMARY:' + t('appName') + ' — ' + t('reminderOn'), 'DESCRIPTION:' + t('reminderDue'),
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + t('reminderDue'), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  download('recordatorio-presupuesto.ics', new Blob([ics], { type: 'text/calendar' }));
}

// ---------- Eventos ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, p = profile();
  switch (act) {
    case 'tab': ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'month': S.month = shiftMonth(S.month, +el.dataset.d); save(); render(); break;
    case 'goto-profile': S.active = el.dataset.id; save(); render(); break;
    case 'lang': if (!S.settings.onboarded) syncOnbInputs(); S.settings.lang = el.dataset.v; save(); render(); break;
    case 'onb-mode': syncOnbInputs(); ui.onb.mode = el.dataset.v; render(); break;
    case 'onb-add-member': syncOnbInputs(); ui.onb.members.push(''); render(); setTimeout(() => { const all = document.querySelectorAll('[data-onb-member]'); if (all.length) all[all.length - 1].focus(); }, 20); break;
    case 'onb-next': syncOnbInputs(); ui.onb.step++; render(); break;
    case 'onb-back': syncOnbInputs(); ui.onb.step--; render(); break;
    case 'onb-finish': syncOnbInputs(); finishOnboarding(!!el.dataset.nopw); break;
    case 'tut': ui.tut = Math.max(0, Math.min(3, ui.tut + +el.dataset.d)); render(); break;
    case 'tut-end': ui.tut = null; render(); break;
    case 'tutorial': ui.tut = 0; render(); window.scrollTo(0, 0); break;
    case 'apply-rule': getMonth(p, S.month).pct = { ...p.rule }; save(); render(); toast(t('ruleApplied')); break;
    case 'save-rule': p.rule = { ...getMonth(p, S.month).pct }; save(); render(); toast(t('ruleSaved')); break;
    case 'recommended': getMonth(p, S.month).pct = { ...RECOMMENDED }; save(); render(); toast(t('ruleApplied')); break;
    case 'exp-menu': expenseMenu(el.dataset.id); break;
    case 'exp-edit': closeModal(); editExpense(el.dataset.id); break;
    case 'exp-del': closeModal(); deleteExpense(p, S.month, el.dataset.id); save(); render(); toast(t('expenseDeleted')); break;
    case 'extra-menu': extraMenu(el.dataset.id); break;
    case 'extra-edit': editExtra(el.dataset.id); break;
    case 'extra-del': { const m = getMonth(p, S.month); m.extra = (m.extra || []).filter((x) => x.id !== el.dataset.id); save(); render(); openExtras(); toast(t('extraDeleted')); break; }
    case 'debt-add': editDebt(null); break;
    case 'debt-edit': editDebt(el.dataset.id); break;
    case 'debt-del': {
      const d = (p.debts || []).find((x) => x.id === el.dataset.id);
      confirmModal(t('debtDeleteQ', { n: d.name }), t('delete'), () => { removeDebt(p, d.id); save(); render(); toast(t('debtDeleted')); });
      break;
    }
    case 'debt-cuota': payDebt(el.dataset.id, 'cuota'); break;
    case 'debt-abono': payDebt(el.dataset.id, 'abono'); break;
    case 'debt-pay-menu': debtPayMenu(el.dataset.id, el.dataset.pay); break;
    case 'debt-pay-del': { closeModal(); deleteDebtPayment(p, el.dataset.id, el.dataset.pay); save(); render(); toast(t('paymentDeleted')); break; }
    case 'debt-toggle': ui.debtOpen = ui.debtOpen === el.dataset.id ? null : el.dataset.id; render(); break;
    case 'reminder-ok': S.settings.reminder.last = Date.now(); save(); ui.tab = 'expenses'; render(); break;
    case 'extras': openExtras(); break;
    case 'install':
      if (installPrompt) { const ev = installPrompt; installPrompt = null; ev.prompt(); try { await ev.userChoice; } catch (err) {} render(); }
      break;
    case 'install-later': S.settings.installHide = true; save(); render(); break;
    case 'mode':
      S.settings.mode = el.dataset.v;
      if (S.settings.mode === 'individual' && S.active === 'family') S.active = S.profiles[0].id;
      save(); render(); break;
    case 'add-member':
      modal(`<h2>${esc(t('addMember'))}</h2><input class="input" name="n" maxlength="30" placeholder="${esc(t('memberName'))}" required><div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('add'))}</button></div>`,
        (fd) => { const n = String(fd.get('n')).trim(); if (!n) return true; const np = newProfile(n, S.profiles.length); S.profiles.push(np); S.active = np.id; save(); render(); });
      break;
    case 'rename-member': {
      const pr = S.profiles.find((x) => x.id === el.dataset.id);
      modal(`<h2>${esc(t('rename'))}</h2><input class="input" name="n" maxlength="30" value="${esc(pr.name)}" required><div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('save'))}</button></div>`,
        (fd) => { const n = String(fd.get('n')).trim(); if (n) { pr.name = n; save(); render(); } });
      break;
    }
    case 'del-member': {
      if (S.profiles.length < 2) { toast(t('cantDeleteLast'), 'warn'); break; }
      const pr = S.profiles.find((x) => x.id === el.dataset.id);
      confirmModal(t('deleteMember', { n: pr.name }), t('delete'), () => { S.profiles = S.profiles.filter((x) => x.id !== pr.id); if (S.active === pr.id) S.active = S.profiles[0].id; save(); render(); });
      break;
    }
    case 'rename-acc': {
      const id = el.dataset.id;
      modal(`<h2>${esc(t('edit'))}</h2><label class="field">${esc(t('name'))}<input class="input" name="n" maxlength="40" value="${esc(accName(id, p))}"></label>
        <label class="field">${esc(t('description'))}<input class="input" name="d" maxlength="100" value="${esc(accDesc(id, p))}"></label>
        <div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('save'))}</button></div>`,
        (fd) => {
          const n = String(fd.get('n')).trim(), d = String(fd.get('d')).trim();
          p.names[id] = { name: n && n !== t('acc_' + id) ? n : '', desc: d && d !== t('acc_' + id + '_d') ? d : '' };
          if (!p.names[id].name && !p.names[id].desc) delete p.names[id];
          save(); render();
        });
      break;
    }
    case 'reset-names': p.names = {}; save(); render(); break;
    case 'pw-set':
      modal(`<h2>${esc(S.settings.pw ? t('changePassword') : t('setPassword'))}</h2>
        ${S.settings.pw ? `<label class="field">${esc(t('currentPw'))}<input class="input" type="password" name="cur" autocomplete="current-password" required></label>` : ''}
        <label class="field">${esc(t('password'))}<input class="input" type="password" name="a" autocomplete="new-password" required></label>
        <label class="field">${esc(t('password2'))}<input class="input" type="password" name="b" autocomplete="new-password" required></label>
        <p class="small neg hidden" id="pw-err"></p>
        <div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('save'))}</button></div>`,
        async (fd) => {
          const err = $('#pw-err'), fail = (m) => { err.textContent = m; err.classList.remove('hidden'); return true; };
          if (S.settings.pw && !(await checkPw(String(fd.get('cur'))))) return fail(t('wrongPw'));
          const a = String(fd.get('a')), b = String(fd.get('b'));
          if (a.length < 4) return fail(t('pwShort'));
          if (a !== b) return fail(t('pwMismatch'));
          S.settings.pw = await makePw(a); save(); render(); toast(t('pwSaved'));
        });
      break;
    case 'pw-remove':
      modal(`<h2>${esc(t('removePassword'))}</h2><label class="field">${esc(t('currentPw'))}<input class="input" type="password" name="cur" required></label><p class="small neg hidden" id="pw-err">${esc(t('wrongPw'))}</p>
        <div class="row"><button type="button" class="btn" data-act="modal-close" style="flex:1">${esc(t('cancel'))}</button><button class="btn primary" style="flex:1">${esc(t('confirm'))}</button></div>`,
        async (fd) => { if (!(await checkPw(String(fd.get('cur'))))) { $('#pw-err').classList.remove('hidden'); return true; } S.settings.pw = null; save(); render(); toast(t('pwRemoved')); });
      break;
    case 'forgot': confirmModal(t('forgotMsg') + ' ' + t('wipeConfirm'), t('wipe'), wipeAll); break;
    case 'excel': exportExcel(); break;
    case 'ics': exportICS(); break;
    case 'backup': download('respaldo-mis-6-cuentas-' + todayISO() + '.json', new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); break;
    case 'restore': $('#restore-file').click(); break;
    case 'wipe': confirmModal(t('wipeConfirm'), t('wipe'), wipeAll); break;
    case 'modal-close': if (e.target === el || el.tagName === 'BUTTON') closeModal(); break;
  }
});
function wipeAll() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  S = blankState(); ui = { tab: 'home', unlocked: false, onb: { step: 0, members: [''], mode: 'individual', income: '', pw: '' }, tut: null, expFilter: 'all' };
  closeModal(); render();
}
document.addEventListener('toggle', (e) => { if (e.target.dataset && e.target.dataset.toggle === 'c1') ui.c1open = e.target.open; }, true);

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'restore-file') return restoreFile(el.files[0]);
  const k = el.dataset.change; if (!k) return;
  const p = profile();
  switch (k) {
    case 'profile': S.active = el.value; break;
    case 'income': getMonth(p, S.month).income = parseMoney(el.value); break;
    case 'pct': {
      const v = Number(String(el.value).replace(',', '.').replace(/[^\d.]/g, ''));
      getMonth(p, S.month).pct[el.dataset.id] = isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; break;
    }
    case 'amt': {
      const m = getMonth(p, S.month), tot = totalIncome(m); if (!tot) break;
      m.pct[el.dataset.id] = Math.max(0, (parseMoney(el.value) / tot) * 100); break;
    }
    case 'exp-filter': ui.expFilter = el.value; break;
    case 'currency': if (!S.settings.onboarded) syncOnbInputs(); S.settings.currency = el.value; break;
    case 'theme': S.settings.theme = el.value; break;
    case 'alertPct': S.settings.alertPct = Number(el.value); break;
    case 'rem-on':
      S.settings.reminder.on = el.checked; S.settings.reminder.last = Date.now();
      if (el.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      break;
    case 'rem-freq': S.settings.reminder.freq = el.value; break;
  }
  save();
  deferRender();
});

// Un campo de texto dispara "change" al perder el foco, justo cuando el usuario toca otro botón.
// Re-dibujar en ese instante reemplaza el botón y el toque se pierde; por eso se espera a soltar el dedo/ratón.
let pointerDown = false, pendingRender = false;
function deferRender() {
  pendingRender = true;
  if (!pointerDown) setTimeout(flushRender, 0);
}
function flushRender() { if (pendingRender) { pendingRender = false; render(); } }
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { pointerDown = false; if (pendingRender) setTimeout(flushRender, 0); }, true);
document.addEventListener('pointercancel', () => { pointerDown = false; if (pendingRender) setTimeout(flushRender, 0); }, true);

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'unlock') {
    if (await checkPw($('#lock-pw').value)) { ui.unlocked = true; render(); }
    else { $('#lock-err').classList.remove('hidden'); $('#lock-pw').select(); }
    return;
  }
  if (f.dataset.form === 'expense') {
    const p = profile(), fd = new FormData(f);
    const amount = parseMoney(fd.get('amount'));
    if (!amount) { toast(t('invalidAmount'), 'warn'); return; }
    const acc = String(fd.get('acc'));
    let date = String(fd.get('date') || todayISO());
    if (!date.startsWith(S.month)) date = S.month + '-01';
    const m = getMonth(p, S.month);
    m.exp.push({ id: uid(), acc, amount, desc: String(fd.get('desc') || '').trim(), date });
    ui.lastAcc = acc;
    save(); render();
    const l = calc(p, m).leaf[acc];
    if (l.spent > l.amt) toast(t('alertOver', { a: accName(acc, p), r: money(l.spent - l.amt) }), 'bad');
    else if (l.amt > 0 && (l.spent / l.amt) * 100 >= S.settings.alertPct) {
      const msg = t('alertNear', { a: accName(acc, p), p: Math.round((l.spent / l.amt) * 100), r: money(l.left) });
      toast(msg, 'warn');
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(t('appName'), { body: msg });
    } else toast(t('expenseAdded'));
    const amt = document.querySelector('[data-form="expense"] [name="amount"]'); if (amt) amt.focus();
  }
});

function restoreFile(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(rd.result);
      if (!data || !Array.isArray(data.profiles) || !data.settings) throw new Error('bad');
      S = Object.assign(blankState(), data); ui.unlocked = true; save(); render(); toast(t('restored'));
    } catch (e) { toast(t('badFile'), 'bad'); }
  };
  rd.readAsText(file);
}

// Formatea montos al salir del campo (sin re-render)
// filas tocables (gastos, ingresos, pagos) también se activan con Enter o Espacio
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('focusin', (e) => { if (e.target.matches('input[inputmode="numeric"], input[inputmode="decimal"]')) setTimeout(() => e.target.select && e.target.select(), 0); });

// Recordatorio con notificación si toca al abrir
function maybeNotify() {
  if (S.settings.onboarded && reminderDue() && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(t('appName'), { body: t('reminderDue'), icon: 'icons/icon-192.png' }); } catch (e) {}
  }
}

// Service worker (solo en http/https)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
maybeNotify();
})();
