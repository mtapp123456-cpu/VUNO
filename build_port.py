"""Einmalige Übernahme der bestehenden App: CSS und Ansichten bleiben, Datenzugriff wird ersetzt."""
import glob, os, re, sys

SRC = sys.argv[1]
OUT = 'app'
html = open(SRC, encoding='utf8').read()

# ---------- CSS ----------
m = re.search(r'<style>\s*(:root\{\s*--bg.*?)</style>', html, re.S)
css = m.group(1)
open(f'{OUT}/style.css', 'w', encoding='utf8').write(css + open('account.css', encoding='utf8').read())

# ---------- JS ----------
js = html[html.index("<script>") + 8: html.rindex("</script>")]


def cut(src, start, end, new=''):
    a = src.index(start)
    b = src.index(end, a)
    return src[:a] + new + src[b:]


def rep(src, old, new):
    if old not in src:
        raise SystemExit('Nicht gefunden: ' + old[:70])
    return src.replace(old, new)


# Stammdaten kommen aus der Datenbank
js = cut(js, "const TEAMS = [", "const GROUPS =", "let TEAMS = [];\n")
js = cut(js, "const FACILITIES = [", "const TL_START", "let FACILITIES = [];\n")
js = rep(js, "const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);\n", "")

# Datenzugriff ersetzen
js = cut(js, "// Alle Buchungen liegen", "/* =================== Belegungslogik", open('data_layer.js', encoding='utf8').read() + "\n")

# Startseite: Kacheln aus den Daten des Vereins
js = cut(js, "  const tiles = [", "  return `\n  <section class=\"hero\">", """  const countGroup = g => FACILITIES.filter(f => f.group === g).length;
  const tiles = [
    ...TEAMS.slice(0, 8).map(x => ({href:`#team-${x.id}`, ic:x.icon, c:x.color, name:esc(x.name), sub:esc(x.sport)})),
    ...(countGroup('platz') ? [{href:'#anlagen-platz', ic:'🏟️', c:'#15803d', name:'Sportplätze', sub:`${countGroup('platz')} Anlage(n)`}] : []),
    ...(countGroup('halle') ? [{href:'#anlagen-halle', ic:'🏢', c:'#0369a1', name:'Sporthallen', sub:`${countGroup('halle')} Anlage(n)`}] : []),
    ...(countGroup('heim') ? [{href:'#anlagen-heim', ic:'🍻', c:'#b45309', name:'Sportheim', sub:`${countGroup('heim')} Anlage(n)`}] : []),
    {href:'#kalender', ic:'📅', c:'#7c3aed', name:'Vereinskalender', sub:'Tag & Monat'}
  ];
""")
js = rep(js, "${readOnly ? 'Sobald der Vorstand Trainings und Spiele einträgt, erscheinen sie hier.' : 'Tippe unten rechts",
         "${setupHint()}${readOnly ? 'Sobald der Vorstand Trainings und Spiele einträgt, erscheinen sie hier.' : 'Tippe unten rechts")

# Router
js = rep(js, "function route() {\n", "function route() {\n  if (gated) return;\n  maybeExtendRange();\n")
js = rep(js, "    case 'kalender': html = viewKalender(); break;\n",
         "    case 'kalender': html = viewKalender(); break;\n    case 'verwaltung': html = viewAdmin(arg); tab = ''; break;\n")
js = rep(js, "window.addEventListener('hashchange', () => { route();", "window.addEventListener('hashchange', () => { if (gated) return; route();")

# Formular
js = rep(js, "const d = Object.assign({title:'', team:'fb1', facility:'p1', unit:'',",
         "const first = bookableTeams()[0] || TEAMS[0] || {};\n  const d = Object.assign({title:'', team:first.id || '', facility:FACILITIES[0] ? FACILITIES[0].id : '', unit:'',")
js = rep(js, "<select name=\"team\">${TEAMS.map(t =>",
         "<select name=\"team\">${(viewOnly ? TEAMS : bookableTeams()).map(t =>")
js = rep(js, "  const isNew = !b.id;\n", "  const isNew = !b.id;\n  const viewOnly = readOnly || (!isNew && !canBook(b.team));\n")
js = rep(js, "  if (readOnly) {\n    sheet.querySelector('h3')", "  if (viewOnly) {\n    sheet.querySelector('h3')")
js = rep(js, "Nur Ansicht – zum Ändern braucht es Bearbeitungsrechte.", "Nur Ansicht – ändern kann das nur die zuständige Person oder der Vorstand.")

# Speichern: Serien sind jetzt ganz oder gar nicht
js = cut(js, "  const fields = {title: d.title, team: d.team,", "  saving = false;\n  toast(formCtx.id", """  const fields = {title: d.title, team: d.team, facility: d.facility, unit: d.unit, start: d.start, end: d.end, note: d.note};
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
""")
js = rep(js, "if (saving || readOnly || !store) return;\n  const d = readForm()", "if (saving || readOnly) return;\n  const d = readForm()")

# Löschen
js = cut(js, "async function doDelete(series) {", "/* =================== Einstellungen", """async function doDelete(series) {
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

""")

# Einstellungen liegen in account.js
js = cut(js, "/* =================== Einstellungen", "/* =================== Toast")

# Ereignisse
js = rep(js, "if (el.dataset.f) { o.facility = el.dataset.f; o.team = 'fb1'; }", "if (el.dataset.f) o.facility = el.dataset.f;")
js = rep(js, "      if (readOnly) { toast('Zum Buchen braucht es Bearbeitungsrechte'); break; }\n      const o = {date: sel.date};",
         "      if (readOnly) { toast('Zum Buchen braucht es Bearbeitungsrechte'); break; }\n      const o = {date: sel.date};")
js = rep(js, "      if (!o.team && h.startsWith('team-')) o.team = h.slice(5);", "      if (!o.team && h.startsWith('team-') && canBook(h.slice(5))) o.team = h.slice(5);")
js = rep(js, "      openForm(o); break;", "      if (o.team && !canBook(o.team)) delete o.team;\n      if (!bookableTeams().length) { toast('Zuerst ein Team anlegen'); break; }\n      openForm(o); break;")
js = rep(js, "      if (readOnly) break;\n      const f = fac(el.dataset.f)", "      if (readOnly || !bookableTeams().length) break;\n      const f = fac(el.dataset.f)")
js = rep(js, "    case 'settings': openSettings(); break;\n    case 'saveclub': saveClub(); break;\n", "    default: accountAction(a, el, e);\n")
js = rep(js, "document.addEventListener('submit', e => { if (e.target.id === 'bform') { e.preventDefault(); submitForm(); } });",
         "document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'bform') submitForm(); else accountSubmit(e.target); });")
js = rep(js, "setInterval(() => { if (backdrop.classList.contains('hidden')) route(); }, 60000);\nroute();\ninitStore();\n",
         "setInterval(() => { if (backdrop.classList.contains('hidden') && !location.hash.startsWith('#verwaltung')) route(); }, 60000);\n")
js = rep(js, "document.getElementById('brand').textContent = '🏆 ' + db.club;",
         "document.getElementById('brand').innerHTML = (branding.logo ? `<img class=\"brand-logo\" src=\"${esc(branding.logo)}\" alt=\"\">` : '🏆 ') + `<span>${esc(db.club)}</span>`;")
js = rep(js, "function closeSheet() { backdrop.classList.add('hidden');", "function closeSheet() { if (me) applyColors(branding.brand_color, branding.header_color); backdrop.classList.add('hidden');")
open(f'{OUT}/app.js', 'w', encoding='utf8').write(js)

# ---------- QR-Bibliothek (MIT, Kazuhiko Arase) als eine Browser-Datei ----------
q = glob.glob('/opt/node22/lib/node_modules/npm/node_modules/qrcode-terminal/vendor/QRCode')[0]
mods = {os.path.basename(p)[:-3]: open(p, encoding='utf8').read() for p in glob.glob(q + '/*.js')}
bundle = "// QRCode for JavaScript, Copyright (c) 2009 Kazuhiko Arase, MIT-Lizenz\n(function(){var d={},c={};function r(n){n=n.replace('./','');if(n in c)return c[n].exports;var m=c[n]={exports:{}};d[n](m,m.exports,r);return m.exports;}\n"
for k, v in mods.items():
    bundle += f"d[{k!r}]=function(module,exports,require){{\n{v}\n}};\n"
bundle += "window.QRCode=r('index');window.QRErrorCorrectLevel=r('QRErrorCorrectLevel');})();\n"
open(f'{OUT}/vendor/qrcode.js', 'w', encoding='utf8').write(bundle)
print('ok')
