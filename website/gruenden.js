// OrgaMe – „Verein gründen“ nach der Bestellübersicht.
// Läuft hinter dem Button „30 Tage kostenlos starten“ im Dialog [data-order]:
// Verein → Haupt-Admin → E-Mail-Code → Zahlungsart & Bestätigen → Übergabe in die App.
// Mit ?test=1 läuft alles im Testmodus: Hinweis überall, Verein wird als Test markiert, nichts wird berechnet.
// Eigenständige Datei ohne Build-Abhängigkeit (Supabase wird erst beim Absenden nachgeladen).
(() => {
  'use strict';
  const SB_URL = 'https://sdnrmhjppvwiqudmugbm.supabase.co';
  const SB_KEY = 'sb_publishable_6T31jc_qSnOOCUJHpbIFuA_5K9GLIph';
  const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  const APP = window.ORGAME_APP || 'https://onbac.pages.dev/';

  const q = new URLSearchParams(location.search);
  if (q.has('test')) { try { sessionStorage.setItem('orgame_test', '1'); } catch (e) {} }
  const TEST = q.has('test') || (() => { try { return sessionStorage.getItem('orgame_test') === '1'; } catch (e) { return false; } })();

  const LAENDER = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen', 'Österreich', 'Schweiz'];
  const FARBEN = ['#1E90FF', '#C8102E', '#16A34A', '#F59E0B', '#7C3AED', '#0F172A', '#0891B2', '#DB2777'];
  const ZAHLUNG = [['lastschrift', 'SEPA-Lastschrift'], ['rechnung', 'Rechnung'], ['paypal', 'PayPal']];
  const STEPS = ['Verein', 'Haupt-Admin', 'E-Mail bestätigen', 'Bestätigen'];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

  // ---------- Stil (ohne backdrop-filter, siehe CLAUDE.md) ----------
  const css = `
  .og-test{position:fixed;left:12px;bottom:12px;z-index:60;display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;font:600 13px/1.2 inherit;color:#1b1400;background:#ffc94d;box-shadow:0 8px 30px rgba(0,0,0,.45)}
  .og-test b{font-weight:800}
  .og-co{display:grid;gap:14px}
  .og-co[hidden]{display:none}
  .og-bar{display:flex;gap:6px;margin-top:4px}.og-bar i{flex:1;height:5px;border-radius:3px;background:rgba(160,175,255,.16)}.og-bar i.on{background:var(--cyan,#5ee3ff)}
  .og-flag{display:inline-block;margin-left:8px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.04em;color:#1b1400;background:#ffc94d;vertical-align:2px}
  .og-f{display:grid;gap:6px;font-size:14px;color:var(--ink-2,#b7bfe6)}
  .og-f input[type=text],.og-f input[type=email],.og-f input[type=tel],.og-f select,.og-code{width:100%;padding:13px 14px;border-radius:14px;border:1px solid rgba(160,175,255,.22);background:rgba(160,175,255,.06);color:var(--ink,#eef1ff);font:inherit;font-size:16px}
  .og-f input:focus,.og-f select:focus,.og-code:focus{outline:2px solid var(--cyan,#5ee3ff);outline-offset:1px}
  .og-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:520px){.og-row{grid-template-columns:1fr}}
  .og-crest{display:flex;align-items:center;gap:14px}
  .og-crest__img{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;flex:none;background:rgba(160,175,255,.08);border:1px dashed rgba(160,175,255,.35);overflow:hidden;font-size:12px;color:var(--ink-3,#8890b8);text-align:center}
  .og-crest__img img{width:100%;height:100%;object-fit:contain}
  .og-file{display:inline-block;padding:10px 14px;border-radius:12px;border:1px solid rgba(160,175,255,.25);cursor:pointer;color:var(--ink,#eef1ff);font-size:14px}
  .og-file input{display:none}
  .og-sw{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .og-sw button{width:34px;height:34px;border-radius:50%;border:2px solid transparent;cursor:pointer;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
  .og-sw button[aria-pressed=true]{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.18)}
  .og-sw input[type=color]{width:38px;height:38px;border:0;background:none;padding:0;cursor:pointer}
  .og-chk{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;color:var(--ink-2,#b7bfe6);cursor:pointer}
  .og-chk input{width:20px;height:20px;flex:none;margin-top:1px;accent-color:#5ee3ff}
  .og-chk a{color:var(--cyan,#5ee3ff)}
  .og-note{padding:12px 14px;border-radius:14px;font-size:14px;line-height:1.5;color:#cfe0ff;background:rgba(94,227,255,.07)}
  .og-warn{padding:12px 14px;border-radius:14px;font-size:14px;line-height:1.5;color:#1b1400;background:#ffc94d}
  .og-err{min-height:1px;font-size:14px;color:#ff8f8f}
  .og-code{font-size:24px;letter-spacing:.35em;text-align:center;font-variant-numeric:tabular-nums}
  .og-link{background:none;border:0;padding:0;color:var(--cyan,#5ee3ff);font:inherit;font-size:14px;cursor:pointer;text-decoration:underline}
  .og-pay{display:grid;gap:8px}
  .og-pay label{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid rgba(160,175,255,.2);cursor:pointer;font-size:15px;color:var(--ink,#eef1ff)}
  .og-pay label:has(input:checked){border-color:var(--cyan,#5ee3ff);background:rgba(94,227,255,.07)}
  .og-pay input{accent-color:#5ee3ff;width:18px;height:18px}
  .og-sum{list-style:none;margin:0;padding:0;display:grid}
  .og-sum li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(160,175,255,.12);font-size:14.5px;color:var(--ink-2,#b7bfe6)}
  .og-sum li span:last-child{color:var(--ink,#eef1ff);text-align:right}
  .og-done{text-align:center;display:grid;gap:12px;justify-items:center}
  .og-done__crest{width:84px;height:84px;border-radius:24px;display:grid;place-items:center;font-weight:800;font-size:22px;color:#fff;overflow:hidden}
  .og-done__crest img{width:100%;height:100%;object-fit:contain;background:#0b0e2c}
  .og-acts{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:4px}
  @media(max-width:560px){.og-acts .btn{flex:1}}
  .og-co .btn[disabled]{opacity:.55;pointer-events:none}`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  if (TEST) {
    const b = document.createElement('div');
    b.className = 'og-test';
    b.innerHTML = '<span>🧪</span><span><b>Testmodus</b> – nichts wird berechnet</span>';
    const add = () => document.body.append(b);
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  }

  // ---------- Zustand ----------
  const S = { step: 0, verein: { name: '', ort: '', land: 'Baden-Württemberg', farbe: FARBEN[0], wappen: '' }, admin: { name: '', email: '', telefon: '', agb: false, ds: false }, code: '', sent: false, zahlung: 'lastschrift', busy: false, err: '', done: null };
  let sb = null;
  const supa = async () => {
    if (sb) return sb;
    const { createClient } = await import(SB_LIB);
    sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return sb;
  };

  let dlg = null, box = null;
  const kids = () => [...dlg.querySelector('.order__inner').children].filter((c) => c !== box && !c.classList.contains('order__x'));
  function open() {
    dlg = document.querySelector('[data-order]');
    if (!dlg) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'og-co';
      dlg.querySelector('.order__inner').append(box);
      dlg.addEventListener('close', reset);
      box.addEventListener('click', onClick);
      box.addEventListener('input', onInput);
      box.addEventListener('change', onChange);
      box.addEventListener('submit', (e) => e.preventDefault());
    }
    kids().forEach((c) => { if (c.dataset.ogDisp === undefined) c.dataset.ogDisp = c.style.display || ''; c.style.display = 'none'; });
    box.hidden = false;
    if (!S.done) S.step = S.step || 1;
    render();
    dlg.querySelector('.order__inner').scrollIntoView?.({ block: 'start' });
    dlg.scrollTop = 0;
  }
  function back() {
    box.hidden = true;
    kids().forEach((c) => { c.style.display = c.dataset.ogDisp || ''; delete c.dataset.ogDisp; });
  }
  function reset() { if (box && !S.done) back(); }

  // ---------- Darstellung ----------
  const bar = () => `<div class="og-bar">${STEPS.map((_, i) => `<i class="${i < S.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = (title) => `<div><p class="order__step">Verein gründen · Schritt ${S.step} von ${STEPS.length}${TEST ? '<span class="og-flag">TEST</span>' : ''}</p>
      <h2 class="order__title">${title}</h2>${bar()}</div>`;
  const err = () => `<p class="og-err" role="alert">${esc(S.err)}</p>`;

  function render() {
    if (!box) return;
    const v = S.verein, a = S.admin;
    if (S.done) { box.innerHTML = doneHTML(); return; }
    if (S.step === 1) {
      box.innerHTML = `${head('Euer Verein')}
        <label class="og-f">Vereinsname<input type="text" data-v="name" maxlength="50" autocomplete="organization" value="${esc(v.name)}" placeholder="z. B. TSV Musterstadt 1921"></label>
        <div class="og-row">
          <label class="og-f">Ort<input type="text" data-v="ort" maxlength="60" autocomplete="address-level2" value="${esc(v.ort)}"></label>
          <label class="og-f">Bundesland<select data-v="land">${LAENDER.map((l) => `<option ${l === v.land ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="og-f">Wappen (optional)
          <div class="og-crest"><span class="og-crest__img">${v.wappen ? `<img src="${v.wappen}" alt="Wappen">` : 'kein Bild'}</span>
          <label class="og-file">Bild wählen<input type="file" accept="image/*" data-wappen></label>${v.wappen ? '<button type="button" class="og-link" data-act="wappen-weg">entfernen</button>' : ''}</div>
        </div>
        <div class="og-f">Vereinsfarbe
          <div class="og-sw">${FARBEN.map((f) => `<button type="button" style="background:${f}" aria-label="Farbe ${f}" aria-pressed="${f.toLowerCase() === v.farbe.toLowerCase()}" data-farbe="${f}"></button>`).join('')}
          <input type="color" value="${esc(v.farbe)}" data-v="farbe" aria-label="Eigene Farbe"></div>
        </div>
        ${err()}
        <div class="og-acts"><button type="button" class="btn btn--ghost" data-act="zurueck">Zur Bestellübersicht</button><button type="button" class="btn" data-act="weiter">Weiter</button></div>`;
    } else if (S.step === 2) {
      box.innerHTML = `${head('Haupt-Admin')}
        <p class="og-note">Du wirst Haupt-Admin mit allen Rechten für den Verein. Bis zu drei weitere Haupt-Admins lädst du später in der App ein.</p>
        <label class="og-f">Dein Name<input type="text" data-a="name" maxlength="60" autocomplete="name" value="${esc(a.name)}"></label>
        <label class="og-f">E-Mail-Adresse<input type="email" data-a="email" maxlength="120" autocomplete="email" inputmode="email" value="${esc(a.email)}"></label>
        <label class="og-f">Handynummer (optional)<input type="tel" data-a="telefon" maxlength="30" autocomplete="tel" value="${esc(a.telefon)}"></label>
        <label class="og-chk"><input type="checkbox" data-a="agb" ${a.agb ? 'checked' : ''}><span>Ich akzeptiere die <a href="#" target="_blank" rel="noopener">AGB</a>.</span></label>
        <label class="og-chk"><input type="checkbox" data-a="ds" ${a.ds ? 'checked' : ''}><span>Ich habe die <a href="#" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen.</span></label>
        ${err()}
        <div class="og-acts"><button type="button" class="btn btn--ghost" data-act="schritt-zurueck">Zurück</button><button type="button" class="btn" data-act="weiter" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Code wird gesendet …' : 'Code per E-Mail senden'}</button></div>`;
    } else if (S.step === 3) {
      box.innerHTML = `${head('E-Mail bestätigen')}
        <p class="og-note">Wir haben einen Code an <b>${esc(a.email)}</b> geschickt. Gib ihn hier ein. Ein Passwort brauchst du nicht – so meldest du dich auch in der App an.</p>
        <input class="og-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" data-code value="${esc(S.code)}" placeholder="••••••" aria-label="Code aus der E-Mail">
        <p style="font-size:14px;color:var(--ink-3,#8890b8)">Keine E-Mail? Schau im Spam-Ordner nach. <button type="button" class="og-link" data-act="neu-senden">Code neu senden</button> · <button type="button" class="og-link" data-act="schritt-zurueck">E-Mail ändern</button></p>
        ${err()}
        <div class="og-acts"><button type="button" class="btn" data-act="weiter" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Wird geprüft …' : 'Bestätigen'}</button></div>`;
      setTimeout(() => box.querySelector('[data-code]')?.focus(), 50);
    } else if (S.step === 4) {
      const o = window.orgameOrder || {}, s = window.orgameSetup || { abteilungen: [], anlagen: [] };
      const anl = (s.anlagen || []).reduce((n, x) => n + (x.anzahl || 1), 0);
      const lauf = { monat: 'monatlich', jahr: 'Jahresabo', zwei: '2-Jahres-Abo' }[o.laufzeit] || (o.monate > 1 ? `${o.monate} Monate` : 'monatlich');
      box.innerHTML = `${head('Bestätigen')}
        ${TEST ? '<p class="og-warn"><b>Testkauf:</b> Es wird nichts abgebucht und keine Rechnung erstellt. Der Verein wird als Testverein angelegt.</p>' : ''}
        <ul class="og-sum">
          <li><span>Verein</span><span><b>${esc(S.verein.name)}</b><br>${esc(S.verein.ort)}, ${esc(S.verein.land)}</span></li>
          <li><span>Haupt-Admin</span><span>${esc(a.name)}<br>${esc(a.email)}</span></li>
          <li><span>Paket</span><span><b>${esc(String(o.paket || 'basic').toUpperCase())}</b> · ${esc(lauf)}</span></li>
          <li><span>Abteilungen · Anlagen</span><span>${(s.abteilungen || []).length} · ${anl}</span></li>
          <li><span>Heute zu zahlen</span><span><b>${euro(0)}</b></span></li>
          <li><span>Nach 30 Tagen, nur wenn du bestätigst</span><span>${o.monate > 1 ? `${euro(o.zahlung)} einmalig` : `${euro(o.monatlich)} / Monat`}</span></li>
        </ul>
        <div class="og-f">Zahlungsart für die Zeit nach dem Test
          <div class="og-pay">${ZAHLUNG.map(([k, n]) => `<label><input type="radio" name="og-pay" value="${k}" ${S.zahlung === k ? 'checked' : ''}> ${n}</label>`).join('')}</div>
        </div>
        <p class="og-note">Die Zahlungsdaten gibst du erst ein, wenn du nach der Testphase verlängerst – in der App unter Abo &amp; Rechnungen. Es gibt keine automatische Buchung.</p>
        ${err()}
        <div class="og-acts"><button type="button" class="btn btn--ghost" data-act="schritt-zurueck-3">Zurück</button><button type="button" class="btn" data-act="anlegen" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Verein wird angelegt …' : (TEST ? 'Testverein anlegen' : 'Verein anlegen – 30 Tage kostenlos')}</button></div>`;
    }
  }

  function doneHTML() {
    const v = S.verein, ini = v.name.split(/\s+/).filter((w) => /^[A-Za-zÄÖÜäöü]/.test(w)).slice(0, 3).map((w) => w[0]).join('').toUpperCase() || 'OM';
    return `<div class="og-done">
      <p class="order__step">Fertig${TEST ? '<span class="og-flag">TEST</span>' : ''}</p>
      <span class="og-done__crest" style="background:${esc(v.farbe)}">${v.wappen ? `<img src="${v.wappen}" alt="">` : esc(ini)}</span>
      <h2 class="order__title">${esc(v.name)} ist angelegt</h2>
      <p class="og-note" style="text-align:left">Abteilungen, Anlagen und Teilflächen sind eingerichtet. Du bist Haupt-Admin. In der App lädst du jetzt Abteilungs-Admins und Trainer ein – die müssen nichts mehr einrichten.</p>
      <a class="btn" href="${esc(S.done.link)}" data-act="app">OrgaMe-App öffnen</a>
      <p style="font-size:13px;color:var(--ink-3,#8890b8)">Auf einem anderen Gerät meldest du dich in der App einfach mit ${esc(S.admin.email)} und einem Code an.</p>
    </div>`;
  }

  // ---------- Eingaben ----------
  function onInput(e) {
    const t = e.target;
    if (t.dataset.v) S.verein[t.dataset.v] = t.value;
    if (t.dataset.a && t.type !== 'checkbox') S.admin[t.dataset.a] = t.value;
    if (t.matches('[data-code]')) { S.code = t.value.replace(/\D/g, ''); if (t.value !== S.code) t.value = S.code; }
    if (t.dataset.v === 'farbe') box.querySelectorAll('[data-farbe]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.farbe.toLowerCase() === t.value.toLowerCase())));
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.a && t.type === 'checkbox') S.admin[t.dataset.a] = t.checked;
    if (t.name === 'og-pay') S.zahlung = t.value;
    if (t.matches('[data-wappen]') && t.files[0]) wappen(t.files[0]);
  }
  function onClick(e) {
    const f = e.target.closest('[data-farbe]');
    if (f) { S.verein.farbe = f.dataset.farbe; render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'zurueck') { S.err = ''; back(); }
    else if (a === 'schritt-zurueck') { S.err = ''; S.step = 2; S.sent = false; S.code = ''; render(); }
    else if (a === 'schritt-zurueck-3') { S.err = ''; S.step = S.session ? 1 : 3; render(); }
    else if (a === 'weiter') next();
    else if (a === 'neu-senden') sendCode(true);
    else if (a === 'anlegen') anlegen();
    else if (a === 'wappen-weg') { S.verein.wappen = ''; render(); }
  }

  async function wappen(file) {
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
      const draw = (max, type) => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL(type, 0.85);
      };
      let d = draw(256, 'image/webp');
      if (!/^data:image\/webp/.test(d)) d = draw(256, 'image/png');
      if (d.length > 280000) d = draw(160, 'image/png');
      S.verein.wappen = d.length <= 280000 ? d : '';
      S.err = S.verein.wappen ? '' : 'Das Bild ist zu groß. Bitte ein kleineres Wappen wählen.';
    } catch (x) { S.err = 'Das Bild konnte nicht gelesen werden.'; }
    render();
  }

  // ---------- Ablauf ----------
  const okMail = (m) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m);
  async function next() {
    if (S.busy) return;
    S.err = '';
    if (S.step === 1) {
      if (S.verein.name.trim().length < 2) S.err = 'Bitte den Vereinsnamen eingeben.';
      else if (!S.verein.ort.trim()) S.err = 'Bitte den Ort eingeben.';
      else { S.step = 2; }
      render(); return;
    }
    if (S.step === 2) {
      const a = S.admin;
      if (a.name.trim().length < 2) S.err = 'Bitte deinen Namen eingeben.';
      else if (!okMail(a.email.trim())) S.err = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      else if (!a.agb || !a.ds) S.err = 'Bitte AGB und Datenschutzerklärung bestätigen.';
      if (S.err) { render(); return; }
      await sendCode(false); return;
    }
    if (S.step === 3) {
      if (S.code.length < 6) { S.err = 'Bitte den Code aus der E-Mail eingeben.'; render(); return; }
      S.busy = true; render();
      try {
        const c = await supa();
        const email = S.admin.email.trim();
        let { data, error } = await c.auth.verifyOtp({ email, token: S.code, type: 'email' });
        if (error || !data?.session) ({ data, error } = await c.auth.verifyOtp({ email, token: S.code, type: 'signup' }));
        if (error || !data?.session) throw error || new Error('Keine Sitzung');
        S.session = data.session; S.step = 4;
      } catch (x) { S.err = /expired|invalid/i.test(x?.message || '') ? 'Der Code stimmt nicht oder ist abgelaufen. Lass dir einen neuen schicken.' : 'Bestätigung hat nicht geklappt: ' + (x?.message || x); S.code = ''; }
      S.busy = false; render();
    }
  }

  async function sendCode(again) {
    S.busy = true; S.err = ''; render();
    try {
      const c = await supa();
      const { error } = await c.auth.signInWithOtp({ email: S.admin.email.trim(), options: { shouldCreateUser: true, data: { name: S.admin.name.trim() } } });
      if (error) throw error;
      S.sent = true; S.step = 3; S.code = '';
      if (again) S.err = '';
    } catch (x) {
      const m = x?.message || String(x);
      S.err = /rate|seconds|too many/i.test(m) ? 'Gerade wurden zu viele Codes verschickt. Bitte kurz warten und dann „Code neu senden“ tippen.' : 'Der Code konnte nicht gesendet werden: ' + m;
    }
    S.busy = false; render();
  }

  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  async function anlegen() {
    if (S.busy) return;
    if (!S.session) { S.step = 3; render(); return; }
    S.busy = true; S.err = ''; render();
    const setup = window.orgameSetup || { kategorie: null, abteilungen: [], anlagen: [] };
    const order = Object.assign({}, window.orgameOrder || {}, { zahlungsart: S.zahlung, test: TEST });
    try {
      const c = await supa();
      const { data: club, error } = await c.rpc('create_club_from_website', {
        p: { test: TEST, verein: S.verein, admin: { name: S.admin.name.trim(), telefon: S.admin.telefon.trim() }, setup, bestellung: order },
      });
      if (error) throw error;
      // Namen der angelegten Anlagen (wie in der Datenbank, mit Nummer bei Anzahl > 1)
      const fac = [];
      (setup.anlagen || []).forEach((x) => { const n = Math.min(Math.max(x.anzahl || 1, 1), 20); for (let i = 1; i <= n; i++) fac.push((String(x.name).trim().slice(0, 56) + (n > 1 ? ' ' + i : '')).toLowerCase()); });
      const hand = {
        c: club, k: setup.kategorie || 'sport',
        d: (setup.abteilungen || []).map((d) => ({ k: /^eigene-/.test(d.schluessel) ? 'x_' + slug(d.name) : d.schluessel, n: d.name, s: d.symbol })),
        f: fac, o: S.verein.ort.trim(), l: S.verein.land, n: S.admin.name.trim(), m: S.admin.email.trim(), t: TEST ? 1 : 0,
      };
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(hand)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const s = S.session;
      const p = new URLSearchParams({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: String(s.expires_in || 3600), expires_at: String(s.expires_at || ''), token_type: 'bearer', type: 'magiclink', orgame: b64 });
      S.done = { club, link: APP + '#' + p.toString() };
      try { sessionStorage.removeItem('orgame_test'); } catch (e) {}
    } catch (x) {
      S.err = 'Der Verein konnte nicht angelegt werden: ' + (x?.message || x);
    }
    S.busy = false; render();
  }

  // ---------- Einstieg: Button „30 Tage kostenlos starten“ ----------
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('[data-order-go]')) return;
    e.preventDefault(); e.stopPropagation();
    open();
  }, true);
})();
