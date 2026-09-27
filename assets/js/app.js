/* Grove — app. Local-first habit tracker.
 * Storage keys are unchanged from v1 ("grove:habits-index", "grove:habit:<id>") so existing data keeps working. */
'use strict';

// ================= Storage (localStorage, namespaced) =================
const NS = 'grove:';
const store = {
  get(key) { const raw = localStorage.getItem(NS + key); return raw === null ? null : raw; },
  set(key, value) { localStorage.setItem(NS + key, value); },
  del(key) { localStorage.removeItem(NS + key); },
};

// ================= Date utils =================
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const startOfWeek = (d) => { const c = startOfDay(d); return addDays(c, -c.getDay()); };
const sameDate = (a, b) => toISO(a) === toISO(b);
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtLong = (iso) => parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// ================= State =================
const state = { habits: [], selectedId: null, range: 'month', loading: true, modal: null };
const RANGE_DAYS = { week: 7, month: 30, '3m': 90, '6m': 180, '1y': 365 };
const RANGE_LABELS = { week: 'Week', month: 'Month', '3m': '3 months', '6m': '6 months', '1y': 'Year' };
const RANGE_KEYS = Object.keys(RANGE_LABELS);
// Colour ids are the v1 ids (kept for stored data); hex values are the new dark-friendly palette.
const COLOR_OPTIONS = [
  { id: 'forest', hex: '#34D399', name: 'Moss' }, { id: 'amber', hex: '#FFC24D', name: 'Gold' }, { id: 'clay', hex: '#FF6B4A', name: 'Ember' },
  { id: 'indigo', hex: '#6E7BFF', name: 'Ion' }, { id: 'plum', hex: '#C15BFF', name: 'Plum' }, { id: 'teal', hex: '#2DD4C8', name: 'Teal' },
];
const colorHex = (id) => (COLOR_OPTIONS.find((c) => c.id === id) || COLOR_OPTIONS[2]).hex;
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

// ================= Persistence =================
function getIndex() { try { const v = JSON.parse(store.get('habits-index') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function setIndex(ids) { store.set('habits-index', JSON.stringify(ids)); }
function getHabit(id) { try { const raw = store.get(`habit:${id}`); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function saveHabit(h) { store.set(`habit:${h.id}`, JSON.stringify(h)); }
function deleteHabitStorage(id) { store.del(`habit:${id}`); }

function loadAll() {
  state.loading = true; render();
  const habits = [];
  for (const id of getIndex()) { const h = getHabit(id); if (h) { if (!h.entries) h.entries = {}; habits.push(h); } }
  state.habits = habits;
  const remembered = store.get('selected');
  state.selectedId = habits.find((h) => h.id === remembered) ? remembered : (habits[0]?.id ?? null);
  state.range = RANGE_KEYS.includes(store.get('range')) ? store.get('range') : 'month';
  state.loading = false; render();
}
const genId = () => 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function addHabit(name, colorId) {
  const habit = { id: genId(), name, color: colorId, createdAt: toISO(new Date()), entries: {} };
  state.habits.push(habit); state.selectedId = habit.id; state.modal = null;
  setIndex(state.habits.map((h) => h.id)); saveHabit(habit); store.set('selected', habit.id);
  render(); toast(`Planted “${name}”`);
}
function updateHabit(id, name, colorId) {
  const h = state.habits.find((x) => x.id === id); if (!h) return;
  h.name = name; h.color = colorId; state.modal = null; saveHabit(h); render(); toast('Saved');
}
function removeHabit(id) {
  const h = state.habits.find((x) => x.id === id);
  state.habits = state.habits.filter((x) => x.id !== id);
  if (state.selectedId === id) state.selectedId = state.habits[0]?.id ?? null;
  state.modal = null; setIndex(state.habits.map((x) => x.id)); deleteHabitStorage(id); render();
  if (h) toast(`Removed “${h.name}”`);
}
function setDayCount(habitId, iso, count) {
  const habit = state.habits.find((h) => h.id === habitId); if (!habit) return;
  const c = Math.max(0, Math.min(30, count));
  if (c === 0) delete habit.entries[iso]; else habit.entries[iso] = c;
  saveHabit(habit); render();
}
function selectHabit(id) { state.selectedId = id; store.set('selected', id); render(); }
function setRange(r) { state.range = r; store.set('range', r); render(); }

// ================= Stats =================
function computeStats(habit) {
  const dates = Object.keys(habit.entries).filter((k) => habit.entries[k] > 0).sort();
  const total = dates.reduce((s, k) => s + habit.entries[k], 0);
  let longest = 0, run = 0, prev = null;
  for (const iso of dates) { const d = parseISO(iso); run = prev && sameDate(addDays(prev, 1), d) ? run + 1 : 1; longest = Math.max(longest, run); prev = d; }
  let current = 0, cursor = startOfDay(new Date());
  if (!(habit.entries[toISO(cursor)] > 0)) cursor = addDays(cursor, -1);
  while (habit.entries[toISO(cursor)] > 0) { current += 1; cursor = addDays(cursor, -1); }
  return { total, daysTracked: dates.length, longest, current };
}
function getWeeksForRange(range, endDate) {
  const end = startOfDay(endDate);
  const first = startOfWeek(addDays(end, -(RANGE_DAYS[range] - 1))), last = startOfWeek(end);
  const weeks = []; let cursor = first;
  while (cursor <= last) { weeks.push(cursor); cursor = addDays(cursor, 7); }
  return weeks;
}
const weekTotal = (habit, ws) => { let t = 0; for (let i = 0; i < 7; i++) t += habit.entries[toISO(addDays(ws, i))] || 0; return t; };
const dayCount = (habit, d) => habit.entries[toISO(d)] || 0;

// ================= Export / import =================
function exportJSON() {
  const data = { app: 'grove', version: 2, exportedAt: new Date().toISOString(), habits: state.habits };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `grove-backup-${toISO(new Date())}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const list = Array.isArray(data) ? data : data.habits;
      if (!Array.isArray(list)) throw new Error('bad');
      let added = 0;
      for (const h of list) {
        if (!h || typeof h.name !== 'string') continue;
        const existing = state.habits.find((x) => x.id === h.id);
        const habit = { id: existing ? h.id : (h.id || genId()), name: h.name.slice(0, 60), color: COLOR_OPTIONS.some((c) => c.id === h.color) ? h.color : 'clay', createdAt: h.createdAt || toISO(new Date()), entries: {} };
        for (const [k, v] of Object.entries(h.entries || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v > 0) habit.entries[k] = Math.min(30, Math.round(v));
        if (existing) Object.assign(existing, habit); else { state.habits.push(habit); added++; }
        saveHabit(habit);
      }
      setIndex(state.habits.map((x) => x.id));
      if (!state.selectedId && state.habits.length) state.selectedId = state.habits[0].id;
      render(); toast(added ? `Imported ${added} habit${added === 1 ? '' : 's'}` : 'Updated existing habits');
    } catch { toast('That file is not a Grove backup'); }
  };
  reader.readAsText(file);
}

// ================= Rendering =================
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render() {
  const app = document.getElementById('app');
  if (state.loading) { app.innerHTML = '<div class="loading-msg">Loading your grove…</div>'; return; }
  const habit = state.habits.find((h) => h.id === state.selectedId) || null;
  app.innerHTML = `
    <aside class="sidebar" aria-label="Habits">
      <div class="brand">
        <a href="/" class="brand-mark"><span class="logo-dot"></span>GROVE</a>
        <a href="/" class="brand-home">← Home</a>
      </div>
      <div class="label">Habits you're growing</div>
      <nav class="habit-list" aria-label="Your habits">${renderHabitList()}</nav>
      <button class="new-habit-btn" id="btn-new-habit">+ New habit <kbd>N</kbd></button>
      <div class="sidebar-foot">
        <button class="tiny-btn" id="btn-export" title="Download a JSON backup">Export</button>
        <button class="tiny-btn" id="btn-import" title="Restore from a JSON backup">Import</button>
        <input type="file" id="import-file" accept="application/json" hidden>
      </div>
    </aside>
    <main class="main">${habit ? renderMain(habit) : renderEmptyMain()}</main>
    <div class="mobile-bar">
      ${habit ? `<button class="btn primary" id="btn-log-today-m">Log today</button>` : ''}
      <button class="btn" id="btn-new-habit-m">+ New habit</button>
    </div>
    ${state.modal ? renderModal() : ''}
  `;
  attachHandlers(habit);
}

function renderHabitList() {
  if (!state.habits.length) return `<div class="sidebar-empty">No habits yet. Plant your first one and start ticking off days.</div>`;
  const todayISO = toISO(new Date());
  return state.habits.map((h) => {
    const s = computeStats(h), hex = colorHex(h.color);
    return `
      <button class="habit-item ${h.id === state.selectedId ? 'active' : ''}" data-select="${h.id}" aria-current="${h.id === state.selectedId}">
        <span class="habit-dot" style="background:${hex};--dot-glow:${rgba(hex, .5)}"></span>
        <span class="habit-item-name">${esc(h.name)}</span>
        ${h.entries[todayISO] > 0 ? `<span class="habit-item-today" title="Logged today"></span>` : ''}
        ${s.current > 0 ? `<span class="habit-item-streak" title="Current streak">🔥 ${s.current}</span>` : ''}
      </button>`;
  }).join('');
}

function renderEmptyMain() {
  const cells = Array.from({ length: 14 * 7 }, (_, i) => `<span class="${Math.random() < 0.14 ? 'on' : ''}" style="animation-delay:${(i % 14) * 0.15}s"></span>`).join('');
  return `
    <div class="main-empty">
      <div class="empty-field" aria-hidden="true">${cells}</div>
      <h2>Your grove is empty</h2>
      <p>Plant a habit or a project you want to keep showing up for. Every day you tick it off, the field fills in a little more.</p>
      <button class="btn primary lg" id="btn-empty-new">Plant your first habit</button>
    </div>`;
}

function renderMain(habit) {
  const stats = computeStats(habit), hex = colorHex(habit.color);
  const todayISO = toISO(new Date()), todayN = habit.entries[todayISO] || 0;
  return `
    <div class="header-row">
      <div>
        <div class="habit-title-wrap">
          <span class="habit-title-dot" style="background:${hex};--dot-glow:${rgba(hex, .55)}"></span>
          <h1 class="habit-title">${esc(habit.name)}</h1>
        </div>
        <div class="habit-subtitle">Planted ${esc(habit.createdAt)}</div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="btn-edit-habit">✎ <span>Rename</span></button>
        <button class="icon-btn danger" id="btn-delete-habit">✕ <span>Remove</span></button>
      </div>
    </div>

    <div class="today-card">
      <div class="today-info">
        <b>${todayN > 0 ? 'Logged today' : 'Not logged yet today'}</b>
        <span>${todayN > 0 ? `${todayN} so far · ${stats.current}-day streak` : (stats.current > 0 ? `Keep the ${stats.current}-day streak alive` : 'Start a streak of one')}</span>
      </div>
      <div class="today-actions">
        <button class="btn round" data-inc="${habit.id}|${todayISO}|-1" aria-label="Subtract one from today" ${todayN === 0 ? 'disabled style="opacity:.35"' : ''}>−</button>
        <span class="today-count" aria-live="polite">${todayN}</span>
        <button class="btn primary lg" id="btn-log-today" data-inc="${habit.id}|${todayISO}|1">Log today <kbd class="kbd" style="color:var(--void);border-color:rgba(5,5,6,.3)">T</kbd></button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-num accent">${stats.current}</div><div class="stat-label">Current streak</div></div>
      <div class="stat-card"><div class="stat-num moss">${stats.longest}</div><div class="stat-label">Longest streak</div></div>
      <div class="stat-card"><div class="stat-num">${stats.total}</div><div class="stat-label">Total logged</div></div>
      <div class="stat-card"><div class="stat-num">${stats.daysTracked}</div><div class="stat-label">Days tracked</div></div>
    </div>

    <div class="range-tabs" role="tablist" aria-label="Range">
      ${RANGE_KEYS.map((r, i) => `<button role="tab" aria-selected="${state.range === r}" class="range-tab ${state.range === r ? 'active' : ''}" data-range="${r}">${RANGE_LABELS[r]} <kbd class="kbd">${i + 1}</kbd></button>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-title">Weekly log <span class="hint">tap a day to add one · hover for −</span></div>
      ${renderLogGrid(habit)}
    </div>
    <div class="panel">
      <div class="panel-title">The field <span class="hint">${RANGE_LABELS[state.range]} · tap a cell to log</span></div>
      ${renderHeatmap(habit)}
    </div>
    <div class="panel">
      <div class="panel-title">${state.range === 'week' ? 'This week, by day' : 'Totals by week'} <span class="hint">${RANGE_LABELS[state.range]}</span></div>
      ${renderBarChart(habit)}
    </div>`;
}

function renderLogGrid(habit) {
  const today = startOfDay(new Date()), thisWeekStart = startOfWeek(today), hex = colorHex(habit.color);
  const weeks = []; for (let i = 5; i >= 0; i--) weeks.push(addDays(thisWeekStart, -7 * i));
  const head = `<div class="log-head">Week of</div>${DAY_LABELS.map((d) => `<div class="log-head">${d}</div>`).join('')}<div class="log-head" style="text-align:right">Total</div>`;
  const rows = weeks.map((ws) => {
    const isCurrent = sameDate(ws, thisWeekStart);
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), iso = toISO(d), c = dayCount(habit, d), future = d > today, isToday = sameDate(d, today);
      const style = c > 0 ? `background:${rgba(hex, Math.min(1, 0.35 + c * 0.13))};border-color:${rgba(hex, .5)}` : '';
      cells += `<div class="day-cell ${isToday ? 'today' : ''} ${future ? 'future' : ''} ${c > 0 ? 'has' : ''}" style="${style}" ${future ? '' : `data-inc="${habit.id}|${iso}|1" role="button" tabindex="0" aria-label="${fmtLong(iso)}: ${c}. Tap to add one"`}>
        ${c || (future ? '' : '·')}
        ${!future && c > 0 ? `<button class="minus" data-inc="${habit.id}|${iso}|-1" aria-label="Subtract one from ${fmtLong(iso)}">−</button>` : ''}
      </div>`;
    }
    return `<div class="week-label ${isCurrent ? 'current' : ''}">${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}</div>${cells}<div class="week-total">${weekTotal(habit, ws)}</div>`;
  }).join('');
  return `<div class="log-grid">${head}${rows}</div>`;
}

function heatColor(count, hex) {
  if (count <= 0) return 'var(--grid-empty)';
  const steps = [0.28, 0.45, 0.65, 0.85, 1];
  return rgba(hex, steps[Math.min(steps.length - 1, Math.floor((count - 1) / 2))]);
}
function renderHeatmap(habit) {
  const today = startOfDay(new Date()), weeks = getWeeksForRange(state.range, today), hex = colorHex(habit.color);
  const colWidth = 16;
  let lastMonth = null, lastLabelIdx = -10;
  const months = weeks.map((w, idx) => {
    if (w.getMonth() === lastMonth) return '';
    lastMonth = w.getMonth();
    if (idx - lastLabelIdx < 3) return ''; // skip labels that would collide with the previous one
    lastLabelIdx = idx;
    return `<span class="heatmap-month-label" style="left:${idx * colWidth}px">${MONTH_NAMES[w.getMonth()]}</span>`;
  }).join('');
  const cols = weeks.map((ws) => {
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), iso = toISO(d), future = d > today, c = dayCount(habit, d);
      cells += future ? `<span class="heatmap-cell future"></span>` : `<button class="heatmap-cell" style="background:${heatColor(c, hex)}" data-inc="${habit.id}|${iso}|1" title="${fmtLong(iso)}: ${c}" aria-label="${fmtLong(iso)}: ${c}. Tap to add one"></button>`;
    }
    return `<div class="heatmap-week">${cells}</div>`;
  }).join('');
  return `
    <div class="heatmap-scroll"><div class="heatmap-grid">
      <div class="heatmap-months" style="width:${weeks.length * colWidth}px">${months}</div>
      <div class="heatmap-body"><div class="heatmap-daylabels"><div></div><div>Mon</div><div></div><div>Wed</div><div></div><div>Fri</div><div></div></div>${cols}</div>
    </div></div>
    <div class="heatmap-legend"><span>Less</span><span class="legend-cell" style="background:var(--grid-empty)"></span>${[1, 3, 5, 9].map((n) => `<span class="legend-cell" style="background:${heatColor(n, hex)}"></span>`).join('')}<span>More</span></div>`;
}

function renderBarChart(habit) {
  const today = startOfDay(new Date()), hex = colorHex(habit.color);
  let bars;
  if (state.range === 'week') { const ws = startOfWeek(today); bars = DAY_LABELS.map((l, i) => ({ label: l, value: dayCount(habit, addDays(ws, i)) })); }
  else bars = getWeeksForRange(state.range, today).map((w) => ({ label: `${MONTH_NAMES[w.getMonth()]} ${w.getDate()}`, value: weekTotal(habit, w) }));
  if (bars.every((b) => b.value === 0)) return `<div class="bar-empty-msg">Nothing logged in this range yet — tick off a day to see it here.</div>`;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const chartH = 160, gap = state.range === 'week' ? 18 : 4, barW = state.range === 'week' ? 46 : 14;
  const chartW = bars.length * (barW + gap) + gap, every = state.range === 'week' ? 1 : Math.ceil(bars.length / 12);
  const svg = bars.map((b, i) => {
    const h = (b.value / max) * (chartH - 26), x = gap + i * (barW + gap), y = chartH - h - 20;
    return `<g><rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${hex}" fill-opacity="${0.55 + 0.45 * (b.value / max)}"><title>${b.label}: ${b.value}</title></rect>
      ${b.value > 0 ? `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" font-family="JetBrains Mono, monospace" fill="#9AA0A8">${b.value}</text>` : ''}
      ${i % every === 0 ? `<text x="${x + barW / 2}" y="${chartH - 4}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono, monospace" fill="#6C727B">${b.label}</text>` : ''}</g>`;
  }).join('');
  return `<div class="bar-chart-wrap"><svg class="bar-chart" width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="Bar chart of logged counts"><line x1="0" y1="${chartH - 20}" x2="${chartW}" y2="${chartH - 20}" stroke="rgba(245,246,243,0.12)"/>${svg}</svg></div>`;
}

function renderModal() {
  const m = state.modal;
  if (m.type === 'delete') {
    const h = state.habits.find((x) => x.id === m.id);
    return `<div class="modal-overlay" id="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h3 id="modal-title">Remove “${esc(h?.name || '')}”?</h3>
      <p class="sub">Its ${Object.keys(h?.entries || {}).length} logged days will be deleted. This can't be undone; export a backup first if you want to keep them.</p>
      <div class="modal-actions"><button class="btn ghost" id="btn-cancel-modal">Cancel</button><button class="btn danger" id="btn-confirm-delete">Remove habit</button></div>
    </div></div>`;
  }
  const editing = m.type === 'edit' ? state.habits.find((x) => x.id === m.id) : null;
  const color = editing ? editing.color : m.color;
  return `<div class="modal-overlay" id="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h3 id="modal-title">${editing ? 'Edit habit' : 'Plant a new habit'}</h3>
    <p class="sub">${editing ? 'Rename it or change its colour.' : 'Give it a name and a colour. You can change both later.'}</p>
    <label class="field-label" for="habit-name-input">Name</label>
    <input type="text" id="habit-name-input" placeholder="e.g. Morning run, Read 20 pages" maxlength="60" value="${esc(editing ? editing.name : '')}" autocomplete="off" />
    <span class="field-label">Colour</span>
    <div class="swatches" role="radiogroup" aria-label="Colour">
      ${COLOR_OPTIONS.map((c) => `<button type="button" class="swatch ${c.id === color ? 'selected' : ''}" data-color="${c.id}" role="radio" aria-checked="${c.id === color}" aria-label="${c.name}" style="background:${c.hex}"></button>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn ghost" id="btn-cancel-modal">Cancel</button><button class="btn primary" id="btn-create-habit">${editing ? 'Save' : 'Create habit'}</button></div>
  </div></div>`;
}

// ================= Toast =================
let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ================= Events =================
function openNew() { state.modal = { type: 'new', color: COLOR_OPTIONS[2].id }; render(); }
function attachHandlers(habit) {
  const $ = (id) => document.getElementById(id);
  ['btn-new-habit', 'btn-empty-new', 'btn-new-habit-m'].forEach((id) => $(id)?.addEventListener('click', openNew));
  $('btn-log-today-m')?.addEventListener('click', () => { if (habit) setDayCount(habit.id, toISO(new Date()), (habit.entries[toISO(new Date())] || 0) + 1); });
  $('btn-export')?.addEventListener('click', exportJSON);
  $('btn-import')?.addEventListener('click', () => $('import-file')?.click());
  $('import-file')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importJSON(f); });
  document.querySelectorAll('[data-select]').forEach((el) => el.addEventListener('click', () => selectHabit(el.getAttribute('data-select'))));
  $('btn-edit-habit')?.addEventListener('click', () => { if (habit) { state.modal = { type: 'edit', id: habit.id }; render(); } });
  $('btn-delete-habit')?.addEventListener('click', () => { if (habit) { state.modal = { type: 'delete', id: habit.id }; render(); } });
  document.querySelectorAll('[data-range]').forEach((el) => el.addEventListener('click', () => setRange(el.getAttribute('data-range'))));

  const inc = (attr) => {
    const [hid, iso, delta] = attr.split('|');
    const h = state.habits.find((x) => x.id === hid);
    setDayCount(hid, iso, (h ? h.entries[iso] || 0 : 0) + parseInt(delta, 10));
  };
  document.querySelectorAll('[data-inc]').forEach((el) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); inc(el.getAttribute('data-inc')); });
    if (el.getAttribute('role') === 'button') el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inc(el.getAttribute('data-inc')); } });
  });

  const overlay = $('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.modal = null; render(); } });
    $('btn-cancel-modal')?.addEventListener('click', () => { state.modal = null; render(); });
    $('btn-confirm-delete')?.addEventListener('click', () => removeHabit(state.modal.id));
    let pendingColor = state.modal.type === 'edit' ? state.habits.find((x) => x.id === state.modal.id)?.color : state.modal.color;
    document.querySelectorAll('.swatch').forEach((sw) => sw.addEventListener('click', () => {
      pendingColor = sw.getAttribute('data-color');
      document.querySelectorAll('.swatch').forEach((s) => { s.classList.toggle('selected', s === sw); s.setAttribute('aria-checked', String(s === sw)); });
    }));
    const input = $('habit-name-input');
    const submit = () => { const val = input?.value.trim(); if (!val) { input?.focus(); return; } if (state.modal.type === 'edit') updateHabit(state.modal.id, val, pendingColor); else addHabit(val, pendingColor); };
    input?.focus(); input?.select();
    // Enter submits from anywhere in the dialog (a focused swatch still keeps its colour).
    overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.closest('#btn-cancel-modal, #btn-confirm-delete')) return;
      e.preventDefault();
      if (state.modal.type !== 'delete') submit();
    });
    $('btn-create-habit')?.addEventListener('click', submit);
  }
}

// Keyboard shortcuts (ignored while typing).
window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape' && state.modal) { state.modal = null; render(); return; }
  if (typing || state.modal || e.metaKey || e.ctrlKey || e.altKey) return;
  const habit = state.habits.find((h) => h.id === state.selectedId);
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNew(); }
  else if ((e.key === 't' || e.key === 'T') && habit) { e.preventDefault(); const iso = toISO(new Date()); setDayCount(habit.id, iso, (habit.entries[iso] || 0) + 1); document.getElementById('btn-log-today')?.classList.add('pop'); }
  else if (/^[1-5]$/.test(e.key) && habit) setRange(RANGE_KEYS[Number(e.key) - 1]);
  else if ((e.key === 'j' || e.key === 'k') && state.habits.length > 1) {
    const i = state.habits.findIndex((h) => h.id === state.selectedId);
    selectHabit(state.habits[(i + (e.key === 'j' ? 1 : -1) + state.habits.length) % state.habits.length].id);
  }
});

loadAll();
