// OrgaMe – Gruppen für Einzelsportarten (20.11.2026)
// Einzelsport-Abteilungen (Reiten, Kampfsport, Leichtathletik, Schwimmen …) zeigen auf der Teams-Seite
// Gruppen: Altersklasse, Leistungsgruppe oder Kurs – optional je Disziplin (Chips).
// Eine Gruppe ist eine normale Zeile in public.teams → 50 Plätze, 👍 ❓ 👎, Termine und Rechte wie bei Mannschaften.
// Braucht gruppen-katalog.js (Vorlagen) und supabase/migration_18_gruppen.sql (Zusatzspalten).
(function () {
  'use strict';
  const G = window.OrgaMeGruppen; if (!G) return;
  const GRP = ['altersklasse', 'leistung', 'kurs'];
  const LABEL = G.TYPE_LABEL;
  const H = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const isAdmin = () => typeof me !== 'undefined' && me && me.role === 'admin';
  const teams = () => (typeof TEAMS !== 'undefined' ? TEAMS : []);

  // ---------- Zusatzangaben der Gruppen laden (Spalten aus migration_18) ----------
  let META = {}, metaFor = null, metaOk = true, metaBusy = false;
  async function loadMeta(force) {
    if (typeof sb === 'undefined' || typeof me === 'undefined' || !me) return;
    const sig = me.club_id + ':' + teams().length + ':' + teams().map(t => t.id).join(',').length;
    if (!force && (metaFor === sig || metaBusy)) return;
    metaBusy = true;
    const {data, error} = await sb.from('teams').select('id,group_type,discipline,age_min,age_max,gender,level').eq('club_id', me.club_id);
    metaBusy = false; metaFor = sig;
    if (error) { metaOk = false; return; }
    metaOk = true; META = {}; (data || []).forEach(r => { META[r.id] = r; });
    if (location.hash.replace(/^#\/?/, '') === 'teams') { document.querySelectorAll('.ob-dep[data-grd]').forEach(reset); decorate(); }
  }
  // Ohne migration_18: Art aus der Beschreibung erkennen („Altersklasse · …“)
  function metaOf(t) {
    const m = META[t.id];
    if (m && GRP.includes(m.group_type)) return m;
    const s = String(t.sport || '');
    const k = GRP.find(g => s.indexOf(LABEL[g]) === 0);
    return k ? {group_type: k, discipline: '', age_min: null, age_max: null, gender: 'gemischt', level: ''} : null;
  }

  // ---------- Teams-Seite ----------
  const CHIP = {};
  const st = document.createElement('style');
  st.textContent = '.gr-chips{display:flex;gap:6px;flex-wrap:wrap;margin:-2px 0 10px}.gr-chip{min-height:34px;padding:0 13px;border-radius:999px;border:1px solid rgba(127,150,200,.4);background:rgba(15,23,42,.45);color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.gr-chip.on{background:#E0177F;border-color:#E0177F;color:#fff}'
    + '.gr-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;margin:2px 0 6px;border-radius:14px;border:1.5px dashed rgba(127,178,255,.55);background:rgba(47,107,255,.08);color:#CFE0FF;font:inherit;font-weight:700;font-size:14.5px;cursor:pointer}'
    + '.gr-badge{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:999px;background:rgba(224,23,127,.18);color:#FFB3D9;font-size:11px;font-weight:800;letter-spacing:.02em}'
    + '.gr-hint{font-size:12.5px;opacity:.75;margin:-4px 2px 10px}'
    + '#gr-form .gr-vl{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 12px;max-height:150px;overflow-y:auto}#gr-form .gr-vl button{min-height:36px;padding:0 11px;border-radius:999px;border:1px solid rgba(127,150,200,.45);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}#gr-form .gr-vl button.on{background:#2F6BFF;border-color:#2F6BFF;color:#fff}'
    + '#gr-form .gr-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:4px 0 12px}#gr-form .gr-seg button{min-height:42px;border-radius:12px;border:1px solid rgba(127,150,200,.45);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}#gr-form .gr-seg button.on{background:#E0177F;border-color:#E0177F;color:#fff}'
    + '#gr-form .gr-t{font-size:13px;font-weight:700;opacity:.85;margin-top:4px}#gr-form .gr-jg{font-size:12.5px;opacity:.8;margin:-4px 0 10px;min-height:16px}#gr-form .gr-msg{color:#FFB86B;font-size:13.5px;min-height:0;margin:6px 0}'
    + '#gr-form .gr-all{display:block;width:100%;margin:8px 0 0;min-height:42px;border-radius:12px;border:1px dashed rgba(127,178,255,.55);background:transparent;color:#CFE0FF;font:inherit;font-weight:700;cursor:pointer}';
  document.head.appendChild(st);

  function depInfo(box) {
    const head = box.querySelector('.ob-head b'); const plus = box.querySelector('.ob-plus');
    const txt = (head ? head.textContent : '').trim();
    const dep = plus ? plus.dataset.dep : txt.replace(/^\S+\s+/, '');
    const icon = plus ? (plus.dataset.ic || '') : '';
    const sport = G.findSport(dep) || G.findSport(txt);
    const einzel = plus ? /^Person/.test(plus.getAttribute('aria-label') || '') : !!(sport && sport.individual);
    return {dep, icon: icon || (sport ? sport.icon : '👥'), sport, einzel: einzel || !!(sport && sport.individual && !plus)};
  }

  function subline(t, m) {
    const parts = [];
    if (m.discipline) parts.push(m.discipline);
    const alt = G.altersText(m.age_min, m.age_max), jg = G.jahrgaenge(m.age_min, m.age_max);
    if (m.group_type === 'altersklasse' && jg) parts.push(jg + (alt ? ' (' + alt + ')' : '')); else if (alt) parts.push(alt);
    if (m.level) parts.push(m.level);
    if (m.gender === 'm') parts.push('männlich'); else if (m.gender === 'w') parts.push('weiblich');
    return '<span class="gr-badge">' + H(LABEL[m.group_type]) + '</span>' + H(parts.join(' · '));
  }

  function reset(box) { box.removeAttribute('data-grd'); box.querySelectorAll('.gr-chips,.gr-add,.gr-hint').forEach(x => x.remove()); }
  function decorate() {
    if (typeof gated !== 'undefined' && gated) return;
    if (location.hash.replace(/^#\/?/, '') !== 'teams') return;
    const app = document.getElementById('app'); if (!app) return;
    loadMeta(false);
    app.querySelectorAll('.ob-dep:not([data-grd])').forEach(box => {
      box.setAttribute('data-grd', '1');
      const d = depInfo(box); if (!d.einzel) return;
      const list = box.querySelector('.tiles'); if (!list) return;
      const discs = new Set(d.sport ? d.sport.disciplines : []);
      const rows = [];
      list.querySelectorAll('a.tile').forEach(a => {
        const id = (a.getAttribute('href') || '').replace('#team-', '');
        const t = teams().find(x => String(x.id) === id); if (!t) return;
        const m = metaOf(t); if (!m) return;
        if (m.discipline) discs.add(m.discipline);
        const sm = a.querySelector('small'); if (sm) sm.innerHTML = subline(t, m);
        rows.push({el: a.closest('.ob-tw') || a, m});
      });
      const empty = list.querySelector('p.empty');
      if (empty) empty.textContent = 'Noch keine Gruppen. Lege Alters-, Leistungsgruppen oder Kurse an.';
      // Disziplin-Chips (nur wenn Gruppen mit Disziplin existieren)
      const used = [...discs].filter(x => rows.some(r => r.m.discipline === x));
      if (used.length) {
        const cur = CHIP[d.dep] && used.includes(CHIP[d.dep]) ? CHIP[d.dep] : '';
        list.insertAdjacentHTML('beforebegin', '<div class="gr-chips" role="group" aria-label="Disziplin wählen">'
          + ['', ...used].map(x => '<button type="button" class="gr-chip' + (x === cur ? ' on' : '') + '" data-gr="chip" data-dep="' + H(d.dep) + '" data-v="' + H(x) + '">' + H(x || 'Alle') + '</button>').join('') + '</div>');
        rows.forEach(r => { r.el.style.display = !cur || !r.m.discipline || r.m.discipline === cur ? '' : 'none'; });
      }
      if (isAdmin()) list.insertAdjacentHTML('afterend', '<button type="button" class="gr-add" data-gr="new" data-dep="' + H(d.dep) + '" data-ic="' + H(d.icon) + '">+ Gruppe anlegen</button>'
        + (rows.length ? '' : '<p class="gr-hint">Einzelsport: statt Mannschaften gibt es Alters- und Leistungsgruppen. Jede Gruppe hat 50 Plätze mit 👍 ❓ 👎.</p>'));
    });
  }

  // ---------- Formular „Gruppe anlegen“ ----------
  let F = null;
  function openForm(dep, icon) {
    const sport = G.findSport(dep);
    F = {dep, icon: icon || (sport ? sport.icon : '👥'), sport, disc: CHIP[dep] || '', type: 'altersklasse', name: '', min: '', max: '', gender: 'gemischt', level: '', pick: -1, busy: false, msg: ''};
    render();
    setTimeout(() => { const i = document.getElementById('gr-name'); if (i) i.focus(); }, 60);
  }
  function readInputs() {
    const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
    if (!document.getElementById('gr-form')) return;
    F.name = v('gr-name'); F.min = v('gr-min'); F.max = v('gr-max'); F.level = v('gr-level'); F.disc = v('gr-disc');
  }
  function tpls() { return F.sport ? G.templates(F.sport.key, F.disc) : []; }
  function render() {
    if (!F || typeof openSheet !== 'function') return;
    const discs = F.sport ? F.sport.disciplines : [];
    const T = tpls();
    const exist = new Set(teams().filter(t => String(t.department || '').toLowerCase() === F.dep.toLowerCase()).map(t => String(t.name).toLowerCase()));
    const missing = T.filter(g => g.group_type !== 'mannschaft' && !exist.has(g.name.toLowerCase()));
    const n = x => (x === '' || x == null ? null : Number(x));
    const jg = G.jahrgaenge(n(F.min), n(F.max));
    const seg = (key, opts) => '<div class="gr-seg" role="group">' + opts.map(([v, l]) => '<button type="button" data-gr="' + key + '" data-v="' + v + '" class="' + (F[key === 'type' ? 'type' : 'gender'] === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    openSheet('<form id="gr-form" novalidate>'
      + '<div class="sheet-head"><h3>Gruppe anlegen · ' + H(F.dep) + '</h3><button type="button" class="x" data-gr="close" aria-label="Schließen">✕</button></div>'
      + (discs.length ? '<label>Disziplin<select id="gr-disc" data-gr="disc"><option value="">Alle / keine</option>' + discs.map(x => '<option' + (x === F.disc ? ' selected' : '') + '>' + H(x) + '</option>').join('') + '</select></label>' : '')
      + (T.length ? '<div class="gr-t">Vorlagen' + (F.sport ? ' für ' + H(F.sport.name) : '') + '</div><div class="gr-vl">' + T.map((g, i) => '<button type="button" data-gr="tpl" data-i="' + i + '" class="' + (i === F.pick ? 'on' : '') + '">' + H(g.name) + (g.level ? ' · ' + H(g.level) : '') + '</button>').join('') + '</div>' : '')
      + '<label>Name der Gruppe<input id="gr-name" maxlength="50" value="' + H(F.name) + '" placeholder="z. B. Jugend U15" autocomplete="off"></label>'
      + '<div class="gr-t">Art der Gruppe</div>' + seg('type', [['altersklasse', 'Altersklasse'], ['leistung', 'Leistungsgruppe'], ['kurs', 'Kurs']])
      + '<div class="row2"><label>Alter von<input id="gr-min" type="number" inputmode="numeric" min="0" max="120" value="' + H(F.min) + '" placeholder="offen"></label>'
      + '<label>Alter bis<input id="gr-max" type="number" inputmode="numeric" min="0" max="120" value="' + H(F.max) + '" placeholder="offen"></label></div>'
      + '<p class="gr-jg" id="gr-jg">' + (jg ? H(jg) + ' · rückt am 1. Januar automatisch weiter' : '') + '</p>'
      + '<div class="gr-t">Geschlecht</div>' + seg('gender', [['gemischt', 'Gemischt'], ['m', 'männlich'], ['w', 'weiblich']])
      + '<label>Stufe <small style="opacity:.7">(freiwillig – z. B. RA 9–8, 8. Kyu, LK 5)</small><input id="gr-level" maxlength="40" value="' + H(F.level) + '" autocomplete="off"></label>'
      + '<p class="gr-msg" id="gr-msg">' + H(F.msg) + '</p>'
      + '<div class="sheet-actions"><button type="button" class="btn ghost" data-gr="close">Abbrechen</button><button type="button" class="btn" data-gr="save"' + (F.busy ? ' disabled' : '') + '>' + (F.busy ? 'Speichert …' : 'Gruppe speichern') + '</button></div>'
      + (missing.length > 1 ? '<button type="button" class="gr-all" data-gr="all"' + (F.busy ? ' disabled' : '') + '>Alle ' + missing.length + ' Vorlagen auf einmal anlegen</button>' : '')
      + '</form>');
  }
  function rowOf(g) {
    const label = LABEL[g.group_type] || 'Gruppe';
    return {club_id: me.club_id, name: g.name.trim().slice(0, 50), department: F.dep,
      sport: label + (g.discipline ? ' · ' + g.discipline : ''), icon: F.icon || '👥', color: '#E0177F',
      group_type: g.group_type, discipline: g.discipline || '', age_min: g.age_min, age_max: g.age_max,
      gender: g.gender || 'gemischt', level: g.level || ''};
  }
  async function insertRows(rows) {
    let sort = teams().length + 1; rows.forEach(r => { r.sort = sort++; });
    let res = await sb.from('teams').insert(rows);
    if (res.error && /group_type|discipline|age_min|age_max|gender|level|column/i.test(res.error.message || '')) {
      // migration_18 fehlt noch: ohne Zusatzangaben speichern, Art steht dann in der Beschreibung
      const basic = rows.map(r => ({club_id: r.club_id, name: r.name, department: r.department, sport: r.sport, icon: r.icon, color: r.color, sort: r.sort}));
      res = await sb.from('teams').insert(basic);
    }
    return res.error;
  }
  async function save(all) {
    if (!F || F.busy) return; readInputs();
    const n = x => (x === '' || x == null ? null : Math.max(0, Math.min(120, parseInt(x, 10) || 0)));
    let rows;
    if (all) {
      const exist = new Set(teams().filter(t => String(t.department || '').toLowerCase() === F.dep.toLowerCase()).map(t => String(t.name).toLowerCase()));
      rows = tpls().filter(g => g.group_type !== 'mannschaft' && !exist.has(g.name.toLowerCase())).map(g => rowOf(Object.assign({gender: 'gemischt'}, g)));
      if (!rows.length) return;
    } else {
      const g = {name: F.name, group_type: F.type, discipline: F.disc, age_min: n(F.min), age_max: n(F.max), gender: F.gender, level: F.level.trim()};
      if (g.name.trim().length < 2) { F.msg = 'Bitte einen Namen mit mindestens 2 Zeichen eingeben.'; render(); return; }
      if (g.age_min != null && g.age_max != null && g.age_min > g.age_max) { F.msg = '„Alter von“ muss kleiner sein als „Alter bis“.'; render(); return; }
      rows = [rowOf(g)];
    }
    F.busy = true; F.msg = ''; render();
    const err = await insertRows(rows);
    if (err) { F.busy = false; F.msg = 'Konnte nicht gespeichert werden: ' + (err.message || err); render(); return; }
    const msg = rows.length === 1 ? 'Gruppe „' + rows[0].name + '“ angelegt' : rows.length + ' Gruppen angelegt';
    if (F.disc) CHIP[F.dep] = F.disc;
    F = null; metaFor = null;
    if (typeof afterMasterChange === 'function') await afterMasterChange(msg); else location.reload();
    loadMeta(true);
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-gr]'); if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.gr;
    if (a === 'chip') { ev.preventDefault(); ev.stopPropagation(); CHIP[b.dataset.dep] = b.dataset.v; const box = b.closest('.ob-dep'); if (box) reset(box); decorate(); return; }
    if (a === 'new') { ev.preventDefault(); ev.stopPropagation(); openForm(b.dataset.dep, b.dataset.ic); return; }
    if (!F || !b.closest('#gr-form')) return;
    ev.preventDefault(); ev.stopPropagation();
    if (a === 'close') { F = null; if (typeof closeSheet === 'function') closeSheet(); return; }
    readInputs();
    if (a === 'type' || a === 'gender') { F[a] = b.dataset.v; render(); return; }
    if (a === 'tpl') {
      const g = tpls()[+b.dataset.i]; if (!g) return;
      F.pick = +b.dataset.i; F.name = g.name; F.type = g.group_type === 'mannschaft' ? 'leistung' : g.group_type;
      F.min = g.age_min == null ? '' : String(g.age_min); F.max = g.age_max == null ? '' : String(g.age_max);
      F.level = g.level; if (g.discipline) F.disc = g.discipline; F.msg = ''; render(); return;
    }
    if (a === 'save') { save(false); return; }
    if (a === 'all') { save(true); }
  }, true);
  document.addEventListener('change', ev => { if (F && ev.target && ev.target.id === 'gr-disc') { readInputs(); F.pick = -1; render(); } });
  document.addEventListener('input', ev => {
    if (!F || !ev.target || (ev.target.id !== 'gr-min' && ev.target.id !== 'gr-max')) return;
    const n = x => (x === '' ? null : Number(x));
    const p = document.getElementById('gr-jg'); if (!p) return;
    const jg = G.jahrgaenge(n(document.getElementById('gr-min').value), n(document.getElementById('gr-max').value));
    p.textContent = jg ? jg + ' · rückt am 1. Januar automatisch weiter' : '';
  });
  document.addEventListener('keydown', ev => { if (F && ev.key === 'Enter' && ev.target && ev.target.closest && ev.target.closest('#gr-form') && ev.target.tagName === 'INPUT') { ev.preventDefault(); save(false); } });

  if (typeof route === 'function') {
    const orig = route;
    route = function () { const r = orig.apply(this, arguments); try { decorate(); } catch (e) { console.warn('OrgaMe Gruppen', e); } return r; };
  }
  window.OrgaMeGruppenUI = {decorate, openForm, loadMeta};
})();
