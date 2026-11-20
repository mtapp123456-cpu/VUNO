// OrgaMe – Übernahme nach „Verein gründen“ auf der Website (www.orga.me, Testmodus ?test=1).
// Muss nach config.js und vor orgame-start.js / account.js geladen werden.
// 1) Startbildschirm: „Verein gründen“ und „Testzugang“ öffnen die Website; der alte Weg in den Testverein bleibt als kleiner Link.
// 2) Kommt man von der Website zurück (#access_token=…&orgame=…), wird die Anmeldung übernommen, der offene Testzugang
//    auf diesem Gerät übersprungen und der neue Verein ohne Einrichtungsschritte geöffnet.
(() => {
  'use strict';
  const WEB = window.ORGAME_WEB || 'https://orga.me/';
  const FLAG = 'orgame_echt';
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // Zurück in den gemeinsamen Testverein: ?testverein=1
  if (/[?&]testverein=1(?:&|$)/.test(location.search)) {
    ls.del(FLAG);
    history.replaceState(null, '', location.pathname + location.hash);
  }

  // ---------- Übergabe von der Website ----------
  const h = location.hash.replace(/^#/, '');
  if (/(?:^|&)access_token=/.test(h) && /(?:^|&)orgame=/.test(h)) {
    try {
      const raw = new URLSearchParams(h).get('orgame').replace(/-/g, '+').replace(/_/g, '/');
      const d = JSON.parse(decodeURIComponent(escape(atob(raw + '==='.slice((raw.length + 3) % 4)))));
      const c = d.c;
      if (c) {
        const k = d.k || 'sport';
        const deps = Array.isArray(d.d) ? d.d : [];
        const eigene = deps.filter((x) => /^x_/.test(x.k)).map((x) => [x.k, x.n, k]);
        if (eigene.length) ls.set('onbac_eigene_' + c, eigene);
        ls.set('onbac_sports_' + c, [...new Set(deps.map((x) => x.k))]);
        ls.set('onbac_kinds_' + c, [k]);
        if (Array.isArray(d.f)) ls.set('onbac_facs_' + c, d.f);
        if (d.o) ls.set('onbac_ort_' + c, d.o);
        if (d.l) ls.set('onbac_land_' + c, d.l);
        ls.set('onbac_hadmin_' + c, { name: d.n || '', mail: d.m || '' });
        ls.set('onbac_gruendung_' + c, { ts: Date.now(), kind: k, quelle: 'website', test: !!d.t });
        ls.set('onbac_einwilligung', { v: '2026-11-12', ds: true, agb: true, ts: new Date().toISOString(), quelle: 'website' });
        ls.set('clubId', c);
        ls.del('pendingJoin'); ls.del('pendingStart');
        ls.set(FLAG, '1');
        try { sessionStorage.setItem('ob_auto_' + c, '1'); } catch (e) {}
        window.orgameNeuGegruendet = { club: c, test: !!d.t };
      }
    } catch (e) { console.warn('OrgaMe Übernahme', e); }
  }

  // Wer über die Website angemeldet ist, landet in seinem echten Verein statt im offenen Testverein.
  if (ls.get(FLAG) === '1' && window.APP_CONFIG) window.APP_CONFIG.openAccess = false;

  // ---------- Startbildschirm: Links auf die Website ----------
  const patch = (w) => {
    if (!w || w.dataset.ogWeb) return;
    w.dataset.ogWeb = '1';
    const g = w.querySelector('.gruenden');
    if (g) { g.href = WEB + '#preise'; g.removeAttribute('target'); }
    const t = w.querySelector('.test');
    const a = t && t.querySelector('[data-og-test]');
    if (!a) return;
    const web = document.createElement('a');
    web.href = WEB + '?test=1#preise';
    web.innerHTML = '🧪 Testzugang – Verein gründen wie echt';
    a.textContent = 'Direkt in den Testverein (Zugangscode)';
    a.style.cssText = 'border:0 !important;font-size:13px !important;color:#8ea4c8 !important;padding:4px 8px !important';
    t.style.cssText = 'flex-direction:column;align-items:center;gap:6px';
    t.insertBefore(web, a);
  };
  new MutationObserver(() => patch(document.getElementById('og-start'))).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- Begrüßung im neuen Verein ----------
  if (window.orgameNeuGegruendet) {
    const hi = () => {
      if (typeof toast === 'function' && typeof me !== 'undefined' && me) {
        toast((window.orgameNeuGegruendet.test ? 'Testverein' : 'Verein') + ' ist eingerichtet – willkommen, Haupt-Admin!');
      } else setTimeout(hi, 500);
    };
    setTimeout(hi, 1500);
  }
})();
