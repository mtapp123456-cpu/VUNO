'use strict';
/* Anmeldung, Einladung per QR-Code, Vereinswechsel und Verwaltung */

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtCode = s => normCode(s).replace(/(.{4})(?=.)/g, '$1-');
const ROLE = {admin: 'Admin', trainer: 'Trainer', member: 'Mitglied'};
const CLUB_ROLE = {spieler: 'Spieler', trainer: 'Trainer', ausschuss: 'Ausschuss', vorstand: 'Vorstand'};
const rightsFor = (admin, clubRole) => admin ? 'admin' : clubRole === 'trainer' ? 'trainer' : 'member';
const joinUrl = code => location.origin + location.pathname + '?join=' + normCode(code);

let otpEmail = '';
let otpPurpose = 'login';
let pendingCode = '';
let joinInfo = null;
const DEFAULT_BRAND = {brand_color: '#166534', header_color: '#14532d'};
let branding = {brand_color: DEFAULT_BRAND.brand_color, header_color: DEFAULT_BRAND.header_color, logo: null};
let brandDraftLogo = null;

function gate(html) {
  gated = true;
  me = null;
  document.body.classList.add('gated');
  app.innerHTML = `<div class="gate"><div class="gate-logo">🏆</div>${html}</div>`;
  window.scrollTo(0, 0);
}
function gateError(id, e) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="msg err">${esc(typeof e === 'string' ? e : friendlyError(e))}</div>`;
}
function otpError(e) {
  const s = String((e && e.message) || '').toLowerCase();
  if ((e && e.status === 429) || s.includes('rate')) return 'Zu viele Versuche. Bitte warte einen Moment und versuche es dann noch einmal.';
  if (s.includes('expired') || s.includes('invalid') || s.includes('token')) return 'Der Code stimmt nicht oder ist abgelaufen.';
  if (s.includes('anonymous')) return 'Die Anmeldung ohne E-Mail ist gerade nicht freigeschaltet. Bitte den E-Mail-Code nutzen.';
  return 'Das hat nicht geklappt. Bitte prüfe die Verbindung und versuche es noch einmal.';
}
function setBusy(form, busy) {
  const b = form.querySelector('button[type=submit]');
  if (b) { b.disabled = busy; if (busy) { b.dataset.t = b.textContent; b.textContent = 'Einen Moment …'; } else if (b.dataset.t) b.textContent = b.dataset.t; }
}

/* ---------- Bildschirme vor dem Einstieg ---------- */
function showLogin() {
  const start = store.get('pendingStart');
  gate(`<h2>${start ? 'Verein einrichten' : 'Willkommen'}</h2>
    <p class="muted">${start ? 'Gib deine E-Mail-Adresse ein. Wir schicken dir einen Code.' : 'Gib deinen Einladungscode oder deine E-Mail-Adresse ein. Ein Passwort brauchst du nicht.'}</p>
    <form id="f-start" class="stack"><label>${start ? 'E-Mail-Adresse' : 'Einladungscode oder E-Mail-Adresse'}<input name="login" autocomplete="email" autocapitalize="off" spellcheck="false" required></label>
      <button class="btn block" type="submit">Weiter</button></form>
    <div id="g-msg"></div>
    ${!start && window.APP_CONFIG.testLogin ? '<div class="btnrow"><button class="btn ghost block" data-action="pw-login">🔑 Testzugang mit Passwort</button></div>' : ''}
    ${legalLinks()}`);
}
// Testphase: Anmeldung mit E-Mail und Passwort, falls die Code-Mail nicht ankommt. Abschalten in config.js (testLogin: false).
function showPasswordLogin() {
  gate(`<h2>Testzugang</h2>
    <p class="muted">Anmeldung mit E-Mail-Adresse und Passwort. Das Passwort legt der Betreiber in Supabase fest.</p>
    <form id="f-pw" class="stack"><label>E-Mail-Adresse<input name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
      <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn block" type="submit">Anmelden</button></form>
    <div id="g-msg"></div>
    <div class="btnrow"><button class="btn ghost" data-action="back-login">Zurück</button></div>`);
}
function showOtp() {
  gate(`<h2>Code eingeben</h2>
    <p class="muted">Wir haben einen Code an <b>${esc(otpEmail)}</b> geschickt. Schau auch im Spam-Ordner nach.</p>
    <form id="f-otp" class="stack"><label>Code<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required></label>
      <button class="btn block" type="submit">Anmelden</button></form>
    <div id="g-msg"></div>
    <div class="btnrow"><button class="btn ghost" data-action="back-login">Andere Adresse</button><button class="btn ghost" data-action="resend">Code neu senden</button></div>`);
}
async function showJoin(code) {
  pendingCode = normCode(code);
  store.set('pendingJoin', pendingCode);
  gate('<p class="muted">Einladung wird geprüft …</p>');
  const {data, error} = await sb.rpc('invite_info', {p_code: pendingCode});
  const info = data && data[0];
  if (error || !info) {
    store.del('pendingJoin'); pendingCode = '';
    gate(`<h2>Einladung nicht gültig</h2><p class="muted">Dieser Code stimmt nicht, ist abgelaufen oder wurde zurückgezogen. Bitte frage im Verein nach einem neuen.</p>
      <button class="btn block" data-action="restart">Zurück</button>`);
    return;
  }
  joinInfo = info;
  const {data: {session}} = await sb.auth.getSession();
  const needsEmail = info.role === 'admin' && (!session || session.user.is_anonymous);
  if (needsEmail) {
    gate(`<h2>${esc(info.club_name)}</h2><p class="muted">Du wurdest als Admin eingeladen. Dafür brauchen wir einmal deine E-Mail-Adresse.</p>
      <form id="f-email" class="stack"><label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" inputmode="email" required></label>
      <button class="btn block" type="submit">Code senden</button></form><div id="g-msg"></div>${legalLinks()}`);
    return;
  }
  const iosHint = isIOS() && !isStandalone() && !session;
  const deps = [...new Set(info.teams.map(t => t.department).filter(Boolean))];
  gate(`<h2>${esc(info.club_name)}</h2>
    <p class="muted">${info.role === 'admin' ? 'Admin-Einladung. ' : ''}Ein Admin des Vereins bestätigt deine Angaben.</p>
    ${iosHint ? `<div class="notice info"><b>Am iPhone zuerst installieren:</b><br>Tippe unten auf „Teilen“ und dann auf „Zum Home-Bildschirm“. Öffne die App dort und gib diesen Code ein:<div class="code-big">${fmtCode(pendingCode)}</div></div>` : ''}
    <form id="f-join" class="stack">
      <label>Dein Name<input name="name" autocomplete="name" maxlength="60" required></label>
      <label>Ich bin<select name="clubrole">${Object.keys(CLUB_ROLE).map(r => `<option value="${r}">${CLUB_ROLE[r]}</option>`).join('')}</select></label>
      ${deps.length ? `<label>Abteilung<select name="department"><option value="">– keine –</option>${deps.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></label>` : ''}
      <label>Mannschaft<select name="team">${joinTeamOptions('')}</select></label>
      <button class="btn block" type="submit">Beitreten</button>
    </form>
    <div id="g-msg"></div>
    ${legalLinks()}`);
}
function joinTeamOptions(dep) {
  const list = joinInfo.teams.filter(t => !dep || t.department === dep);
  return `<option value="">– keine –</option>` + list.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}
function showNoClub() {
  gate(`<h2>Noch kein Verein</h2>
    <p class="muted">Scanne den QR-Code deines Vereins oder gib den Einladungscode ein.</p>
    <form id="f-code" class="stack"><label>Einladungscode<input name="code" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" autocomplete="off" required></label>
      <button class="btn block" type="submit">Weiter</button></form>
    <div id="g-msg"></div>
    <div class="btnrow"><button class="btn ghost" data-action="logout">Abmelden</button></div>`);
}
function showCreateClub() {
  gate(`<h2>Verein anlegen</h2>
    <form id="f-club" class="stack">
      <label>Vereinsname<input name="club" maxlength="50" required></label>
      <label>Dein Name<input name="name" maxlength="60" autocomplete="name" required></label>
      <label class="check"><input type="checkbox" name="examples"> Mit Beispiel-Teams und -Anlagen starten</label>
      <button class="btn block" type="submit">Verein anlegen</button></form>
    <div id="g-msg"></div>
    <div class="btnrow"><button class="btn ghost" data-action="start-cancel">Abbrechen</button></div>`);
}
function showWaiting(c) {
  gate(`<h2>Fast geschafft</h2>
    <p>Ein Admin von <b>${esc(c.club_name)}</b> muss dich noch bestätigen. Danach siehst du hier die Termine.</p>
    <div class="btnrow"><button class="btn block" data-action="restart">Erneut prüfen</button></div>
    <div class="btnrow"><button class="btn ghost" data-action="logout">Abmelden</button></div>`);
}
function legalLinks() {
  const c = window.APP_CONFIG || {};
  const l = [c.imprintUrl && `<a href="${esc(c.imprintUrl)}" target="_blank" rel="noopener">Impressum</a>`,
             c.privacyUrl && `<a href="${esc(c.privacyUrl)}" target="_blank" rel="noopener">Datenschutz</a>`].filter(Boolean);
  return l.length ? `<p class="legal">${l.join(' · ')}</p>` : '';
}

/* ---------- Ablauf ---------- */
async function enterApp() {
  const code = pendingCode || store.get('pendingJoin');
  if (code) { await showJoin(code); return; }
  const {data: {session}} = await sb.auth.getSession();
  if (!session) { showLogin(); return; }
  if (store.get('pendingStart') && !session.user.is_anonymous) { showCreateClub(); return; }
  const {data, error} = await sb.rpc('my_clubs');
  if (error) {
    gate(`<h2>Keine Verbindung</h2><p class="muted">Die Daten konnten nicht geladen werden.</p><button class="btn block" data-action="restart">Noch einmal versuchen</button>
      <div class="btnrow"><button class="btn ghost" data-action="logout">Abmelden</button></div>`);
    return;
  }
  myClubs = data;
  if (!myClubs.length) { showNoClub(); return; }
  const wanted = store.get('clubId');
  const active = myClubs.filter(c => c.status === 'active');
  const cur = active.find(c => c.club_id === wanted) || active[0];
  if (!cur) { showWaiting(myClubs[0]); return; }
  await openClub(cur);
}
async function openClub(c) {
  store.set('clubId', c.club_id);
  const {data, error} = await sb.rpc('club_data', {p_club: c.club_id});
  if (error) { myClubs = []; gate(`<h2>Kein Zugriff</h2><div class="btnrow"><button class="btn block" data-action="restart">Erneut versuchen</button></div>`); return; }
  me = c;
  TEAMS = data.teams.map(t => Object.assign(t, {sport: t.sport || ''}));
  FACILITIES = data.facilities.map(f => Object.assign(f, {parts: f.parts || [], units: f.units || []}));
  db = {club: data.name, bookings: []};
  setBranding(data);
  readOnly = !bookableTeams().length && me.role !== 'admin';
  gated = false;
  document.body.classList.remove('gated');
  loadState = 'loading';
  lowDate = addDays(todayStr(), -62);
  route();
  await reloadBookings();
  subscribeLive();
  if (me.role === 'admin') loadAdmin();
}
async function reloadClubData() {
  const {data, error} = await sb.rpc('club_data', {p_club: me.club_id});
  if (error) return;
  TEAMS = data.teams;
  FACILITIES = data.facilities.map(f => Object.assign(f, {parts: f.parts || [], units: f.units || []}));
  db.club = data.name;
  setBranding(data);
}
async function logout() {
  if (channel) { sb.removeChannel(channel); channel = null; }
  await sb.auth.signOut();
  setBranding({});
  store.del('clubId'); store.del('pendingJoin'); store.del('pinHash'); store.del('pinSalt'); pendingCode = '';
  closeSheet();
  showLogin();
}

/* ---------- Formulare ---------- */
async function accountSubmit(form) {
  const v = n => (form.elements[n] ? form.elements[n].value.trim() : '');
  setBusy(form, true);
  try {
    switch (form.id) {
      case 'f-start': {
        const val = v('login');
        if (!val.includes('@')) { await showJoin(val); return; }
        otpEmail = val; otpPurpose = 'login';
        const {error} = await sb.auth.signInWithOtp({email: otpEmail, options: {shouldCreateUser: true}});
        if (error) { gateError('g-msg', otpError(error)); break; }
        showOtp(); return;
      }
      case 'f-email': {
        otpEmail = v('email'); otpPurpose = 'login';
        const {error} = await sb.auth.signInWithOtp({email: otpEmail, options: {shouldCreateUser: true}});
        if (error) { gateError('g-msg', otpError(error)); break; }
        showOtp(); return;
      }
      case 'f-otp': {
        const {error} = await sb.auth.verifyOtp({email: otpEmail, token: v('otp'), type: otpPurpose === 'add' ? 'email_change' : 'email'});
        if (error) { gateError('g-msg', otpError(error)); break; }
        if (otpPurpose === 'add') { closeSheet(); toast('E-Mail-Adresse gespeichert'); return; }
        await enterApp(); return;
      }
      case 'f-code': await showJoin(v('code')); return;
      case 'f-pw': {
        if (!window.APP_CONFIG.testLogin) return;
        const {error} = await sb.auth.signInWithPassword({email: v('email'), password: form.elements.password.value});
        if (error) { gateError('g-msg', (error.status === 429 || /rate/i.test(error.message || '')) ? otpError(error) : 'E-Mail-Adresse oder Passwort stimmt nicht.'); break; }
        await enterApp(); return;
      }
      case 'f-join': {
        const {data: {session}} = await sb.auth.getSession();
        if (!session) {
          const {error} = await sb.auth.signInAnonymously();
          if (error) { gateError('g-msg', otpError({message: 'anonymous'})); break; }
        }
        const {error} = await sb.rpc('join_club', {p_code: pendingCode, p_display_name: v('name'), p_club_role: form.elements.clubrole.value,
          p_department: form.elements.department ? form.elements.department.value : '', p_team: form.elements.team.value || null});
        if (error) { gateError('g-msg', error); break; }
        store.del('pendingJoin'); pendingCode = '';
        await enterApp(); return;
      }
      case 'f-club': {
        const {data, error} = await sb.rpc('create_club', {p_signup_code: store.get('pendingStart'), p_club_name: v('club'), p_display_name: v('name'), p_with_examples: form.elements.examples.checked});
        if (error) { gateError('g-msg', error); break; }
        store.del('pendingStart');
        store.set('clubId', data);
        await enterApp(); return;
      }
      case 'f-addmail': {
        otpEmail = v('email'); otpPurpose = 'add';
        const {error} = await sb.auth.updateUser({email: otpEmail});
        if (error) { gateError('s-msg', otpError(error)); break; }
        form.outerHTML = `<p class="muted" style="font-size:13px">Code wurde an ${esc(otpEmail)} geschickt.</p>
          <form id="f-otp" class="stack"><label>Code<input name="otp" inputmode="numeric" autocomplete="one-time-code" required></label><button class="btn" type="submit">Bestätigen</button></form><div id="g-msg"></div>`;
        return;
      }
      case 'f-rename': {
        const {error} = await sb.rpc('rename_club', {p_club: me.club_id, p_name: v('name')});
        if (error) { gateError('s-msg', error); break; }
        db.club = v('name'); route(); closeSheet(); toast('Name gespeichert'); return;
      }
      case 'f-brand': await saveBranding(form); return;
      case 'f-unlock': await tryUnlock(form); return;
      case 'f-pin': await savePin(form); return;
      case 'f-invite': await saveInvite(form); return;
      case 'f-team': await saveTeam(form); return;
      case 'f-facility': await saveFacility(form); return;
      case 'f-member': await saveMember(form); return;
    }
  } finally {
    if (document.body.contains(form)) setBusy(form, false);
  }
}

/* ---------- Einstellungen ---------- */
async function openSettings() {
  brandDraftLogo = branding.logo;
  const {data: {user}} = await sb.auth.getUser();
  const anon = !user || user.is_anonymous;
  const others = myClubs.filter(c => c.club_id !== me.club_id && c.status === 'active');
  openSheet(`<div class="sheet-head"><h3>⚙️ Einstellungen</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    <p class="muted" style="margin:0 0 10px;font-size:13px">${esc(me.display_name)} · ${esc(ROLE[me.role])}</p>
    ${me.role === 'admin' ? `<a class="btn block" href="#verwaltung" data-action="close">👥 Verwaltung: Mitglieder, QR-Codes, Teams, Anlagen</a>
      <form id="f-rename" class="stack"><label>Vereinsname<input name="name" value="${esc(db.club)}" maxlength="50" required></label><button class="btn ghost" type="submit">Namen speichern</button></form>
      <h4 class="s-h">Aussehen des Vereins</h4>
      <form id="f-brand" class="stack">
        <div class="logo-row"><div class="logo-preview" id="logoPreview">${branding.logo ? `<img src="${esc(branding.logo)}" alt="Vereinslogo">` : '🏆'}</div>
          <div><label class="btn ghost file-btn">Logo auswählen<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>
          <button type="button" class="btn ghost" data-action="logo-remove">Logo entfernen</button></div></div>
        <div class="row2"><label>Hauptfarbe<input type="color" name="brand" value="${esc(branding.brand_color)}"></label>
          <label>Kopfzeile<input type="color" name="header" value="${esc(branding.header_color)}"></label></div>
        <div class="btnrow"><button class="btn" type="submit">Aussehen speichern</button><button type="button" class="btn ghost" data-action="brand-reset">Standardfarben</button></div>
      </form>` : ''}
    ${others.length ? `<h4 class="s-h">Verein wechseln</h4>${others.map(c => `<button class="btn ghost block" style="margin-bottom:6px" data-action="switch" data-id="${c.club_id}">${esc(c.club_name)}</button>`).join('')}` : ''}
    <h4 class="s-h">Mein Zugang</h4>
    ${anon ? `<p class="muted" style="font-size:13px">Du bist nur auf diesem Gerät angemeldet. Mit einer E-Mail-Adresse kommst du auch nach einem Handywechsel wieder hinein.</p>
      <form id="f-addmail" class="stack"><label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" required></label><button class="btn ghost" type="submit">Adresse hinterlegen</button></form>`
      : `<p class="muted" style="font-size:13px">Angemeldet als ${esc(user.email)}</p>`}
    <h4 class="s-h">App-Sperre</h4>
    ${store.get('pinHash') ? `<p class="muted" style="font-size:13px">Die PIN ist aktiv.</p><button class="btn ghost" data-action="pin-off">PIN entfernen</button>`
      : `<form id="f-pin" class="stack"><label>PIN festlegen (optional, 4 bis 8 Ziffern)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="new-password" required></label><button class="btn ghost" type="submit">PIN aktivieren</button></form>`}
    <div id="s-msg"></div>
    <div class="sheet-actions">
      <button class="btn ghost" data-action="join-other">Weiterem Verein beitreten</button>
      <button class="btn ghost" data-action="logout-ask">Abmelden</button>
      <button class="btn ghost" data-action="delete-ask">Konto löschen</button>
    </div>
    <div id="s-confirm"></div>
    ${legalLinks()}`);
}
function askConfirm(html) { document.getElementById('s-confirm').innerHTML = `<div class="msg warn">${html}</div>`; }

/* ---------- Verwaltung ---------- */
const adm = {tab: 'mitglieder', members: null, invites: null, error: ''};
async function loadAdmin() {
  adm.error = '';
  const [m, i] = await Promise.all([
    sb.rpc('club_members', {p_club: me.club_id}),
    sb.from('invites').select('*').eq('club_id', me.club_id).order('created_at', {ascending: false})
  ]);
  if (m.error || i.error) adm.error = friendlyError(m.error || i.error);
  adm.members = m.data || [];
  adm.invites = i.data || [];
  if (!gated) route();
}
function viewAdmin(arg) {
  if (!me || me.role !== 'admin') return '<p class="empty">Nur für Admins.</p>';
  if (arg) adm.tab = arg;
  if (adm.members === null) { adm.members = []; adm.invites = []; loadAdmin(); }
  const pend = adm.members.filter(m => m.status === 'pending').length;
  const tabs = [['mitglieder', `Mitglieder${pend ? ' (' + pend + ')' : ''}`], ['einladungen', 'QR-Codes'], ['teams', 'Teams'], ['anlagen', 'Anlagen']];
  const body = {mitglieder: adminMembers, einladungen: adminInvites, teams: adminTeams, anlagen: adminFacilities}[adm.tab] || adminMembers;
  return `<h2>👥 Verwaltung</h2>
    <div class="seg">${tabs.map(([k, l]) => `<button class="${adm.tab === k ? 'on' : ''}" data-action="adm-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${adm.error ? `<div class="notice">${esc(adm.error)}</div>` : ''}${body()}`;
}
function teamNames(ids) { return (ids || []).map(id => { const t = TEAMS.find(x => x.id === id); return t ? t.name : null; }).filter(Boolean).join(', '); }
function adminMembers() {
  if (!adm.members.length) return '<p class="empty">Wird geladen …</p>';
  const admins = adm.members.filter(m => m.role === 'admin' && m.status === 'active').length;
  return `<p class="muted" style="font-size:13px;margin:0 0 8px">${admins} von 10 Admins</p>` + adm.members.map(m => `<div class="row-card">
    <div class="row-main"><b>${esc(m.display_name)}</b>${m.role === 'admin' ? ' <span class="badge">Admin</span>' : ''}${m.status === 'pending' ? ' <span class="badge warn">wartet</span>' : ''}
      <small>${esc(CLUB_ROLE[m.club_role] || '')}${m.department ? ' · ' + esc(m.department) : ''}${m.team_ids.length ? ' · ' + esc(teamNames(m.team_ids)) : ''}${m.email ? ' · ' + esc(m.email) : ' · ohne E-Mail'}</small></div>
    ${m.status === 'pending' ? `<button class="btn" data-action="mem-approve" data-id="${m.user_id}">Bestätigen</button><button class="btn ghost" data-action="mem-edit" data-id="${m.user_id}">Ändern</button><button class="btn ghost" data-action="mem-remove" data-id="${m.user_id}">Ablehnen</button>`
      : `<button class="btn ghost" data-action="mem-edit" data-id="${m.user_id}">Bearbeiten</button>`}
  </div>`).join('');
}
function openMember(id) {
  const m = adm.members.find(x => x.user_id === id);
  if (!m) return;
  openSheet(`<form id="f-member" data-id="${id}" data-status="${m.status}">
    <div class="sheet-head"><h3>${esc(m.display_name)}</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    <p class="muted" style="margin:0;font-size:13px">${esc(m.email || 'Keine E-Mail hinterlegt: kann nicht Admin werden')}</p>
    <label>Rolle<select name="clubrole">${Object.keys(CLUB_ROLE).map(r => `<option value="${r}" ${r === m.club_role ? 'selected' : ''}>${CLUB_ROLE[r]}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" name="admin" ${m.role === 'admin' ? 'checked' : ''}> Admin (darf alles, höchstens zehn)</label>
    <p class="muted" style="font-size:13px;margin:12px 0 0">Mannschaften. Trainer dürfen für diese buchen:</p>
    ${TEAMS.map(t => `<label class="check"><input type="checkbox" name="team" value="${t.id}" ${m.team_ids.includes(t.id) ? 'checked' : ''}> ${t.icon} ${esc(t.name)}</label>`).join('')}
    <div id="s-msg"></div>
    <div class="sheet-actions"><button type="button" class="btn danger" data-action="mem-remove" data-id="${id}">Entfernen</button><button class="btn" type="submit">${m.status === 'pending' ? 'Bestätigen' : 'Speichern'}</button></div>
  </form>`);
}
async function saveMember(form) {
  const ids = [...form.querySelectorAll('[name=team]:checked')].map(x => x.value);
  const clubRole = form.elements.clubrole.value;
  const {error} = await sb.rpc('update_member', {p_club: me.club_id, p_user: form.dataset.id, p_role: rightsFor(form.elements.admin.checked, clubRole), p_status: 'active', p_team_ids: ids, p_club_role: clubRole});
  if (error) { gateError('s-msg', error); return; }
  closeSheet(); toast('Gespeichert'); await loadAdmin();
}
function inviteState(i) {
  if (new Date(i.expires_at) <= new Date()) return 'abgelaufen';
  if (i.max_uses && i.uses >= i.max_uses) return 'verbraucht';
  return 'gültig bis ' + new Date(i.expires_at).toLocaleDateString('de-DE');
}
function adminInvites() {
  return `<div class="btnrow" style="margin:0 0 12px"><button class="btn" data-action="inv-new">+ Neuer QR-Code</button></div>
    ${adm.invites.length ? adm.invites.map(i => `<div class="row-card">
      <div class="row-main"><b>${esc(i.label || 'Einladung')}</b>
        <small>${i.role === 'admin' ? 'Für Admins' : 'Für Mitglieder'} · ${i.revoked_at ? 'zurückgezogen' : esc(inviteState(i))} · ${i.uses}× genutzt</small></div>
      <button class="btn ghost" data-action="inv-show" data-id="${i.id}">QR</button>
      <button class="btn ghost" data-action="inv-del" data-id="${i.id}" aria-label="Zurückziehen">✕</button></div>`).join('')
      : '<p class="empty">Noch keine Einladungen. Lege einen QR-Code für den Aushang oder die Team-Gruppe an.</p>'}`;
}
function openInviteForm() {
  openSheet(`<form id="f-invite">
    <div class="sheet-head"><h3>Neuer QR-Code</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    <label>Bezeichnung<input name="label" maxlength="50" placeholder="z. B. Aushang Sportheim" required></label>
    <label>Für wen<select name="kind">
      <option value="member">Mitglieder</option>
      <option value="admin">Admins (höchstens zehn)</option>
    </select></label>
    <label>Gültig für<select name="days"><option value="7">7 Tage</option><option value="30" selected>30 Tage</option><option value="90">90 Tage</option><option value="365">1 Jahr</option></select></label>
    <p class="muted" style="font-size:13px;margin:10px 0 0">Jeder Beitritt muss von einem Admin bestätigt werden.</p>
    <div id="s-msg"></div>
    <div class="sheet-actions"><button class="btn" type="submit">Erstellen</button></div></form>`);
}
async function saveInvite(form) {
  const el = form.elements;
  const {data, error} = await sb.rpc('create_invite', {p_club: me.club_id, p_label: el.label.value.trim(), p_role: el.kind.value, p_team: null,
    p_single_use: false, p_requires_approval: true, p_days: Number(el.days.value)});
  if (error) { gateError('s-msg', error); return; }
  await loadAdmin();
  showQR(data);
}
function qrSVG(text) {
  const q = new QRCode(-1, QRErrorCorrectLevel.M);
  q.addData(text); q.make();
  const n = q.getModuleCount(), b = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + b} ${r + b}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * b} ${n + 2 * b}" role="img" aria-label="QR-Code zur Einladung" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
function showQR(i) {
  const url = joinUrl(i.code);
  openSheet(`<div class="sheet-head"><h3>${esc(i.label || 'Einladung')}</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    <div class="qrprint"><h2>${esc(db.club)}</h2><p>Mit dem Handy scannen und beitreten</p>
      <div class="qr">${qrSVG(url)}</div>
      <p class="muted" style="margin-bottom:2px">oder diesen Code in der App eingeben:</p><div class="code-big">${fmtCode(i.code)}</div>
      <p class="muted" style="font-size:13px">${esc(inviteState(i))}</p></div>
    <div class="sheet-actions noprint"><button class="btn ghost" data-action="copy" data-t="${esc(url)}">Link kopieren</button><button class="btn" data-action="print">Drucken</button></div>`);
}
function adminTeams() {
  return `<div class="btnrow" style="margin:0 0 12px"><button class="btn" data-action="team-new">+ Neues Team</button></div>
    ${TEAMS.length ? TEAMS.map(t => `<div class="row-card" style="border-left:4px solid ${t.color}"><div class="row-main"><b>${t.icon} ${esc(t.name)}</b><small>${esc(t.department || '')}${t.department && t.sport ? ' · ' : ''}${esc(t.sport)}</small></div>
      <button class="btn ghost" data-action="team-edit" data-id="${t.id}">Bearbeiten</button></div>`).join('') : '<p class="empty">Noch keine Teams.</p>'}`;
}
function openTeam(id) {
  const t = TEAMS.find(x => x.id === id) || {icon: '⚽', color: '#16a34a', name: '', sport: '', department: ''};
  openSheet(`<form id="f-team" data-id="${id || ''}">
    <div class="sheet-head"><h3>${id ? 'Team bearbeiten' : 'Neues Team'}</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    <label>Name<input name="name" value="${esc(t.name)}" maxlength="50" required></label>
    <label>Abteilung<input name="department" value="${esc(t.department || '')}" maxlength="40" placeholder="z. B. Fußball"></label>
    <label>Beschreibung<input name="sport" value="${esc(t.sport)}" maxlength="60" placeholder="z. B. Herren"></label>
    <div class="row2"><label>Symbol<input name="icon" value="${esc(t.icon)}" maxlength="4" required></label>
      <label>Farbe<input name="color" type="color" value="${esc(t.color)}"></label></div>
    <div id="s-msg"></div>
    <div class="sheet-actions">${id ? `<button type="button" class="btn danger" data-action="team-del" data-id="${id}">Löschen</button>` : ''}<button class="btn" type="submit">Speichern</button></div></form>`);
}
async function saveTeam(form) {
  const el = form.elements, id = form.dataset.id;
  const row = {name: el.name.value.trim(), department: el.department.value.trim(), sport: el.sport.value.trim(), icon: el.icon.value.trim(), color: el.color.value};
  const res = id ? await sb.from('teams').update(row).eq('id', id)
    : await sb.from('teams').insert(Object.assign({club_id: me.club_id, sort: TEAMS.length + 1}, row));
  if (res.error) { gateError('s-msg', res.error); return; }
  await afterMasterChange('Team gespeichert');
}
async function afterMasterChange(msg) {
  await reloadClubData();
  readOnly = false;
  closeSheet(); toast(msg); route();
}
function adminFacilities() {
  return `<div class="btnrow" style="margin:0 0 12px"><button class="btn" data-action="fac-new">+ Neue Anlage</button></div>
    ${FACILITIES.length ? FACILITIES.map(f => `<div class="row-card"><div class="row-main"><b>${f.icon} ${esc(f.name)}</b><small>${esc(GROUPS[f.group])} · ${f.units.map(u => esc(u.name)).join(', ')}</small></div>
      <button class="btn ghost" data-action="fac-edit" data-id="${f.id}">Bearbeiten</button></div>`).join('') : '<p class="empty">Noch keine Anlagen.</p>'}`;
}
function openFacility(id) {
  const f = FACILITIES.find(x => x.id === id);
  const n = f ? f.parts.length : 0;
  const partName = pid => f.parts.find(p => p.id === pid).name;
  const whole = f && n > 1 && f.units.find(u => u.parts.length === n);
  const combos = f ? f.units.filter(u => u.parts.length > 1 && u !== whole).map(u => u.name + ': ' + u.parts.map(partName).join(', ')).join('\n') : '';
  openSheet(`<form id="f-facility" data-id="${id || ''}">
    <div class="sheet-head"><h3>${id ? 'Anlage bearbeiten' : 'Neue Anlage'}</h3><button type="button" class="x" data-action="close" aria-label="Schließen">✕</button></div>
    <label>Name<input name="name" value="${esc(f ? f.name : '')}" maxlength="50" placeholder="z. B. Sportplatz 1" required></label>
    <div class="row2"><label>Art<select name="grp">${Object.keys(GROUPS).map(k => `<option value="${k}" ${f && f.group === k ? 'selected' : ''}>${GROUPS[k]}</option>`).join('')}</select></label>
      <label>Symbol<input name="icon" value="${esc(f ? f.icon : '🏟️')}" maxlength="4" required></label></div>
    <label>Beschreibung<input name="desc" value="${esc(f ? f.desc : '')}" maxlength="80"></label>
    <label>Teilflächen (eine pro Zeile)<textarea name="parts" rows="4" placeholder="Hälfte A&#10;Hälfte B" required>${esc(f ? f.parts.map(p => p.name).join('\n') : '')}</textarea></label>
    <label>Name für die ganze Anlage<input name="whole" value="${esc(whole ? whole.name : 'Ganze Anlage')}" maxlength="40"></label>
    <label>Weitere Kombinationen (optional, eine pro Zeile)<textarea name="combos" rows="2" placeholder="Hälfte Nord: Viertel 1, Viertel 2">${esc(combos)}</textarea></label>
    <div id="s-msg"></div>
    <div class="sheet-actions">${id ? `<button type="button" class="btn danger" data-action="fac-del" data-id="${id}">Löschen</button>` : ''}<button class="btn" type="submit">Speichern</button></div></form>`);
}
async function saveFacility(form) {
  const el = form.elements;
  const lines = s => s.split('\n').map(x => x.trim()).filter(Boolean);
  const parts = lines(el.parts.value);
  const combos = [];
  for (const l of lines(el.combos.value)) {
    const i = l.indexOf(':');
    const names = i < 0 ? [] : l.slice(i + 1).split(',').map(x => x.trim()).filter(Boolean);
    if (i < 1 || !names.length) { gateError('s-msg', `Bitte so schreiben: „Name: Fläche 1, Fläche 2“. Fehler in: ${l}`); return; }
    if (names.some(x => !parts.includes(x))) { gateError('s-msg', `Unbekannte Teilfläche in: ${l}`); return; }
    combos.push({name: l.slice(0, i).trim(), parts: names});
  }
  const {error} = await sb.rpc('save_facility', {p_club: me.club_id, p_id: form.dataset.id || null, p_name: el.name.value.trim(), p_grp: el.grp.value,
    p_icon: el.icon.value.trim(), p_descr: el.desc.value.trim(), p_parts: parts, p_whole: el.whole.value.trim(), p_combos: combos});
  if (error) { gateError('s-msg', error); return; }
  await afterMasterChange('Anlage gespeichert');
}

/* ---------- Klicks ---------- */
async function accountAction(a, el, e) {
  switch (a) {
    case 'settings': openSettings(); break;
    case 'restart': pendingCode = ''; await enterApp(); break;
    case 'back-login': showLogin(); break;
    case 'pw-login': showPasswordLogin(); break;
    case 'resend': {
      const {error} = await sb.auth.signInWithOtp({email: otpEmail, options: {shouldCreateUser: true}});
      if (error) gateError('g-msg', otpError(error)); else toast('Code wurde neu gesendet');
      break;
    }
    case 'logout': logout(); break;
    case 'logo-remove': brandDraftLogo = null; document.getElementById('logoPreview').textContent = '🏆'; break;
    case 'brand-reset': {
      const f = document.getElementById('f-brand');
      f.elements.brand.value = DEFAULT_BRAND.brand_color; f.elements.header.value = DEFAULT_BRAND.header_color;
      applyColors(DEFAULT_BRAND.brand_color, DEFAULT_BRAND.header_color);
      break;
    }
    case 'start-cancel': store.del('pendingStart'); await enterApp(); break;
    case 'pin-off': store.del('pinHash'); store.del('pinSalt'); closeSheet(); toast('PIN entfernt'); break;
    case 'pin-forgot': hideLock(); logout(); break;
    case 'logout-ask': {
      const {data: {user}} = await sb.auth.getUser();
      if (user && user.is_anonymous) askConfirm(`<b>Achtung:</b> Ohne hinterlegte E-Mail-Adresse kommst du danach nicht mehr in dieses Konto und musst neu beitreten.<div class="btnrow"><button class="btn danger" data-action="logout">Trotzdem abmelden</button></div>`);
      else logout();
      break;
    }
    case 'delete-ask': askConfirm(`<b>Konto endgültig löschen?</b> Deine Mitgliedschaften werden entfernt. Termine bleiben im Verein bestehen.<div class="btnrow"><button class="btn danger" data-action="delete-do">Ja, löschen</button></div>`); break;
    case 'delete-do': {
      const {error} = await sb.rpc('delete_my_account');
      if (error) { gateError('s-msg', error); break; }
      logout(); break;
    }
    case 'switch': {
      const c = myClubs.find(x => x.club_id === el.dataset.id);
      if (c) { closeSheet(); adm.members = null; location.hash = '#start'; await openClub(c); }
      break;
    }
    case 'join-other': closeSheet(); gate(`<h2>Weiterem Verein beitreten</h2><form id="f-code" class="stack"><label>Einladungscode<input name="code" autocapitalize="characters" autocomplete="off" required></label><button class="btn block" type="submit">Weiter</button></form><div class="btnrow"><button class="btn ghost" data-action="restart">Abbrechen</button></div>`); break;
    case 'adm-tab': adm.tab = el.dataset.tab; if (location.hash === '#verwaltung-' + adm.tab) route(); else location.hash = '#verwaltung-' + adm.tab; break;
    case 'mem-approve': {
      const m = adm.members.find(x => x.user_id === el.dataset.id);
      const {error} = await sb.rpc('update_member', {p_club: me.club_id, p_user: m.user_id, p_role: m.role, p_status: 'active', p_team_ids: m.team_ids, p_club_role: m.club_role});
      if (error) toast(friendlyError(error)); else { toast('Bestätigt'); await loadAdmin(); }
      break;
    }
    case 'mem-edit': openMember(el.dataset.id); break;
    case 'mem-remove': {
      const {error} = await sb.rpc('remove_member', {p_club: me.club_id, p_user: el.dataset.id});
      if (error) { if (document.getElementById('s-msg')) gateError('s-msg', error); else toast(friendlyError(error)); break; }
      closeSheet(); toast('Entfernt'); await loadAdmin();
      break;
    }
    case 'inv-new': openInviteForm(); break;
    case 'inv-show': showQR(adm.invites.find(x => x.id === el.dataset.id)); break;
    case 'inv-del': {
      const {error} = await sb.from('invites').delete().eq('id', el.dataset.id);
      if (error) toast(friendlyError(error)); else { toast('Einladung zurückgezogen'); await loadAdmin(); }
      break;
    }
    case 'copy': try { await navigator.clipboard.writeText(el.dataset.t); toast('Link kopiert'); } catch (x) { toast(el.dataset.t); } break;
    case 'print': window.print(); break;
    case 'team-new': openTeam(); break;
    case 'team-edit': openTeam(el.dataset.id); break;
    case 'team-del': {
      const {error} = await sb.from('teams').delete().eq('id', el.dataset.id);
      if (error) { gateError('s-msg', error); break; }
      await afterMasterChange('Team gelöscht'); break;
    }
    case 'fac-new': openFacility(); break;
    case 'fac-edit': openFacility(el.dataset.id); break;
    case 'fac-del': {
      const {error} = await sb.rpc('delete_facility', {p_club: me.club_id, p_id: el.dataset.id});
      if (error) { gateError('s-msg', error); break; }
      await afterMasterChange('Anlage gelöscht'); break;
    }
  }
}

/* ---------- Start ---------- */
/* ---------- Vereinsfarben und Logo ---------- */
const hexLum = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const onColor = h => hexLum(h) > .35 ? '#111111' : '#ffffff';
function applyColors(brand, header) {
  const s = document.documentElement.style;
  s.setProperty('--brand', brand);
  s.setProperty('--brand-2', header);
  s.setProperty('--on-brand', onColor(brand));
  s.setProperty('--on-brand-2', onColor(header));
  s.setProperty('--brand-soft', `color-mix(in srgb, ${brand} 16%, var(--card))`);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = header;
}
function setBranding(d) {
  branding = {brand_color: d.brand_color || DEFAULT_BRAND.brand_color, header_color: d.header_color || DEFAULT_BRAND.header_color, logo: d.logo || null};
  applyColors(branding.brand_color, branding.header_color);
}
// Verkleinert das Bild im Gerät, damit es klein gespeichert werden kann
async function resizeLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/png');
    if (out.length > 250000) out = c.toDataURL('image/webp', .85);
    if (out.length > 300000 || !/^data:image\/(png|webp);/.test(out)) throw new Error('zu groß');
    return out;
  } finally { URL.revokeObjectURL(url); }
}
async function saveBranding(form) {
  const el = form.elements;
  const {error} = await sb.rpc('update_club_branding', {p_club: me.club_id, p_brand: el.brand.value, p_header: el.header.value, p_logo: brandDraftLogo});
  if (error) { gateError('s-msg', error); return; }
  setBranding({brand_color: el.brand.value, header_color: el.header.value, logo: brandDraftLogo});
  closeSheet(); route(); toast('Aussehen gespeichert');
}
document.addEventListener('input', e => {
  if (e.target.form && e.target.form.id === 'f-brand' && e.target.type === 'color') {
    applyColors(e.target.form.elements.brand.value, e.target.form.elements.header.value);
  }
});
document.addEventListener('change', async e => {
  if (e.target.name !== 'logo' || !e.target.form || e.target.form.id !== 'f-brand' || !e.target.files[0]) return;
  try {
    brandDraftLogo = await resizeLogo(e.target.files[0]);
    const p = document.getElementById('logoPreview'); p.innerHTML = ''; const i = new Image(); i.src = brandDraftLogo; i.alt = 'Vereinslogo'; p.appendChild(i);
  } catch (x) { gateError('s-msg', 'Dieses Bild konnte nicht gelesen werden. Bitte PNG, JPG oder WebP wählen.'); }
});

/* ---------- App-Sperre mit PIN (nur auf diesem Gerät) ---------- */
async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 200000}, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function savePin(form) {
  const pin = form.elements.pin.value;
  if (!/^[0-9]{4,8}$/.test(pin)) { gateError('s-msg', 'Bitte 4 bis 8 Ziffern eingeben.'); return; }
  const salt = crypto.randomUUID();
  store.set('pinHash', await pinHash(pin, salt));
  store.set('pinSalt', salt);
  closeSheet(); toast('PIN aktiviert');
}
function showLock() {
  if (document.getElementById('lock')) return;
  const d = document.createElement('div');
  d.id = 'lock';
  d.innerHTML = `<div class="gate"><div class="gate-logo">🔒</div><h2>App entsperren</h2>
    <form id="f-unlock" class="stack"><label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" required></label>
    <button class="btn block" type="submit">Entsperren</button></form><div id="l-msg"></div>
    <div class="btnrow"><button class="btn ghost" data-action="pin-forgot">PIN vergessen? Abmelden</button></div></div>`;
  document.body.appendChild(d);
}
function hideLock() { const d = document.getElementById('lock'); if (d) d.remove(); }
async function tryUnlock(form) {
  const h = await pinHash(form.elements.pin.value, store.get('pinSalt') || '');
  if (h === store.get('pinHash')) { hideLock(); return; }
  form.elements.pin.value = '';
  gateError('l-msg', 'Die PIN stimmt nicht.');
}
let lockHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lockHiddenAt = Date.now();
  else if (store.get('pinHash') && lockHiddenAt && Date.now() - lockHiddenAt > 60000) showLock();
});
document.addEventListener('change', e => {
  if (e.target.name === 'department' && e.target.form && e.target.form.id === 'f-join') {
    e.target.form.elements.team.innerHTML = joinTeamOptions(e.target.value);
  }
});

(async function boot() {
  const c = window.APP_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseKey || !window.supabase) {
    gate(`<h2>Noch nicht eingerichtet</h2><p class="muted">${window.supabase ? 'In der Datei config.js fehlen die Zugangsdaten des Supabase-Projekts.' : 'Die Verbindung konnte nicht aufgebaut werden. Bitte prüfe deine Internetverbindung.'}</p>`);
    return;
  }
  sb = window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  const params = new URLSearchParams(location.search);
  const j = params.get('join'), s = params.get('start');
  if (j) { pendingCode = normCode(j); store.set('pendingJoin', pendingCode); }
  if (s) store.set('pendingStart', normCode(s));
  if (j || s) history.replaceState(null, '', location.pathname + location.hash);
  const {data: {session: first}} = await sb.auth.getSession();
  if (first && store.get('pinHash')) showLock();
  await enterApp();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
