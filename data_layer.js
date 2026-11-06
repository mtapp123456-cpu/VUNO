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
}
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