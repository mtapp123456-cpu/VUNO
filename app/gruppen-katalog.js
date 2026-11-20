// OrgaMe Gruppen-Katalog (20.11.2026) – Vorlagen für Untergruppen je Sportart
// Grundlage: Vorschau „Untergruppen je Sportart“ (PDF). Vor dem Livegang je Verband prüfen.
//
// Je Sportart:
//   key, name, icon, individual (true = Einzelsport → Gruppen statt Mannschaften),
//   disciplines: Disziplin-Chips (leer = keine Disziplin-Ebene),
//   groups: "Name|Typ|AlterVon|AlterBis|Stufe|Disziplin"
//     Typ: a = Altersklasse, l = Leistungsgruppe, k = Kurs, m = Mannschaft
//     AlterVon/AlterBis leer = offen · Disziplin leer = gilt für alle
(function (global) {
  const SPORTS = [
    { key: 'reiten', name: 'Reiten', icon: '🐴', individual: true,
      disciplines: ['Dressur', 'Springen', 'Vielseitigkeit', 'Voltigieren', 'Fahren', 'Western', 'Distanz', 'Freizeit'],
      groups: ['Führzügel & Longe|k|4|7|RA 10|', 'Reitschule Einsteiger|l|||RA 9–8|', 'Reitschule Fortgeschrittene|l|||RA 7–5|',
        'Jugend|a||17||', 'Junge Reiter|a|18|21||', 'Turniergruppe|l|||LK 5–4|', 'Voltigiergruppe|l|||Gruppe|Voltigieren',
        'Pony-Club|a|6|12||', 'Erwachsene Freizeit|a|40|||Freizeit'] },
    { key: 'kampfsport', name: 'Kampfsport', icon: '🥋', individual: true,
      disciplines: ['Boxen', 'Judo', 'Karate', 'Taekwondo', 'Ringen', 'Kickboxen', 'Ju-Jutsu'],
      groups: ['Schüler U13|a||12||Boxen', 'Kadetten U15|a|13|14||Boxen', 'Junioren U17|a|15|16||Boxen', 'Jugend U19|a|17|18||Boxen',
        'Elite|a|19|39||Boxen', 'Fitnessboxen Ü30|a|30|||Boxen',
        'Judo-Minis U11|a||10||Judo', 'U13|a|11|12||Judo', 'U15|a|13|14||Judo', 'U18|a|15|17||Judo', 'U21|a|18|20||Judo',
        'Gurtgruppe weiß–gelb|l|||9.–8. Kyu|Judo', 'Gurtgruppe orange–grün|l|||7.–5. Kyu|Judo', 'Masters|a|30|||Judo',
        'Kinderkarate|a|6|12||Karate', 'Kata-Team|l|||Kata|Karate', 'Kumite-Team|l|||Kumite|Karate',
        'Taekwondo Kids|a|6|11||Taekwondo', 'Poomsae|l|||Poomsae|Taekwondo', 'Selbstverteidigung Erwachsene|k|18||||'] },
    { key: 'leichtathletik', name: 'Leichtathletik', icon: '🏃', individual: true,
      disciplines: ['Sprint & Hürden', 'Lauf', 'Sprung', 'Wurf', 'Mehrkampf', 'Walking'],
      groups: ['Kinderleichtathletik U8|a|6|7||', 'Kinderleichtathletik U10|a|8|9||', 'Kinderleichtathletik U12|a|10|11||',
        'U14|a|12|13||', 'U16|a|14|15||', 'U18|a|16|17||', 'U20|a|18|19||', 'Aktive|a|20|29||', 'Masters|a|30|||',
        'Lauftreff|l|||offen|Lauf', 'Nordic Walking|k||||Walking'] },
    { key: 'schwimmen', name: 'Schwimmen', icon: '🏊', individual: true,
      disciplines: ['Schwimmen', 'Wasserball', 'Wasserspringen', 'Artistic Swimming', 'Aquafitness'],
      groups: ['Wassergewöhnung|k|4|6||Schwimmen', 'Seepferdchen-Kurs|k|5|7|Seepferdchen|Schwimmen', 'Bronze|l|||Bronze|Schwimmen',
        'Silber & Gold|l|||Silber/Gold|Schwimmen', 'Talentgruppe|l|8|11||Schwimmen', 'Leistungsgruppe|l|12|18||Schwimmen',
        'Masters|a|20|||Schwimmen', 'Aquafitness|k|18|||Aquafitness', 'Wasserball Jugend|m||17||Wasserball', 'Wasserball Aktive|m|18|||Wasserball'] },
    { key: 'turnen', name: 'Turnen & Gymnastik', icon: '🤸', individual: true,
      disciplines: ['Gerätturnen', 'Rhythmische Sportgymnastik', 'Trampolin', 'Rhönrad', 'Akrobatik', 'Fitness & Gesundheit'],
      groups: ['Eltern-Kind-Turnen|k|1|3||', 'Kleinkinderturnen|a|3|6||', 'Kinderturnen|a|6|10||', 'Leistungsriege|l|||Kür|Gerätturnen',
        'Trampolin|l||||Trampolin', 'Rhönrad|l||||Rhönrad', 'Rückenfit|k|18|||Fitness & Gesundheit',
        'Seniorengymnastik|a|60|||Fitness & Gesundheit', 'Rehasport|k||||Fitness & Gesundheit'] },
    { key: 'tennis', name: 'Tennis & Padel', icon: '🎾', individual: false,
      disciplines: ['Tennis', 'Padel'],
      groups: ['Ballschule|k|4|6||Tennis', 'Kleinfeld U9|a||8||Tennis', 'Midcourt U10|a|9|9||Tennis', 'Jugend U12–U18|a|10|17||Tennis',
        'Damen|m|18|||Tennis', 'Herren|m|18|||Tennis', 'Damen 40|m|40|||Tennis', 'Herren 40|m|40|||Tennis',
        'Hobbyrunde|l|||Hobby|Tennis', 'Padel-Treff|l||||Padel'] },
    { key: 'tischtennis', name: 'Tischtennis', icon: '🏓', individual: false, disciplines: [],
      groups: ['Anfänger|l|||Einsteiger|', 'Jugend-Training|a||18||', '1. Mannschaft|m|||', 'Hobby & Freizeit|l|||Hobby|', 'Senioren|a|40|||'] },
    { key: 'badminton', name: 'Badminton', icon: '🏸', individual: false, disciplines: [],
      groups: ['Jugend U11–U19|a|8|18||', 'Mannschaft|m|||', 'Hobby & Freizeit|l|||Hobby|', 'Senioren O35|a|35|||'] },
    { key: 'radsport', name: 'Radsport', icon: '🚴', individual: true,
      disciplines: ['Straße', 'MTB', 'BMX', 'Bahn', 'Kunstrad', 'Radball'],
      groups: ['Laufradgruppe|k|2|5||', 'Kids-MTB|a|6|12||MTB', 'Jugend U15–U19|a|13|18||', 'Elite|a|19|||', 'Masters|a|30|||',
        'Rennrad-Treff|l||||Straße', 'Kunstrad|l||||Kunstrad'] },
    { key: 'schiessen', name: 'Schießsport', icon: '🎯', individual: true,
      disciplines: ['Luftgewehr', 'Luftpistole', 'Kleinkaliber', 'Bogen', 'Lichtpunkt'],
      groups: ['Lichtpunkt-Kids|a|6|11||Lichtpunkt', 'Schüler|a|12|14||', 'Jugend|a|15|16||', 'Junioren|a|17|20||',
        'Damen/Herren|a|21|40||', 'Senioren|a|41|||', 'Rundenwettkampf|m|||', 'Bogengruppe|l||||Bogen'] },
    { key: 'tanzen', name: 'Tanzen', icon: '💃', individual: true,
      disciplines: ['Standard', 'Latein', 'Hip-Hop', 'Jazz & Modern', 'Garde'],
      groups: ['Kindertanz|a|4|10||', 'Jugend|a|11|18||', 'Turnierpaare D|l|||Startklasse D|', 'Turnierpaare C|l|||Startklasse C|',
        'Turnierpaare B–S|l|||Startklasse B–S|', 'Formation|m|||', 'Hobbytanz|k|18|||', 'Garde|m||||Garde'] },
    { key: 'wassersport', name: 'Rudern, Kanu & Segeln', icon: '🚣', individual: true,
      disciplines: ['Rudern', 'Kanu', 'Segeln'],
      groups: ['Anfängerkurs|k|||', 'Kinder & Junioren|a|10|18||', 'Trainingsgruppe|l|||', 'Wanderfahrer|l|||', 'Regattateam|l|||Regatta|', 'Masters|a|27|||'] },
    { key: 'golf', name: 'Golf', icon: '⛳', individual: true, disciplines: [],
      groups: ['Platzreife-Kurs|k|||', 'Jugend|a||18||', 'Damen|a|19|||', 'Herren|a|19|||', 'Senioren AK 50|a|50|||', 'Liga-Team|m|||'] },
    { key: 'gesundheit', name: 'Gesundheitssport', icon: '💚', individual: true, disciplines: [],
      groups: ['Rehasport|k|||', 'Yoga|k|||', 'Pilates|k|||', 'Rückenfit|k|||', 'Herzsport|k|||', 'Sport 60+|a|60|||'] },
    // Mannschaftssportarten: bleiben bei Mannschaften, Vorlagen nur zum schnelleren Anlegen
    { key: 'fussball', name: 'Fußball', icon: '⚽', individual: false, disciplines: [],
      groups: ['Bambini|m|5|6||', 'F-Jugend|m|7|8||', 'E-Jugend|m|9|10||', 'D-Jugend|m|11|12||', 'C-Jugend|m|13|14||',
        'B-Jugend|m|15|16||', 'A-Jugend|m|17|18||', '1. Mannschaft|m|||', '2. Mannschaft|m|||', 'Frauen|m|||', 'Alte Herren Ü32|m|32|||', 'Walking Football|k|50|||'] },
    { key: 'handball', name: 'Handball', icon: '🤾', individual: false, disciplines: [],
      groups: ['Minis|m||7||', 'E-Jugend|m|8|9||', 'D-Jugend|m|10|11||', 'C-Jugend|m|12|13||', 'B-Jugend|m|14|15||', 'A-Jugend|m|16|17||', 'Aktive|m|||', 'Alte Herren|m|32|||'] },
    { key: 'basketball', name: 'Basketball', icon: '🏀', individual: false, disciplines: [],
      groups: ['U10|m||9||', 'U12|m|10|11||', 'U14|m|12|13||', 'U16|m|14|15||', 'U18|m|16|17||', 'Herren|m|||', 'Damen|m|||', 'Ü35|m|35|||', '3x3|m|||'] },
    { key: 'volleyball', name: 'Volleyball', icon: '🏐', individual: false, disciplines: ['Halle', 'Beach'],
      groups: ['U12–U14|m|10|13||Halle', 'U16–U20|m|14|19||Halle', 'Damen|m|||Halle', 'Herren|m|||Halle', 'Mixed Hobby|m|||Halle', 'Beach-Team|m||||Beach'] }
  ];

  const TYPES = { a: 'altersklasse', l: 'leistung', k: 'kurs', m: 'mannschaft' };
  const TYPE_LABEL = { altersklasse: 'Altersklasse', leistung: 'Leistungsgruppe', kurs: 'Kurs', mannschaft: 'Mannschaft' };

  function num(v) { return v === '' || v == null ? null : Number(v); }

  function parse(line) {
    const [name, t, aMin, aMax, level, discipline] = String(line).split('|');
    return { name, group_type: TYPES[t] || 'mannschaft', age_min: num(aMin), age_max: num(aMax),
      level: level || '', discipline: discipline || '' };
  }

  // Jahrgänge aus Alter von/bis für ein Stichjahr (Standard: aktuelles Jahr) – rückt am 1.1. weiter
  function jahrgaenge(ageMin, ageMax, year) {
    const y = year || new Date().getFullYear();
    if (ageMin == null && ageMax == null) return '';
    if (ageMin != null && ageMax != null) return 'Jg. ' + (y - ageMax) + '–' + (y - ageMin);
    if (ageMin != null) return 'Jg. ' + (y - ageMin) + ' und älter';
    return 'Jg. ' + (y - ageMax) + ' und jünger';
  }

  function altersText(ageMin, ageMax) {
    if (ageMin != null && ageMax != null) return ageMin === ageMax ? ageMin + ' Jahre' : ageMin + '–' + ageMax + ' Jahre';
    if (ageMin != null) return 'ab ' + ageMin + ' Jahre';
    if (ageMax != null) return 'bis ' + ageMax + ' Jahre';
    return '';
  }

  // Sportart zu einem Abteilungsnamen finden (z. B. „Reiten“, „Boxen“ → Kampfsport)
  const ALIASES = { boxen: 'kampfsport', judo: 'kampfsport', karate: 'kampfsport', kendo: 'kampfsport', taekwondo: 'kampfsport',
    ringen: 'kampfsport', pferdesport: 'reiten', reitsport: 'reiten', voltigieren: 'reiten', turnen: 'turnen',
    gymnastik: 'turnen', schützen: 'schiessen', 'schützenverein': 'schiessen', bogensport: 'schiessen', rudern: 'wassersport',
    kanu: 'wassersport', segeln: 'wassersport', laufen: 'leichtathletik', triathlon: 'leichtathletik', padel: 'tennis' };

  function findSport(departmentName) {
    const n = String(departmentName || '').toLowerCase().trim();
    if (!n) return null;
    const direct = SPORTS.find(s => s.key === n || s.name.toLowerCase() === n || s.name.toLowerCase().startsWith(n));
    if (direct) return direct;
    const alias = Object.keys(ALIASES).find(a => n.includes(a));
    if (alias) return SPORTS.find(s => s.key === ALIASES[alias]);
    return SPORTS.find(s => n.includes(s.key)) || null;
  }

  function templates(sportKey, discipline) {
    const s = SPORTS.find(x => x.key === sportKey);
    if (!s) return [];
    return s.groups.map(parse).filter(g => !discipline || !g.discipline || g.discipline === discipline);
  }

  global.OrgaMeGruppen = { SPORTS, TYPE_LABEL, parse, jahrgaenge, altersText, findSport, templates };
})(typeof window !== 'undefined' ? window : globalThis);
