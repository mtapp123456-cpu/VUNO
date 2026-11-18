// OrgaMe: Einladung mit Rechten (18.11.2026)
// - Willkommen: „QR-Code scannen“ oder „Verein auswählen“ (Entwurf des Nutzers)
// - Einladen: Wer einlädt, kann nur Rechte und Mannschaften weitergeben, die er selbst hat.
//   Gesperrtes ist mit 🔒 markiert. Die Datenbank prüft dasselbe noch einmal (migration_einladung_rechte.sql).
// - Eingeladene sehen eine eigene Übersicht: Heute im Verein (Plätze, Hallen, Sportheim),
//   „Belegung eintragen“ nur mit Belegungsrecht, oben die Reiter Übersicht · Kalender · Plätze · Sportheim · Mehr.
// Wird als LETZTES Skript geladen. app.js und account.js rufen die Haken window.orgame* auf.
(function () {
  'use strict';

  const RECHTE = [
    ['platz', 'Sportplätze belegen', 'Termine auf den Plätzen eintragen', 'team'],
    ['halle', 'Sporthallen belegen', 'Termine in den Hallen eintragen', 'team'],
    ['spieler', 'Spieler verwalten', 'Spieler hinzufügen und entfernen', 'team'],
    ['news', 'Breaking News posten', 'Meldungen für die Mannschaft', 'team'],
    ['sportheim', 'Sportheim verwalten', 'Speisekarte und Aktionen', 'club'],
    ['einladen', 'Mitglieder einladen', 'Eigene Rechte weitergeben', 'club']
  ];
  const NAME = Object.fromEntries(RECHTE.map(r => [r[0], r[1]]));
  const cfg = () => window.APP_CONFIG || {};
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const H = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const normC = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fmtC = s => normC(s).replace(/(.{4})(?=.)/g, '$1-');
  const page = () => location.hash.replace(/^#\/?/, '') || 'start';
  const errText = e => (e && (e.message || e.details)) || 'Das hat nicht geklappt. Bitte prüfe die Verbindung.';

  const ICON = {
    qr: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4"/><rect x="7" y="7" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/><path d="M13 7h4v3M7 13v4h3"/></svg>',
    search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    chev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    platz: '<svg width="34" height="26" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="1.5" y="2" width="29" height="20" rx="2"/><path d="M16 2v20"/><circle cx="16" cy="12" r="3.5"/><path d="M1.5 8h4v8h-4M30.5 8h-4v8h4"/></svg>',
    halle: '<svg width="30" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10l9-6 9 6v11H3z"/><path d="M7 21v-7h10v7M7 17h10M12 14v7"/></svg>',
    heim: '<svg width="30" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 11l9-7 9 7v10H3z"/><path d="M10 21v-6h4v6"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    cal: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    feld: '<svg width="26" height="22" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1.5" y="2" width="29" height="20" rx="2"/><path d="M16 2v20"/><circle cx="16" cy="12" r="3.5"/></svg>',
    haus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v10H3z"/><path d="M10 21v-6h4v6"/></svg>',
    mehr: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    bell: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8M10 21h4"/></svg>',
    ppl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/></svg>',
    plus: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="5" width="15" height="15" rx="2"/><path d="M3 10h15M7 3v4M14 3v4M19 15v6M16 18h6"/></svg>'
  };

  /* ---------- Rechte der angemeldeten Person ---------- */
  const OG = {rechte: [], eingeladen: false, von: '', club: null, geladen: false};
  const isAdm = () => !!me && me.role === 'admin' && !window.fanPreviewMe;
  function darf(r, t) {
    if (!me || window.fanPreviewMe) return false;
    if (me.role === 'admin') return true;
    return OG.rechte.some(x => x.r === r && (t === undefined || (x.t || null) === (t || null)));
  }
  const darfIrgendwo = r => isAdm() || (!window.fanPreviewMe && OG.rechte.some(x => x.r === r));
  const isInv = () => !!me && !gated && OG.eingeladen && me.role !== 'admin' && !window.fanPreviewMe;

  // Haken für app.js (Buchen, Spieler, News, Ortsauswahl im Buchungsformular)
  window.orgameDarf = darf;
  window.orgameOrt = f => !OG.geladen || isAdm() || f.group === 'heim' || OG.rechte.some(x => x.r === f.group);
  window.orgameNews = tid => !!me && !window.fanPreviewMe && !isFanTeam(tid)
    && (me.role === 'admin' || (me.role === 'trainer' && (me.team_ids || []).includes(tid)) || darf('news', tid));

  // Haken für account.js: nach dem Öffnen eines Vereins die Rechte laden
  window.orgameNachClub = async function (c) {
    Object.assign(OG, {rechte: [], eingeladen: false, von: '', club: c.club_id, geladen: false});
    try {
      const {data, error} = await sb.rpc('orgame_meine_rechte', {p_club: c.club_id});
      if (!error && data) Object.assign(OG, {rechte: data.rechte || [], eingeladen: !!data.eingeladen, von: data.von || '', geladen: true});
    } catch (e) {}
    if (OG.eingeladen) LS.set('orgame_eingeladen', '1');
  };

  /* ---------- Link ?einladung=CODE merken ---------- */
  try {
    const p = new URLSearchParams(location.search);
    const c = p.get('einladung');
    if (c) {
      LS.set('orgame_einladung', normC(c));
      p.delete('einladung');
      const rest = p.toString();
      history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  } catch (e) {}

  /* ---------- Einstieg (account.js ruft das zuerst auf) ---------- */
  window.orgameEnter = async function () {
    const code = LS.get('orgame_einladung');
    if (code) { await zeigeEinladung(code); return true; }
    const {data: {session}} = await sb.auth.getSession();
    if (LS.get('orgame_eingeladen') === '1') {
      if (session) {
        const {data, error} = await sb.rpc('my_clubs');
        if (error) return false;
        myClubs = data || [];
        const act = myClubs.filter(c => c.status === 'active');
        const cur = act.find(c => c.club_id === LS.get('clubId')) || act[0];
        if (cur) { entferneOverlay(); await openClub(cur); return true; }
      }
      LS.del('orgame_eingeladen');
    }
    if (window.__ogWeiter) return false;
    if (cfg().openAccess) {
      if (LS.get('onbac_zugang') || session) return false;   // Admin-Testzugang wie bisher
      zeigeWillkommen(); return true;
    }
    if (!session && !LS.get('pendingJoin') && !LS.get('pendingStart')) { zeigeWillkommen(); return true; }
    return false;
  };

  /* ---------- Vollbild-Seiten (Willkommen, Einladung) ---------- */
  function overlay(html) {
    let o = document.getElementById('og-ov');
    if (!o) { o = document.createElement('div'); o.id = 'og-ov'; document.body.appendChild(o); }
    o.innerHTML = html; o.scrollTop = 0;
    document.body.classList.add('og-ov-open');
    return o;
  }
  function entferneOverlay() {
    const o = document.getElementById('og-ov'); if (o) o.remove();
    document.body.classList.remove('og-ov-open');
    stopScan();
  }
  const logo = (cls) => `<img src="onbac-logo.png?v=53" alt="OrgaMe" class="${cls || 'og-w-logo'}">`;

  let VQ = '', vListe = null, vTimer = null;
  function zeigeWillkommen(msg) {
    overlay(`<div class="og-welcome">
      <div class="og-w-top">${logo()}<p class="og-w-tag">Die All-in-One Vereins-App</p></div>
      <div class="og-w-bottom">
        ${msg ? `<div class="og-msg">${H(msg)}</div>` : ''}
        <button type="button" class="og-cta-big" data-og="scan">${ICON.qr}<span>QR-Code scannen</span></button>
        <div class="og-or"><span>oder</span></div>
        <label class="og-search">${ICON.search}<input id="og-vq" placeholder="Verein auswählen …" autocomplete="off" autocapitalize="off" spellcheck="false" value="${H(VQ)}"></label>
        <div id="og-vlist" class="og-vlist">${vListHTML()}</div>
        <button type="button" class="og-link" data-og="code">Ich habe einen Einladungscode</button>
        ${cfg().openAccess ? '' : '<button type="button" class="og-link" data-og="login">Als Vorstand mit E-Mail anmelden</button>'}
      </div></div>`);
    ladeVereine();
  }
  function vListHTML() {
    if (vListe === null) return '<p class="og-small" style="text-align:center">Vereine werden geladen …</p>';
    if (!vListe.length) return `<p class="og-small" style="text-align:center">${VQ.length >= 2 ? 'Kein Verein gefunden.' : 'Tippe den Namen deines Vereins ein.'}</p>`;
    return vListe.map(c => `<button type="button" class="og-club" data-og="club" data-id="${H(c.id)}" data-n="${H(c.name)}" data-offen="${c.offen ? 1 : 0}">
      <span class="og-crest">${H((c.name || '?').replace(/^(TSV|SV|FC|TV|SC|VfB|VfL|SG|SpVgg)\s+/i, '').charAt(0).toUpperCase())}</span>
      <span class="og-club-n">${H(c.name)}${c.offen && cfg().openAccess ? '<small>Testverein</small>' : ''}</span>${ICON.chev}</button>`).join('');
  }
  async function ladeVereine() {
    const q = VQ;
    try {
      const {data, error} = await sb.rpc('orgame_vereine', {p_q: q});
      if (q !== VQ) return;
      vListe = error ? [] : (data || []);
    } catch (e) { vListe = []; }
    const el = document.getElementById('og-vlist'); if (el) el.innerHTML = vListHTML();
  }

  function zeigeCodeEingabe(clubName, msg) {
    overlay(`<div class="og-welcome og-plain">
      <div class="og-w-top small">${logo()}</div>
      <div class="og-card">
        <h2>${clubName ? H(clubName) : 'Einladungscode'}</h2>
        <p class="og-sub">${clubName ? 'Beitreten kannst du nur mit einer Einladung. Dein Trainer oder Vorstand gibt dir einen QR-Code oder einen Code.' : 'Gib den Code aus deiner Einladung ein.'}</p>
        <form id="og-f-code" class="og-form"><label>Code<input name="code" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" autocomplete="off" spellcheck="false" required></label>
          <button class="og-cta-big" type="submit">Weiter</button></form>
        <div id="og-code-msg">${msg ? `<div class="og-msg">${H(msg)}</div>` : ''}</div>
        <button type="button" class="og-cta-sec" data-og="scan">${ICON.qr}<span>QR-Code scannen</span></button>
      </div>
      <button type="button" class="og-link" data-og="willkommen">‹ Zurück</button>
    </div>`);
  }
  async function pruefeCode(raw) {
    const c = normC(raw);
    if (c.length < 6) { zeigeCodeEingabe('', 'Der Code ist zu kurz.'); return; }
    let info = null;
    try { const r = await sb.rpc('orgame_einladung_info', {p_code: c}); info = r.data; } catch (e) {}
    if (info && info.ok) { LS.set('orgame_einladung', c); await zeigeEinladung(c); return; }
    // Alte Einladungen (Aushang-QR-Code, ?join=…) laufen wie bisher
    entferneOverlay(); window.__ogWeiter = true;
    if (typeof showJoin === 'function') await showJoin(c);
  }

  /* ---------- Einladung ansehen und annehmen ---------- */
  async function zeigeEinladung(code) {
    overlay(`<div class="og-welcome og-plain"><div class="og-w-top small">${logo()}</div><p class="og-small" style="text-align:center">Einladung wird geprüft …</p></div>`);
    let info = null;
    try { const r = await sb.rpc('orgame_einladung_info', {p_code: code}); info = r.data; } catch (e) {}
    if (!info || !info.ok) { LS.del('orgame_einladung'); zeigeWillkommen('Diese Einladung gibt es nicht. Bitte frag im Verein nach einem neuen QR-Code.'); return; }
    if (info.status === 'eingelöst') {
      const {data: {session}} = await sb.auth.getSession();
      if (session) { const r = await sb.rpc('orgame_einladung_annehmen', {p_code: code, p_name: ''}); if (!r.error && r.data) { await fertig(r.data); return; } }
    }
    if (info.status !== 'offen') { LS.del('orgame_einladung'); zeigeWillkommen('Diese Einladung ist ' + info.status + '. Bitte frag im Verein nach einem neuen QR-Code.'); return; }
    const rechte = info.rechte || [], teams = info.teams || [];
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
    overlay(`<div class="og-welcome og-plain">
      <div class="og-w-top small">${logo()}</div>
      <div class="og-card">
        <div class="og-k">Einladung</div>
        <h2>${H(info.club)}</h2>
        ${info.von ? `<p class="og-sub">von ${H(info.von)}</p>` : ''}
        <div class="og-k">Deine Rechte</div>
        <div class="og-chips">${rechte.length ? rechte.map(r => `<span class="og-chip on">${H(r)}</span>`).join('') : '<span class="og-chip">Alles ansehen</span>'}</div>
        ${teams.length ? `<div class="og-k">Mannschaften</div><div class="og-chips">${teams.map(t => `<span class="og-chip">${H(t)}</span>`).join('')}</div>` : ''}
        <p class="og-small">Gültig bis ${new Date(info.gueltig_bis).toLocaleDateString('de-DE')} · nur für dich</p>
      </div>
      ${ios ? `<div class="og-hint"><b>iPhone-Tipp:</b> Wenn du die App auf dem Home-Bildschirm haben willst, installiere sie zuerst (Teilen → „Zum Home-Bildschirm“), öffne sie dort und gib diesen Code ein:<div class="og-code">${fmtC(code)}</div></div>` : ''}
      <form id="og-f-join" class="og-form">
        <label>Dein Name<input name="name" maxlength="60" autocomplete="name" value="${H(info.name || '')}" required></label>
        <button class="og-cta-big" type="submit">Jetzt beitreten</button>
      </form>
      <div id="og-join-msg"></div>
      <button type="button" class="og-link" data-og="abbrechen">Abbrechen</button>
    </div>`);
  }
  async function beitreten(form) {
    const btn = form.querySelector('button[type=submit]');
    const msg = t => { const m = document.getElementById('og-join-msg'); if (m) m.innerHTML = `<div class="og-msg">${H(t)}</div>`; btn.disabled = false; btn.textContent = 'Jetzt beitreten'; };
    btn.disabled = true; btn.textContent = 'Einen Moment …';
    const {data: {session}} = await sb.auth.getSession();
    if (!session) {
      const {error} = await sb.auth.signInAnonymously();
      if (error) { msg('Die Anmeldung ohne E-Mail ist gerade nicht freigeschaltet.'); return; }
    }
    const {data, error} = await sb.rpc('orgame_einladung_annehmen', {p_code: LS.get('orgame_einladung'), p_name: form.elements.name.value.trim()});
    if (error) { msg(errText(error)); return; }
    await fertig(data);
  }
  async function fertig(d) {
    LS.del('orgame_einladung');
    LS.set('orgame_eingeladen', '1');
    LS.set('clubId', d.club_id);
    try { history.replaceState(null, '', location.pathname + '#start'); } catch (e) {}
    entferneOverlay();
    await enterApp();
    if (d.gekappt) toast('Einige Rechte hatte die einladende Person nicht mehr – sie wurden weggelassen.');
    else if (!d.schon) toast('Willkommen im Verein!');
  }

  /* ---------- QR-Code mit der Kamera scannen ---------- */
  let SCAN = null;
  function stopScan() {
    if (!SCAN) return;
    SCAN.stop = true;
    try { SCAN.stream && SCAN.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    const s = document.getElementById('og-scan'); if (s) s.remove();
    SCAN = null;
  }
  function ladeJsQR() {
    if (window.jsQR) return Promise.resolve(true);
    return new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = () => res(!!window.jsQR); s.onerror = () => res(false);
      document.head.appendChild(s);
    });
  }
  async function scan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { zeigeCodeEingabe('', 'Die Kamera ist hier nicht verfügbar. Bitte den Code eingeben – oder den QR-Code mit der Kamera-App des Handys scannen.'); return; }
    stopScan();
    const box = document.createElement('div');
    box.id = 'og-scan';
    box.innerHTML = '<video playsinline muted></video><div class="og-scan-frame"></div><p>QR-Code der Einladung in den Rahmen halten</p><button type="button" class="og-cta-sec" data-og="scan-stop">Abbrechen</button>';
    document.body.appendChild(box);
    const video = box.querySelector('video');
    SCAN = {stop: false, stream: null};
    const my = SCAN;
    try {
      my.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false});
      if (my.stop) { my.stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = my.stream; await video.play();
    } catch (e) { stopScan(); zeigeCodeEingabe('', 'Die Kamera konnte nicht geöffnet werden. Bitte den Code eingeben – oder den QR-Code mit der Kamera-App des Handys scannen.'); return; }
    let det = null;
    try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({formats: ['qr_code']}); } catch (e) { det = null; }
    if (!det && !(await ladeJsQR())) { stopScan(); zeigeCodeEingabe('', 'Der Scanner konnte nicht geladen werden. Bitte den Code eingeben.'); return; }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', {willReadFrequently: true});
    const tick = async () => {
      if (my.stop) return;
      let text = '';
      try {
        if (video.readyState >= 2) {
          if (det) { const r = await det.detect(video); if (r && r[0]) text = r[0].rawValue; }
          else {
            const w = video.videoWidth, h = video.videoHeight, k = Math.min(1, 640 / Math.max(w, h));
            cv.width = Math.round(w * k); cv.height = Math.round(h * k);
            cx.drawImage(video, 0, 0, cv.width, cv.height);
            const img = cx.getImageData(0, 0, cv.width, cv.height);
            const r = window.jsQR(img.data, img.width, img.height, {inversionAttempts: 'dontInvert'});
            if (r) text = r.data;
          }
        }
      } catch (e) {}
      if (text) { stopScan(); gescannt(text); return; }
      setTimeout(tick, 220);
    };
    tick();
  }
  function gescannt(text) {
    let c = '';
    try { const u = new URL(text); c = u.searchParams.get('einladung') || u.searchParams.get('join') || u.searchParams.get('i') || ''; }
    catch (e) { c = text; }
    pruefeCode(c);
  }

  /* ---------- Einladen (für alle mit Recht „Mitglieder einladen“) ---------- */
  const INV = {rechte: new Set(), teams: new Set(), name: ''};
  function meineTeams() {
    const ids = new Set(isAdm() ? TEAMS.map(t => t.id) : OG.rechte.filter(x => x.t).map(x => x.t));
    return TEAMS.filter(t => ids.has(t.id));
  }
  function pruefeAuswahl() {
    const tr = [...INV.rechte].filter(r => RECHTE.find(x => x[0] === r)[3] === 'team');
    if (tr.length && !INV.teams.size && meineTeams().length) return 'Bitte mindestens eine Mannschaft auswählen.';
    const fehlt = [];
    tr.forEach(r => INV.teams.forEach(t => { if (!darf(r, t)) fehlt.push(NAME[r] + ' (' + team(t).name + ')'); }));
    return fehlt.length ? '🔒 Das hast du selbst nicht: ' + fehlt.join(', ') : '';
  }
  function oeffneEinladen() {
    if (!darf('einladen', null)) { toast('Du darfst niemanden einladen.'); return; }
    INV.rechte = new Set(); INV.teams = new Set(); INV.name = '';
    const teams = meineTeams();
    const rows = RECHTE.map(([k, l, d, art]) => {
      const has = art === 'club' ? darf(k, null) : darfIrgendwo(k);
      return `<button type="button" class="og-perm ${has ? '' : 'lock'}" data-og="recht" data-k="${k}" ${has ? '' : 'aria-disabled="true"'}>
        <span class="og-box"></span><span class="og-perm-t"><b>${l}</b><small>${has ? d + (art === 'team' ? ' · für die gewählten Mannschaften' : '') : '🔒 Hast du selbst nicht'}</small></span></button>`;
    }).join('');
    openSheet(`<form id="og-f-inv">
      <div class="sheet-head"><h3>➕ Mitglied einladen</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
      <p class="muted" style="margin:0 0 10px;font-size:13px">Du kannst nur Rechte und Mannschaften weitergeben, die du selbst hast. Gesperrtes ist mit 🔒 markiert.</p>
      <label>Name der Person<input name="name" maxlength="60" placeholder="z. B. Max Müller" autocomplete="off" required></label>
      <div class="og-lbl">Rechte</div>${rows}
      <div class="og-lbl">Mannschaften</div>
      ${teams.length ? `<div class="og-chips">${teams.map(t => `<button type="button" class="og-chip sel" data-og="team" data-id="${H(t.id)}">${H(t.icon || '')} ${H(t.name)}</button>`).join('')}</div>`
        : '<p class="muted" style="font-size:13px;margin:0">Du hast keine eigenen Mannschaften – die Einladung gilt für den Verein allgemein.</p>'}
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Ohne Haken bei den Rechten kann die Person alles nur ansehen. Der QR-Code gilt 7 Tage und nur für eine Person.</p>
      <div id="og-inv-msg"></div>
      <div class="sheet-actions"><button class="btn" type="submit">QR-Code erstellen</button></div>
    </form>`);
  }
  function zeigeWarnung(text, art) {
    const m = document.getElementById('og-inv-msg');
    if (m) m.innerHTML = text ? `<div class="msg ${art || 'warn'}">${H(text)}</div>` : '';
  }
  async function einladungErstellen(form) {
    const name = form.elements.name.value.trim();
    if (!name) { zeigeWarnung('Bitte den Namen der Person eingeben.', 'err'); return; }
    const w = pruefeAuswahl();
    if (w) { zeigeWarnung(w, 'err'); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Einen Moment …';
    const {data, error} = await sb.rpc('orgame_einladung_erstellen', {p_club: me.club_id, p_name: name, p_rechte: [...INV.rechte], p_teams: [...INV.teams]});
    btn.disabled = false; btn.textContent = 'QR-Code erstellen';
    if (error) { zeigeWarnung(errText(error), 'err'); return; }
    zeigeQR(data.code, name, [...INV.rechte], [...INV.teams]);
  }
  function zeigeQR(code, name, rechte, teams) {
    const url = location.origin + location.pathname + '?einladung=' + code;
    const qr = typeof qrSVG === 'function' ? qrSVG(url) : '';
    openSheet(`<div class="sheet-head"><h3>Einladung für ${H(name)}</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
      <div class="qrprint"><h2>${H(db.club)}</h2><p>Mit dem Handy scannen und beitreten</p>
        <div class="qr">${qr}</div>
        <p class="muted" style="margin-bottom:2px">oder in der App „Ich habe einen Einladungscode“ wählen:</p><div class="code-big">${fmtC(code)}</div>
        <div class="og-chips" style="justify-content:center;margin:10px 0">${rechte.length ? rechte.map(r => `<span class="og-chip on">${H(NAME[r])}</span>`).join('') : '<span class="og-chip">Alles ansehen</span>'}${teams.map(t => `<span class="og-chip">${H(team(t).name)}</span>`).join('')}</div>
        <p class="muted" style="font-size:13px">7 Tage gültig · nur für eine Person</p></div>
      <div class="sheet-actions noprint"><button type="button" class="btn ghost" data-og="teilen" data-u="${H(url)}" data-n="${H(name)}">Teilen</button><button type="button" class="btn ghost" data-action="copy" data-t="${H(url)}">Link kopieren</button><button type="button" class="btn" data-action="close">Fertig</button></div>`);
  }
  async function teilen(url, name) {
    const text = 'Hallo ' + name + ', du bist bei OrgaMe für ' + (db.club || 'unseren Verein') + ' eingeladen. Einfach hier tippen: ' + url;
    if (navigator.share) { try { await navigator.share({title: 'OrgaMe – Einladung', text}); } catch (e) {} return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  // Knopf in den Einstellungen (⚙️)
  function einstellungenKnopf() {
    const sh = document.getElementById('sheet');
    if (!sh || !sh.querySelector('.share-btn') || sh.querySelector('.og-inv-btn') || !darf('einladen', null)) return;
    const a = sh.querySelector('#share-box') || sh.querySelector('.share-btn');
    a.insertAdjacentHTML('afterend', '<button type="button" class="btn block og-inv-btn" data-og="einladen" style="margin-top:8px">➕ Mitglied einladen (Rechte vergeben)</button>');
  }
  try { const shEl = document.getElementById('sheet'); if (shEl) new MutationObserver(einstellungenKnopf).observe(shEl, {childList: true}); } catch (e) {}

  /* ---------- Ansicht für Eingeladene ---------- */
  const TABS = [['start', 'Übersicht', ICON.home], ['kalender', 'Kalender', ICON.cal], ['plaetze', 'Plätze', ICON.feld], ['og-heim', 'Sportheim', ICON.haus], ['og-mehr', 'Mehr', ICON.mehr]];
  function tabOf(h) {
    if (h === 'start') return 'start';
    if (h.indexOf('kalender') === 0) return 'kalender';
    if (h.indexOf('anlage') === 0) return 'plaetze';
    return h;
  }
  function tabsHTML(h) {
    const cur = tabOf(h);
    const pl = FACILITIES.some(f => f.group === 'platz') ? 'platz' : 'halle';
    return `<nav class="og-tabs" aria-label="Bereiche">${TABS.map(([k, l, ic]) => `<a href="#${k === 'plaetze' ? 'anlagen-' + pl : k}" class="${cur === k ? 'on' : ''}">${ic}<span>${l}</span></a>`).join('')}</nav>`;
  }
  const icFor = g => g === 'platz' ? ICON.platz : g === 'halle' ? ICON.halle : ICON.heim;
  function facRows(list, max) {
    const t = todayStr(), n = nowHM();
    const ord = {platz: 0, halle: 1, heim: 2};
    const rows = list.map(f => {
      const bs = db.bookings.filter(b => b.date === t && b.facility === f.id).sort((a, b) => a.start.localeCompare(b.start));
      const live = bs.find(b => b.start <= n && n < b.end);
      const offen = bs.filter(b => b.end > n);             // was heute noch kommt (oder gerade läuft)
      const next = live || offen[0] || null;
      return {f, bs: offen, live, next, had: bs.length > 0};
    }).sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || (b.next ? 1 : 0) - (a.next ? 1 : 0) || ord[a.f.group] - ord[b.f.group] || a.f.name.localeCompare(b.f.name));
    const shown = max ? rows.slice(0, max) : rows;
    return shown.map(({f, bs, live, next, had}) => {
      const tn = next ? team(next.team).name : '';
      const sub = next ? `<div>${ICON.ppl} ${live ? 'Aktiv: ' : ''}${H(tn)}${next.title && next.title !== tn ? ' · ' + H(next.title) : ''}</div>` : '';
      const right = next ? `${next.start} – ${next.end}${bs.length > 1 ? `<small>+${bs.length - 1} weitere</small>` : ''}` : `<span class="og-free">frei</span><small>${had ? 'ab jetzt' : 'ganztägig'}</small>`;
      return `<a class="og-row ${live ? 'act' : ''}" href="#anlage-${H(f.id)}"><span class="og-ic">${icFor(f.group)}</span><span class="og-mid"><b>${H(f.name)}</b>${sub}</span><span class="og-rt">${right}</span><span class="og-chev">${ICON.chev}</span></a>`;
    }).join('') + (max && rows.length > max ? `<a class="og-more" href="#anlagen-${FACILITIES.some(f => f.group === 'platz') ? 'platz' : 'halle'}">Alle ${rows.length} Anlagen ansehen ›</a>` : '');
  }
  function belegungKnopf() {
    if (readOnly || !bookableTeams().length) return '<p class="og-note">Du kannst die Belegung ansehen. Eintragen dürfen nur Personen mit Belegungsrecht.</p>';
    const wo = [darfIrgendwo('platz') ? 'Sportplätze' : '', darfIrgendwo('halle') ? 'Sporthallen' : ''].filter(Boolean).join(' und ');
    return `<button type="button" class="og-cta" data-action="new">${ICON.plus}<span>Belegung eintragen<small>für dich: ${H(wo || 'Termine')}</small></span></button>`;
  }
  function uebersichtHTML() {
    const d = new Date();
    const datum = d.toLocaleDateString('de-DE', {weekday: 'short', day: 'numeric', month: 'short'});
    const nNews = typeof activeNews === 'function' ? activeNews().length : 0;
    const name = (me.display_name || '').trim();
    return `${typeof newsBannerHTML === 'function' ? newsBannerHTML() : ''}
    <div class="og-hello">
      <span class="og-av">${H((name || '?').charAt(0).toUpperCase())}</span>
      <span class="og-hello-t"><b>Hallo ${H(name.split(' ')[0] || '')}</b><small>Das ist heute in deinem Verein.</small></span>
      <button type="button" class="og-bell ${nNews ? 'dot' : ''}" data-action="news" aria-label="Breaking News">${ICON.bell}</button>
    </div>
    <div class="og-day"><b>Heute</b><span>${H(datum)}</span></div>
    ${FACILITIES.length ? facRows(FACILITIES, 8) : '<p class="empty">Der Verein hat noch keine Plätze oder Hallen angelegt.</p>'}
    ${belegungKnopf()}`;
  }

  // Sportheim
  const SH = {items: null, club: null, at: 0, loading: false, del: null};
  const canHeim = () => isAdm() || darf('sportheim', null);
  async function ladeHeim(force) {
    if (!me || SH.loading) return;
    if (!force && SH.club === me.club_id && Date.now() - SH.at < 30000) return;
    SH.loading = true;
    try {
      const {data, error} = await sb.from('sportheim_items').select('id,kind,title,price,description').eq('club_id', me.club_id).order('created_at');
      SH.items = error ? [] : (data || []);
    } catch (e) { SH.items = []; }
    SH.loading = false; SH.club = me.club_id; SH.at = Date.now();
    if (page() === 'og-heim') route();
  }
  const euro = p => p == null || p === '' ? '' : Number(p).toLocaleString('de-DE', {style: 'currency', currency: 'EUR'});
  function heimHTML() {
    ladeHeim();
    const heim = FACILITIES.filter(f => f.group === 'heim');
    const items = SH.items || [];
    const liste = kind => {
      const l = items.filter(i => i.kind === kind);
      if (SH.items === null) return '<p class="og-small">Wird geladen …</p>';
      if (!l.length) return `<p class="og-small">${kind === 'speise' ? 'Noch keine Speisekarte.' : 'Gerade keine Aktion.'}</p>`;
      return l.map(i => `<div class="og-item"><span><b>${H(i.title)}</b>${i.description ? `<small>${H(i.description)}</small>` : ''}</span><span class="og-price">${euro(i.price)}</span>${canHeim() ? `<button type="button" class="og-del" data-og="sh-del" data-id="${H(i.id)}" aria-label="Löschen">${SH.del === i.id ? 'Löschen?' : '🗑️'}</button>` : ''}</div>`).join('');
    };
    return `<h2 class="og-h">🍻 Sportheim</h2>
      ${heim.length ? `<div class="og-day"><b>Heute</b><span>${H(new Date().toLocaleDateString('de-DE', {weekday: 'short', day: 'numeric', month: 'short'}))}</span></div>${facRows(heim)}` : ''}
      <div class="og-day"><b>🍽️ Speisekarte</b></div><div class="card">${liste('speise')}</div>
      <div class="og-day"><b>🎉 Aktion</b></div><div class="card">${liste('aktion')}</div>
      ${canHeim() ? `<form id="og-f-sh" class="card og-form-sm">
        <b>Neuer Eintrag</b>
        <div class="og-seg2"><label><input type="radio" name="kind" value="speise" checked> Speisekarte</label><label><input type="radio" name="kind" value="aktion"> Aktion</label></div>
        <label>Name<input name="title" maxlength="80" placeholder="z. B. Currywurst mit Pommes" required></label>
        <label>Preis in € (optional)<input name="price" inputmode="decimal" maxlength="9" placeholder="z. B. 4,50"></label>
        <div id="og-sh-msg"></div>
        <button class="btn block" type="submit">Speichern</button></form>`
        : '<p class="og-note">Speisekarte und Aktionen ändern dürfen der Vorstand und die Sportheim-Verantwortlichen.</p>'}`;
  }
  async function heimSpeichern(f) {
    const el = f.elements, raw = (el.price.value || '').trim().replace(/\s|€/g, '').replace(',', '.');
    const price = raw === '' ? null : Number(raw);
    const m = document.getElementById('og-sh-msg');
    if (price != null && (!isFinite(price) || price < 0)) { m.innerHTML = '<div class="msg warn">Bitte einen gültigen Preis eingeben, z. B. 4,50.</div>'; return; }
    const {error} = await sb.from('sportheim_items').insert({club_id: me.club_id, kind: el.kind.value, title: el.title.value.trim(), price});
    if (error) { m.innerHTML = `<div class="msg err">${H(errText(error))}</div>`; return; }
    toast('Gespeichert'); await ladeHeim(true);
  }
  async function heimLoeschen(id) {
    if (SH.del !== id) { SH.del = id; route(); return; }
    SH.del = null;
    const {error} = await sb.from('sportheim_items').delete().eq('id', id);
    if (error) toast(errText(error)); else toast('Gelöscht');
    await ladeHeim(true);
  }

  // Mehr
  function mehrHTML() {
    const club = OG.rechte.filter(x => !x.t).map(x => x.r);
    const proTeam = {};
    OG.rechte.filter(x => x.t).forEach(x => { (proTeam[x.r] = proTeam[x.r] || []).push(team(x.t).name); });
    const chips = [...RECHTE.filter(r => r[3] === 'team' && proTeam[r[0]]).map(r => `<div class="og-recht"><b>✓ ${r[1]}</b><small>${H(proTeam[r[0]].join(', '))}</small></div>`),
      ...RECHTE.filter(r => r[3] === 'club' && club.includes(r[0])).map(r => `<div class="og-recht"><b>✓ ${r[1]}</b><small>ganzer Verein</small></div>`)].join('');
    const mt = (me.team_ids || []).map(id => team(id)).filter(t => t.name !== 'Unbekannt');
    return `<h2 class="og-h">Mehr</h2>
      <div class="card"><b>Deine Rechte</b>${chips || '<p class="og-small">Du kannst alles ansehen. Eintragen oder ändern ist für dich nicht freigeschaltet.</p>'}
        ${OG.von ? `<p class="og-small">Eingeladen von ${H(OG.von)}</p>` : ''}</div>
      ${mt.length ? `<div class="card"><b>Deine Mannschaften</b><div class="og-chips" style="margin-top:8px">${mt.map(t => `<a class="og-chip" href="#team-${H(t.id)}">${H(t.icon || '')} ${H(t.name)}</a>`).join('')}</div></div>` : ''}
      ${darf('einladen', null) ? '<button type="button" class="btn block" data-og="einladen">➕ Mitglied einladen</button>' : ''}
      <a class="btn ghost block" href="#teams" style="margin-top:8px">👥 Alle Teams</a>
      <button type="button" class="btn ghost block" data-action="settings" style="margin-top:8px">⚙️ Einstellungen</button>`;
  }

  /* ---------- route() erweitern ---------- */
  if (typeof route === 'function') {
    const origRoute = route;
    route = function () {
      if (gated) { document.body.classList.remove('og-inv'); return origRoute.apply(this, arguments); }
      const inv = isInv(), h = page();
      document.body.classList.toggle('og-inv', inv);
      if (inv && (h === 'og-heim' || h === 'og-mehr')) {
        app.innerHTML = (loadState !== 'ok' ? statusHTML() : '') + tabsHTML(h) + (h === 'og-heim' ? heimHTML() : mehrHTML());
        const fab = document.querySelector('.fab'); if (fab) fab.hidden = true;
        return;
      }
      const r = origRoute.apply(this, arguments);
      if (inv) {
        if (h === 'start') app.innerHTML = (loadState !== 'ok' ? statusHTML() : '') + tabsHTML(h) + uebersichtHTML();
        else if (!app.querySelector('.og-tabs')) app.insertAdjacentHTML('afterbegin', tabsHTML(h));
        const fab = document.querySelector('.fab'); if (fab) fab.hidden = true;
      }
      return r;
    };
  }
  if (typeof logout === 'function') {
    const origLogout = logout;
    logout = async function () { LS.del('orgame_eingeladen'); Object.assign(OG, {rechte: [], eingeladen: false, geladen: false}); return origLogout.apply(this, arguments); };
  }

  /* ---------- Klicks, Eingaben, Formulare ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-og]');
    if (!el) return;
    const a = el.dataset.og;
    switch (a) {
      case 'scan': scan(); break;
      case 'scan-stop': stopScan(); break;
      case 'code': zeigeCodeEingabe(''); break;
      case 'willkommen': zeigeWillkommen(); break;
      case 'login': entferneOverlay(); window.__ogWeiter = true; if (typeof showLogin === 'function') showLogin(); break;
      case 'club':
        if (el.dataset.offen === '1' && cfg().openAccess) { window.__ogWeiter = true; entferneOverlay(); enterApp(); }
        else zeigeCodeEingabe(el.dataset.n);
        break;
      case 'abbrechen': LS.del('orgame_einladung'); entferneOverlay(); enterApp(); break;
      case 'einladen': oeffneEinladen(); break;
      case 'recht': {
        if (el.classList.contains('lock')) { toast('Dieses Recht hast du selbst nicht – du kannst es nicht weitergeben.'); break; }
        const k = el.dataset.k;
        if (INV.rechte.has(k)) INV.rechte.delete(k); else INV.rechte.add(k);
        el.classList.toggle('on', INV.rechte.has(k));
        zeigeWarnung(pruefeAuswahl());
        break;
      }
      case 'team': {
        const id = el.dataset.id;
        if (INV.teams.has(id)) INV.teams.delete(id); else INV.teams.add(id);
        el.classList.toggle('on', INV.teams.has(id));
        zeigeWarnung(pruefeAuswahl());
        break;
      }
      case 'teilen': teilen(el.dataset.u, el.dataset.n); break;
      case 'sh-del': heimLoeschen(el.dataset.id); break;
    }
  });
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'og-vq') {
      VQ = e.target.value.trim();
      clearTimeout(vTimer); vTimer = setTimeout(ladeVereine, 250);
    }
  });
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!f || !/^og-f-/.test(f.id || '')) return;
    e.preventDefault(); e.stopPropagation();
    if (f.id === 'og-f-code') pruefeCode(f.elements.code.value);
    else if (f.id === 'og-f-join') beitreten(f);
    else if (f.id === 'og-f-inv') einladungErstellen(f);
    else if (f.id === 'og-f-sh') heimSpeichern(f);
  }, true);

  /* ---------- Aussehen (passt zum Glas-Design der App) ---------- */
  const css = document.createElement('style');
  css.textContent = `
#og-ov{position:fixed;inset:0;z-index:2147482500;overflow:auto;background:#05070c;color:#eef1f6;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-overflow-scrolling:touch}
body.og-ov-open{overflow:hidden}
.og-welcome{min-height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:calc(env(safe-area-inset-top) + 48px) 22px calc(env(safe-area-inset-bottom) + 26px);max-width:520px;margin:0 auto;
 background:linear-gradient(180deg,rgba(5,7,12,.82) 0%,rgba(5,7,12,.35) 30%,rgba(5,7,12,.55) 55%,#05070c 82%),url("img/platz.jpg") center 30%/cover no-repeat}
.og-welcome.og-plain{background:radial-gradient(circle at 15% 10%,rgba(30,144,255,.22),transparent 45%),radial-gradient(circle at 90% 60%,rgba(255,140,40,.12),transparent 45%),#05070c;justify-content:flex-start;gap:16px}
.og-w-top{text-align:center}.og-w-top.small{margin-bottom:4px}
.og-w-logo{width:230px;max-width:72%;display:block;margin:0 auto}
.og-w-top.small .og-w-logo{width:150px}
.og-w-tag{margin:10px 0 0;font-size:17px;color:#e3e8f2;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.og-w-bottom{display:flex;flex-direction:column;gap:10px;margin-top:40px}
.og-cta-big{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;border:0;border-radius:18px;padding:17px;font:inherit;font-size:18px;font-weight:700;color:#fff;cursor:pointer;
 background:linear-gradient(145deg,#2f9bff,#1E78F0);box-shadow:0 0 28px rgba(30,144,255,.45),inset 0 1px 0 rgba(255,255,255,.35)}
.og-cta-big:disabled{opacity:.6}
.og-cta-sec{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:1px solid rgba(255,255,255,.22);border-radius:16px;padding:13px;font:inherit;font-weight:600;color:#eef1f6;background:rgba(255,255,255,.06);cursor:pointer;margin-top:10px}
.og-or{display:flex;align-items:center;gap:14px;color:#9aa3b2;font-size:15px;margin:6px 4px}
.og-or:before,.og-or:after{content:"";flex:1;height:1px;background:rgba(255,255,255,.2)}
.og-search{display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:12px 18px;background:rgba(15,19,28,.78);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#cfd6e2}
.og-search input{flex:1;background:transparent !important;border:0 !important;outline:0;box-shadow:none !important;color:#fff;font:inherit;font-size:16px;padding:0 !important;margin:0;min-width:0}
.og-vlist{display:flex;flex-direction:column;gap:8px}
.og-club{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(17,21,30,.85);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;font:inherit;font-size:16px;font-weight:600;cursor:pointer}
.og-club svg{margin-left:auto;color:#9aa3b2;flex:none}
.og-crest{width:40px;height:44px;flex:none;display:grid;place-items:center;font-weight:800;color:#0b1220;background:#fff;clip-path:path("M20 1 L39 6 L39 22 C39 33 30 40 20 44 C10 40 1 33 1 22 L1 6 Z")}
.og-club-n small{display:block;font-size:12px;font-weight:500;color:#7fb2ff}
.og-link{background:none;border:0;color:#9fc6ff;font:inherit;font-size:14.5px;padding:8px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.og-msg{background:rgba(255,107,107,.13);border:1px solid rgba(255,107,107,.35);color:#ffd0d0;border-radius:14px;padding:11px 13px;font-size:14px;line-height:1.45}
.og-small{font-size:13px;color:#9aa3b2;margin:8px 0 0}
.og-card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);border-radius:22px;padding:18px;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.og-card h2{margin:2px 0 2px;font-size:24px}
.og-sub{margin:0 0 6px;color:#aab3c2;font-size:14.5px;line-height:1.45}
.og-k{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:#7fb2ff;font-weight:700;margin:14px 0 6px}
.og-chips{display:flex;flex-wrap:wrap;gap:7px}
.og-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line,rgba(255,255,255,.16));background:rgba(255,255,255,.06);color:inherit;border-radius:999px;padding:6px 11px;font:inherit;font-size:13px;text-decoration:none}
.og-chip.on{background:color-mix(in srgb,var(--brand,#1E90FF) 26%,transparent);border-color:color-mix(in srgb,var(--brand,#1E90FF) 70%,transparent);color:#fff}
#og-ov .og-chip.on{background:rgba(30,144,255,.22);border-color:rgba(30,144,255,.7)}
button.og-chip.sel{cursor:pointer}
.og-form{display:flex;flex-direction:column;gap:12px}
.og-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#aab3c2}
.og-form input{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:13px 14px;color:#fff;font:inherit;font-size:16px;outline:0}
.og-form input:focus{border-color:#1E90FF}
.og-hint{background:rgba(30,144,255,.12);border:1px solid rgba(30,144,255,.35);border-radius:16px;padding:12px 14px;font-size:13.5px;line-height:1.45}
.og-code{font-family:ui-monospace,Menlo,monospace;font-size:22px;letter-spacing:.1em;text-align:center;margin-top:8px;font-weight:700;color:#7fb2ff}
#og-scan{position:fixed;inset:0;z-index:2147482600;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;color:#fff;text-align:center}
#og-scan video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9}
#og-scan .og-scan-frame{position:relative;width:min(70vw,280px);aspect-ratio:1;border:3px solid #1E90FF;border-radius:24px;box-shadow:0 0 0 2000px rgba(0,0,0,.45)}
#og-scan p,#og-scan button{position:relative;max-width:320px}
/* Einladen-Formular */
.og-lbl{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#9aa3b2);margin:16px 0 8px}
.og-perm{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 12px;margin:0 0 7px;border-radius:14px;border:1px solid var(--line,rgba(255,255,255,.14));background:rgba(255,255,255,.05);color:inherit;font:inherit;cursor:pointer}
.og-perm .og-box{width:22px;height:22px;border-radius:7px;border:2px solid rgba(255,255,255,.35);flex:none;display:grid;place-items:center}
.og-perm.on{border-color:color-mix(in srgb,var(--brand,#1E90FF) 70%,transparent);background:color-mix(in srgb,var(--brand,#1E90FF) 14%,transparent)}
.og-perm.on .og-box{background:var(--brand,#1E90FF);border-color:var(--brand,#1E90FF)}
.og-perm.on .og-box:after{content:"";width:6px;height:11px;border:solid var(--on-brand,#fff);border-width:0 2.5px 2.5px 0;transform:rotate(45deg) translate(-1px,-1px)}
.og-perm.lock{opacity:.45;cursor:not-allowed}
.og-perm-t b{display:block;font-size:15px}.og-perm-t small{display:block;font-size:12px;margin-top:2px}
/* Ansicht für Eingeladene */
body.og-inv .tabbar,body.og-inv .fab{display:none !important}
body.og-inv{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 28px) !important}
body.og-inv .vuno-top .hero{display:none !important}
.og-tabs{display:flex;margin:0 0 14px;border-radius:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);overflow:hidden}
.og-tabs a{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 2px 9px;font-size:11.5px;font-weight:600;color:var(--text,#eef1f6);text-decoration:none;position:relative;opacity:.85}
.og-tabs a.on{color:var(--brand,#1E90FF);opacity:1;background:linear-gradient(180deg,color-mix(in srgb,var(--brand,#1E90FF) 16%,transparent),transparent)}
.og-tabs a.on:after{content:"";position:absolute;bottom:0;left:22%;right:22%;height:3px;border-radius:3px;background:var(--brand,#1E90FF)}
.og-hello{display:flex;align-items:center;gap:14px;padding:14px;border-radius:22px;margin:0 0 6px;background:linear-gradient(145deg,color-mix(in srgb,var(--brand-2,#1a2a4a) 60%,transparent),color-mix(in srgb,var(--brand-2,#1a2a4a) 20%,transparent));border:1px solid rgba(255,255,255,.16)}
.og-av{width:54px;height:54px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:21px;font-weight:800;color:var(--on-brand,#fff);background:var(--brand,#1E90FF);box-shadow:0 0 18px color-mix(in srgb,var(--brand,#1E90FF) 50%,transparent)}
.og-hello-t{flex:1;min-width:0}.og-hello-t b{display:block;font-size:21px}.og-hello-t small{font-size:14px}
.og-bell{position:relative;border:0;background:rgba(255,255,255,.08);color:inherit;width:42px;height:42px;border-radius:14px;display:grid;place-items:center;cursor:pointer;flex:none}
.og-bell.dot:after{content:"";position:absolute;top:8px;right:9px;width:8px;height:8px;border-radius:50%;background:#ff5a5a}
.og-day{display:flex;justify-content:space-between;align-items:baseline;margin:14px 2px 8px}
.og-day b{font-size:18px}.og-day span{color:var(--muted,#9aa3b2);font-size:14px}
.og-row{display:flex;align-items:center;gap:12px;padding:11px 12px 11px 14px;margin:0 0 7px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;text-decoration:none}
.og-row.act{border-color:color-mix(in srgb,var(--brand,#1E90FF) 75%,transparent);background:linear-gradient(90deg,color-mix(in srgb,var(--brand,#1E90FF) 18%,transparent),rgba(255,255,255,.04));box-shadow:0 0 18px color-mix(in srgb,var(--brand,#1E90FF) 25%,transparent)}
.og-ic{flex:none;width:36px;display:grid;place-items:center;opacity:.9}.og-row.act .og-ic{color:var(--brand,#1E90FF);opacity:1}
.og-mid{flex:1;min-width:0}.og-mid b{font-size:15.5px;font-weight:650}
.og-mid div{display:flex;align-items:center;gap:5px;font-size:12.5px;color:var(--muted,#9aa3b2);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.og-rt{text-align:right;font-size:14.5px;font-weight:600;white-space:nowrap}.og-rt small{display:block;font-size:12px;font-weight:400;color:var(--muted,#9aa3b2)}
.og-free{color:#34c77b}
.og-chev{flex:none;opacity:.6;display:grid}
.og-more{display:block;text-align:center;padding:8px;font-size:14px;color:var(--brand,#1E90FF);text-decoration:none}
.og-cta{display:flex;align-items:center;gap:14px;width:100%;margin:14px 0 6px;padding:14px 20px;border:0;border-radius:20px;font:inherit;font-size:17px;font-weight:750;text-align:left;cursor:pointer;color:var(--on-brand,#fff);
 background:linear-gradient(145deg,color-mix(in srgb,var(--brand,#1E90FF) 92%,#fff 8%),var(--brand,#1E90FF));box-shadow:0 0 26px color-mix(in srgb,var(--brand,#1E90FF) 45%,transparent),inset 0 1px 0 rgba(255,255,255,.3)}
.og-cta small{display:block;font-size:13px;font-weight:500;opacity:.85}
.og-note{text-align:center;font-size:13px;color:var(--muted,#9aa3b2);margin:14px 6px}
.og-h{margin:2px 0 6px}
.og-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.og-item:last-child{border-bottom:0}.og-item span:first-child{flex:1;min-width:0}.og-item small{display:block}
.og-price{font-weight:700;white-space:nowrap}
.og-del{border:0;background:rgba(255,255,255,.08);color:inherit;border-radius:10px;padding:6px 9px;font:inherit;font-size:13px;cursor:pointer}
.og-form-sm{display:flex;flex-direction:column;gap:10px}
.og-seg2{display:flex;gap:16px;font-size:14px}.og-seg2 label{display:flex;align-items:center;gap:6px}
.og-recht{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}.og-recht:last-of-type{border-bottom:0}.og-recht small{display:block}
`;
  document.head.appendChild(css);

  window.dispatchEvent(new Event('orgame-bereit'));
})();
