// Erzeugt die Seite „Alle Buttons der Vereins-Einrichtung“ aus den echten App-Dateien.
// Läuft im Browser (fetch von onbac.pages.dev), Ergebnis: window.__buttonsHtml
(async () => {
  const SRC = 'https://onbac.pages.dev/';
  const ic = await fetch(SRC + 'onbac-icons.js', {cache: 'no-store'}).then(r => r.text());
  const ein = await fetch(SRC + 'onbac-einrichtung.js', {cache: 'no-store'}).then(r => r.text());
  const block = (src, name) => {
    const i = src.indexOf('const ' + name + ' =');
    if (i < 0) throw new Error('fehlt: ' + name);
    let d = 0, j = src.indexOf('=', i) + 1, start = -1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '[' || c === '{') { if (start < 0) start = j; d++; }
      else if (c === ']' || c === '}') { d--; if (d === 0 && start >= 0) return src.slice(start, j + 1); }
    }
    throw new Error('Ende fehlt: ' + name);
  };
  const ev = s => new Function('return (' + s + ');')();
  const P = ev(block(ic, 'P')), M = ev(block(ic, 'M'));
  const DZ = ev(block(ein, 'DZ_P')), SPORTS = ev(block(ein, 'SPORTS')), KINDS = ev(block(ein, 'KINDS'));
  const KIND_OF = ev(block(ein, 'KIND_OF')), ANL = ev(block(ein, 'ANL')), ANLKAT = ev(block(ein, 'ANLKAT'));
  const ki = ein.indexOf('function anlIconKey'); const ke = ein.indexOf('const anlIcon', ki);
  const anlIconKey = new Function('return ' + ein.slice(ki, ke).trim())();

  const svgOf = paths => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  const emojiIcon = e => { const k = String(e).replace(/️$/, ''); const id = M[e] || M[k]; return id ? {id: 'symbol-' + id, svg: svgOf(P[id])} : null; };
  const H = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const LIB = {};
  const reg = (id, svg) => { LIB[id] = svg; return id; };
  const box = (ico, emoji) => ico ? `<span class="box" data-svg="${ico.id}">${ico.svg}</span>` : `<span class="box emo">${H(emoji)}</span>`;
  Object.keys(P).forEach(k => reg('symbol-' + k, svgOf(P[k])));
  Object.keys(DZ).forEach(k => reg('anlage-' + k, svgOf(DZ[k])));

  const KN = {sport: 'Sport und Bewegung', musik: 'Musik und Gesang', brauchtum: 'Brauchtum und Tradition', kultur: 'Kultur und Freizeit', natur: 'Natur, Tiere und Umwelt'};
  const TY = {g: 'Gebäude', p: 'Platz', a: 'Anlage', r: 'Raum'}, TE = {'1': 'ganz', '2': '2 Hälften', '4': '4 Viertel'};
  const kindOf = id => KIND_OF[id] || 'sport';
  const dl = id => `<a class="dl" href="#" data-dl="${id}" title="SVG herunterladen">SVG</a>`;

  // 1) Kategorie
  const kat = KINDS.map(([k, e, t, d], i) => { const ico = emojiIcon(e); return `<div class="kat"><span class="kbox">${ico ? ico.svg : H(e)}</span><span class="kt"><b>${i + 1}. ${H(t)}</b><small>${H(d)}</small></span><span class="radio"></span>${ico ? dl(ico.id) : ''}<code>${k}</code></div>`; }).join('');
  // 2) Struktur
  let struk = '';
  for (const k of Object.keys(KN)) {
    const list = SPORTS.filter(s => kindOf(s[0]) === k);
    struk += `<h3>${H(KN[k])} <small>${list.length}</small></h3><div class="grid">` + list.map(([id, n, e]) => { const ico = emojiIcon(e); return `<div class="tile"><span class="pill">${ico ? ico.svg : H(e)}</span><b>${H(n)}</b>${ico ? dl(ico.id) : '<em>Emoji ' + H(e) + '</em>'}<code>${id}</code></div>`; }).join('') + '</div>';
  }
  // 3) Anlagen
  const anlTile = (str) => { const [n, t, e, teil, tipp] = str.split('|'); const key = anlIconKey(n, t); return `<div class="tile anl">${tipp === '1' ? '<i class="tipp">Tipp</i>' : ''}<span class="abox">${svgOf(DZ[key] || DZ.heim)}</span><b>${H(n)}</b><small>${TY[t]} · ${TE[teil]}</small>${dl('anlage-' + (DZ[key] ? key : 'heim'))}</div>`; };
  let anl = `<h3>Gesamtverein</h3><div class="grid">${ANLKAT.gesamt.map(anlTile).join('')}</div>`;
  for (const [id, n, e] of SPORTS) {
    const l = ANLKAT.kat[id] || []; if (!l.length) continue;
    const ico = emojiIcon(e);
    anl += `<h3><span class="mini">${ico ? ico.svg : H(e)}</span>${H(n)}</h3><div class="grid">${l.map(anlTile).join('')}</div>`;
  }
  const eigen = ANL.map(([k, n, icn, list]) => `<h3>Eigene Anlage: ${H(n)}</h3><div class="grid">` + list.map(([nm, key]) => `<div class="tile anl"><span class="abox">${svgOf(DZ[key] || DZ.heim)}</span><b>${H(nm)}</b>${dl('anlage-' + (DZ[key] ? key : 'heim'))}</div>`).join('') + '</div>').join('');
  // 4) Bibliothek
  const lib = Object.keys(LIB).map(id => `<div class="lib"><span class="pill">${LIB[id]}</span><code>${id}</code>${dl(id)}</div>`).join('');
  const DATA = {kategorien: KINDS.map(([k, e, t, d]) => ({schluessel: k, titel: t, beschreibung: d, symbol: (emojiIcon(e) || {}).id || e})),
    abteilungen: SPORTS.map(([id, n, e]) => ({schluessel: id, name: n, vereinsart: kindOf(id), symbol: (emojiIcon(e) || {}).id || e})),
    anlagen: Object.assign({gesamt: ANLKAT.gesamt}, ANLKAT.kat), eigeneAnlagen: ANL, symbole: LIB};

  const css = `*{box-sizing:border-box;margin:0;padding:0}body{background:#0B0F1A;color:#EAF0FF;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:980px;margin:0 auto;padding:24px 16px 80px}.head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.head img{width:150px}
h1{font-size:26px;margin:14px 0 6px}h2{font-size:22px;margin:34px 0 4px;padding-top:12px;border-top:1px solid #1C2640}h3{font-size:16px;margin:20px 0 10px;display:flex;align-items:center;gap:8px;color:#BFD3FF}h3 small{color:#7F8AA0;font-weight:500}
p.sub{color:#9AA7C2;font-size:14px;line-height:1.5;max-width:720px}.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.btn{border:0;border-radius:14px;padding:11px 16px;font:inherit;font-weight:700;color:#fff;background:linear-gradient(145deg,#3a8dff,#2F6BFF);cursor:pointer;box-shadow:0 0 18px rgba(47,107,255,.35)}.btn.sec{background:#111829;border:1px solid #22315A;box-shadow:none}
nav{position:sticky;top:0;z-index:5;background:rgba(11,15,26,.92);backdrop-filter:blur(8px);display:flex;gap:6px;padding:10px 0;overflow-x:auto}nav a{white-space:nowrap;color:#BFD3FF;text-decoration:none;border:1px solid #22315A;border-radius:999px;padding:6px 12px;font-size:13px}
.kat{position:relative;display:flex;align-items:center;gap:16px;padding:16px;margin-top:12px;border-radius:22px;background:#111829;border:1.5px solid #1C2640;max-width:560px}
.kbox{flex:none;width:76px;height:76px;border-radius:18px;display:grid;place-items:center;border:1.5px solid rgba(201,162,74,.85);background:#141210;box-shadow:0 0 14px rgba(201,162,74,.28),inset 0 0 8px rgba(201,162,74,.15);color:#fff}.kbox svg{width:42px;height:42px}
.kt b{display:block;font-size:19px}.kt small{display:block;color:#9AA7C2;font-size:14px;line-height:1.45;margin-top:4px}.radio{flex:none;width:30px;height:30px;border-radius:50%;border:2px solid #3A4766;margin-left:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:16px 8px 12px;border-radius:20px;background:#111829;border:1.5px solid #1C2640}.tile b{font-size:15px}.tile small{font-size:11.5px;color:#9AA7C2}
.pill{display:inline-grid;place-items:center;width:58px;height:34px;border-radius:999px;border:1.5px solid rgba(201,162,74,.85);box-shadow:0 0 10px rgba(201,162,74,.25);color:#fff}.pill svg{width:22px;height:22px}
.abox{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;border:1.5px solid rgba(201,162,74,.55);background:#141210;color:#fff}.abox svg{width:30px;height:30px}
.tipp{position:absolute;top:-1px;right:-1px;font-style:normal;font-size:12px;font-weight:700;color:#BFD3FF;background:#1B2A4F;border-radius:0 18px 0 12px;padding:4px 10px}
.mini{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;border:1px solid rgba(201,162,74,.7)}.mini svg{width:16px;height:16px}
code{font-size:10.5px;color:#5F6B85}.dl{position:absolute;left:8px;top:8px;font-size:10px;font-weight:700;color:#7FB2FF;text-decoration:none;border:1px solid #22315A;border-radius:6px;padding:1px 5px}.kat .dl{left:auto;right:14px;top:12px}.kat code{position:absolute;right:14px;bottom:8px}
.lib{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px 10px;border-radius:16px;background:#111829;border:1px solid #1C2640}.libgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
em{font-size:11px;color:#9AA7C2;font-style:normal}`;
  const js = `const LIB=${JSON.stringify(LIB)};const DATA=${JSON.stringify(DATA)};
function save(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();}
document.addEventListener('click',e=>{const d=e.target.closest('[data-dl]');if(d){e.preventDefault();save(d.dataset.dl+'.svg',LIB[d.dataset.dl],'image/svg+xml');}});
document.getElementById('json').onclick=()=>save('orgame-einrichtung-daten.json',JSON.stringify(DATA,null,2),'application/json');
document.getElementById('zip').onclick=()=>{const enc=new TextEncoder();const T=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0});const crc=d=>{let c=0xFFFFFFFF;for(let i=0;i<d.length;i++)c=T[(c^d[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};const u16=(v,a,o)=>{a[o]=v&255;a[o+1]=(v>>>8)&255},u32=(v,a,o)=>{a[o]=v&255;a[o+1]=(v>>>8)&255;a[o+2]=(v>>>16)&255;a[o+3]=(v>>>24)&255};const parts=[],cd=[];let off=0;const files=Object.keys(LIB).map(k=>['symbole/'+k+'.svg',LIB[k]]);files.push(['orgame-einrichtung-daten.json',JSON.stringify(DATA,null,2)]);for(const[p,t]of files){const n=enc.encode(p),d=enc.encode(t),c=crc(d);const l=new Uint8Array(30+n.length);u32(0x04034b50,l,0);u16(20,l,4);u16(0x800,l,6);u16(0x21,l,12);u32(c,l,14);u32(d.length,l,18);u32(d.length,l,22);u16(n.length,l,26);l.set(n,30);const h=new Uint8Array(46+n.length);u32(0x02014b50,h,0);u16(20,h,4);u16(20,h,6);u16(0x800,h,8);u16(0x21,h,14);u32(c,h,16);u32(d.length,h,20);u32(d.length,h,24);u16(n.length,h,28);u32(off,h,42);h.set(n,46);parts.push(l,d);cd.push(h);off+=l.length+d.length}const s=cd.reduce((a,x)=>a+x.length,0);const e=new Uint8Array(22);u32(0x06054b50,e,0);u16(cd.length,e,8);u16(cd.length,e,10);u32(s,e,12);u32(off,e,16);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([...parts,...cd,e],{type:'application/zip'}));a.download='orgame-buttons.zip';document.body.appendChild(a);a.click();a.remove();};`;
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OrgaMe – alle Buttons der Vereins-Einrichtung</title><style>${css}</style></head><body><div class="wrap">
<div class="head"><img src="onbac-logo.png" alt="OrgaMe"></div>
<h1>Alle Buttons der Vereins-Einrichtung</h1>
<p class="sub">Direkt aus dem Code der OrgaMe-App erzeugt (Stand 19.11.2026): gleiche Linien-Symbole, gleiche Texte und Aufteilungen wie in der App. Jedes Symbol lässt sich als SVG herunterladen; unten gibt es alle auf einmal als ZIP und die Daten als JSON für die Website.</p>
<div class="btns"><button class="btn" id="zip">Alle Symbole + Daten als ZIP</button><button class="btn sec" id="json">Nur Daten (JSON)</button></div>
<nav><a href="#kat">Kategorie (${KINDS.length})</a><a href="#struk">Struktur (${SPORTS.length})</a><a href="#anl">Anlagen je Abteilung</a><a href="#eigen">Eigene Anlage</a><a href="#lib">Symbol-Bibliothek (${Object.keys(LIB).length})</a></nav>
<h2 id="kat">Schritt 2 · Kategorie – „Was für ein Verein seid ihr?“</h2>${kat}
<h2 id="struk">Schritt 3 · Struktur – „Welche Abteilungen oder Gruppen habt ihr?“</h2>${struk}
<h2 id="anl">Schritt 4 · Anlagen je Abteilung</h2><p class="sub">„Tipp“ = vorgeschlagen. Darunter Typ und Standard-Aufteilung.</p>${anl}
<h2 id="eigen">Schritt 4 · Eigene Anlage hinzufügen</h2>${eigen}
<h2 id="lib">Symbol-Bibliothek</h2><p class="sub">symbol-… = Abteilungs- und Kategorie-Symbole, anlage-… = Anlagen-Symbole. Linienstärke 1,7, Farbe folgt der Schriftfarbe (currentColor).</p><div class="libgrid">${lib}</div>
</div><script>${js}<\/script></body></html>`;
  window.__buttonsHtml = html;
  const ohne = SPORTS.filter(s => !emojiIcon(s[2])).map(s => s[1] + ' ' + s[2]);
  return {laenge: html.length, symbole: Object.keys(LIB).length, ohneLinienSymbol: ohne};
})()
