// Browser-Test: echte App und echte Datenbank-Regeln. Nur die Supabase-Schnittstelle wird lokal nachgebildet.
const {chromium, devices} = require('playwright');
const {spawnSync} = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../app'), OUT = process.argv[2];
const PSQL = ['-h', '/tmp/pgv', '-p', '5544', '-U', 'postgres', '-d', 't', '-XAtq'];
const lit = v => v === null || v === undefined ? 'NULL'
  : Array.isArray(v) ? "'{" + v.map(x => '"' + String(x).replace(/"/g, '\\"') + '"').join(',') + "}'"
  : typeof v === 'object' ? "'" + JSON.stringify(v).replace(/'/g, "''") + "'"
  : typeof v === 'boolean' || typeof v === 'number' ? String(v)
  : "'" + String(v).replace(/'/g, "''") + "'";
function sql(uid, q, role = 'authenticated') {
  const full = `\\set VERBOSITY verbose\nbegin;\nset local role ${role};\nset local request.jwt.claim.sub='${uid || ''}';\n${q};\ncommit;\n`;
  const r = spawnSync('psql', [...PSQL, '-v', 'ON_ERROR_STOP=1'], {input: full, encoding: 'utf8'});
  const m = r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
  if (m) return {error: {code: m[1], message: m[2]}};
  return {out: r.stdout.trim()};
}
function pgCall(req) {
  const {uid, kind} = req, adminSql = q => sql('', q, 'postgres');
  if (kind === 'newuser') { adminSql(`insert into auth.users(id,email,is_anonymous) values (${lit(req.id)},${lit(req.email)},${req.anon}) on conflict (id) do nothing`); return {}; }
  if (kind === 'finduser') { return {data: adminSql(`select id from auth.users where email=${lit(req.email)}`).out || null}; }
  if (kind === 'setemail') { adminSql(`update auth.users set email=${lit(req.email)}, is_anonymous=false where id=${lit(uid)}`); return {}; }
  if (kind === 'rpc') {
    const meta = adminSql(`select p.proretset, t.typtype, t.typname from pg_proc p join pg_type t on t.oid=p.prorettype where p.proname=${lit(req.fn)} and p.pronamespace='public'::regnamespace`).out;
    if (!meta) return {error: {code: 'PGRST202', message: 'Funktion fehlt: ' + req.fn}};
    const [set, typ, name] = meta.split('|');
    const args = Object.entries(req.args || {}).map(([k, v]) => `${k} => ${k === "p_combos" ? lit(JSON.stringify(v)) : lit(v)}`).join(', ');
    const q = set === 't' ? `select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${req.fn}(${args}) r`
      : typ === 'c' ? `select to_jsonb(r) from public.${req.fn}(${args}) r`
      : name === 'void' ? `select public.${req.fn}(${args}), 'null'` : `select to_jsonb(public.${req.fn}(${args}))`;
    const r = sql(uid, q);
    if (r.error) return r;
    return {data: name === 'void' ? null : JSON.parse(r.out)};
  }
  // Tabellenzugriff
  const w = (req.filters || []).map(f => `${f[0]} ${f[1]} ${lit(f[2])}`).join(' and ') || 'true';
  const t = 'public.' + req.table;
  let q;
  if (req.op === 'select') {
    q = `select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (select ${req.cols || '*'} from ${t} where ${w} ${req.order || ''} ${req.limit || ''}) s`;
  } else if (req.op === 'insert') {
    const rows = [].concat(req.values), cols = Object.keys(rows[0]);
    q = `with x as (insert into ${t}(${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_recordset(null::${t}, ${lit(JSON.stringify(rows))}::jsonb) returning *) select coalesce(jsonb_agg(to_jsonb(x)),'[]') from x`;
  } else if (req.op === 'update') {
    const set = Object.entries(req.values).map(([k, v]) => `${k}=${lit(v)}`).join(',');
    q = `with x as (update ${t} set ${set} where ${w} returning *) select coalesce(jsonb_agg(to_jsonb(x)),'[]') from x`;
  } else {
    q = `with x as (delete from ${t} where ${w} returning *) select coalesce(jsonb_agg(to_jsonb(x)),'[]') from x`;
  }
  const r = sql(uid, q);
  return r.error ? r : {data: JSON.parse(r.out)};
}
const FAKE = `window.supabase={createClient(){
  const KEY='fake-session';
  const uid=()=>{try{return JSON.parse(localStorage.getItem(KEY)).id}catch(e){return null}};
  const sess=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}};
  const call=r=>window.pgCall(Object.assign({uid:uid()},r));
  function chain(table,op,values,cols){const q={table,op,values,cols,filters:[]};const self={
    select(c){if(op==='select')q.cols=c;return self},eq(a,b){q.filters.push([a,'=',b]);return self},gte(a,b){q.filters.push([a,'>=',b]);return self},lt(a,b){q.filters.push([a,'<',b]);return self},
    order(c,o){q.order=(q.order?q.order+',':'order by ')+c+(o&&o.ascending===false?' desc':'');return self},range(a,b){q.limit='limit '+(b-a+1)+' offset '+a;return self},
    then(f,g){return call(q).then(f,g)}};return self}
  return{
   auth:{getSession:async()=>{const s=sess();return{data:{session:s?{...s,user:s}:null}}},getUser:async()=>({data:{user:sess()}}),
    signInWithOtp:async({email})=>{window.__lastEmail=email;return{error:null}},
    verifyOtp:async({email,token,type})=>{if(token!=='123456')return{error:{message:'Token has expired or is invalid'}};
      if(type==='email_change'){await call({kind:'setemail',email});const s=sess();s.email=email;s.is_anonymous=false;localStorage.setItem(KEY,JSON.stringify(s));return{error:null}}
      const f=await call({kind:'finduser',email});const id=f.data||crypto.randomUUID();if(!f.data)await call({kind:'newuser',id,email,anon:false});
      localStorage.setItem(KEY,JSON.stringify({id,email,is_anonymous:false}));return{error:null}},
    signInAnonymously:async()=>{const id=crypto.randomUUID();await call({kind:'newuser',id,email:null,anon:true});localStorage.setItem(KEY,JSON.stringify({id,email:null,is_anonymous:true}));return{error:null}},
    updateUser:async()=>({error:null}),signOut:async()=>{localStorage.removeItem(KEY);return{error:null}}},
   rpc:(fn,args)=>call({kind:'rpc',fn,args}),
   from:t=>({select:c=>chain(t,'select',null,c),insert:v=>chain(t,'insert',v),update:v=>chain(t,'update',v),delete:()=>chain(t,'delete')}),
   channel:()=>{const c={on(){return c},subscribe(f){f&&f('SUBSCRIBED');return c}};return c},removeChannel(){}
  }}};`;
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json'};
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'text/plain'}); s.end(fs.readFileSync(f));
});
const res = [];
const ok = (n, c, i = '') => { res.push(!!c); console.log((c ? 'OK   ' : 'FAIL ') + n + (c ? '' : ' :: ' + i)); };

(async () => {
  await new Promise(r => srv.listen(4173, r));
  const base = 'http://localhost:4173/';
  const br = await chromium.launch();
  const errs = [];
  async function user(name) {
    const ctx = await br.newContext({...devices['iPhone 13'], userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile'});
    await ctx.exposeFunction('pgCall', pgCall);
    await ctx.route('**/config.js', r => r.fulfill({contentType: 'text/javascript', body: "window.APP_CONFIG={supabaseUrl:'x',supabaseKey:'y',imprintUrl:'https://example.org/i',privacyUrl:'https://example.org/d'}"}));
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({contentType: 'text/javascript', body: FAKE}));
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
    return p;
  }
  const shot = (p, n) => p.screenshot({path: path.join(OUT, n + '.png')});
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const dateIn = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

  // --- Vorstand richtet den Verein ein ---
  const anna = await user('Anna');
  await anna.goto(base + '?start=PILOT1');
  await anna.waitForSelector('#f-start');
  await shot(anna, '1-login');
  ok('Login-Seite ohne Überlauf', await noOverflow(anna));
  await anna.fill('#f-start [name=login]', 'anna@verein.de'); await anna.click('#f-start button');
  await anna.waitForSelector('#f-otp');
  await anna.fill('[name=otp]', '000000'); await anna.click('#f-otp button');
  await anna.waitForSelector('.msg.err');
  ok('Falscher Code wird gemeldet', (await anna.textContent('.msg.err')).includes('stimmt nicht'));
  await anna.fill('[name=otp]', '123456'); await anna.click('#f-otp button');
  await anna.waitForSelector('#f-club');
  await anna.fill('#f-club [name=club]', 'SV Beispiel'); await anna.fill('#f-club [name=name]', 'Anna'); await anna.check('#f-club [name=examples]'); await anna.click('#f-club button');
  await anna.waitForSelector('.hero');
  ok('Verein angelegt, Startseite zeigt Namen', (await anna.textContent('.hero h2')).includes('SV Beispiel'));
  await anna.waitForFunction(() => loadState === 'ok');
  await shot(anna, '2-start');

  // --- Buchung ---
  await anna.click('.fab');
  await anna.fill('#bform [name=title]', 'Training');
  await anna.selectOption('#bform [name=facility]', {label: 'Sportplatz 3'});
  await anna.selectOption('#bform [name=unit]', {label: 'Hälfte Nord'});
  const today = dateIn(1);
  await anna.fill('#bform [name=date]', today);
  await anna.check('#bform [name=repeat]');
  await anna.fill('#bform [name=until]', dateIn(22));
  await anna.click('#bform button[type=submit]');
  await anna.waitForSelector('#backdrop.hidden', {state: 'attached'});
  ok('Wöchentliche Serie gespeichert (4 Termine)', (await anna.evaluate(() => db.bookings.length)) === 4, await anna.evaluate(() => db.bookings.length));
  await anna.click('.fab');
  await anna.fill('#bform [name=title]', 'Spiel');
  await anna.selectOption('#bform [name=facility]', {label: 'Sportplatz 3'});
  await anna.selectOption('#bform [name=unit]', {label: 'Ganzer Platz'});
  await anna.fill('#bform [name=date]', today);
  await anna.waitForSelector('#fmsg .warn');
  ok('Konflikt wird schon beim Ausfüllen angezeigt', (await anna.textContent('#fmsg')).includes('Bereits belegt'));
  await shot(anna, '3-konflikt');
  // Andere Person bucht gleichzeitig: Datenbank muss abweisen, obwohl die App es nicht weiß
  await anna.selectOption('#bform [name=facility]', {label: 'Sportplatz 1'});
  await anna.selectOption('#bform [name=unit]', {label: 'Ganzer Platz'});
  sql('', `insert into public.bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
    select f.club_id,(select id from public.teams t where t.club_id=f.club_id limit 1),f.id,u.id,'Parallel',${lit(today)},'18:00','19:00'
    from public.facilities f join public.facility_units u on u.facility_id=f.id where f.name='Sportplatz 1' and u.name='Ganzer Platz'`, 'postgres');
  await anna.click('#bform button[type=submit]');
  await anna.waitForSelector('#fmsg .err');
  ok('Gleichzeitige Buchung wird abgelehnt und verständlich gemeldet', (await anna.textContent('#fmsg')).includes('gerade von jemand anderem'), await anna.textContent('#fmsg'));
  await anna.click('[data-action=close]');

  // --- QR-Code ---
  await anna.click('[data-action=settings]');
  await anna.waitForSelector('#f-rename');
  await shot(anna, '4-einstellungen');
  await anna.click('a[href="#verwaltung"]');
  await anna.waitForSelector('.seg');
  await anna.waitForFunction(() => adm.members && adm.members.length === 1);
  await anna.click('[data-tab=einladungen]');
  await anna.click('[data-action=inv-new]');
  await anna.fill('#f-invite [name=label]', 'Aushang Sportheim'); await anna.click('#f-invite button[type=submit]');
  await anna.waitForSelector('.qr svg');
  await shot(anna, '5-qr');
  const code = (await anna.textContent('.code-big')).trim();
  ok('QR-Code und lesbarer Einladungscode erscheinen', /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), code);
  await anna.locator('.qr').screenshot({path: path.join(OUT, 'qr.png')});
  await anna.click('[data-action=close]');
  await anna.click('[data-action=inv-new]');
  await anna.fill('#f-invite [name=label]', 'Admins'); await anna.selectOption('#f-invite [name=kind]', 'admin');
  await anna.click('#f-invite button[type=submit]');
  await anna.waitForSelector('.qr svg');
  const acode = (await anna.textContent('.code-big')).trim();
  await anna.click('[data-action=close]');

  // --- Mitglied per QR-Code ohne E-Mail ---
  const carl = await user('Carl');
  await carl.goto(base + '?join=' + code.replace(/-/g, ''));
  await carl.waitForSelector('#f-join');
  await shot(carl, '6-beitritt');
  ok('Beitritt zeigt Vereinsnamen', (await carl.textContent('.gate h2')).includes('SV Beispiel'));
  ok('Beitritt fragt Rolle, Abteilung und Mannschaft', await carl.isVisible('[name=clubrole]') && await carl.isVisible('[name=department]') && await carl.isVisible('[name=team]'));
  await carl.selectOption('[name=department]', 'Kendo');
  ok('Mannschaften passen zur Abteilung', (await carl.locator('[name=team] option').allTextContents()).join() === '– keine –,Kendo');
  await carl.selectOption('[name=team]', {label: 'Kendo'});
  ok('Code verschwindet aus der Adresszeile', !carl.url().includes('join='));
  await carl.fill('#f-join [name=name]', 'Carl'); await carl.click('#f-join button');
  await carl.waitForSelector('[data-action=restart]');
  await shot(carl, '7-warten');
  ok('Mitglied wartet auf Freigabe', (await carl.textContent('.gate')).includes('bestätigen'));

  await anna.evaluate(() => { location.hash = '#start'; return loadAdmin(); });
  await anna.waitForSelector('a[href="#verwaltung-mitglieder"]');
  ok('Vorstand sieht Hinweis auf wartende Personen', (await anna.textContent('.notice')).includes('warten'));
  await anna.click('a[href="#verwaltung-mitglieder"]');
  await anna.waitForSelector('.seg');
  await anna.evaluate(() => loadAdmin());
  await anna.waitForSelector('[data-action=mem-approve]');
  await shot(anna, '8-freigabe');
  await anna.click('[data-action=mem-approve]');
  await anna.waitForSelector('[data-action=mem-approve]', {state: 'detached'});

  await carl.click('[data-action=restart]');
  await carl.waitForSelector('.hero');
  await carl.waitForFunction(() => loadState === 'ok');
  ok('Nach Freigabe sieht das Mitglied die Termine', (await carl.evaluate(() => db.bookings.length)) >= 4);
  ok('Mitglied sieht keinen Buchen-Knopf', !(await carl.isVisible('.fab')));
  await carl.goto(base + '#anlagen-platz'); await carl.waitForSelector('.tl-track');
  await shot(carl, '9-belegung');
  ok('Auch in der Belegung kein Buchen-Knopf', !(await carl.isVisible('.fab')));
  ok('Belegungsansicht ohne Überlauf', await noOverflow(carl));
  await carl.click('[data-action=settings]'); await carl.waitForSelector('#f-addmail');
  ok('Keine Verwaltung für Mitglieder', !(await carl.isVisible('a[href="#verwaltung"]')));
  await carl.fill('#f-addmail [name=email]', 'carl@x.de'); await carl.click('#f-addmail button');
  await carl.waitForSelector('#f-otp'); await carl.fill('[name=otp]', '123456'); await carl.click('#f-otp button');
  await carl.waitForSelector('#backdrop.hidden', {state: 'attached'});
  ok('E-Mail nachträglich hinterlegt', (await carl.evaluate(() => sb.auth.getUser())).data.user.email === 'carl@x.de');

  const ios = await br.newContext({...devices['iPhone 13']});
  await ios.exposeFunction('pgCall', pgCall);
  await ios.route('**/config.js', r => r.fulfill({contentType: 'text/javascript', body: "window.APP_CONFIG={supabaseUrl:'x',supabaseKey:'y'}"}));
  await ios.route('https://cdn.jsdelivr.net/**', r => r.fulfill({contentType: 'text/javascript', body: FAKE}));
  const ip = await ios.newPage(); await ip.goto(base + '?join=' + code.replace(/-/g, '')); await ip.waitForSelector('#f-join');
  ok('iPhone bekommt Installationshinweis mit Code', (await ip.textContent('.notice')).includes(code));
  await ip.screenshot({path: path.join(OUT, '11-iphone.png')});
  // --- Trainerin über denselben Code, zuerst das eine Eingabefeld ---
  const berta = await user('Berta');
  await berta.goto(base);
  await berta.waitForSelector('#f-start');
  await shot(berta, '12-start');
  await berta.fill('#f-start [name=login]', 'falsch-code'); await berta.click('#f-start button');
  await berta.waitForSelector('[data-action=restart]');
  ok('Falscher Einladungscode wird gemeldet', (await berta.textContent('.gate')).includes('nicht gültig'));
  await berta.click('[data-action=restart]');
  await berta.waitForSelector('#f-start');
  await berta.fill('#f-start [name=login]', code.toLowerCase()); await berta.click('#f-start button');
  await berta.waitForSelector('#f-join');
  await berta.fill('[name=name]', 'Berta'); await berta.selectOption('[name=clubrole]', 'trainer');
  await berta.click('#f-join button');
  await berta.waitForSelector('#g-msg .err');
  ok('Trainer muss Mannschaft wählen', (await berta.textContent('#g-msg')).includes('Mannschaft'));
  await berta.selectOption('[name=department]', 'Basketball'); await berta.selectOption('[name=team]', {label: 'Basketball'});
  await berta.click('#f-join button');
  await berta.waitForSelector('[data-action=restart]');
  await anna.evaluate(() => loadAdmin());
  await anna.waitForSelector('[data-action=mem-approve]');
  await shot(anna, '13-bestaetigen');
  ok('Admin sieht Rolle und Mannschaft', (await anna.textContent('.row-card')).includes('Trainer') && (await anna.textContent('.row-card')).includes('Basketball'));
  await anna.click('[data-action=mem-approve]');
  await anna.waitForSelector('[data-action=mem-approve]', {state: 'detached'});
  await berta.click('[data-action=restart]');
  // --- Admin-QR verlangt E-Mail und Bestätigung ---
  const dora = await user('Dora');
  await dora.goto(base + '?join=' + acode.replace(/-/g, ''));
  await dora.waitForSelector('#f-email');
  ok('Admin-Einladung verlangt E-Mail', (await dora.locator('#f-join').count()) === 0);
  await dora.fill('#f-email [name=email]', 'dora@x.de'); await dora.click('#f-email button');
  await dora.waitForSelector('#f-otp'); await dora.fill('[name=otp]', '123456'); await dora.click('#f-otp button');
  await dora.waitForSelector('#f-join');
  await dora.fill('[name=name]', 'Dora'); await dora.selectOption('[name=clubrole]', 'vorstand'); await dora.click('#f-join button');
  await dora.waitForSelector('[data-action=restart]');
  await anna.evaluate(() => loadAdmin());
  await anna.waitForSelector('[data-action=mem-approve]');
  await anna.click('[data-action=mem-approve]');
  await anna.waitForSelector('[data-action=mem-approve]', {state: 'detached'});
  await dora.click('[data-action=restart]');
  await dora.waitForSelector('.hero');
  await dora.click('[data-action=settings]');
  ok('Bestätigter Admin sieht Verwaltung', await dora.waitForSelector('a[href="#verwaltung"]').then(() => true));
  // --- PIN ---
  await dora.fill('#f-pin [name=pin]', '1234'); await dora.click('#f-pin button');
  await dora.waitForFunction(() => document.getElementById('backdrop').classList.contains('hidden'));
  await dora.reload(); await dora.waitForSelector('#f-unlock');
  await dora.fill('#f-unlock [name=pin]', '9999'); await dora.click('#f-unlock button');
  await dora.waitForSelector('#l-msg .err');
  ok('Falsche PIN wird abgelehnt', await dora.isVisible('#lock'));
  await shot(dora, '14-pin');
  await dora.fill('#f-unlock [name=pin]', '1234'); await dora.click('#f-unlock button');
  await dora.waitForSelector('#lock', {state: 'detached'});
  ok('Richtige PIN entsperrt, Anmeldung bleibt erhalten', await dora.isVisible('.hero'));
  await berta.waitForSelector('.hero');
  await berta.waitForFunction(() => loadState === 'ok');
  await berta.click('.fab');
  const opts = await berta.locator('#bform [name=team] option').allTextContents();
  ok('Trainerin kann nur ihr Team buchen', opts.length === 1 && opts[0].includes('Basketball'), opts.join());
  await berta.fill('#bform [name=title]', 'Basketball Training');
  await berta.selectOption('#bform [name=facility]', {label: 'Sporthalle 1'});
  await berta.click('#bform button[type=submit]');
  await berta.waitForSelector('#backdrop.hidden', {state: 'attached'});
  ok('Trainerin bucht erfolgreich', await berta.evaluate(() => db.bookings.some(b => b.title === 'Basketball Training')));
  await berta.goto(base + '#kalender'); await berta.waitForSelector('.mgrid');
  await berta.waitForFunction(() => loadState === 'ok');
  await berta.evaluate(d => { sel.date = d; sel.calMode = 'tag'; route(); }, today);
  await berta.locator('.item', {hasText: 'Training'}).first().waitFor();
  await berta.locator('.item', {hasNotText: 'Basketball'}).first().click();
  await berta.waitForSelector('#bform');
  ok('Fremde Termine nur ansehen', await berta.isDisabled('#bform [name=title]'));
  await berta.click('[data-action=close]');

  // --- Anlage und Team pflegen; Serie löschen ---
  await anna.click('[data-tab=anlagen]');
  await anna.click('[data-action=fac-new]');
  await anna.fill('#f-facility [name=name]', 'Beachplatz');
  await anna.fill('#f-facility [name=parts]', 'Feld West\nFeld Ost');
  await anna.fill('#f-facility [name=combos]', 'Quatsch: Feld Nord');
  await anna.click('#f-facility button[type=submit]');
  await anna.waitForSelector('#s-msg .err');
  ok('Falsche Kombination wird abgefangen', (await anna.textContent('#s-msg')).includes('Unbekannte'));
  await anna.fill('#f-facility [name=combos]', '');
  await shot(anna, '10-anlage');
  await anna.click('#f-facility button[type=submit]');
  await anna.waitForSelector('#backdrop.hidden', {state: 'attached'});
  ok('Neue Anlage erscheint', (await anna.textContent('#app')).includes('Beachplatz'));
  await anna.click('[data-tab=teams]');
  await anna.click('[data-action=team-new]');
  await anna.fill('#f-team [name=name]', 'A-Jugend'); await anna.click('#f-team button[type=submit]');
  await anna.waitForSelector('#backdrop.hidden', {state: 'attached'});
  ok('Neues Team erscheint', (await anna.textContent('#app')).includes('A-Jugend'));
  await anna.evaluate(() => { const b = db.bookings.find(x => x.seriesId); openForm(b); });
  await anna.click('[data-action=del]'); await anna.click('[data-action=delS]');
  await anna.waitForSelector('#backdrop.hidden', {state: 'attached'});
  ok('Serie gelöscht', !(await anna.evaluate(() => db.bookings.some(x => x.seriesId))));

  // --- Farben und Logo ---
  await anna.click('[data-action=settings]');
  await anna.waitForSelector('#f-brand');
  await anna.setInputFiles('#f-brand [name=logo]', path.join(__dirname, '../app/icon-512.png'));
  await anna.waitForSelector('#logoPreview img');
  await anna.locator('#f-brand [name=brand]').evaluate(e => { e.value = '#1d4ed8'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await anna.locator('#f-brand [name=header]').evaluate(e => { e.value = '#fde047'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await shot(anna, '15-aussehen');
  await anna.click('#f-brand button[type=submit]');
  await anna.waitForFunction(() => document.getElementById('backdrop').classList.contains('hidden'));
  await anna.reload(); await anna.waitForSelector('.brand-logo');
  await anna.evaluate(() => { location.hash = '#start'; }); await anna.waitForSelector('.hero');
  const look = await anna.evaluate(() => { const c = getComputedStyle(document.querySelector('.topbar')); return {bg: c.backgroundColor, fg: c.color, w: document.querySelector('.brand-logo').naturalWidth}; });
  ok('Farben und Logo bleiben nach Neuladen', look.bg === 'rgb(253, 224, 71)' && look.w === 256, JSON.stringify(look));
  ok('Schrift auf heller Kopfzeile wird dunkel', look.fg === 'rgb(17, 17, 17)', look.fg);
  await shot(anna, '16-start-logo');
  const peer = await carl.evaluate(() => 1);
  await berta.reload(); await berta.waitForSelector('.brand-logo');
  ok('Logo erscheint auch bei anderen Mitgliedern', true);
  await berta.click('[data-action=settings]'); await berta.waitForSelector('[data-action=delete-ask]');
  ok('Nur Admins sehen die Aussehen-Einstellung', (await berta.locator('#f-brand').count()) === 0);
  await berta.click('[data-action=close]');
  // --- Teilnahme 👍 ❓ 👎 ---
  await anna.evaluate(async d => { const k = TEAMS.find(t => t.name === 'Kendo');
    await insertBookings([{title: 'Kendo-Training', team: k.id, facility: '', unit: '', date: d, start: '18:00', end: '19:30', note: ''}]); await loadAttendance(); }, dateIn(2));
  await carl.goto(base + '#start'); await carl.reload(); await carl.waitForFunction(() => loadState === 'ok' && Object.keys(ATT).length > 0);
  await carl.waitForSelector('.itemwrap .att [data-s=yes]');
  await shot(carl, '17-teilnahme-liste');
  ok('Spieler sieht 👍 ❓ 👎 beim eigenen Mannschaftstermin', (await carl.locator('.itemwrap .att [data-s=yes]').count()) >= 1);
  ok('Keine Abstimm-Knöpfe bei fremden Mannschaften', (await carl.locator('.att [data-action=att]').count()) === (await carl.locator('.itemwrap').filter({hasText: 'Kendo-Training'}).locator('[data-action=att]').count()));
  await carl.locator('.itemwrap').filter({hasText: 'Kendo-Training'}).first().locator('[data-s=yes]').click();
  await carl.waitForFunction(() => Object.values(ATT).some(a => a.mine === 'yes' && a.yes === 1));
  ok('Zusage wird gespeichert und gezählt', (await carl.locator('.itemwrap').filter({hasText: 'Kendo-Training'}).first().textContent()).includes('👍 1'));
  await carl.locator('.itemwrap').filter({hasText: 'Kendo-Training'}).first().locator('[data-s=yes]').click();
  await carl.waitForFunction(() => Object.values(ATT).every(a => a.mine !== 'yes'));
  ok('Erneutes Antippen nimmt die Zusage zurück', true);
  await carl.locator('.itemwrap').filter({hasText: 'Kendo-Training'}).first().locator('[data-s=maybe]').click();
  await carl.waitForFunction(() => Object.values(ATT).some(a => a.mine === 'maybe'));
  await carl.locator('.itemwrap').filter({hasText: 'Kendo-Training'}).first().locator('.item').click();
  await carl.waitForSelector('#attbox .att-row');
  await shot(carl, '18-teilnahme-detail');
  ok('Terminansicht zeigt Namensliste', (await carl.textContent('#attbox')).includes('Carl') && (await carl.textContent('#attbox')).includes('Vielleicht'));
  ok('Spieler kann andere nicht ändern', (await carl.locator('#attbox .att-mini').count()) === 0);
  await carl.click('#attbox .att-mine [data-s=no]');
  await carl.waitForFunction(() => Object.values(ATT).some(a => a.mine === 'no'));
  await carl.waitForFunction(() => document.querySelector('#attbox') && document.querySelector('#attbox').textContent.includes('Abgesagt'));
  ok('Absage aus der Terminansicht', true);
  await carl.click('[data-action=close]');
  ok('Teilnahme ohne Überlauf', await noOverflow(carl));

  const kendoId = await anna.evaluate(() => TEAMS.find(t => t.name === 'Kendo').id);
  await anna.evaluate(id => { location.hash = '#team-' + id; return loadAttendance(); }, kendoId);
  await anna.waitForSelector('.attov-row');
  await shot(anna, '19-trainer-uebersicht');
  ok('Trainer-Übersicht zeigt Zähler', (await anna.textContent('.attov')).includes('👎 1'));
  ok('Mannschaftsseite zeigt Spielerzahl', (await anna.textContent('.teamhead')).includes('1/50'));
  await anna.click('.attov-row');
  await anna.waitForSelector('#attbox .att-mini');
  await anna.click('#attbox .att-mini [data-s=yes]');
  await anna.waitForFunction(() => document.querySelector('#attbox') && document.querySelector('#attbox').textContent.includes('Zugesagt (1)'));
  ok('Admin trägt für Spieler ein', true);
  await anna.click('[data-action=close]');
  await carl.goto(base + '#anlagen-platz');

  // --- Konto ---
  await carl.reload(); await carl.waitForSelector('.tl-track');
  await carl.click('[data-action=settings]'); await carl.waitForSelector('[data-action=delete-ask]');
  await carl.click('[data-action=delete-ask]'); await carl.click('[data-action=delete-do]');
  await carl.waitForSelector('#f-start');
  ok('Konto löschen führt zur Anmeldung', true);
  ok('Keine Skriptfehler im Browser', errs.length === 0, errs.join(' | '));
  await br.close(); srv.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f} bestanden, ${f} fehlgeschlagen`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error('ABBRUCH', e); process.exit(2); });
