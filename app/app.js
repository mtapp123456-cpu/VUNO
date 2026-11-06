
'use strict';
/* =================== Stammdaten =================== */
let TEAMS = [];
const GROUPS = {platz:'Sportplätze', halle:'Sporthallen', heim:'Sportheim'};
let FACILITIES = [];
const TL_START = 7, TL_END = 24, TL_SPAN = (TL_END - TL_START) * 60; // Zeitleiste 07–24 Uhr

/* =================== Hilfsfunktionen =================== */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmtShort = s => { const d = parseYmd(s); return `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`; };
const fmtLong = s => { const d = parseYmd(s); return `${WDL[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return fromMin(d.getHours() * 60 + d.getMinutes()); };
const team = id => TEAMS.find(t => t.id === id) || {id, name:'Unbekannt', icon:'❔', color:'#64748b', sport:''};
const fac = id => FACILITIES.find(f => f.id === id);
const unitOf = (f, id) => f ? f.units.find(u => u.id === id) : null;
const placeName = b => { const f = fac(b.facility); if (!f) return 'kein Ort / auswärts'; const u = unitOf(f, b.unit); return f.name + (u ? ' · ' + u.name : ''); };
const sortB = (a, b) => a.date === b.date ? (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)) : a.date.localeCompare(b.date);

/* =================== Daten / gemeinsamer Speicher =================== */
// Alle Daten liegen in Supabase, getrennt nach Verein. Änderungen kommen live bei allen an.
let db = {club: 'Vereins-App', bookings: []};
let sb = null;             // Supabase-Client
let me = null;             // aktuelle Mitgliedschaft {club_id, role, status, display_name, team_ids}
let myClubs = [];
let gated = true;          // true, solange Anmelde- oder Warte-Bildschirm läuft
let loadState = 'loading'; // loading | ok | error
let readOnly = true;
let lowDate = '';          // bis zu diesem Datum zurück sind Termine geladen
let extending = false;
let channel = null;
let hiddenAt = 0;

let ATT = {};              // Teilnahme je Termin: {yes, maybe, no, open, mine}
let attTimer = null;
const inTeam = teamId => !!me && (me.team_ids || []).includes(teamId);
const hasEnded = b => b.date < todayStr() || (b.date === todayStr() && b.end <= nowHM());
const canBook = teamId => !!me && (me.role === 'admin' || (me.role === 'trainer' && (me.team_ids || []).includes(teamId)));
const bookableTeams = () => TEAMS.filter(t => canBook(t.id));

function refresh() {
  route();
  if (!backdrop.classList.contains('hidden')) liveCheck();
}
const toRowDate = t => t.length === 5 ? t + ':00' : t;
const fromRow = r => ({id: r.id, title: r.title, team: r.team_id, facility: r.facility_id || '', unit: r.unit_id || '',
  date: r.date, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5), note: r.note || '', seriesId: r.series_id || null});
const toRow = b => ({club_id: me.club_id, title: b.title, team_id: b.team, facility_id: b.facility || null, unit_id: b.facility ? b.unit : null,
  date: b.date, start_time: toRowDate(b.start), end_time: toRowDate(b.end), note: b.note || '', series_id: b.seriesId || null});

async function fetchBookings(from, before) {
  const rows = [];
  for (let p = 0; ; p++) {
    let q = sb.from('bookings').select('id,title,team_id,facility_id,unit_id,date,start_time,end_time,note,series_id')
      .eq('club_id', me.club_id).gte('date', from);
    if (before) q = q.lt('date', before);
    const {data, error} = await q.order('date').order('id').range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows.map(fromRow);
}
async function reloadBookings() {
  try {
    db.bookings = await fetchBookings(lowDate);
    loadState = 'ok';
  } catch (e) { loadState = 'error'; }
  refresh();
  loadAttendance();
}
async function loadAttendance() {
  if (!me) return;
  const club = me.club_id;
  const {data, error} = await sb.rpc('attendance_overview', {p_club: club, p_from: addDays(todayStr(), -14), p_to: addDays(todayStr(), 180)});
  if (error || !me || me.club_id !== club) return;
  ATT = {};
  for (const r of data) ATT[r.booking_id] = r;
  refresh();
  if (formCtx.id && document.getElementById('attbox')) loadRoster(formCtx.id);
}
const scheduleAttendance = () => { clearTimeout(attTimer); attTimer = setTimeout(loadAttendance, 400); };
// Ältere Termine werden erst geladen, wenn man dorthin blättert
async function maybeExtendRange() {
  if (!me || extending || !lowDate) return;
  const need = [sel.date, sel.month + '-01'].sort()[0];
  if (need >= lowDate) return;
  extending = true;
  const from = addDays(need, -31);
  try {
    db.bookings = db.bookings.concat(await fetchBookings(from, lowDate));
    lowDate = from;
    refresh();
  } catch (e) { /* bleibt beim bisherigen Stand */ }
  extending = false;
}
function subscribeLive() {
  if (channel) sb.removeChannel(channel);
  let connectedBefore = false;
  const upsert = p => {
    const b = fromRow(p.new);
    if (b.date < lowDate) return;
    const i = db.bookings.findIndex(x => x.id === b.id);
    if (i >= 0) db.bookings[i] = b; else db.bookings.push(b);
    refresh();
  };
  const filter = `club_id=eq.${me.club_id}`;
  channel = sb.channel('bookings-' + me.club_id)
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'bookings', filter}, upsert)
    .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'bookings', filter}, upsert)
    // Löschungen lassen sich technisch nicht nach Verein filtern; unbekannte IDs werden ignoriert
    .on('postgres_changes', {event: 'DELETE', schema: 'public', table: 'bookings'}, p => {
      const n = db.bookings.length;
      db.bookings = db.bookings.filter(x => x.id !== p.old.id);
      if (db.bookings.length !== n) refresh();
    })
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'attendance', filter}, scheduleAttendance)
    .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'attendance', filter}, scheduleAttendance)
    .on('postgres_changes', {event: 'DELETE', schema: 'public', table: 'attendance'}, p => { if (p.old && ATT[p.old.booking_id]) scheduleAttendance(); })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') { if (connectedBefore) reloadBookings(); connectedBefore = true; }
    });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (me && !gated && hiddenAt && Date.now() - hiddenAt > 5 * 60000) reloadBookings();
});

function friendlyError(e) {
  const code = e && e.code;
  if (code === '23P01') return 'Dieser Bereich wurde gerade von jemand anderem belegt. Bitte eine andere Zeit wählen.';
  if (code === '23505') return 'Dieser Name ist schon vergeben.';
  if (code === '23503') return 'Das geht nicht, solange noch Termine damit verknüpft sind.';
  if (code === '42501') return 'Dafür fehlen dir die Rechte.';
  if (code === 'P0001' || code === 'P0002' || code === 'P0003') return e.message;
  return 'Das hat nicht geklappt. Bitte prüfe die Verbindung und versuche es noch einmal.';
}
const writeError = friendlyError;
async function insertBookings(list) {
  const {data, error} = await sb.from('bookings').insert(list.map(toRow)).select();
  if (error) throw error;
  for (const r of data) if (!db.bookings.some(x => x.id === r.id)) db.bookings.push(fromRow(r));
}
async function updateBooking(b) {
  const {data, error} = await sb.from('bookings').update(toRow(b)).eq('id', b.id).select();
  if (error) throw error;
  if (!data.length) throw {code: '42501'};
  db.bookings = db.bookings.map(x => x.id === b.id ? fromRow(data[0]) : x);
}
async function deleteBooking(id) {
  const {data, error} = await sb.from('bookings').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw {code: '42501'};
  db.bookings = db.bookings.filter(x => x.id !== id);
  return data.length;
}
async function deleteSeries(seriesId) {
  const {data, error} = await sb.from('bookings').delete().eq('series_id', seriesId).eq('club_id', me.club_id).select('id');
  if (error) throw error;
  const gone = new Set(data.map(r => r.id));
  db.bookings = db.bookings.filter(x => !gone.has(x.id));
  return data.length;
}
function statusHTML() {
  if (loadState === 'error') return '<div class="notice">Die Termine konnten nicht geladen werden. Bitte die Seite neu öffnen.</div>';
  if (loadState === 'loading') return '<div class="notice info">Termine werden geladen …</div>';
  const waiting = me && me.role === 'admin' && adm.members ? adm.members.filter(m => m.status === 'pending').length : 0;
  if (waiting && !location.hash.startsWith('#verwaltung')) return `<div class="notice"><a href="#verwaltung-mitglieder"><b>${waiting} Person(en) warten auf Bestätigung</b></a></div>`;
  if (readOnly) return '<div class="notice info">Du kannst die Belegung ansehen. Zum Buchen braucht es Bearbeitungsrechte.</div>';
  return '';
}
function setupHint() {
  if (!me || me.role !== 'admin') return '';
  if (!TEAMS.length || !FACILITIES.length) return 'Lege zuerst unter <a href="#verwaltung">Verwaltung</a> deine Teams und Anlagen an.<br>';
  return '';
}

/*
/* =================== Belegungslogik =================== */
function overlapParts(u1, u2) { return !!(u1 && u2) && u1.parts.some(p => u2.parts.includes(p)); }
function conflicts(b, ignoreId) {
  if (!b.facility) return [];
  const f = fac(b.facility), u = unitOf(f, b.unit);
  if (!u) return [];
  const s = toMin(b.start), e = toMin(b.end);
  return db.bookings.filter(o => o.id !== ignoreId && o.date === b.date && o.facility === b.facility &&
    toMin(o.start) < e && s < toMin(o.end) && overlapParts(u, unitOf(f, o.unit)));
}
const onDate = d => db.bookings.filter(b => b.date === d).sort(sortB);
const upcoming = (filter) => { const t = todayStr(), n = nowHM();
  return db.bookings.filter(b => (b.date > t || (b.date === t && b.end > n)) && (!filter || filter(b))).sort(sortB); };

/* =================== UI-Zustand =================== */
const sel = {date: todayStr(), month: todayStr().slice(0, 7), calMode: 'monat', team: '', group: ''};
let formCtx = {id: null};
const app = document.getElementById('app');

/* =================== Bausteine =================== */
const ATT_LABEL = {yes: ['👍', 'Ich bin dabei'], maybe: ['❓', 'Vielleicht'], no: ['👎', 'Ich kann nicht']};
const attCounts = a => `<span class="attcnt">👍 ${a.yes} · ❓ ${a.maybe} · 👎 ${a.no}${a.open ? ` · <span class="open">${a.open} offen</span>` : ''}</span>`;
function attButtons(id, cur, user, big) {
  return Object.keys(ATT_LABEL).map(s => `<button type="button" class="attbtn ${big ? 'big' : ''} ${cur === s ? 'on ' + s : ''}" data-action="att" data-id="${id}" data-s="${s}"${user ? ` data-u="${user}"` : ''}
    aria-pressed="${cur === s}" title="${ATT_LABEL[s][1]}" aria-label="${ATT_LABEL[s][1]}">${ATT_LABEL[s][0]}${big ? `<small>${ATT_LABEL[s][1]}</small>` : ''}</button>`).join('');
}
function attRowHTML(b) {
  const a = ATT[b.id];
  if (!a) return '';
  const vote = inTeam(b.team) && !hasEnded(b);
  return `<div class="att">${vote ? attButtons(b.id, a.mine) : ''}${attCounts(a)}</div>`;
}
function itemHTML(b, showDate) {
  const att = attRowHTML(b);
  return att ? `<div class="itemwrap" style="--c:${team(b.team).color}">${itemBtnHTML(b, showDate)}${att}</div>` : itemBtnHTML(b, showDate);
}
function itemBtnHTML(b, showDate) {
  const t = team(b.team);
  const live = b.date === todayStr() && b.start <= nowHM() && nowHM() < b.end;
  return `<button class="item" data-action="edit" data-id="${b.id}" style="--c:${t.color}">
    <div class="item-time">${b.start}<small>${b.end}</small></div>
    <div class="item-body">
      ${showDate ? `<div class="item-date">${fmtShort(b.date)}</div>` : ''}
      <div class="item-title">${t.icon} ${esc(b.title)} ${live ? '<span class="badge live">läuft</span>' : ''}</div>
      <div class="item-sub">${esc(t.name)} · ${esc(placeName(b))}</div>
    </div></button>`;
}
function groupedHTML(list, empty) {
  if (!list.length) return `<p class="empty">${empty}</p>`;
  let html = '', cur = '';
  for (const b of list) {
    if (b.date !== cur) { cur = b.date; html += `<h4 class="dhead">${b.date === todayStr() ? 'Heute · ' : ''}${fmtLong(cur)}</h4>`; }
    html += itemHTML(b, false);
  }
  return html;
}
function dateNav() {
  return `<div class="datenav">
    <button class="navbtn" data-action="day" data-d="-1" aria-label="Vorheriger Tag">‹</button>
    <input type="date" value="${sel.date}" data-change="pickdate" aria-label="Datum wählen">
    <button class="navbtn" data-action="day" data-d="1" aria-label="Nächster Tag">›</button>
    <button class="navbtn txt" data-action="today">Heute</button>
  </div><div class="daytitle">${sel.date === todayStr() ? 'Heute, ' : ''}${fmtLong(sel.date)}</div>`;
}
function timelineHTML(f, date) {
  const bs = db.bookings.filter(b => b.date === date && b.facility === f.id).sort(sortB);
  let hours = '';
  for (let h = TL_START + 1; h < TL_END; h += 2) hours += `<span style="left:${(h - TL_START) / (TL_END - TL_START) * 100}%">${h}</span>`;
  const isToday = date === todayStr();
  const nowM = toMin(nowHM());
  const nowPos = (nowM - TL_START * 60) / TL_SPAN * 100;
  const nowLine = isToday && nowPos >= 0 && nowPos <= 100 ? `<div class="nowline" style="left:${nowPos}%"></div>` : '';
  const rows = f.parts.map(p => {
    const blocks = bs.filter(b => { const u = unitOf(f, b.unit); return u && u.parts.includes(p.id); }).map(b => {
      const s = Math.max(toMin(b.start), TL_START * 60), e = Math.min(toMin(b.end), TL_END * 60);
      if (e <= s) return '';
      const t = team(b.team);
      return `<button class="blk" data-action="edit" data-id="${b.id}" style="--c:${t.color};left:${(s - TL_START * 60) / TL_SPAN * 100}%;width:${(e - s) / TL_SPAN * 100}%"
        title="${esc(b.start + '–' + b.end + ' ' + b.title + ' (' + t.name + ')')}">${t.icon} ${esc(b.title)}</button>`;
    }).join('');
    return `<div class="tl-row"><div class="tl-label">${esc(p.name)}</div>
      <div class="tl-track" data-action="slot" data-f="${f.id}" data-p="${p.id}" data-date="${date}">${blocks}${nowLine}</div></div>`;
  }).join('');
  return `<div class="tl"><div class="tl-hours">${hours}</div>${rows}</div>`;
}

/* =================== Ansichten =================== */
function viewStart() {
  const t = todayStr(), n = nowHM();
  const today = onDate(t);
  const live = today.filter(b => b.start <= n && n < b.end);
  const next = upcoming().slice(0, 6);
  const weekEnd = addDays(t, 6);
  const weekCount = db.bookings.filter(b => b.date >= t && b.date <= weekEnd).length;
  const countGroup = g => FACILITIES.filter(f => f.group === g).length;
  const tiles = [
    ...TEAMS.slice(0, 8).map(x => ({href:`#team-${x.id}`, ic:x.icon, c:x.color, name:esc(x.name), sub:esc(x.sport)})),
    ...(countGroup('platz') ? [{href:'#anlagen-platz', ic:'🏟️', c:'#15803d', name:'Sportplätze', sub:`${countGroup('platz')} Anlage(n)`}] : []),
    ...(countGroup('halle') ? [{href:'#anlagen-halle', ic:'🏢', c:'#0369a1', name:'Sporthallen', sub:`${countGroup('halle')} Anlage(n)`}] : []),
    ...(countGroup('heim') ? [{href:'#anlagen-heim', ic:'🍻', c:'#b45309', name:'Sportheim', sub:`${countGroup('heim')} Anlage(n)`}] : []),
    {href:'#kalender', ic:'📅', c:'#7c3aed', name:'Vereinskalender', sub:'Tag & Monat'}
  ];
  return `
  <section class="hero">
    <h2>${esc(db.club)}</h2>
    <p>${fmtLong(t)}</p>
    <div class="stats">
      <div class="stat"><b>${today.length}</b><span>Termine heute</span></div>
      <div class="stat"><b>${live.length}</b><span>gerade belegt</span></div>
      <div class="stat"><b>${weekCount}</b><span>nächste 7 Tage</span></div>
    </div>
  </section>
  ${loadState === 'ok' && !db.bookings.length ? `<div class="notice info"><b>Noch keine Termine eingetragen.</b><br>
    ${setupHint()}${readOnly ? 'Sobald der Vorstand Trainings und Spiele einträgt, erscheinen sie hier.' : 'Tippe unten rechts auf <b>+</b>, um das erste Training, Spiel oder eine Raumbuchung einzutragen. Regelmäßige Trainings lassen sich als wöchentliche Serie anlegen.'}</div>` : ''}
  <div class="tiles">${tiles.map(x => `<a class="tile" href="${x.href}" style="--c:${x.c}"><span class="ic">${x.ic}</span><span><b>${x.name}</b><small>${x.sub}</small></span></a>`).join('')}</div>
  ${live.length ? `<h3>🔴 Jetzt belegt</h3>${live.map(b => itemHTML(b)).join('')}` : ''}
  <h3>Heute</h3>
  ${today.length ? today.map(b => itemHTML(b)).join('') : '<p class="empty">Heute ist nichts eingetragen.</p>'}
  <h3>Nächste Termine</h3>
  ${next.length ? next.map(b => itemHTML(b, true)).join('') : '<p class="empty">Keine anstehenden Termine.</p>'}`;
}

function viewTeams() {
  return `<h2>Mannschaften & Abteilungen</h2>
  <div class="tiles" style="grid-template-columns:1fr">${TEAMS.map(x => {
    const nx = upcoming(b => b.team === x.id)[0];
    return `<a class="tile" href="#team-${x.id}" style="--c:${x.color}"><span class="ic">${x.icon}</span>
      <span><b>${esc(x.name)}</b><small>${esc(x.sport)}${nx ? ' · Nächster Termin: ' + fmtShort(nx.date) + ' ' + nx.start + ' ' + esc(nx.title) : ''}</small></span></a>`;
  }).join('')}</div>`;
}

function viewTeam(id) {
  const x = TEAMS.find(t => t.id === id);
  if (!x) return `<p class="empty">Mannschaft nicht gefunden.</p>`;
  const t = todayStr();
  const list = upcoming(b => b.team === id && b.date <= addDays(t, 30));
  const games = upcoming(b => b.team === id && /spiel/i.test(b.title));
  const ng = games[0];
  const weekEnd = addDays(t, 6);
  const trainings = db.bookings.filter(b => b.team === id && b.date >= t && b.date <= weekEnd && /training|kata/i.test(b.title)).length;
  return `
  <section class="teamhead" style="--c:${x.color}">
    <h2>${x.icon} ${esc(x.name)}</h2><p>${esc(x.sport)}</p>
    <div class="stats">
      <div class="stat"><b>${trainings}</b><span>Trainings (7 Tage)</span></div>
      <div class="stat"><b>${x.players || 0}/50</b><span>Spieler</span></div>
      <div class="stat"><b>${ng ? fmtShort(ng.date) : '–'}</b><span>${ng ? esc(ng.title) + ' ' + ng.start : 'kein Spiel geplant'}</span></div>
    </div>
    <div class="btnrow"><button class="btn light" data-action="new" data-team="${x.id}">+ Termin eintragen</button>
      <a class="btn light" href="#kalender" data-action="calteam" data-team="${x.id}">📅 Im Kalender</a></div>
  </section>
  ${canBook(id) ? attOverviewHTML(list) : ''}
  <h3>Termine der nächsten 30 Tage</h3>
  ${groupedHTML(list, 'Keine Termine in den nächsten 30 Tagen.')}`;
}
// Trainer-Übersicht: Zu- und Absagen der nächsten Termine auf einen Blick
function attOverviewHTML(list) {
  const rows = list.filter(b => ATT[b.id]).slice(0, 8);
  if (!rows.length) return '';
  return `<h3>👥 Teilnahme-Übersicht</h3><div class="card attov">${rows.map(b => {
    const a = ATT[b.id], total = a.yes + a.maybe + a.no + a.open;
    return `<button class="attov-row" data-action="edit" data-id="${b.id}">
      <span class="attov-main"><b>${fmtShort(b.date)} ${b.start}</b> ${esc(b.title)}</span>${attCounts(a)}
      <span class="attbar"><i class="yes" style="width:${a.yes / total * 100}%"></i><i class="maybe" style="width:${a.maybe / total * 100}%"></i><i class="no" style="width:${a.no / total * 100}%"></i></span>
    </button>`;
  }).join('')}<p class="muted" style="font-size:13px;margin:6px 0 0">Antippen zeigt, wer zu- oder abgesagt hat.</p></div>`;
}

function viewAnlagen(group) {
  const g = GROUPS[group] ? group : '';
  sel.group = g;
  const list = FACILITIES.filter(f => !g || f.group === g);
  return `<h2>${g ? GROUPS[g] : 'Platz- & Raumbelegung'}</h2>
  <div class="chips">
    <a class="chip ${!g ? 'on' : ''}" href="#anlagen">Alle</a>
    ${Object.keys(GROUPS).map(k => `<a class="chip ${g === k ? 'on' : ''}" href="#anlagen-${k}">${GROUPS[k]}</a>`).join('')}
  </div>
  ${dateNav()}
  ${list.map(f => `<div class="card">
      <div class="fac-head"><span>${f.icon}</span><a href="#anlage-${f.id}">${esc(f.name)} <small>· ${esc(f.desc)}</small></a><a class="badge" href="#anlage-${f.id}">Details ›</a></div>
      ${timelineHTML(f, sel.date)}
    </div>`).join('')}
  <p class="tl-hint">Tipp: Auf eine freie Stelle in der Zeitleiste tippen, um dort direkt zu buchen.</p>`;
}

function viewAnlage(id) {
  const f = fac(id);
  if (!f) return `<p class="empty">Anlage nicht gefunden.</p>`;
  const list = db.bookings.filter(b => b.date === sel.date && b.facility === f.id).sort(sortB);
  return `<p style="margin:0 0 6px"><a href="#anlagen-${f.group}" class="muted">‹ ${GROUPS[f.group]}</a></p>
  <h2>${f.icon} ${esc(f.name)}</h2>
  <p class="muted" style="margin:-8px 0 12px">${esc(f.desc)}</p>
  ${dateNav()}
  <div class="card">${timelineHTML(f, sel.date)}
    <p class="tl-hint">Freie Stelle antippen = neue Buchung für diesen Bereich.</p></div>
  <div class="card"><b>Buchbare Bereiche</b><p class="list-units">${f.units.map(u => esc(u.name)).join(' · ')}</p>
    <div class="btnrow"><button class="btn" data-action="new" data-f="${f.id}">+ ${esc(f.name)} buchen</button></div></div>
  <h3>Belegung am ${fmtShort(sel.date)}</h3>
  ${list.length ? list.map(b => itemHTML(b)).join('') : '<p class="empty">An diesem Tag frei.</p>'}`;
}

function viewKalender() {
  const fil = b => !sel.team || b.team === sel.team;
  const chips = `<div class="chips"><button class="chip ${!sel.team ? 'on' : ''}" data-action="teamfilter" data-team="">Alle</button>
    ${TEAMS.map(t => `<button class="chip ${sel.team === t.id ? 'on' : ''}" data-action="teamfilter" data-team="${t.id}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>`;
  const seg = `<div class="seg"><button class="${sel.calMode === 'monat' ? 'on' : ''}" data-action="calmode" data-mode="monat">Monat</button>
    <button class="${sel.calMode === 'tag' ? 'on' : ''}" data-action="calmode" data-mode="tag">Tag</button></div>`;
  const dayList = onDate(sel.date).filter(fil);
  if (sel.calMode === 'tag') {
    return `<h2>📅 Vereinskalender</h2>${seg}${chips}${dateNav()}
      ${dayList.length ? dayList.map(b => itemHTML(b)).join('') : '<p class="empty">Keine Termine an diesem Tag.</p>'}
      <div class="btnrow"><a class="btn ghost block" href="#anlagen">🔄 Platz- & Raumbelegung für diesen Tag</a></div>`;
  }
  const [y, m] = sel.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const off = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m, 0).getDate();
  const cells = Math.ceil((off + daysIn) / 7) * 7;
  const start = addDays(ymd(first), -off);
  const idx = {};
  for (const b of db.bookings) if (fil(b)) (idx[b.date] = idx[b.date] || []).push(b);
  const t = todayStr();
  let grid = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const ds = addDays(start, i), d = parseYmd(ds), list = idx[ds] || [];
    const colors = [...new Set(list.map(b => team(b.team).color))];
    grid += `<button class="mday ${d.getMonth() !== m - 1 ? 'out' : ''} ${ds === t ? 'today' : ''} ${ds === sel.date ? 'sel' : ''}" data-action="pickday" data-date="${ds}">
      <span class="n">${d.getDate()}</span>
      <span class="dots">${colors.slice(0, 5).map(c => `<i class="dot" style="--c:${c}"></i>`).join('')}</span>
      ${list.length ? `<span class="cnt">${list.length}</span>` : ''}</button>`;
  }
  return `<h2>📅 Vereinskalender</h2>${seg}${chips}
  <div class="card">
    <div class="mhead"><button class="navbtn" data-action="month" data-d="-1" aria-label="Vorheriger Monat">‹</button>
      <b>${MON[m - 1]} ${y}</b>
      <button class="navbtn" data-action="month" data-d="1" aria-label="Nächster Monat">›</button>
      <button class="navbtn txt" data-action="today">Heute</button></div>
    <div class="mgrid">${grid}</div>
  </div>
  <h3>${sel.date === t ? 'Heute, ' : ''}${fmtLong(sel.date)}</h3>
  ${dayList.length ? dayList.map(b => itemHTML(b)).join('') : '<p class="empty">Keine Termine an diesem Tag.</p>'}`;
}

/* =================== Router =================== */
function route() {
  if (gated) return;
  maybeExtendRange();
  const h = location.hash.replace(/^#\/?/, '') || 'start';
  const i = h.indexOf('-');
  const v = i < 0 ? h : h.slice(0, i), arg = i < 0 ? '' : h.slice(i + 1);
  let html, tab = v;
  switch (v) {
    case 'teams': html = viewTeams(); break;
    case 'team': html = viewTeam(arg); tab = 'teams'; break;
    case 'anlagen': html = viewAnlagen(arg); break;
    case 'anlage': html = viewAnlage(arg); tab = 'anlagen'; break;
    case 'kalender': html = viewKalender(); break;
    case 'verwaltung': html = viewAdmin(arg); tab = ''; break;
    default: html = viewStart(); tab = 'start';
  }
  app.innerHTML = statusHTML() + html;
  document.querySelector('.fab').hidden = readOnly;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  document.getElementById('brand').innerHTML = (branding.logo ? `<img class="brand-logo" src="${esc(branding.logo)}" alt="">` : '🏆 ') + `<span>${esc(db.club)}</span>`;
  document.title = db.club + ' – Vereins-App';
}
let lastHash = location.hash;
window.addEventListener('hashchange', () => { if (gated) return; route(); if (location.hash !== lastHash) window.scrollTo(0, 0); lastHash = location.hash; });

/* =================== Formular (Buchen) =================== */
const backdrop = document.getElementById('backdrop'), sheet = document.getElementById('sheet');
function openSheet(html) { sheet.innerHTML = html; backdrop.classList.remove('hidden'); document.body.classList.add('noscroll'); sheet.scrollTop = 0; }
function closeSheet() { if (me) applyColors(branding.brand_color, branding.header_color); backdrop.classList.add('hidden'); document.body.classList.remove('noscroll'); sheet.innerHTML = ''; formCtx = {id: null}; }

function unitOptions(fid, cur) {
  const f = fac(fid);
  if (!f) return '<option value="">–</option>';
  return f.units.map(u => `<option value="${u.id}" ${u.id === cur ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
}
function openForm(b) {
  const isNew = !b.id;
  const viewOnly = readOnly || (!isNew && !canBook(b.team));
  const first = bookableTeams()[0] || TEAMS[0] || {};
  const d = Object.assign({title:'', team:first.id || '', facility:FACILITIES[0] ? FACILITIES[0].id : '', unit:'', date:sel.date, start:'18:00', end:'19:30', note:''}, b);
  if (d.facility && !unitOf(fac(d.facility), d.unit)) d.unit = fac(d.facility) ? fac(d.facility).units[0].id : '';
  formCtx = {id: isNew ? null : b.id, seriesId: b.seriesId || null};
  openSheet(`<form id="bform" novalidate>
    <div class="sheet-head"><h3>${isNew ? 'Neue Buchung' : 'Buchung bearbeiten'}</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    ${!isNew && ATT[b.id] ? '<div id="attbox" class="attbox"><p class="muted" style="margin:0">Teilnahme wird geladen …</p></div>' : ''}
    <label>Titel<input name="title" value="${esc(d.title)}" placeholder="z. B. Training, Heimspiel, Feier" maxlength="60" autocomplete="off"></label>
    <label>Mannschaft / Gruppe<select name="team">${(viewOnly ? TEAMS : bookableTeams()).map(t => `<option value="${t.id}" ${t.id === d.team ? 'selected' : ''}>${t.icon} ${esc(t.name)}</option>`).join('')}</select></label>
    <div class="row2">
      <label>Ort<select name="facility"><option value="" ${!d.facility ? 'selected' : ''}>– kein Ort / auswärts –</option>
        ${FACILITIES.map(f => `<option value="${f.id}" ${f.id === d.facility ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      <label>Bereich<select name="unit" ${d.facility ? '' : 'disabled'}>${unitOptions(d.facility, d.unit)}</select></label>
    </div>
    <div class="row3">
      <label>Datum<input type="date" name="date" value="${d.date}"></label>
      <label>Von<input type="time" name="start" value="${d.start}" step="900"></label>
      <label>Bis<input type="time" name="end" value="${d.end}" step="900"></label>
    </div>
    ${isNew ? `<label class="check"><input type="checkbox" name="repeat"> Wöchentlich wiederholen</label>
      <label class="until hidden" id="untilRow">bis einschließlich<input type="date" name="until" value="${addDays(d.date, 56)}"></label>`
      : (b.seriesId ? '<p class="muted" style="font-size:13px;margin:10px 0 0">Teil einer Serie – Änderungen gelten nur für diesen Termin.</p>' : '')}
    <label>Notiz<textarea name="note" rows="2" maxlength="300">${esc(d.note)}</textarea></label>
    <div id="fmsg"></div>
    <div class="sheet-actions" id="factions">
      ${isNew ? '' : '<button type="button" class="btn danger" data-action="del">Löschen</button>'}
      <button type="submit" class="btn">Speichern</button>
    </div>
  </form>`);
  if (!isNew && ATT[b.id]) loadRoster(b.id);
  if (viewOnly) {
    sheet.querySelector('h3').textContent = 'Termin';
    for (const x of document.getElementById('bform').elements) if (x.dataset.action !== 'close' && x.dataset.action !== 'att') x.disabled = true;
    document.getElementById('factions').innerHTML = '<p class="muted" style="margin:0;font-size:13px">Nur Ansicht – ändern kann das nur die zuständige Person oder der Vorstand.</p>';
    return;
  }
  liveCheck();
  if (isNew) setTimeout(() => { const i = sheet.querySelector('[name=title]'); if (i && window.matchMedia('(pointer:fine)').matches) i.focus(); }, 50);
}
async function loadRoster(id) {
  const {data, error} = await sb.rpc('booking_attendance', {p_booking: id});
  const box = document.getElementById('attbox');
  if (!box || formCtx.id !== id) return;
  if (error) { box.innerHTML = '<p class="muted" style="margin:0">Die Teilnahme konnte nicht geladen werden.</p>'; return; }
  const b = db.bookings.find(x => x.id === id), a = ATT[id];
  if (!b || !data.length) { box.remove(); return; }
  const mgr = canBook(b.team), ended = hasEnded(b);
  const groups = [['yes', '👍 Zugesagt'], ['maybe', '❓ Vielleicht'], ['no', '👎 Abgesagt'], [null, 'Noch keine Antwort']];
  let h = `<div class="att-head"><b>Teilnahme</b>${a ? attCounts(a) : ''}</div>`;
  if (inTeam(b.team) && !ended) h += `<div class="att-mine">${attButtons(id, a && a.mine, null, true)}</div>`;
  else if (ended) h += '<p class="muted" style="font-size:13px;margin:4px 0">Termin ist vorbei.</p>';
  for (const [s, label] of groups) {
    const people = data.filter(r => (r.status || null) === s);
    if (!people.length) continue;
    h += `<div class="att-group"><div class="att-gl">${label} (${people.length})</div>${people.map(r => `<div class="att-row">
      <span>${esc(r.display_name)}${r.club_role === 'trainer' ? ' <span class="badge">Trainer</span>' : ''}</span>
      ${mgr ? `<span class="att-mini">${attButtons(id, r.status, r.user_id)}</span>` : ''}</div>`).join('')}</div>`;
  }
  box.innerHTML = h;
}
let attBusy = false;
async function setAttendance(id, s, user) {
  if (attBusy) return;
  const a = ATT[id];
  const own = !user;
  const val = own && a && a.mine === s ? null : s; // erneutes Antippen nimmt die eigene Antwort zurück
  if (own && a) { if (a.mine) a[a.mine]--; else a.open--; if (val) a[val]++; else a.open++; a.mine = val; refresh(); }
  attBusy = true;
  const {error} = await sb.rpc('set_attendance', {p_booking: id, p_status: val, p_user: user || null});
  attBusy = false;
  if (error) toast(friendlyError(error));
  else if (own) toast(val ? {yes: 'Zugesagt 👍', maybe: 'Vielleicht ❓', no: 'Abgesagt 👎'}[val] : 'Antwort zurückgenommen');
  else toast('Gespeichert');
  await loadAttendance();
}
function readForm() {
  const f = document.getElementById('bform'), el = f.elements;
  const v = n => el[n] ? el[n].value : '';
  return {title: v('title').trim(), team: v('team'), facility: v('facility'), unit: v('facility') ? v('unit') : '',
          date: v('date'), start: v('start'), end: v('end'), note: v('note').trim(),
          repeat: !!(el.repeat && el.repeat.checked), until: v('until')};
}
function checkForm(d) {
  const errs = [];
  if (!d.title) errs.push('Bitte einen Titel eingeben.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errs.push('Bitte ein Datum wählen.');
  if (!d.start || !d.end) errs.push('Bitte Beginn und Ende angeben.');
  else if (toMin(d.end) <= toMin(d.start)) errs.push('Das Ende muss nach dem Beginn liegen.');
  let dates = [d.date];
  if (d.repeat && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.until) || d.until < d.date) errs.push('Bitte ein gültiges Enddatum für die Wiederholung wählen.');
    else { dates = []; for (let x = d.date; x <= d.until && dates.length < 104; x = addDays(x, 7)) dates.push(x); }
  }
  const clashes = [];
  if (d.start && d.end && toMin(d.end) > toMin(d.start) && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    for (const dt of dates) for (const c of conflicts(Object.assign({}, d, {date: dt}), formCtx.id)) clashes.push(c);
  return {errs, dates, clashes};
}
function msgHTML(r, showErrs) {
  let h = '';
  if (showErrs && r.errs.length) h += `<div class="msg err">${r.errs.map(esc).join('<br>')}</div>`;
  if (r.clashes.length) {
    const sh = r.clashes.slice(0, 5).map(c => `<li>${fmtShort(c.date)} ${c.start}–${c.end}: ${esc(c.title)} (${esc(team(c.team).name)}, ${esc(placeName(c))})</li>`).join('');
    h += `<div class="msg warn"><b>⚠️ Bereits belegt – bitte anderen Bereich oder andere Zeit wählen:</b><ul>${sh}</ul>${r.clashes.length > 5 ? `… und ${r.clashes.length - 5} weitere` : ''}</div>`;
  } else if (r.dates.length > 1 && !r.errs.length) {
    h += `<div class="msg warn" style="background:var(--brand-soft);color:var(--brand)">✓ ${r.dates.length} Termine, alle frei.</div>`;
  }
  return h;
}
function liveCheck() {
  const m = document.getElementById('fmsg');
  if (!m) return;
  m.innerHTML = msgHTML(checkForm(readForm()), false);
}
let saving = false;
async function submitForm() {
  if (saving || readOnly) return;
  const d = readForm(), r = checkForm(d);
  const msg = document.getElementById('fmsg');
  if (r.errs.length || r.clashes.length) { msg.innerHTML = msgHTML(r, true); return; }
  const fields = {title: d.title, team: d.team, facility: d.facility, unit: d.unit, start: d.start, end: d.end, note: d.note};
  const sid = !formCtx.id && r.dates.length > 1 ? crypto.randomUUID() : null;
  const list = formCtx.id
    ? [Object.assign({id: formCtx.id, seriesId: formCtx.seriesId}, fields, {date: d.date})]
    : r.dates.map(dt => Object.assign({seriesId: sid, date: dt}, fields));
  const btn = sheet.querySelector('button[type=submit]');
  saving = true; if (btn) { btn.disabled = true; btn.textContent = 'Speichert …'; }
  try {
    if (formCtx.id) await updateBooking(list[0]); else await insertBookings(list);
  } catch (e) {
    saving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    msg.innerHTML = `<div class="msg err">${esc(writeError(e))}</div>`;
    return;
  }
  saving = false;
  toast(formCtx.id ? 'Gespeichert' : list.length > 1 ? `${list.length} Termine eingetragen` : 'Gebucht');
  loadAttendance();
  sel.date = d.date; sel.month = d.date.slice(0, 7);
  closeSheet();
  route();
}
function askDelete() {
  const box = document.getElementById('factions');
  const seriesCount = formCtx.seriesId ? db.bookings.filter(b => b.seriesId === formCtx.seriesId).length : 0;
  box.innerHTML = seriesCount > 1
    ? `<button type="button" class="btn danger" data-action="del1">Nur diesen Termin</button>
       <button type="button" class="btn danger" data-action="delS">Ganze Serie (${seriesCount})</button>
       <button type="button" class="btn ghost" data-action="delcancel">Abbrechen</button>`
    : `<button type="button" class="btn danger" data-action="del1">Ja, löschen</button>
       <button type="button" class="btn ghost" data-action="delcancel">Abbrechen</button>`;
}
async function doDelete(series) {
  if (saving || readOnly) return;
  saving = true;
  document.getElementById('factions').innerHTML = '<p class="muted" style="margin:0">Löscht …</p>';
  let done = 0;
  try { done = series ? await deleteSeries(formCtx.seriesId) : await deleteBooking(formCtx.id); }
  catch (e) { saving = false; document.getElementById('fmsg').innerHTML = `<div class="msg err">${esc(writeError(e))}</div>`; return; }
  saving = false;
  closeSheet(); route();
  toast(`${done} Termin(e) gelöscht`);
}

/* =================== Toast =================== */
let toastT;
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }

/* =================== Events =================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) { if (e.target === backdrop) closeSheet(); return; }
  const a = el.dataset.action;
  switch (a) {
    case 'new': {
      if (readOnly) { toast('Zum Buchen braucht es Bearbeitungsrechte'); break; }
      const o = {date: sel.date};
      if (el.dataset.team) o.team = el.dataset.team;
      if (el.dataset.f) o.facility = el.dataset.f;
      const h = location.hash.replace(/^#/, '');
      if (!o.team && h.startsWith('team-') && canBook(h.slice(5))) o.team = h.slice(5);
      if (!o.facility && h.startsWith('anlage-')) o.facility = h.slice(7);
      if (o.team && !canBook(o.team)) delete o.team;
      if (!bookableTeams().length) { toast('Zuerst ein Team anlegen'); break; }
      openForm(o); break;
    }
    case 'edit': { e.stopPropagation(); const b = db.bookings.find(x => x.id === el.dataset.id); if (b) openForm(b); break; }
    case 'slot': {
      if (readOnly || !bookableTeams().length) break;
      const f = fac(el.dataset.f), r = el.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
      let s = Math.floor((TL_START * 60 + ratio * TL_SPAN) / 30) * 30;
      s = Math.min(s, 22 * 60 + 30);
      const end = Math.min(s + 90, 23 * 60 + 59);
      const u = f.units.find(x => x.parts.length === 1 && x.parts[0] === el.dataset.p) || f.units[0];
      openForm({date: el.dataset.date, facility: f.id, unit: u.id, start: fromMin(s), end: fromMin(end)});
      break;
    }
    case 'att': e.preventDefault(); setAttendance(el.dataset.id, el.dataset.s, el.dataset.u); break;
    case 'close': closeSheet(); break;
    case 'day': sel.date = addDays(sel.date, Number(el.dataset.d)); sel.month = sel.date.slice(0, 7); route(); break;
    case 'today': sel.date = todayStr(); sel.month = sel.date.slice(0, 7); route(); break;
    case 'month': { const [y, m] = sel.month.split('-').map(Number); const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
      sel.month = ymd(d).slice(0, 7); route(); break; }
    case 'pickday': sel.date = el.dataset.date; sel.month = sel.date.slice(0, 7); route(); break;
    case 'calmode': sel.calMode = el.dataset.mode; route(); break;
    case 'teamfilter': sel.team = el.dataset.team; route(); break;
    case 'calteam': sel.team = el.dataset.team; sel.calMode = 'monat'; break; // Link navigiert danach
    case 'del': askDelete(); break;
    case 'del1': doDelete(false); break;
    case 'delS': doDelete(true); break;
    case 'delcancel': {
      document.getElementById('factions').innerHTML = '<button type="button" class="btn danger" data-action="del">Löschen</button><button type="submit" class="btn">Speichern</button>';
      break;
    }
    default: accountAction(a, el, e);
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.change === 'pickdate' && el.value) { sel.date = el.value; sel.month = el.value.slice(0, 7); route(); return; }
  if (el.closest('#bform')) {
    if (el.name === 'facility') {
      const us = el.form.elements.unit;
      us.innerHTML = unitOptions(el.value, '');
      us.disabled = !el.value;
    }
    if (el.name === 'repeat') document.getElementById('untilRow').classList.toggle('hidden', !el.checked);
    if (el.name === 'date' && el.form.elements.until && el.value && el.form.elements.until.value < el.value) el.form.elements.until.value = addDays(el.value, 56);
    liveCheck();
  }
});
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#bform')) liveCheck(); });
document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'bform') submitForm(); else accountSubmit(e.target); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) closeSheet(); });

// Startseite jede Minute aktualisieren ("läuft gerade", rote Jetzt-Linie)
setInterval(() => { if (backdrop.classList.contains('hidden') && !location.hash.startsWith('#verwaltung')) route(); }, 60000);
