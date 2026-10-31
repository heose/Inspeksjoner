'use strict';
/* Argus – offline inspeksjonsapp. Data lagres i IndexedDB på enheten. */

/* ---------- Sjekklister ---------- */
const yn  = (id, label, o = {}) => ({ id, type: 'yn', label, ...o });
const ok  = (id, label, o = {}) => ({ id, type: 'ok', label, ...o });
const okm = (id, label, o = {}) => ({ id, type: 'okm', label, ...o });
const num = (id, label, unit, o = {}) => ({ id, type: 'number', label, unit, ...o });
const txt = (id, label, o = {}) => ({ id, type: 'text', label, ...o });
const dat = (id, label, o = {}) => ({ id, type: 'date', label, ...o });
const cho = (id, label, options, o = {}) => ({ id, type: 'choice', label, options, ...o });
const mul = (id, label, options, o = {}) => ({ id, type: 'multi', label, options, ...o });
const hd  = (id, label) => ({ id, type: 'heading', label });
const inf = (id, label) => ({ id, type: 'info', label });
const k12 = id => yn(id, 'Er det mindre enn 12 mnd siden siste sakkyndige kontroll?', { help: 'Hvis Nei: opprett handling og bestill service.' });

const vkBase = press => [
  ok('hovedventil', 'Hovedventil låst?'),
  ok('turbin', 'Turbinklokke ok?'),
  num('trykk_over', 'Trykk over', 'bar', { help: 'Ta gjerne bilde av loggboka.' }),
  num('trykk_under', 'Trykk under', 'bar'),
  ...(press ? [ok('press1', 'Alarmoverføring pressostat 1'), ok('press2', 'Alarmoverføring pressostat 2')] : []),
];
const ALARMINFO = 'Sør-Øst 110 varsles på 3304110 før test. Brannsentralen skal være i normal drift og uten feilmeldinger. Utkoblinger skal være loggført og med beskrivelse av årsak.';
const nokkelBlock = () => [hd('h_nokkel', 'Nøkkelboks'), yn('nokler', 'Har du husket å vri nøkler til normalposisjon?')];
const alarmBlock = () => [hd('h_alarm', 'Alarmtavle'), inf('alarminfo', ALARMINFO), ok('sentral', 'Brannsentral ok'), ok('overforing', 'Alarmoverføring')];
const vkTail = () => [...nokkelBlock(), ...alarmBlock()];

const uke = o => [
  ...o.vent,
  ok('innelys', 'Innelys er i orden'),
  ok('utelys', 'Utelys er i orden'),
  ...(o.glykol ? [ok('glykol', 'Det er trykk i glykolkurs/trykkvann til varme', { help: 'Etterfyll om nødvendig.' })] : []),
  ok('sikringer', 'Alle sikringer ligger inne', { help: 'Sikringer som er frakoblet skal være tapet / merket. Tavlerom skal være ryddig.' }),
  ok('branntavle', 'Branntavle er fri for feil og utkoblinger', { help: 'Hvis utkoblinger: velg utkobling og noter nummer.' }),
  ok('nodlys', 'Nød- og ledelys er i orden', { help: 'Ved feil, opprett handling; noter nummer på lampe, og ta bilde.' }),
  ok('sprinklerrom', 'Sprinklerrom er ok, ingen synlige lekkasjer', { help: 'Sjekk at det er trykk på manometer.' }),
  ...(o.menerga ? [ok('menerga', 'Sjekk vann i Menerga anlegg', { help: 'Det skal være åpent og kunne renne ut av rør mot sluk. Sjekk evt. luke i vent.anlegg.' })] : []),
  ok('varemottak', 'Varemottak er ryddig og lite bøss'),
  ok('uteomrade', 'Uteområdet er ryddig'),
  ok('skader', 'Bygget er fri for skader', { help: 'Ta bilde av bygningsskade om du er i tvil om noe er nytt eller gammelt, og opprett handling.' }),
  ok('kamera', 'Kameraovervåkning er i orden på alle kameraene', { help: 'Dersom noen mangler, restart maskin.' }),
  txt('andre', 'Andre observasjoner som ikke passer inn i kategoriene over', { suggestOn: 'any', help: 'Ta bilde og opprett handling.' }),
  yn('skjema', 'Er det noe annet som bør legges til i dette skjemaet?', { flag: [], neutral: true }),
];
const svc = (p, o = {}) => [
  ok(p + '_ok', o.q || 'Kontroller at service intervaller følges og utstyret fungerer?', o.help ? { help: o.help } : {}),
  txt(p + '_lev', o.lev || 'Navn på service leverandør', { carry: true }),
  dat(p + '_dato', o.dato || 'Dato for siste eksterne kontroll', { carry: true, yearly: true }),
];

const TEMPLATES = [
  {
    id: 'internkontroll', name: 'Periodisk internkontroll', site: 'Olsrød Park – Teknisk', months: 1,
    sections: [
      { id: 'endringer', title: 'Strukturelle og funksjonelle endringer i bygget', items: [
        yn('ombygg', 'Er det foretatt ombygninger av lokaler eller bygget siden forrige inspeksjon?', { flag: ['Ja'] }),
        txt('lokale', 'I hvilket lokale er ombygning utført?', { showIf: { item: 'ombygg', eq: 'Ja' } }),
        cho('arbeid', 'Hva slags arbeider er gjort?', ['Flytting av vegger', 'Nye gjennomføringer', 'Endring av dører', 'Annet'], { showIf: { item: 'ombygg', eq: 'Ja' } }),
        yn('egenregi', 'Skal det gjøres ferdigstillende arbeider i egen regi?', { flag: [], suggestOn: ['Ja'], help: 'Hvis Ja: opprett handling.', showIf: { item: 'ombygg', eq: 'Ja' } }),
        yn('brannceller', 'Kan endringene ha påvirket branncellebegrensende konstruksjoner?', { flag: ['Ja'], showIf: { item: 'ombygg', eq: 'Ja' } }),
        txt('entreprenor', 'Utførende entreprenør', { suggestOn: 'any', help: 'Entreprenøren bes sende dokumentasjon på at brannsikkerhetskrav er ivaretatt. Opprett handling med dato for oppfølging.', showIf: { item: 'brannceller', eq: 'Ja' } }),
        dat('befaring', 'Dato for befaring med entreprenør når arbeidene er ferdigstilt', { showIf: { item: 'ombygg', eq: 'Ja' } }),
      ] },
      { id: 'brann', title: 'Brann', items: [yn('tavle', 'Branntavle OK?'), k12('k12')] },
      { id: 'sprinkler', title: 'Sprinkleranlegg', items: [
        yn('finnes', 'Er det sprinkleranlegg i bygget?', { flag: [] }),
        yn('merket', 'Adgang til sprinkleranlegg er merket på dør', { showIf: { item: 'finnes', ne: 'Nei' } }),
        yn('ryddig', 'Sprinklerrom er ryddig og i orden', { showIf: { item: 'finnes', ne: 'Nei' } }),
        yn('ventiler', 'Stengeventiler er sikret/låst og merket', { showIf: { item: 'finnes', ne: 'Nei' } }),
        yn('loggbok', 'Loggbok er oppdatert og uten merknader', { showIf: { item: 'finnes', ne: 'Nei' } }),
        { ...k12('k12'), showIf: { item: 'finnes', ne: 'Nei' } },
      ] },
      { id: 'romning', title: 'Rømningsveier', items: [yn('ok', 'Er rømningsveier kontrollert og funnet i orden?')] },
      { id: 'ledelys', title: 'Markeringslys / ledelys', items: [
        yn('ok', 'Er markeringslys/ledelys OK?'),
        yn('avvik', 'Er det laget avvik?', { showIf: { item: 'ok', eq: 'Nei' } }),
      ] },
      { id: 'slokke', title: 'Håndslokkeapparater', items: [yn('ok', 'Er slokkeapparat sjekket og funnet i orden?'), k12('k12')] },
      { id: 'slanger', title: 'Brannslanger', items: [yn('ok', 'Er brannslangene sjekket og funnet i orden?'), k12('k12')] },
      { id: 'royk', title: 'Røykventilasjon / branngardiner', items: [yn('ok', 'Er røykventilasjon/branngardiner sjekket og funnet i orden?'), k12('k12')] },
      { id: 'dorer', title: 'Branndører og porter', items: [yn('ok', 'Er branndører og porter sjekket og funnet i orden?'), k12('k12')] },
    ],
  },
  {
    id: 'sprinkel_vk', name: 'Brann og sprinkeltest VK/SVK', site: 'Vekterkvartalet – Teknisk', months: 1,
    sections: [
      { id: 'forberedelse', title: 'Før testen', items: [
        inf('lokal', 'Husk å vri om nøkkel på gul boks ved lokal test. Ved lokal test skal GUL lampe på testboks lyse og GRØNN lampe indikerer vellykket test. Turbinklokke skal være uten lekkasje. Hovedventil skal være låst, men mulighet for å åpnes uten nøkkel (strips, lenke etc.).'),
        inf('utkobling', 'Start med å koble ut følgende i 1 time: Summer på panel, Sprinklervakt næring 01.123, Sprinklervakt leiligheter 01.124.'),
      ] },
      { id: 'sted', title: 'Hvilket sted', items: [mul('hvor', 'Hvor testes det?', ['Næring', 'Leiligheter trinn 1-3', 'Leiligheter trinn 4'])] },
      { id: 'naering', title: 'Næring', showIf: { item: 'sted.hvor', includes: 'Næring' }, items: [...vkBase(true), ...vkTail()] },
      { id: 'leil13', tl: 'svk', title: 'SVK bolig trinn 1-3', showIf: { item: 'sted.hvor', includes: 'Leiligheter trinn 1-3' }, items: [...vkBase(false), ...vkTail()] },
      { id: 'leil4', tl: 'svk', title: 'SVK bolig trinn 4', showIf: { item: 'sted.hvor', includes: 'Leiligheter trinn 4' }, items: [
        ...vkBase(false),
        hd('h_varme', 'Varmekabel sprinkler'),
        yn('sept_april', 'Er måneden i perioden sept–april?', { flag: [], neutral: true, auto: 'septApril' }),
        yn('varmekabel', 'Er test ok på både VK1 og VK2?', { showIf: { item: 'sept_april', eq: 'Ja' } }),
        ...vkTail(),
      ] },
      { id: 'innkobling', title: 'Innkobling', items: [yn('summer', 'Koble inn summer på panel', { help: 'Bekreft at summer er koblet inn igjen.' })] },
    ],
  },
  {
    id: 'kloakk', name: 'Kloakktest', site: 'Olsrød Park – Teknisk', months: 1,
    sections: [
      { id: 'kum', title: 'Kloakkum', repeat: true, unit: 'Kum', defaultCount: 2, items: [
        cho('sted', 'Hvor testes det?', ['Gammel del', 'Level'], { allowOther: true }),
        ok('tilstand', 'Generell tilstand i kum'),
        ok('pumper', 'Funksjonstest pumper', { help: 'Kjør pumper manuelt i minst 30 sek.' }),
        yn('arskontroll', 'Har det vært årskontroll siden forrige månedlige test?', { flag: [], neutral: true }),
        yn('auto', 'Er pumper satt tilbake i AUTO?'),
      ] },
    ],
  },
  {
    id: 'vernerunde', name: 'Vernerunde kvartalsvis', site: 'Sameiet VK, Vekterkvartalet – Teknisk', months: 3,
    sections: [
      { id: 'nodlys', title: 'Nødlys', items: [okm('ok', 'Nødlys kontrollert og funnet i orden?', { help: 'Utføres egen kontroll av nødlys: velg Merknad og skriv i notat.' })] },
      { id: 'elektro', title: 'Elektro – sikringsskap og tavler', items: [ok('tavler', 'Visuell kontroll av sikringsskapene og sjekk rundt i tavlerom')] },
      { id: 'slukke', title: 'Slukkeutstyr', items: [
        yn('handslokkere', 'Håndslokkere kontrollert og funnet i orden?'),
        yn('slanger', 'Brannslanger kontrollert og funnet i orden?'),
        yn('frost', 'Dersom i kuldeperiode: sjekk også frostvakter i brannskap. Sjekket ok?'),
      ] },
      { id: 'romning', title: 'Rømningsveier', items: [yn('frie', 'Er rømningsveier frie og uten lagring?')] },
      { id: 'hjerte', title: 'Hjertestarter', items: [
        ok('ok', 'Kontroller at hjertestarter er i orden'),
        dat('batteri', 'Utløpsdato batteri', { expiry: true }),
        dat('pads', 'Datostempling pads/elektroder', { expiry: true }),
      ] },
      { id: 'andre', title: 'Andre observasjoner', items: [
        hd('h_orden', 'Orden og renhold'),
        ok('rent', 'Er det rent og ryddig?'),
        ok('kilde', 'Fungerer kildesorteringen?'),
        ok('utvendig', 'Sjekk bygg for skader utvendig'),
        yn('andre', 'Andre observasjoner som ikke passer inn i kategoriene over?', { flag: ['Ja'], help: 'Ta bilde og opprett handling.' }),
        yn('skjema', 'Er det noe annet som bør legges til i dette skjemaet?', { flag: [], neutral: true }),
      ] },
    ],
  },
  {
    id: 'sprinkel_op', name: 'Brann og sprinkeltest OP', site: 'Olsrød Park – Teknisk', months: 1,
    sections: [
      { id: 'sprinkler', title: 'Sprinkleranlegg', items: [ok('summer', 'Er summer koblet ut før test?')] },
      { id: 'sted', title: 'Hvilket sted', items: [mul('hvor', 'Hvor testes det?', ['Næring ny del', 'Leiligheter ny del', 'Næring gammel del'])] },
      { id: 'naering_ny', title: 'Næring ny del', showIf: { item: 'sted.hvor', includes: 'Næring ny del' }, items: [...vkBase(true), ...nokkelBlock(), ...alarmBlock()] },
      { id: 'leil_ny', title: 'Bolig', showIf: { item: 'sted.hvor', includes: 'Leiligheter ny del' }, items: [...vkBase(false), ...nokkelBlock(), ...alarmBlock()] },
      { id: 'naering_gml', title: 'Næring gammel del', showIf: { item: 'sted.hvor', includes: 'Næring gammel del' }, items: [...vkBase(true)] },
    ],
  },
  {
    id: 'sprinkel_tb', name: 'Sprinkeltest Tollbodgata 14', site: 'Tollbodgata 14', months: 1,
    sections: [
      { id: 'sprinkler', title: 'Sprinkleranlegg', items: [
        inf('info', 'Husk å vri om nøkler på grå boks ved lokal test. Ved lokal test skal GUL lampe på testboks lyse og RØD lampe indikerer vellykket test. Turbinklokke skal være uten lekkasje. Hovedventil skal være låst, men mulighet for å åpnes uten nøkkel (strips, lenke etc.).'),
      ] },
      { id: 'vatventil', title: 'Våtventil', items: [
        ok('hovedventil', 'Hovedventil låst?'), ok('turbin', 'Turbinklokke ok?'),
        num('over', 'Overtrykk', 'bar'), num('under', 'Undertrykk', 'bar'),
        ok('press1', 'Alarmoverføring pressostat 1'), ok('press2', 'Alarmoverføring pressostat 2'),
      ] },
      { id: 'torrventil', title: 'Tørr ventil', items: [
        ok('hovedventil', 'Hovedventil låst?'), ok('turbin', 'Turbinklokke ok?'),
        num('over', 'Overtrykk', 'bar'), num('under_vann', 'Undertrykk vann', 'bar'),
        num('under_luft', 'Undertrykk luft', 'bar'), num('trykk_luft', 'Trykk luft', 'bar'),
        ok('overforing', 'Alarmoverføring tørrventil'),
      ] },
      { id: 'kompressor', title: 'Kompressor', items: [
        ok('drift', 'Drift kompressor'), num('trykk', 'Kompressor trykk', 'bar'), ok('drenering', 'Drenering vann kompressor'),
      ] },
      { id: 'alarmtavle', title: 'Alarmtavle', items: [inf('info', ALARMINFO)] },
      { id: 'brannsentral', title: 'Brannsentral', items: [
        ok('sentral', 'Brannsentral Røde Kors'), ok('branntavle', 'Branntavle leiligheter. Visuell kontroll'), ok('overforing', 'Alarmoverføring til Sør-Øst 110'),
      ] },
      { id: 'nokkelboks', title: 'Nøkkelboks', items: [yn('nokler', 'Har du husket å vri nøkler til normalposisjon?')] },
      { id: 'nodlys', title: 'Nødlys', items: [yn('ok', 'Er nødlys sjekket og funnet i orden?')] },
    ],
  },
  {
    id: 'op_ukentlig', name: 'Ukentlig sjekkrunde OP', site: 'Olsrød Park – Teknisk', days: 7,
    sections: [{ id: 'runde', title: 'Inspeksjon', items: [
      inf('intro', 'Under hvert punkt kan det opprettes handlinger eller legges til bilder ved observasjoner.'),
      ...uke({ vent: [ok('vent', 'Ventilasjon er i orden, ingen feilmeldinger eller uventet stans')], glykol: true, menerga: true }),
    ] }],
  },
  {
    id: 'vk_ukentlig', name: 'Ukentlig sjekkrunde VK', site: 'Vekterkvartalet – Teknisk', days: 7,
    sections: [{ id: 'runde', title: 'Inspeksjon', items: [
      inf('intro', 'Under hvert punkt kan det opprettes handlinger eller legges til bilder ved observasjoner.'),
      ...uke({ vent: [
        hd('h_vent', 'Ventilasjon'),
        inf('ventinfo', 'Sjekk at ventilasjon er i orden, ingen feilmeldinger eller uventet stans.'),
        ok('vent1', 'Ventilasjon senter og legesenter 36.08 og 36.09'),
        ok('vent2', 'Ventilasjon tak 36.10, 36.11, 36.12, 36.13'),
        ok('vent3', 'Ventilasjon kjeller (Yaku) 36.06'),
      ] }),
    ] }],
  },
  {
    id: 'vernerunde_halvar', name: 'Vernerunde halvårlig', site: 'Vekterkvartalet – Teknisk', months: 6,
    sections: [
      { id: 'elektro', title: 'Elektro', items: [
        hd('h_vent', 'Ventilasjon'),
        ...svc('vent', { q: 'Ventilasjon: Kontroller at service intervaller følges og utstyret fungerer?' }),
        hd('h_tavler', 'Sikringsskap og tavler'),
        ...svc('tavler', { q: 'Visuell kontroll av sikringsskapene og sjekk rundt i tavlerom.', lev: 'Navn på service/kontroll leverandør' }),
      ] },
      { id: 'teknisk', title: 'Teknisk', items: [
        hd('h_rulle', 'Rulletrapp'),
        ...svc('rulle', { dato: 'Dato for siste kontroll' }),
        hd('h_heis', 'Heis'),
        ...svc('heis'),
      ] },
      { id: 'brannvern', title: 'Brannvern', items: [
        hd('h_nodlys', 'Nødlys'),
        ok('nodlys_ok1', 'Kontroller at service intervaller følges og utstyret fungerer.', { help: 'Det er ikke intensjonen i denne inspeksjonen å sjekke alle nødlys, men heller kontrollere at de rutinemessige kontrollene fungerer.' }),
        ...svc('nodlys', { q: 'Kontroller at service intervaller følges.', dato: 'Dato for siste kontroll' }),
        txt('nodlys_egen', 'Siste egenkontroll utført av', { carry: true }),
        dat('nodlys_egendato', 'Dato for egenkontroll', { carry: true }),
        hd('h_slokk', 'Håndslukkere og brannslanger'),
        inf('slokk_info1', 'Brannslukkere: Kontroller at plomberingen er intakt, trykkmåleren er i det grønne området, og at apparatet er lett tilgjengelig. Gummislange skal være uten sprekker.'),
        inf('slokk_info2', 'Brannslanger: Sjekk at munnstykket fungerer og beveg kuleventil for åpning et par ganger for å sjekke funksjon. Sjekk at det ikke lekker i skap ved åpen ventil.'),
        ...svc('slokk'),
        inf('slokk_frost', 'Dersom i kuldeperiode: sjekk også frostvakter i brannskap.'),
        hd('h_ovelse', 'Brannøvelser'),
        dat('ovelse_dato', 'Dato for siste gjennomføring', { carry: true }),
        hd('h_spr', 'Sprinkleranlegg'),
        ok('spr_ok1', 'Kontroller at service intervaller følges og utstyret fungerer?', { help: 'Hvis loggbok på papir, ta bilde og legg ved.' }),
        txt('spr_lev', 'Navn på service leverandør', { carry: true }),
        dat('spr_dato', 'Dato for siste kontroll', { carry: true, yearly: true }),
        ok('spr_ok2', 'Kontroller at service intervaller følges og utstyret fungerer?', { help: 'Hvis loggbok på papir, ta bilde og legg ved.' }),
        txt('spr_kontrollor', 'Navn på uavhengig kontrollør', { carry: true }),
        dat('spr_dato2', 'Dato for siste kontroll', { carry: true, yearly: true }),
        dat('spr_egen', 'Dato for siste egenkontroll', { carry: true }),
        yn('spr_logg', 'Bilde av loggbok lagt ved?', { flag: [], neutral: true, help: 'Bruk Bilde-knappen.' }),
        hd('h_dorer', 'Branndører / Rømningsveier'),
        inf('dorer_info', 'Lukk døren ved å trykke på magnetutløser på branndør og sjekk at alle dørbladene lukker tilfredsstillende. Betjen panikkbeslag for åpning. Rømningsveier skal være frie for lagring, også utenfor normalt lukket branndør.'),
        ok('dorer_ok', 'Kontroller at rømningsveier er frie og at utstyret fungerer?'),
        hd('h_merk', 'Brannmerking'),
        inf('merk_info', 'Kontroller at brannskilt er hele og synlige. Kontroller at orienteringsplaner og branninstrukser er montert på strategiske steder.'),
        ok('merk_ok', 'Kontroller at brannskilt er hele og synlige.'),
        hd('h_hjerte', 'Hjertestarter'),
        inf('hjerte_info', 'Kontroller at hjertestarter er i orden og at boks for tilbehør er tilstede. Boks skal inneholde klut, saks, barberhøvel, pocketmask.'),
        ok('hjerte_ok', 'Kontroller at hjertestarter er i orden'),
        dat('batteri', 'Utløpsdato batteri', { expiry: true, carry: true }),
        dat('pads', 'Datostempling pads/elektroder', { expiry: true, carry: true }),
      ] },
      { id: 'diverse', title: 'Diverse', items: [
        hd('h_vvs', 'VVS-anlegg'),
        inf('vvs_info', 'Sjekk taksluk og se etter andre skader og mangler på rom som har VVS-tilknytning.'),
        ok('vvs_ok', 'Kontrollert og ok'),
        hd('h_orden', 'Orden og renhold'),
        inf('orden_info', 'Sjekk at kildesortering fungerer og at det er tilstrekkelig med beholdere slik at det ikke blir plassert søppel på utsiden.'),
        ok('rent', 'Er det rent og ryddig?'),
        ok('kilde', 'Fungerer kildesorteringen?'),
        ok('utvendig', 'Sjekk bygg for skader utvendig'),
        hd('h_annet', 'Annet'),
        txt('merknader', 'Andre merknader eller funn', { suggestOn: 'any' }),
      ] },
    ],
  },
];
TEMPLATES.push({
  id: 'avvik', name: 'Avviksmelding', site: '', hidden: true,
  sections: [{ id: 'avvik', title: 'Avvik', items: [{ id: 'feil', type: 'avvik', label: 'Beskriv avviket', help: 'Ta bilde og skriv i handlingen hva som må gjøres. Handlingen blir et kort i Trello når du fullfører.' }] }],
});
TEMPLATES.push({
  id: 'halvar_op', name: 'Halvårlig servicesjekk OP', site: 'Olsrød Park – Teknisk', months: 6,
  sections: [
    { id: 'heis1', title: 'Heis 1', items: svc('s', { help: 'Sjekk serviceboka/loggen i maskinrom eller heisstol.' }) },
    { id: 'heis2', title: 'Heis 2', items: svc('s', { help: 'Sjekk serviceboka/loggen i maskinrom eller heisstol.' }) },
    { id: 'rulle', title: 'Rulletrapp', items: svc('s', { dato: 'Dato for siste kontroll' }) },
  ],
});
const ORDER = ['internkontroll', 'sprinkel_op', 'kloakk', 'op_ukentlig', 'halvar_op', 'sprinkel_vk', 'vk_ukentlig', 'vernerunde', 'vernerunde_halvar', 'sprinkel_tb'];
TEMPLATES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
const TRELLO = { board: '69fd92b5f73c4c4645f0a9b2', lists: { olsrod: '69fd92efa0fbbbd4a10fc0ee', vk: '69fd92f5a4757aaa7dcfef02', svk: '6ae5a990f8db6f1ba0c7970f', tb: '6ae5a995305871414c09e581' } };
const TLIST = { internkontroll: 'olsrod', sprinkel_op: 'olsrod', kloakk: 'olsrod', op_ukentlig: 'olsrod', halvar_op: 'olsrod', sprinkel_vk: 'vk', vk_ukentlig: 'vk', vernerunde_halvar: 'vk', vernerunde: 'svk', sprinkel_tb: 'tb' };
TEMPLATES.forEach(t => { t.tl = TLIST[t.id]; });
const listKey = (ins, key) => { const t = TPL[ins.templateId]; return ins.tl || findItem(t, key).sec?.tl || t.tl; };
const TPL = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));
/* ---------- Anleggsregister ----------
   Hvert anlegg peker på punktene i sjekklistene som kontrollerer det: [mal, [nøkler]].
   En nøkkel er 'seksjon' (hele seksjonen) eller 'seksjon.punkt'. Tillegg: x = punkter som ikke teller,
   w = bare instanser der et svar er lik en verdi (kloakkum). */
const SITES = [
  { id: 'op', tl: 'olsrod', name: 'Olsrød Park', short: 'OP', tpls: ['op_ukentlig', 'internkontroll', 'sprinkel_op', 'kloakk', 'halvar_op'] },
  { id: 'vk', tl: 'vk', name: 'Vekterkvartalet', short: 'VK', tpls: ['vk_ukentlig', 'sprinkel_vk', 'vernerunde_halvar'] },
  { id: 'svk', tl: 'svk', name: 'Sameiet VK', short: 'SVK', tpls: ['sprinkel_vk', 'vernerunde'] },
  { id: 'tb', tl: 'tb', name: 'Tollbodgata 14', short: 'TB', tpls: ['sprinkel_tb'] },
];
const ALARM = ['h_nokkel', 'nokler', 'h_alarm', 'alarminfo', 'sentral', 'overforing'];
const sv = (sec, p) => ['_ok', '_lev', '_dato'].map(x => sec + '.' + p + x);
const R = (...ids) => ids.map(i => 'runde.' + i);
const ANLEGG = [
  ['op', 'op_brann', 'Brannalarmanlegg', 'Brannsentral, alarmoverføring og nøkkelboks', [['op_ukentlig', R('branntavle')], ['internkontroll', ['brann']], ['sprinkel_op', ['naering_ny', 'leil_ny'].flatMap(s => ALARM.map(i => s + '.' + i))]]],
  ['op', 'op_spr_ny', 'Sprinkleranlegg – næring ny del', '', [['sprinkel_op', ['sprinkler', 'naering_ny'], { x: ALARM }], ['op_ukentlig', R('sprinklerrom')], ['internkontroll', ['sprinkler']]]],
  ['op', 'op_spr_bolig', 'Sprinkleranlegg – bolig', '', [['sprinkel_op', ['leil_ny'], { x: ALARM }]]],
  ['op', 'op_spr_gml', 'Sprinkleranlegg – næring gammel del', '', [['sprinkel_op', ['naering_gml']]]],
  ['op', 'op_nodlys', 'Nød- og ledelys', 'Årskontroll: Xpert installasjon', [['op_ukentlig', R('nodlys')], ['internkontroll', ['ledelys']]]],
  ['op', 'op_romning', 'Rømningsveier', '', [['internkontroll', ['romning']]]],
  ['op', 'op_slokke', 'Håndslokkeapparater', '', [['internkontroll', ['slokke']]]],
  ['op', 'op_slanger', 'Brannslanger', '', [['internkontroll', ['slanger']]]],
  ['op', 'op_royk', 'Røykventilasjon og branngardiner', '', [['internkontroll', ['royk']]]],
  ['op', 'op_dorer', 'Branndører og porter', '', [['internkontroll', ['dorer']]]],
  ['op', 'op_kloakk_gml', 'Kloakkum og pumper – gammel del', '', [['kloakk', ['kum'], { w: ['sted', 'Gammel del'] }]]],
  ['op', 'op_kloakk_level', 'Kloakkum og pumper – Level', '', [['kloakk', ['kum'], { w: ['sted', 'Level'] }]]],
  ['op', 'op_vent', 'Ventilasjon', '', [['op_ukentlig', R('vent')]]],
  ['op', 'op_varme', 'Varmeanlegg', 'Glykolkurs og trykkvann', [['op_ukentlig', R('glykol')]]],
  ['op', 'op_menerga', 'Menerga-anlegg', '', [['op_ukentlig', R('menerga')]]],
  ['op', 'op_el', 'El-tavler og sikringer', '', [['op_ukentlig', R('sikringer')]]],
  ['op', 'op_lys', 'Belysning inne og ute', '', [['op_ukentlig', R('innelys', 'utelys')]]],
  ['op', 'op_kamera', 'Kameraovervåking', '', [['op_ukentlig', R('kamera')]]],
  ['op', 'op_heis1', 'Heis 1', '', [['halvar_op', ['heis1']]]],
  ['op', 'op_heis2', 'Heis 2', '', [['halvar_op', ['heis2']]]],
  ['op', 'op_rulle', 'Rulletrapp', '', [['halvar_op', ['rulle']]]],
  ['op', 'op_bygg', 'Bygg, uteområde og varemottak', '', [['op_ukentlig', R('varemottak', 'uteomrade', 'skader', 'andre')], ['internkontroll', ['endringer']]]],

  ['vk', 'vk_brann', 'Brannalarmanlegg', 'Brannsentral, alarmoverføring og nøkkelboks', [['vk_ukentlig', R('branntavle')], ['sprinkel_vk', ['innkobling', ...['naering', 'leil13', 'leil4'].flatMap(s => ALARM.map(i => s + '.' + i))]]]],
  ['vk', 'vk_spr', 'Sprinkleranlegg – næring', '', [['sprinkel_vk', ['naering'], { x: ALARM }], ['vk_ukentlig', R('sprinklerrom')], ['vernerunde_halvar', ['spr_ok1', 'spr_lev', 'spr_dato', 'spr_ok2', 'spr_kontrollor', 'spr_dato2', 'spr_egen', 'spr_logg'].map(i => 'brannvern.' + i)]]],
  ['vk', 'vk_nodlys', 'Nød- og ledelys', '', [['vk_ukentlig', R('nodlys')], ['vernerunde_halvar', ['brannvern.nodlys_ok1', ...sv('brannvern', 'nodlys'), 'brannvern.nodlys_egen', 'brannvern.nodlys_egendato']]]],
  ['vk', 'vk_vent', 'Ventilasjon', '36.06, 36.08–36.13', [['vk_ukentlig', R('vent1', 'vent2', 'vent3')], ['vernerunde_halvar', sv('elektro', 'vent')]]],
  ['vk', 'vk_el', 'El-tavler og sikringer', '', [['vk_ukentlig', R('sikringer')], ['vernerunde_halvar', sv('elektro', 'tavler')]]],
  ['vk', 'vk_rulle', 'Rulletrapp', '', [['vernerunde_halvar', sv('teknisk', 'rulle')]]],
  ['vk', 'vk_heis', 'Heis', '', [['vernerunde_halvar', sv('teknisk', 'heis')]]],
  ['vk', 'vk_slokk', 'Håndslukkere og brannslanger', 'Med frostvakter', [['vernerunde_halvar', sv('brannvern', 'slokk')]]],
  ['vk', 'vk_dorer', 'Branndører og rømningsveier', '', [['vernerunde_halvar', ['brannvern.dorer_ok']]]],
  ['vk', 'vk_merk', 'Brannmerking og branninstrukser', '', [['vernerunde_halvar', ['brannvern.merk_ok', 'brannvern.ovelse_dato']]]],
  ['vk', 'vk_hjerte', 'Hjertestarter', '', [['vernerunde_halvar', ['brannvern.hjerte_ok', 'brannvern.batteri', 'brannvern.pads']]]],
  ['vk', 'vk_vvs', 'VVS og taksluk', '', [['vernerunde_halvar', ['diverse.vvs_ok']]]],
  ['vk', 'vk_lys', 'Belysning inne og ute', '', [['vk_ukentlig', R('innelys', 'utelys')]]],
  ['vk', 'vk_kamera', 'Kameraovervåking', '', [['vk_ukentlig', R('kamera')]]],
  ['vk', 'vk_bygg', 'Bygg, uteområde og kildesortering', '', [['vk_ukentlig', R('varemottak', 'uteomrade', 'skader', 'andre')], ['vernerunde_halvar', ['diverse'], { x: ['h_vvs', 'vvs_info', 'vvs_ok'] }]]],

  ['svk', 'svk_spr13', 'Sprinkleranlegg – bolig trinn 1–3', '', [['sprinkel_vk', ['leil13'], { x: ALARM }]]],
  ['svk', 'svk_spr4', 'Sprinkleranlegg – bolig trinn 4', 'Med varmekabel VK1/VK2', [['sprinkel_vk', ['leil4'], { x: ALARM }]]],
  ['svk', 'svk_nodlys', 'Nødlys', '', [['vernerunde', ['nodlys']]]],
  ['svk', 'svk_el', 'El-tavler og sikringsskap', '', [['vernerunde', ['elektro']]]],
  ['svk', 'svk_slokk', 'Håndslukkere og brannslanger', 'Med frostvakter', [['vernerunde', ['slukke']]]],
  ['svk', 'svk_romning', 'Rømningsveier', '', [['vernerunde', ['romning']]]],
  ['svk', 'svk_hjerte', 'Hjertestarter', '', [['vernerunde', ['hjerte']]]],
  ['svk', 'svk_bygg', 'Bygg, orden og kildesortering', '', [['vernerunde', ['andre']]]],

  ['tb', 'tb_vat', 'Sprinkleranlegg – våtventil', '', [['sprinkel_tb', ['sprinkler', 'vatventil']]]],
  ['tb', 'tb_torr', 'Sprinkleranlegg – tørrventil', 'Med kompressor', [['sprinkel_tb', ['torrventil', 'kompressor']]]],
  ['tb', 'tb_brann', 'Brannalarmanlegg', 'Brannsentral Røde Kors, branntavle leiligheter, alarmoverføring, nøkkelboks', [['sprinkel_tb', ['alarmtavle', 'brannsentral', 'nokkelboks']]]],
  ['tb', 'tb_nodlys', 'Nødlys', '', [['sprinkel_tb', ['nodlys']]]],
].map(([site, id, name, note, cov]) => ({ site, id, name, note, cov: cov.map(([t, k, o = {}]) => ({ t, k, x: o.x || [], w: o.w })) }));
const ANL = Object.fromEntries(ANLEGG.map(a => [a.id, a]));

const TYPES = {
  ok:  { opts: ['Ok', 'Ikke OK', 'N/A'], flag: ['Ikke OK'] },
  okm: { opts: ['Ok', 'Ikke OK', 'Merknad', 'N/A'], flag: ['Ikke OK'] },
  yn:  { opts: ['Ja', 'Nei', 'N/A'], flag: ['Nei'] },
};
const CHOICE_TYPES = ['yn', 'ok', 'okm', 'choice'];

/* ---------- Hjelpere ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const APP_VERSION = '2026-10-31 m';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayISO = () => iso(new Date());
const fmt = s => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = parseISO(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Lagring (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('oseberg-inspeksjon', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('inspections', { keyPath: 'id' });
        d.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      let out;
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all(s) { return this.req(s, 'readonly', st => st.getAll()); },
  get(s, id) { return this.req(s, 'readonly', st => st.get(id)); },
  put(s, v) { return this.req(s, 'readwrite', st => st.put(v)); },
  del(s, id) { return this.req(s, 'readwrite', st => st.delete(id)); },
};

const S = {
  ins: {}, cur: null, view: 'home', ready: false, error: null,
  settings: { by: 'Henrik Oseberg', company: 'Oseberg Drift og Service' },
  pickKey: null, ready_file: null, confirmFinish: false, showAllHist: false, showSettings: false, busy: false,
};
try { Object.assign(S.settings, JSON.parse(localStorage.getItem('insp-settings') || '{}')); } catch (e) {}
S.settings.notes = S.settings.notes || {};
S.settings.trello = S.settings.trello || {};
const saveSettings = () => { try { localStorage.setItem('insp-settings', JSON.stringify(S.settings)); } catch (e) {} };

const timers = {}; const chains = {};
function touch(ins) { ins.updatedAt = Date.now(); scheduleSave(ins.id); }
function scheduleSave(id) {
  setStatus('Lagrer…');
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => flush(id), 400);
}
function flush(id) {
  clearTimeout(timers[id]); delete timers[id];
  const ins = S.ins[id]; if (!ins) return Promise.resolve();
  chains[id] = (chains[id] || Promise.resolve()).then(() => DB.put('inspections', clone(ins)))
    .then(() => setStatus('Lagret'))
    .catch(e => { setStatus('Ikke lagret'); toast('Kunne ikke lagre: ' + (e && e.message || e)); });
  return chains[id];
}
function flushAll() { return Promise.all(Object.keys(timers).map(flush)); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
window.addEventListener('pagehide', flushAll);

/* ---------- Logikk ---------- */
const optsOf = it => it.options || (TYPES[it.type] ? TYPES[it.type].opts : []);
const flagsOf = it => it.flag || (TYPES[it.type] ? TYPES[it.type].flag : []);
const isoOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const deadlineOf = (it, v) => !isoOk(v) ? null : it.expiry ? v : it.yearly ? addMonths(v, 12) : null;
function isFlag(it, a) {
  if (!a || a.value == null || a.value === '') return false;
  if (it.type === 'date') { const dl = deadlineOf(it, a.value); return !!dl && dl < todayISO(); }
  return flagsOf(it).includes(a.value);
}
function toneFor(it, v) {
  if (isFlag(it, { value: v })) return 'bad';
  if (v === 'N/A' || v === 'Merknad' || it.neutral) return 'na';
  if (it.type === 'choice' || it.type === 'multi') return 'sel';
  return 'ok';
}
function secVisible(sec, ins) {
  const c = sec.showIf; if (!c) return true;
  const v = ins.answers[c.item]?.value;
  if (c.includes) return Array.isArray(v) && v.includes(c.includes);
  return true;
}
function itemVisible(it, ins, prefix) {
  const c = it.showIf; if (!c) return true;
  const v = ins.answers[prefix + '.' + c.item]?.value;
  if ('eq' in c) return v === c.eq;
  if ('ne' in c) return v !== c.ne;
  return true;
}
const instCount = (sec, ins) => sec.repeat ? (ins.repeats?.[sec.id] ?? sec.defaultCount ?? 1) : 1;
const prefixOf = (sec, i) => sec.repeat ? sec.id + '#' + i : sec.id;
function* walk(tpl, ins) {
  for (const sec of tpl.sections) {
    if (!secVisible(sec, ins)) continue;
    const n = instCount(sec, ins);
    for (let i = 0; i < n; i++) {
      const p = prefixOf(sec, i);
      for (const it of sec.items) if (itemVisible(it, ins, p)) yield { sec, i, it, key: p + '.' + it.id };
    }
  }
}
function stats(ins) {
  const r = { flags: 0, actions: 0, open: 0, unanswered: 0, total: 0, photos: 0 };
  for (const x of walk(TPL[ins.templateId], ins)) {
    if (x.it.type === 'heading' || x.it.type === 'info') continue;
    const a = ins.answers[x.key];
    if (isFlag(x.it, a)) r.flags++;
    const acts = a?.actions || [];
    r.actions += acts.length; r.open += acts.filter(z => !z.done).length;
    r.photos += (a?.photos || []).length;
    if (['yn', 'ok', 'okm', 'choice', 'multi', 'number'].includes(x.it.type)) {
      r.total++;
      const v = a?.value;
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) r.unanswered++;
    }
  }
  return r;
}
function findItem(tpl, key) {
  const [p, id] = key.split('.');
  const secId = p.split('#')[0];
  const sec = tpl.sections.find(s => s.id === secId);
  return { sec, it: sec?.items.find(i => i.id === id), inst: p.includes('#') ? +p.split('#')[1] : 0 };
}
function prevValue(ins, key) {
  const list = Object.values(S.ins).filter(i => i.id !== ins.id && i.templateId === ins.templateId && i.status === 'complete' && (i.date || '') <= (ins.date || '9'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
  for (const i of list) { const v = i.answers[key]?.value; if (v != null && v !== '') return v; }
  return null;
}
const freqLabel = t => t.days === 7 ? 'Ukentlig' : t.months === 1 ? 'Månedlig' : t.months === 3 ? 'Kvartalsvis' : t.months === 6 ? 'Halvårlig' : 'Hver ' + t.months + '. mnd';
function dueInfo(t, last) {
  if (!last) return { cls: 'na', text: 'Ikke utført i appen ennå' };
  const next = t.days ? addDays(last.date, t.days) : addMonths(last.date, t.months);
  const d = daysBetween(todayISO(), next);
  if (d < 0) return { cls: 'bad', text: 'Forfalt ' + fmt(next) };
  if (d <= (t.days ? 2 : 7)) return { cls: 'warn', text: 'Forfaller ' + fmt(next) };
  return { cls: 'ok', text: 'Neste ' + fmt(next) };
}
function covMatch(c, key, ins) {
  const dot = key.indexOf('.'), p = key.slice(0, dot), id = key.slice(dot + 1), sec = p.split('#')[0];
  if (c.x.includes(id)) return false;
  if (!c.k.some(k => k === sec || k === sec + '.' + id)) return false;
  if (c.w && ins.answers[p + '.' + c.w[0]]?.value !== c.w[1]) return false;
  return true;
}
function covItems(c, ins) {
  const t = TPL[c.t], out = [];
  for (const x of walk(t, ins)) if (x.it.type !== 'heading' && x.it.type !== 'info' && covMatch(c, x.key, ins)) out.push(x);
  return out;
}
const answered = a => a && a.value != null && a.value !== '' && !(Array.isArray(a.value) && !a.value.length);
const unresolved = a => !(a.actions || []).length || a.actions.some(z => !z.done);
let anlCache = null;
function anlState(a) {
  anlCache ||= {};
  if (anlCache[a.id]) return anlCache[a.id];
  const all = Object.values(S.ins);
  const done = all.filter(i => i.status === 'complete').sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.updatedAt - x.updatedAt);
  const covs = [], hist = [], open = [];
  for (const c of a.cov) {
    const t = TPL[c.t]; let last = null, lastFlags = [];
    for (const i of done) {
      if (i.templateId !== c.t) continue;
      const items = covItems(c, i).filter(x => answered(i.answers[x.key]) || (i.answers[x.key]?.actions || []).length);
      if (!items.length) continue;
      const flags = items.filter(x => isFlag(x.it, i.answers[x.key]));
      hist.push({ i, t, n: items.length, flags });
      if (!last) { last = i; lastFlags = flags.filter(x => unresolved(i.answers[x.key])); }
    }
    for (const i of all) if (i.templateId === c.t) for (const [key, ans] of Object.entries(i.answers))
      for (const act of ans.actions || []) if (!act.done && covMatch(c, key, i)) open.push({ i, key, act });
    const next = last ? (t.days ? addDays(last.date, t.days) : addMonths(last.date, t.months)) : null;
    covs.push({ c, t, last, flags: lastFlags, next, d: next ? daysBetween(todayISO(), next) : null, draft: all.find(i => i.templateId === c.t && i.status !== 'complete') });
  }
  for (const i of all) if (i.anl === a.id) {
    const acts = Object.entries(i.answers).flatMap(([key, ans]) => (ans.actions || []).map(act => ({ key, act })));
    for (const { key, act } of acts) if (!act.done) open.push({ i, key, act });
    if (i.status === 'complete') hist.push({ i, t: TPL.avvik, n: 1, flags: acts.map(z => ({ it: { label: (z.act.text || 'Avvik').split('\n')[0] } })) });
  }
  hist.sort((x, y) => (y.i.date || '').localeCompare(x.i.date || ''));
  const dated = covs.filter(x => x.next).sort((x, y) => x.next.localeCompare(y.next));
  const nextDue = dated[0]?.next || null;
  const overdue = dated.find(x => x.d < 0);
  const soon = dated.find(x => x.d <= (x.t.days ? 2 : 7));
  const nflag = covs.reduce((n, x) => n + x.flags.length, 0);
  let cls, text;
  if (open.length || nflag) { cls = 'bad'; text = [open.length ? open.length + (open.length === 1 ? ' åpen handling' : ' åpne handlinger') : '', nflag ? nflag + ' avvik' : ''].filter(Boolean).join(' · '); }
  else if (!dated.length) { cls = 'na'; text = 'Ikke kontrollert i Argus ennå'; }
  else if (overdue) { cls = 'bad'; text = 'Forfalt ' + fmt(overdue.next); }
  else if (soon) { cls = 'warn'; text = 'Forfaller ' + fmt(soon.next); }
  else { cls = 'ok'; text = 'Neste ' + fmt(nextDue); }
  if (cls === 'bad' && overdue && (open.length || nflag)) text += ' · forfalt';
  return (anlCache[a.id] = { covs, hist, open, nextDue, cls, text });
}
const A = (ins, key) => (ins.answers[key] ||= {});
const cur = () => S.ins[S.cur];

function newInspection(tid) {
  const t = TPL[tid], date = todayISO();
  const ins = { id: uid(), templateId: tid, site: t.site, date, by: S.settings.by, status: 'draft', answers: {}, repeats: {}, createdAt: Date.now(), updatedAt: Date.now() };
  for (const sec of t.sections) for (const it of sec.items) if (it.auto === 'septApril') {
    const m = new Date().getMonth() + 1;
    ins.answers[prefixOf(sec, 0) + '.' + it.id] = { value: (m >= 9 || m <= 4) ? 'Ja' : 'Nei' };
  }
  const prev = Object.values(S.ins).filter(i => i.templateId === tid && i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt)[0];
  if (prev) for (const sec of t.sections) for (const it of sec.items) if (it.carry) {
    const k = prefixOf(sec, 0) + '.' + it.id, v = prev.answers[k]?.value;
    if (v) ins.answers[k] = { value: v };
  }
  S.ins[ins.id] = ins; flush(ins.id);
  openIns(ins.id);
}
function openSite(id) { S.site = id; S.anl = null; S.cur = null; S.showAllHist = false; S.view = 'site'; render(); window.scrollTo(0, 0); }
function openAnl(id) { S.anl = id; S.site = ANL[id].site; S.view = 'anl'; S.cur = null; render(); window.scrollTo(0, 0); }
function avSite(ins) {
  const site = SITES.find(x => x.id === ins.siteId);
  ins.tl = site?.tl;
  ins.site = [site?.name, ins.anl && ANL[ins.anl] ? ANL[ins.anl].name : ins.annet ? 'Annet' : '', (ins.where || '').trim()].filter(Boolean).join(' – ');
}
function newAvvik(o = {}) {
  const siteId = o.anl ? ANL[o.anl].site : (o.site || S.settings.lastSite || null), id = uid();
  const ins = { id: uid(), templateId: 'avvik', siteId, anl: o.anl || null, annet: false, where: '', date: todayISO(), by: S.settings.by, status: 'draft',
    answers: { 'avvik.feil': { actions: [{ id, text: '', due: addDays(todayISO(), 14), who: S.settings.by, prio: 'Middels', done: false }] } }, repeats: {}, createdAt: Date.now(), updatedAt: Date.now() };
  avSite(ins);
  S.ins[ins.id] = ins; flush(ins.id); openIns(ins.id);
  S.pickKey = 'avvik.feil'; $('#filepick').click();
}
function openIns(id) { S.cur = id; S.view = 'ins'; S.confirmFinish = false; render(); window.scrollTo(0, 0); }
function goHome(root) { flushAll(); syncTrello(); if (root) { S.anl = null; S.site = null; } S.cur = null; S.view = S.anl ? 'anl' : S.site ? 'site' : 'home'; render(); window.scrollTo(0, 0); }

/* ---------- Visning ---------- */
const app = $('#app');
function setStatus(t) { const el = $('#save-status'); if (el) el.textContent = t; }
let toastTimer;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms); }

function render() {
  anlCache = null;
  const bar = $('#topbar');
  if (S.view === 'anl' && ANL[S.anl] && S.ready) {
    bar.innerHTML = `<button class="back" data-act="to-site" aria-label="Tilbake til bygget">‹ ${SITES.find(x => x.id === ANL[S.anl].site).short}</button><div class="bar-title">${esc(ANL[S.anl].name)}</div><div class="bar-status"></div>`;
    app.innerHTML = renderAnl();
  } else if (S.view === 'site' && S.site && S.ready) {
    bar.innerHTML = `<button class="back" data-act="home-root" aria-label="Tilbake til byggene">‹ Bygg</button><div class="bar-title">${esc(SITES.find(x => x.id === S.site).name)}</div><div class="bar-status"></div>`;
    app.innerHTML = renderSite();
  } else if (S.view === 'ins' && cur()) {
    const t = TPL[cur().templateId];
    bar.innerHTML = `<button class="back" data-act="home" aria-label="Tilbake">‹ ${S.anl && ANL[S.anl] ? 'Anlegg' : S.site ? SITES.find(x => x.id === S.site).short : 'Oversikt'}</button><div class="bar-title">${esc(t.name)}</div><div class="bar-status" id="save-status">Lagret</div>`;
    app.innerHTML = renderIns();
  } else {
    bar.innerHTML = `<div class="brand"><span class="brand-name">Argus</span><span class="brand-co">${esc(S.settings.company)}</span></div><button class="ghost-sm" data-act="settings">${S.showSettings ? 'Lukk' : 'Innstillinger'}</button>`;
    app.innerHTML = S.ready ? renderHome() : (S.error ? `<p class="empty">${esc(S.error)}</p>` : '<p class="empty">Laster…</p>');
  }
  renderSheet();
  hydratePhotos();
}

function installHint() {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone || !ios) return '';
  return `<div class="notice"><strong>Installer før du starter.</strong> Trykk på Del-knappen i Safari og velg «Legg til på Hjem-skjerm». Appen på hjemskjermen har egen lagring og virker uten dekning, så inspeksjoner du lager her i Safari blir ikke med dit.</div>`;
}

function renderHome() {
  const all = Object.values(S.ins);
  const drafts = all.filter(i => i.status !== 'complete').sort((a, b) => b.updatedAt - a.updatedAt);
  const done = all.filter(i => i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
  let h = installHint();

  if (S.showSettings) {
    h += `<section class="panel settings"><h2 class="h2">Innstillinger</h2>
      <label class="fld"><span>Ditt navn (utført av, ansvarlig)</span><input id="set-by" data-set="by" value="${esc(S.settings.by)}"></label>
      <label class="fld"><span>Firmanavn i rapporter</span><input id="set-co" data-set="company" value="${esc(S.settings.company)}"></label>
      <h3 class="h3">Trello</h3>
      <p class="muted small">Handlinger fra fullførte inspeksjoner sendes som kort til tavlen Vaktmester, i listen for riktig bygg. Nøkkel og token lagres bare på denne telefonen og tas ikke med i sikkerhetskopien.</p>
      <label class="fld"><span>API-nøkkel</span><input id="tr-key" data-trello="key" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.settings.trello.key || '')}"></label>
      <label class="fld"><span>Token</span><input id="tr-token" type="password" data-trello="token" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.settings.trello.token || '')}"></label>
      <div class="row-btns"><button class="btn" data-act="tr-token">Hent token</button><button class="btn" data-act="tr-test">Test tilkobling</button></div>
      <p class="muted small">${trelloCfg() ? trelloPending().n + ' handlinger venter på sending.' : 'Ikke koblet til ennå.'}</p>
      <details class="how"><summary>Slik får du nøkkel og token</summary><ol>
        <li>Åpne <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener">trello.com/power-ups/admin</a> og velg Create new Power-Up. Navn: Argus. Velg arbeidsområdet ditt og fyll inn e-post. Feltet for iframe-adresse kan stå tomt.</li>
        <li>Åpne Power-Up-en, velg API key og trykk Generate a new API key. Kopier nøkkelen hit.</li>
        <li>Under Allowed origins legger du til <b>https://heose.github.io</b> og lagrer.</li>
        <li>Trykk Hent token her, trykk Allow i Trello, og kopier token-teksten hit.</li>
      </ol></details>
      <h3 class="h3">Koder og lokale notater</h3>
      <p class="muted small">Lagres bare på denne telefonen. Vises øverst i sjekklisten, men kommer ikke med i PDF-en. Er med i sikkerhetskopien, så oppbevar den privat.</p>
      ${TEMPLATES.filter(t => !t.hidden).map(t => `<label class="fld"><span>${esc(t.name)}</span><textarea class="inp" id="ln-${t.id}" rows="2" data-lnote="${t.id}">${esc(S.settings.notes[t.id] || '')}</textarea></label>`).join('')}
      <p class="muted small">Argus, versjon ${APP_VERSION}</p>
      <div class="row-btns"><button class="btn" data-act="force-update">Hent nyeste versjon</button></div>
      <h3 class="h3">Sikkerhetskopi</h3>
      <p class="muted small">Alt ligger bare på denne telefonen. Ta en kopi jevnlig og legg den i iCloud Drive eller Google Drive.</p>
      <div class="row-btns"><button class="btn" data-act="export">Lag sikkerhetskopi</button><button class="btn" data-act="import">Gjenopprett fra fil</button></div>
    </section>`;
  }

  if (drafts.length) {
    h += `<section><h2 class="h2">Pågår</h2><div class="list">${drafts.map(i => {
      const st = stats(i); const t = TPL[i.templateId];
      return `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
        <span class="rc-title">${esc(t.name)}</span><span class="rc-sub">${esc(i.site)} · ${fmt(i.date)}</span>
        <span class="rc-sub">${st.total - st.unanswered} av ${st.total} besvart${st.flags ? ` · <b class="t-bad">${st.flags} avvik</b>` : ''}</span></button>
        <button class="link danger" data-act="del-ins" data-id="${i.id}">Slett</button></div>`;
    }).join('')}</div></section>`;
  }

  {
    const lb = S.settings.lastBackup, ndone = all.filter(i => i.status === 'complete').length;
    if (ndone && (!lb || daysBetween(lb, todayISO()) >= 7)) h += `<div class="notice backup"><strong>${lb ? `Siste sikkerhetskopi er ${daysBetween(lb, todayISO())} dager gammel.` : 'Du har ikke tatt sikkerhetskopi ennå.'}</strong> Alt ligger bare på denne telefonen. Lagre kopien i iCloud Drive eller Google Drive.<div class="row-btns"><button class="btn primary" data-act="export">Lag sikkerhetskopi nå</button></div></div>`;
  }
  h += `<button class="btn avvik-big" data-act="avvik-new">Meld avvik</button>`;
  h += `<section><h2 class="h2">Velg bygg</h2><div class="list">${SITES.map(site => {
    const ss = siteState(site);
    return `<button class="sitebtn" data-act="site" data-id="${site.id}"><span class="dot ${ss.cls}" aria-hidden="true"></span>
      <span class="anl-txt"><span class="site-name">${esc(site.name)} <span class="count">${site.short}</span></span>
      <span class="rc-sub ${ss.cls === 'bad' ? 't-bad' : ''}">${esc(ss.text)}</span><span class="rc-sub">${esc(ss.rounds)}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  }).join('')}</div>${trelloHomeLine()}</section>`;
  return h;
}

const rank = { bad: 0, warn: 1, ok: 2, na: 3 };
const doneList = () => Object.values(S.ins).filter(i => i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
const actSite = (i, key) => { const tl = listKey(i, key); return SITES.find(x => x.tl === tl)?.id; };
function siteOpen(site) {
  const out = [];
  for (const i of Object.values(S.ins)) if (TPL[i.templateId]) for (const [key, a] of Object.entries(i.answers)) for (const act of a.actions || []) if (!act.done && actSite(i, key) === site.id) out.push({ i, key, act });
  return out.sort((x, y) => (x.act.due || '9').localeCompare(y.act.due || '9'));
}
function siteState(site) {
  const sts = ANLEGG.filter(a => a.site === site.id).map(anlState);
  const nbad = sts.filter(x => x.cls === 'bad').length, nwarn = sts.filter(x => x.cls === 'warn').length, nna = sts.filter(x => x.cls === 'na').length;
  const nopen = siteOpen(site).length;
  const cls = nbad ? 'bad' : nwarn ? 'warn' : nna === sts.length ? 'na' : 'ok';
  const text = nna === sts.length && !nopen ? 'Ingen kontroller i Argus ennå'
    : [nbad ? `${nbad} anlegg med avvik eller forfalt` : '', nwarn ? `${nwarn} forfaller snart` : '', nopen ? `${nopen} ${nopen === 1 ? 'åpen handling' : 'åpne handlinger'}` : ''].filter(Boolean).join(' · ') || `Alle ${sts.length} anlegg i orden`;
  const done = doneList(); const ds = site.tpls.map(id => ({ t: TPL[id], d: dueInfo(TPL[id], done.find(i => i.templateId === id)) }));
  const late = ds.filter(x => x.d.cls === 'bad').length, never = ds.filter(x => x.d.cls === 'na').length;
  const rounds = `${site.tpls.length} ${site.tpls.length === 1 ? 'runde' : 'runder'}` + (late ? ` · ${late} forfalt` : '') + (never ? ` · ${never} ikke startet` : '');
  return { cls, text, rounds };
}

function renderSite() {
  const site = SITES.find(x => x.id === S.site), done = doneList();
  const tplBtn = t => {
    const last = done.find(i => i.templateId === t.id); const due = dueInfo(t, last);
    const draft = Object.values(S.ins).find(i => i.templateId === t.id && i.status !== 'complete');
    return `<button class="tpl" data-act="${draft ? 'open' : 'new'}" data-tpl="${t.id}"${draft ? ` data-id="${draft.id}"` : ''}>
      <span class="tpl-top"><span class="tpl-name">${esc(t.name)}</span><span class="freq">${freqLabel(t)}</span></span>
      <span class="tpl-meta">${draft ? `<span class="pill warn">Påbegynt ${fmt(draft.date)}, trykk for å fortsette</span>` : `<span class="pill ${due.cls}">${due.text}</span>`}${last ? `<span class="muted small">Sist ${fmt(last.date)}</span>` : ''}</span>
    </button>`;
  };
  const anlBtn = (a, st) => `<button class="anl" data-act="anl" data-id="${a.id}"><span class="dot ${st.cls}" aria-hidden="true"></span>
    <span class="anl-txt"><span class="rc-title">${esc(a.name)}</span><span class="rc-sub ${st.cls === 'bad' ? 't-bad' : ''}">${esc(st.text)}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  const list = ANLEGG.filter(a => a.site === site.id).map(a => ({ a, st: anlState(a) })).sort((x, y) => rank[x.st.cls] - rank[y.st.cls]);
  let h = `<button class="btn avvik-big" data-act="avvik-new" data-site="${site.id}">Meld avvik i ${esc(site.short)}</button>`;
  h += `<section><h2 class="h2">Inspeksjoner</h2><div class="tpl-list">${site.tpls.map(id => tplBtn(TPL[id])).join('')}</div></section>`;
  h += `<section><h2 class="h2">Anlegg <span class="count">${list.length}</span></h2><div class="list">${list.map(x => anlBtn(x.a, x.st)).join('')}</div></section>`;
  const open = siteOpen(site);
  h += `<section><h2 class="h2">Åpne handlinger <span class="count">${open.length}</span></h2>`;
  h += open.length ? `<div class="list">${open.map(({ i, key, act }) => {
    const t = TPL[i.templateId]; const late = act.due && act.due < todayISO();
    return `<div class="act-line"><input type="checkbox" id="hd-${act.id}" data-hdone="${i.id}|${esc(key)}|${act.id}" aria-label="Merk som utført">
      <button class="row-main" data-act="open" data-id="${i.id}" data-focus="${esc(key)}">
      <span class="rc-title">${esc(act.text || '(uten beskrivelse)')}</span>
      <span class="rc-sub">${esc(t.name)} · ${fmt(i.date)}${act.due ? ` · <span class="${late ? 't-bad' : ''}">Frist ${fmt(act.due)}</span>` : ''}</span></button></div>`;
  }).join('')}</div>` : '<p class="empty">Ingen åpne handlinger.</p>';
  h += '</section>';
  const mine = done.filter(i => site.tpls.includes(i.templateId) || (i.templateId === 'avvik' && (i.siteId || ANL[i.anl]?.site) === site.id));
  const hist = S.showAllHist ? mine : mine.slice(0, 8);
  h += `<section><h2 class="h2">Fullførte</h2>`;
  h += mine.length ? `<div class="list">${hist.map(i => {
    const st = stats(i); const t = TPL[i.templateId];
    return `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
      <span class="rc-title">${esc(t.name)}</span><span class="rc-sub">${fmt(i.date)} · ${esc(i.by || '')}</span>
      <span class="rc-sub">${st.flags ? `<b class="t-bad">${st.flags} avvik</b>` : 'Ingen avvik'} · ${st.actions} handlinger</span></button>
      <button class="link" data-act="pdf" data-id="${i.id}">PDF</button><button class="link danger" data-act="del-ins" data-id="${i.id}">Slett</button></div>`;
  }).join('')}</div>${mine.length > 8 && !S.showAllHist ? `<button class="link more" data-act="hist-all">Vis alle ${mine.length}</button>` : ''}` : '<p class="empty">Fullførte inspeksjoner for dette bygget havner her.</p>';
  h += '</section>';
  return h;
}

function renderAnl() {
  const a = ANL[S.anl], st = anlState(a), site = SITES.find(x => x.id === a.site);
  let h = `<section class="panel meta"><h1 class="ins-title">${esc(a.name)}</h1>
    <p class="muted">${esc(site.name)}${a.note ? ' · ' + esc(a.note) : ''}</p>
    <p><span class="pill ${st.cls}">${esc(st.text)}</span></p>
    <button class="btn primary" data-act="avvik" data-id="${a.id}">Meld avvik</button></section>`;
  h += `<section><h2 class="h2">Kontroller</h2><div class="list">${st.covs.map(x => {
    const due = dueInfo(x.t, x.last);
    return `<div class="panel cov"><div class="tpl-top"><span class="tpl-name">${esc(x.t.name)}</span><span class="freq">${freqLabel(x.t)}</span></div>
      <div class="tpl-meta"><span class="pill ${due.cls}">${due.text}</span>${x.last ? `<span class="muted small">Sist ${fmt(x.last.date)}</span>` : ''}</div>
      ${x.flags.length ? `<ul class="flags">${x.flags.map(f => `<li><button class="link" data-act="open" data-id="${x.last.id}" data-focus="${esc(f.key)}">${esc(f.it.label)}: <b class="t-bad">${esc(String(x.last.answers[f.key].value))}</b></button></li>`).join('')}</ul>` : ''}
      ${x.draft ? `<button class="btn" data-act="open" data-id="${x.draft.id}">Fortsett påbegynt (${fmt(x.draft.date)})</button>` : `<button class="btn primary" data-act="new" data-tpl="${x.t.id}">Start kontroll</button>`}</div>`;
  }).join('')}</div></section>`;
  h += `<section><h2 class="h2">Åpne handlinger <span class="count">${st.open.length}</span></h2>`;
  h += st.open.length ? `<div class="list">${st.open.sort((x, y) => (x.act.due || '9').localeCompare(y.act.due || '9')).map(({ i, key, act }) => {
    const t = TPL[i.templateId]; const late = act.due && act.due < todayISO();
    return `<div class="act-line"><input type="checkbox" id="hd-${act.id}" data-hdone="${i.id}|${esc(key)}|${act.id}" aria-label="Merk som utført">
      <button class="row-main" data-act="open" data-id="${i.id}" data-focus="${esc(key)}">
      <span class="rc-title">${esc(act.text || '(uten beskrivelse)')}</span>
      <span class="rc-sub">${esc(t.name)} · ${fmt(i.date)}${act.due ? ` · <span class="${late ? 't-bad' : ''}">Frist ${fmt(act.due)}</span>` : ''}</span></button></div>`;
  }).join('')}</div>` : '<p class="empty">Ingen åpne handlinger.</p>';
  h += '</section>';
  h += `<section><h2 class="h2">Historikk</h2>`;
  h += st.hist.length ? `<div class="list">${st.hist.slice(0, 30).map(({ i, t, n, flags }) => `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
      <span class="rc-title">${fmt(i.date)} · ${esc(t.name)}</span>
      <span class="rc-sub">${flags.length ? `<b class="t-bad">${flags.length} avvik</b>: ${esc(flags.map(f => f.it.label).join('; ').slice(0, 140))}` : `${n} ${n === 1 ? "punkt" : "punkter"}, ingen avvik`}</span></button>
      <button class="link" data-act="pdf" data-id="${i.id}">PDF</button></div>`).join('')}</div>` : '<p class="empty">Ingen fullførte kontroller av dette anlegget ennå.</p>';
  h += '</section>';
  return h;
}

function renderIns() {
  const ins = cur(); const tpl = TPL[ins.templateId]; const st = stats(ins);
  let h = `<section class="panel meta">
    <h1 class="ins-title">${esc(tpl.name)}</h1>
    ${ins.status === 'complete' ? `<p class="done-note">Fullført. Endringer lagres, og du kan lage ny PDF når som helst.</p>` : ''}
    <div class="fields">
      ${ins.templateId === 'avvik' ? '' : `<label class="fld wide"><span>Sted</span><input id="m-site" data-meta="site" value="${esc(ins.site)}"></label>`}
      <label class="fld"><span>Dato</span><input id="m-date" type="date" data-meta="date" value="${esc(ins.date)}"></label>
      <label class="fld"><span>Utført av</span><input id="m-by" data-meta="by" value="${esc(ins.by)}"></label>
    </div></section>`;
  if (ins.templateId === 'avvik') {
    const site = SITES.find(x => x.id === ins.siteId);
    h += `<section class="panel avf"><h2 class="h3">Hvor er avviket?</h2>
      <div class="q">Bygg</div><div class="seg" role="group" aria-label="Bygg">${SITES.map(x => `<button type="button" data-act="av-site" data-id="${x.id}" aria-pressed="${x.id === ins.siteId}"${x.id === ins.siteId ? ' data-tone="sel"' : ''}>${x.short}</button>`).join('')}</div>
      ${site ? `<label class="fld"><span>Anlegg</span><select id="av-anl" data-avf="anl"><option value="">Velg anlegg…</option>${ANLEGG.filter(a => a.site === site.id).map(a => `<option value="${a.id}"${ins.anl === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="annet"${ins.annet ? ' selected' : ''}>Annet</option></select></label>
      <label class="fld"><span>Hvor?${ins.annet ? ' (må fylles ut for Annet)' : ' (valgfritt)'}</span><input id="av-where" data-avf="where" value="${esc(ins.where || '')}" placeholder="F.eks. trapp B, 2. etg"></label>` : '<p class="muted small">Velg bygg først.</p>'}
    </section>`;
  }
  { const ln = (S.settings.notes[ins.templateId] || '').trim(); if (ln) h += `<section class="panel lnote"><h3 class="h3">Koder og notater (kun på denne telefonen)</h3><p>${esc(ln)}</p></section>`; }
  for (const sec of tpl.sections) {
    if (!secVisible(sec, ins)) continue;
    const n = instCount(sec, ins);
    for (let i = 0; i < n; i++) {
      const p = prefixOf(sec, i);
      h += `<section class="sec"><header class="sec-h"><h2>${esc(sec.title)}${sec.repeat ? ` <span class="inst">${esc(sec.unit)} ${i + 1}</span>` : ''}</h2>${sec.repeat && n > 1 && i === n - 1 ? `<button class="link danger" data-act="rep-del" data-sec="${sec.id}">Fjern ${esc(sec.unit.toLowerCase())}</button>` : ''}</header><div class="items">`;
      for (const it of sec.items) if (itemVisible(it, ins, p)) h += itemHTML(ins, it, p + '.' + it.id);
      h += '</div></section>';
    }
    if (sec.repeat) h += `<button class="add-rep" data-act="rep-add" data-sec="${sec.id}">+ Legg til ${esc(sec.unit.toLowerCase())}</button>`;
  }
  h += `<section class="panel finish">
    <div class="sum"><div><b>${st.total - st.unanswered}</b><span>av ${st.total} besvart</span></div><div class="${st.flags ? 't-bad' : ''}"><b>${st.flags}</b><span>avvik</span></div><div><b>${st.actions}</b><span>handlinger</span></div><div><b>${st.photos}</b><span>bilder</span></div></div>`;
  if (S.confirmFinish) {
    h += `<p class="warn-text">${st.unanswered} ${st.unanswered === 1 ? 'punkt er' : 'punkter er'} ikke besvart. Vil du fullføre likevel?</p>
      <div class="row-btns"><button class="btn" data-act="finish-cancel">Gå tilbake</button><button class="btn primary" data-act="finish-force">Fullfør likevel</button></div>`;
  } else {
    h += `<button class="btn primary big" data-act="${ins.status === 'complete' ? 'pdf' : 'finish'}" data-id="${ins.id}" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Lager PDF…' : ins.status === 'complete' ? 'Lag PDF på nytt' : ins.templateId === 'avvik' ? 'Send avvik' : 'Fullfør og lag PDF'}</button>`;
  }
  h += '</section>';
  return h;
}

function itemHTML(ins, it, key) {
  if (it.type === 'heading') return `<h3 class="sub">${esc(it.label)}</h3>`;
  if (it.type === 'info') return `<p class="info">${esc(it.label)}</p>`;
  const a = ins.answers[key] || {};
  const flag = isFlag(it, a); const acts = a.actions || []; const photos = a.photos || [];
  const want = flag || (it.suggestOn && (it.suggestOn === 'any' ? !!a.value : it.suggestOn.includes(a.value)));
  const k = esc(key);
  let ctl = '';
  if (CHOICE_TYPES.includes(it.type)) {
    const opts = optsOf(it);
    ctl = `<div class="seg" role="group" aria-label="${esc(it.label)}">${opts.map(o => {
      const on = a.value === o;
      return `<button type="button" data-act="set" data-key="${k}" data-val="${esc(o)}" aria-pressed="${on}"${on ? ` data-tone="${toneFor(it, o)}"` : ''}>${esc(o)}</button>`;
    }).join('')}</div>`;
    if (it.allowOther) {
      const other = a.value && !opts.includes(a.value) ? a.value : '';
      ctl += `<input class="inp other" id="o-${k}" data-bind="${k}" data-field="value" data-rerender="1" placeholder="Annet – skriv inn" value="${esc(other)}">`;
    }
  } else if (it.type === 'multi') {
    const v = Array.isArray(a.value) ? a.value : [];
    ctl = `<div class="seg multi">${it.options.map(o => `<button type="button" data-act="toggle" data-key="${k}" data-val="${esc(o)}" aria-pressed="${v.includes(o)}"${v.includes(o) ? ' data-tone="sel"' : ''}>${esc(o)}</button>`).join('')}</div>`;
  } else if (it.type === 'number') {
    const prev = prevValue(ins, key);
    ctl = `<div class="numrow"><input class="inp num" id="n-${k}" type="text" inputmode="decimal" data-bind="${k}" data-field="value" value="${esc(a.value ?? '')}" placeholder="0,0" autocomplete="off"><span class="unit">${esc(it.unit || '')}</span>${prev != null ? `<span class="prev">Forrige: ${esc(String(prev).replace('.', ','))} ${esc(it.unit || '')}</span>` : ''}</div>`;
  } else if (it.type === 'text') {
    ctl = `<input class="inp" id="t-${k}" data-bind="${k}" data-field="value" value="${esc(a.value ?? '')}">`;
  } else if (it.type === 'date') {
    const dl = deadlineOf(it, a.value);
    ctl = `<input class="inp date" id="d-${k}" type="date" data-bind="${k}" data-field="value" data-rerender="1" value="${esc(a.value ?? '')}">${flag ? `<span class="t-bad small">${it.yearly ? 'Årlig kontroll forfalt ' + fmt(dl) : 'Utløpt'}</span>` : it.yearly && dl ? `<span class="muted small">Neste kontroll senest ${fmt(dl)}</span>` : ''}`;
  }
  const note = a.note != null ? `<textarea class="inp note" id="nt-${k}" rows="2" data-bind="${k}" data-field="note" placeholder="Notat">${esc(a.note)}</textarea>` : '';
  const thumbs = photos.length ? `<div class="thumbs">${photos.map((pid, ix) => `<button type="button" class="thumb" data-act="thumb" data-key="${k}" data-ix="${ix}" aria-label="Åpne bilde ${ix + 1}"><img data-pid="${pid}" alt=""></button>`).join('')}</div>` : '';
  const actsH = acts.map(act => actHTML(key, act, ins.status === 'complete')).join('');
  return `<div class="item${flag ? ' is-flag' : ''}" id="it-${k}">
    <div class="q">${esc(it.label)}</div>${it.help ? `<div class="help">${esc(it.help)}</div>` : ''}
    ${ctl}${note}${thumbs}${actsH}
    <div class="tools">
      <button type="button" class="tool" data-act="note" data-key="${k}">${a.note != null ? 'Skjul notat' : 'Notat'}</button>
      <button type="button" class="tool" data-act="photo" data-key="${k}">Bilde</button>
      <button type="button" class="tool${want && !acts.length ? ' prompt' : ''}" data-act="act-add" data-key="${k}">+ Handling</button>
    </div></div>`;
}
function actHTML(key, act, sent) {
  const k = esc(key), base = `${k}|${act.id}`;
  return `<div class="act${act.done ? ' done' : ''}">
    <div class="act-h"><span class="act-tag">Handling</span>${trTag(act, sent)}<label class="chk"><input type="checkbox" id="ad-${act.id}" data-actf="${base}|done"${act.done ? ' checked' : ''}> Utført</label></div>
    <textarea class="inp" id="at-${act.id}" rows="2" data-actf="${base}|text" placeholder="Hva skal gjøres?">${esc(act.text)}</textarea>
    <div class="act-row">
      <label class="fld"><span>Frist</span><input type="date" id="af-${act.id}" data-actf="${base}|due" value="${esc(act.due || '')}"></label>
      <label class="fld"><span>Ansvarlig</span><input id="aw-${act.id}" data-actf="${base}|who" value="${esc(act.who || '')}"></label>
      <label class="fld"><span>Prioritet</span><select id="ap-${act.id}" data-actf="${base}|prio">${['Lav', 'Middels', 'Høy'].map(p => `<option${act.prio === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
    </div>
    <button type="button" class="link danger" data-act="act-del" data-key="${k}" data-aid="${act.id}">Slett handling</button>
  </div>`;
}

const URLS = {};
async function hydratePhotos() {
  for (const img of document.querySelectorAll('img[data-pid]')) {
    const id = img.dataset.pid;
    if (!URLS[id]) {
      const rec = await DB.get('photos', id).catch(() => null);
      if (!rec) continue;
      URLS[id] = URL.createObjectURL(rec.blob);
    }
    img.src = URLS[id];
  }
}

/* ---------- Ark for deling (må startes av et trykk) ---------- */
function renderSheet() {
  const el = $('#sheet');
  if (!S.ready_file) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<div class="sheet-card" role="dialog" aria-label="Fil klar"><p class="sheet-title">${esc(S.ready_file.title)}</p><p class="muted small">${esc(S.ready_file.file.name)}</p>
    <button class="btn primary big" data-act="share-file">Del eller lagre</button>
    <button class="btn" data-act="close-sheet">Lukk</button></div>`;
}
async function shareFile() {
  const { file } = S.ready_file;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); S.ready_file = null; renderSheet(); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  S.ready_file = null; renderSheet();
}

/* ---------- Hendelser ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, key = b.dataset.key, ins = cur();
  switch (act) {
    case 'home': goHome(); break;
    case 'home-root': goHome(true); break;
    case 'force-update':
      if (!b.dataset.armed) { arm(b, 'Trykk igjen for å laste på nytt'); break; }
      await flushAll();
      try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
      location.reload(); break;
    case 'anl': openAnl(b.dataset.id); break;
    case 'site': openSite(b.dataset.id); break;
    case 'avvik': newAvvik({ anl: b.dataset.id }); break;
    case 'avvik-new': newAvvik({ site: b.dataset.site }); break;
    case 'av-site': if (ins) { ins.siteId = b.dataset.id; ins.anl = null; ins.annet = false; S.settings.lastSite = ins.siteId; saveSettings(); avSite(ins); touch(ins); render(); } break;
    case 'to-site': openSite(S.site); break;
    case 'settings': S.showSettings = !S.showSettings; render(); break;
    case 'new': newInspection(b.dataset.tpl); break;
    case 'open': openIns(b.dataset.id); if (b.dataset.focus) { const el = document.getElementById('it-' + b.dataset.focus); if (el) el.scrollIntoView({ block: 'center' }); } break;
    case 'hist-all': S.showAllHist = true; render(); break;
    case 'del-ins':
      if (!b.dataset.armed) { arm(b, 'Bekreft sletting'); break; }
      { const victim = S.ins[b.dataset.id]; delete S.ins[b.dataset.id]; await DB.del('inspections', b.dataset.id);
        for (const a of Object.values(victim.answers)) for (const p of a.photos || []) DB.del('photos', p);
        render(); toast('Inspeksjonen er slettet'); }
      break;
    case 'set': {
      const a = A(ins, key); a.value = a.value === b.dataset.val ? null : b.dataset.val;
      touch(ins); render(); break;
    }
    case 'toggle': {
      const a = A(ins, key); const v = Array.isArray(a.value) ? a.value : [];
      a.value = v.includes(b.dataset.val) ? v.filter(x => x !== b.dataset.val) : [...v, b.dataset.val];
      touch(ins); render(); break;
    }
    case 'note': {
      const a = A(ins, key);
      if (a.note == null) { a.note = ''; render(); document.getElementById('nt-' + key)?.focus(); }
      else { if (!a.note) delete a.note; else { toast('Notatet er beholdt. Tøm teksten for å fjerne det.'); break; } render(); }
      touch(ins); break;
    }
    case 'photo': S.pickKey = key; $('#filepick').click(); break;
    case 'thumb': openEditor(key, +b.dataset.ix); break;
    case 'act-add': {
      const a = A(ins, key); const id = uid();
      (a.actions ||= []).push({ id, text: '', due: addDays(todayISO(), 14), who: S.settings.by, prio: 'Lav', done: false });
      touch(ins); render(); document.getElementById('at-' + id)?.focus(); break;
    }
    case 'act-del':
      if (!b.dataset.armed) { arm(b, 'Trykk igjen for å slette'); break; }
      { const a = A(ins, key); a.actions = (a.actions || []).filter(x => x.id !== b.dataset.aid); touch(ins); render(); }
      break;
    case 'rep-add': ins.repeats[b.dataset.sec] = instCount(TPL[ins.templateId].sections.find(s => s.id === b.dataset.sec), ins) + 1; touch(ins); render(); break;
    case 'rep-del': {
      if (!b.dataset.armed) { arm(b, 'Bekreft fjerning'); break; }
      const sec = TPL[ins.templateId].sections.find(s => s.id === b.dataset.sec); const n = instCount(sec, ins);
      const p = prefixOf(sec, n - 1) + '.';
      for (const k of Object.keys(ins.answers)) if (k.startsWith(p)) delete ins.answers[k];
      ins.repeats[sec.id] = n - 1; touch(ins); render(); break;
    }
    case 'finish': {
      if (ins.templateId === 'avvik') {
        const miss = !ins.siteId ? 'Velg bygg.' : !ins.anl && !ins.annet ? 'Velg anlegg, eller Annet.' : ins.annet && !(ins.where || '').trim() ? 'Skriv hvor avviket er.' : !Object.values(ins.answers).some(z => (z.actions || []).some(q => (q.text || '').trim())) ? 'Skriv hva som må gjøres i handlingen.' : '';
        if (miss) { toast(miss, 4000); break; }
        S.settings.lastSite = ins.siteId; saveSettings();
      }
      const st = stats(ins);
      if (st.unanswered && !S.confirmFinish) { S.confirmFinish = true; render(); break; }
      await finish(ins); break;
    }
    case 'finish-force': await finish(ins); break;
    case 'finish-cancel': S.confirmFinish = false; render(); break;
    case 'pdf': await makePdf(S.ins[b.dataset.id]); break;
    case 'share-file': shareFile(); break;
    case 'close-sheet': S.ready_file = null; renderSheet(); break;
    case 'tr-token': {
      const k = S.settings.trello.key; if (!k) { toast('Lim inn API-nøkkelen først.'); break; }
      window.open('https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Argus&key=' + encodeURIComponent(k), '_blank'); break;
    }
    case 'tr-test':
      try { const bd = await tfetch('GET', `boards/${TRELLO.board}`, { fields: 'name' }); S.settings.trello.members = null; await trelloMembers(); S.settings.trello.labels = {}; let lab = 'etiketter klare'; try { for (const k of Object.keys(PRIO_LABEL)) await prioLabel(k); } catch (e) { lab = 'etiketter feilet: ' + trelloErr(e); } toast(`Koblet til tavlen «${bd.name}», ${lab}`, 6000); }
      catch (e) { toast(trelloErr(e), 8000); }
      break;
    case 'tr-sync': await syncTrello(true); break;
    case 'export': await exportBackup(); break;
    case 'import': $('#importpick').click(); break;
  }
});
function arm(b, label) {
  const old = b.textContent; b.dataset.armed = '1'; b.textContent = label; b.classList.add('armed');
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = old; b.classList.remove('armed'); } }, 3500);
}

document.addEventListener('input', e => {
  const el = e.target; const ins = cur();
  if (el.dataset.trello) { const t = S.settings.trello; t[el.dataset.trello] = el.value.trim(); t.members = null; saveSettings(); return; }
  if (el.dataset.lnote) { S.settings.notes[el.dataset.lnote] = el.value; saveSettings(); return; }
  if (el.dataset.set) { S.settings[el.dataset.set] = el.value; saveSettings(); return; }
  if (!ins) return;
  if (el.dataset.avf) {
    if (el.dataset.avf === 'anl') { ins.annet = el.value === 'annet'; ins.anl = ins.annet || !el.value ? null : el.value; } else ins.where = el.value;
    avSite(ins); touch(ins); return;
  }
  if (el.dataset.meta) { ins[el.dataset.meta] = el.value; touch(ins); return; }
  if (el.dataset.bind) {
    const a = A(ins, el.dataset.bind);
    if (el.dataset.field === 'value') a.value = el.value === '' ? null : el.value; else a.note = el.value;
    touch(ins); return;
  }
  if (el.dataset.actf && el.type !== 'checkbox') {
    const [key, id, field] = el.dataset.actf.split('|');
    const act = (ins.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act[field] = el.value; touch(ins); }
  }
});
document.addEventListener('change', e => {
  const el = e.target; const ins = cur();
  if (el.dataset.hdone) {
    const [iid, key, id] = el.dataset.hdone.split('|'); const i = S.ins[iid];
    const act = (i?.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act.done = el.checked; touch(i); toast('Handlingen er merket som utført'); setTimeout(render, 350); setTimeout(syncTrello, 1200); }
    return;
  }
  if (!ins) return;
  if (el.dataset.actf && el.type === 'checkbox') {
    const [key, id] = el.dataset.actf.split('|');
    const act = (ins.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act.done = el.checked; touch(ins); render(); }
  } else if (el.dataset.rerender || el.dataset.avf === 'anl') render();
});

/* ---------- Bilder ---------- */
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Kunne ikke lese bildet')); i.src = src; }); }
async function toJpeg(src, max = 1600) {
  const img = await loadImage(src);
  let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  return { blob, w, h };
}
$('#filepick').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  const ins = cur(), key = S.pickKey; if (!files.length || !ins || !key) return;
  for (let n = 0; n < files.length; n++) {
    toast(files.length > 1 ? `Lagrer bilde ${n + 1} av ${files.length}…` : 'Lagrer bilde…', 8000);
    const url = URL.createObjectURL(files[n]);
    try {
      const { blob, w, h } = await toJpeg(url); const id = uid();
      await DB.put('photos', { id, blob, w, h });
      (A(ins, key).photos ||= []).push(id);
    } catch (err) { toast('Bildet kunne ikke lagres: ' + err.message); }
    finally { URL.revokeObjectURL(url); }
  }
  touch(ins); render(); toast('Bilde lagret. Trykk på bildet for å markere.');
});

const ED = { key: null, ix: 0, id: null, img: null, strokes: [], drawing: null };
const cv = $('#ed-canvas'), cx = cv.getContext('2d');
async function openEditor(key, ix) {
  const id = cur().answers[key].photos[ix];
  Object.assign(ED, { key, ix, id, strokes: [], drawing: null });
  ED.img = await loadImage(URLS[id]);
  cv.width = ED.img.naturalWidth; cv.height = ED.img.naturalHeight;
  edDraw(); $('#editor').hidden = false; document.body.classList.add('noscroll');
  $('#ed-del').textContent = 'Slett bilde'; delete $('#ed-del').dataset.armed;
}
function edDraw() {
  cx.drawImage(ED.img, 0, 0);
  cx.strokeStyle = '#e8262f'; cx.lineWidth = Math.max(4, cv.width / 140); cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const s of ED.strokes) { cx.beginPath(); s.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); if (s.length === 1) cx.lineTo(s[0][0] + 0.1, s[0][1]); cx.stroke(); }
}
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ED.drawing = [pt(e)]; ED.strokes.push(ED.drawing); edDraw(); });
cv.addEventListener('pointermove', e => { if (!ED.drawing) return; ED.drawing.push(pt(e)); edDraw(); });
const endStroke = () => { ED.drawing = null; };
cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
function closeEditor() { $('#editor').hidden = true; document.body.classList.remove('noscroll'); }
$('#ed-cancel').onclick = closeEditor;
$('#ed-undo').onclick = () => { ED.strokes.pop(); edDraw(); };
$('#ed-save').onclick = async () => {
  if (!ED.strokes.length) { closeEditor(); return; }
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
  await DB.put('photos', { id: ED.id, blob, w: cv.width, h: cv.height });
  if (URLS[ED.id]) URL.revokeObjectURL(URLS[ED.id]); delete URLS[ED.id];
  touch(cur()); closeEditor(); render(); toast('Markering lagret');
};
$('#ed-del').onclick = async () => {
  const b = $('#ed-del');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Trykk igjen'; return; }
  const a = cur().answers[ED.key]; a.photos = a.photos.filter(p => p !== ED.id);
  await DB.del('photos', ED.id); touch(cur()); closeEditor(); render(); toast('Bildet er slettet');
};

/* ---------- Fullfør og PDF ---------- */
function ctxLabel(tpl, key) {
  const { sec, it } = findItem(tpl, key); if (!sec) return '';
  let head = null;
  for (const x of sec.items) { if (x === it) break; if (x.type === 'heading') head = x.label; }
  return head || sec.title;
}
function autoActions(ins) {
  const tpl = TPL[ins.templateId], today = todayISO(); let n = 0;
  const horizon = (tpl.days || (tpl.months || 12) * 31) + 30;
  for (const x of walk(tpl, ins)) {
    if (x.it.type !== 'date') continue;
    const a = ins.answers[x.key]; const dl = deadlineOf(x.it, a?.value); if (!dl) continue;
    if (daysBetween(today, dl) > horizon) continue;
    const dup = Object.values(S.ins).some(i => i.templateId === ins.templateId && Object.entries(i.answers).some(([k, z]) => k === x.key && (z.actions || []).some(q => q.auto === x.key && (q.autoFor === dl || !q.done))));
    if (dup) continue;
    const ctx = ctxLabel(tpl, x.key), late = dl < today;
    const text = x.it.yearly ? `${ctx}: årlig kontroll ${late ? 'forfalt' : 'forfaller'} ${fmt(dl)} – bestill kontroll` : `${ctx}: ${x.it.label.toLowerCase()} ${fmt(dl)} – bestill nytt`;
    const due = addDays(dl, -30) > today ? addDays(dl, -30) : addDays(today, 7);
    (a.actions ||= []).push({ id: uid(), text, due, who: ins.by || S.settings.by, prio: late ? 'Høy' : 'Middels', done: false, auto: x.key, autoFor: dl });
    n++;
  }
  return n;
}
async function finish(ins) {
  const nAuto = autoActions(ins);
  if (nAuto) toast(`${nAuto} ${nAuto === 1 ? 'påminnelse' : 'påminnelser'} om utløp/kontroll lagt til`, 4000);
  ins.status = 'complete'; ins.completedAt = Date.now(); S.confirmFinish = false;
  touch(ins); await flush(ins.id);
  if (ins.templateId === 'avvik') { goHome(); toast(trelloCfg() && navigator.onLine ? 'Avviket er registrert og sendes til Trello' : 'Avviket er registrert. Det sendes til Trello når du har dekning.', 3500); return; }
  syncTrello();
  await makePdf(ins);
}
async function makePdf(ins) {
  if (!ins || S.busy) return;
  S.busy = true; if (S.view === 'ins') render(); else toast('Lager PDF…');
  try {
    await flushAll();
    const blob = await buildReport(ins);
    const t = TPL[ins.templateId];
    const name = `${t.name} ${ins.site.split(/[–,-]/)[0].trim()} ${fmt(ins.date).replace(/\./g, '-')}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    S.ready_file = { file: new File([blob], name, { type: 'application/pdf' }), title: 'PDF-rapporten er klar' };
  } catch (e) { toast('Kunne ikke lage PDF: ' + (e && e.message || e), 5000); console.error(e); }
  S.busy = false; render();
}

const C = { ink: [20, 33, 42], muted: [86, 104, 116], line: [214, 222, 227], band: [233, 238, 241], ok: [26, 122, 76], bad: [192, 23, 47], na: [94, 108, 118], sel: [15, 90, 125], actBg: [255, 245, 209], actLine: [226, 191, 61], actInk: [92, 71, 8], white: [255, 255, 255], accent: [15, 90, 125] };

async function buildReport(ins) {
  const tpl = TPL[ins.templateId]; const d = new PDFDoc();
  const W = 210, M = 16, CW = W - 2 * M, TOP = 18, BOT = 297 - 18, LH = 4.6;
  let y = TOP;
  const items = [...walk(tpl, ins)];
  const st = stats(ins);

  const pnum = {}, pinfo = {}; let pc = 0;
  for (const x of items) for (const pid of ins.answers[x.key]?.photos || []) {
    if (pid in pnum) continue;
    const rec = await DB.get('photos', pid).catch(() => null);
    if (!rec) continue;
    pnum[pid] = ++pc;
    pinfo[pid] = { data: new Uint8Array(await rec.blob.arrayBuffer()), w: rec.w, h: rec.h, label: x.it.label };
  }
  const need = h => { if (y + h > BOT) { d.addPage(); y = TOP; } };

  // Tittel
  d.text(S.settings.company, W - M, 11, { size: 8.5, bold: true, color: C.accent, align: 'right' });
  d.wrap(tpl.name, 20, true, CW).forEach(l => { y += 8; d.text(l, M, y, { size: 20, bold: true, color: C.ink }); });
  y += 7;
  d.text(`${fmt(ins.date)} / ${ins.by}`, M, y, { size: 11, color: C.muted });
  d.text(ins.status === 'complete' ? 'Fullført' : 'Utkast', W - M, y, { size: 9.5, bold: true, color: ins.status === 'complete' ? C.ok : C.na, align: 'right' });
  y += 5;
  const half = CW / 2 - 1;
  d.rect(M, y, half, 10, C.band); d.rect(M + half + 2, y, half, 10, C.band);
  d.text('Avvik', M + 3, y + 6.5, { size: 10, bold: true, color: C.ink }); d.text(String(st.flags), M + half - 3, y + 6.5, { size: 10, color: st.flags ? C.bad : C.ink, bold: !!st.flags, align: 'right' });
  d.text('Handlinger', M + half + 5, y + 6.5, { size: 10, bold: true, color: C.ink }); d.text(String(st.actions), W - M - 3, y + 6.5, { size: 10, color: C.ink, align: 'right' });
  y += 11;
  for (const [k, v] of [['Sted', ins.site], ['Utført dato', fmt(ins.date)], ['Utført av', ins.by]]) {
    d.text(k, M + 3, y + 6, { size: 10, bold: true, color: C.ink }); d.text(v || '', W - M - 3, y + 6, { size: 10, color: C.ink, align: 'right' });
    y += 9; d.line(M, y, W - M, y, C.line);
  }
  y += 4;

  function secHeader(title, right) {
    need(18); y += 3;
    d.rect(M, y, CW, 9, C.band);
    d.text(title, M + 3, y + 6, { size: 11, bold: true, color: C.ink });
    if (right) d.text(right, W - M - 3, y + 6, { size: 8.5, color: C.muted, align: 'right' });
    y += 10;
  }
  function actBlock(act) {
    const head = ['Handling', 'Ansvarlig: ' + (act.who || '-'), 'Prioritet: ' + (act.prio || '-'), 'Frist: ' + (act.due ? fmt(act.due) : '-')].concat(act.done ? ['Utført'] : []).join('   |   ');
    const hl = d.wrap(head, 8.5, false, CW - 8), tl = d.wrap(act.text || '(uten beskrivelse)', 10, false, CW - 8);
    const h = hl.length * 4 + tl.length * LH + 5;
    need(h + 1.5);
    d.rect(M, y, CW, h, C.actBg); d.rect(M, y, 1.2, h, C.actLine);
    let yy = y + 4.3;
    hl.forEach(l => { d.text(l, M + 4, yy, { size: 8.5, color: C.actInk }); yy += 4; });
    tl.forEach(l => { d.text(l, M + 4, yy + 0.8, { size: 10, color: C.ink }); yy += LH; });
    y += h + 1.5;
  }
  function itemBlock(x) {
    const { it, key } = x; const a = ins.answers[key] || {};
    if (it.type === 'heading') { need(12); y += 1.5; d.text(it.label, M + 2, y + 5, { size: 10, color: C.muted }); y += 7.5; d.line(M, y, W - M, y, C.line); return; }
    if (it.type === 'info') { y += 1; for (const l of d.wrap(it.label, 8.5, false, CW - 4)) { need(4.2); d.text(l, M + 2, y + 3.2, { size: 8.5, color: C.muted }); y += 4; } y += 1.5; return; }
    const v = a.value; let ans = null, tone = null;
    if (CHOICE_TYPES.includes(it.type) && v) { ans = v; tone = toneFor(it, v); }
    else if (it.type === 'multi' && Array.isArray(v) && v.length) { ans = v.join(', '); tone = 'sel'; }
    else if (it.type === 'number' && v != null && v !== '') ans = String(v).replace('.', ',') + (it.unit ? ' ' + it.unit : '');
    else if (it.type === 'date' && v) { ans = fmt(v); if (isFlag(it, a)) tone = 'bad'; }
    else if (it.type === 'text' && v) ans = v;
    const pillW = 52, pill = !!tone;
    const lines = d.wrap(it.label, 10, true, CW - pillW - 8);
    const al = ans != null ? d.wrap(ans, 10, false, pillW - 6) : [];
    const rowH = Math.max(lines.length, al.length, 1) * LH + 5;
    need(rowH + 1);
    lines.forEach((l, i) => d.text(l, M + 2, y + 5.2 + i * LH, { size: 10, bold: true, color: C.ink }));
    if (pill) d.rect(W - M - pillW, y + 0.6, pillW, rowH - 1.2, C[tone]);
    al.forEach((l, i) => d.text(l, W - M - 3, y + 5.2 + i * LH, { size: 10, color: pill ? C.white : C.ink, align: 'right' }));
    y += rowH;
    if (a.note) {
      for (const l of d.wrap(a.note, 9, false, CW - 4)) { need(4.4); d.text(l, M + 2, y + 3.4, { size: 9, color: C.muted }); y += 4.2; }
      y += 1.5;
    }
    const ps = (a.photos || []).filter(p => pinfo[p]);
    if (ps.length) {
      const th = 24; let x0 = M + 2; need(th + 7);
      for (const p of ps) {
        const pi = pinfo[p]; const tw = Math.min(th * pi.w / pi.h, CW - 4);
        if (x0 + tw > W - M) { x0 = M + 2; y += th + 7; need(th + 7); }
        d.image(pi.data, pi.w, pi.h, x0, y + 1, tw, th);
        d.text('Bilde ' + pnum[p], x0, y + th + 4.6, { size: 7.5, color: C.muted });
        x0 += tw + 5;
      }
      y += th + 7.5;
    }
    for (const act of a.actions || []) actBlock(act);
    d.line(M, y, W - M, y, C.line);
  }

  // Sammendrag
  const hits = items.filter(x => x.it.type !== 'heading' && x.it.type !== 'info' && (isFlag(x.it, ins.answers[x.key]) || (ins.answers[x.key]?.actions || []).length));
  secHeader('Avvik og handlinger', `${st.flags} avvik, ${st.actions} handlinger`);
  if (!hits.length) { need(9); d.text('Ingen avvik eller handlinger registrert.', M + 2, y + 5.5, { size: 10, color: C.muted }); y += 9; }
  for (const x of hits) {
    need(14);
    const ctx = x.sec.title + (x.sec.repeat ? ` – ${x.sec.unit} ${x.i + 1}` : '');
    d.text(ctx, M + 2, y + 4, { size: 8, color: C.muted }); y += 4.5;
    itemBlock(x);
  }

  // Avvik meldt siden forrige runde
  if (tpl.id !== 'avvik') {
    const sites = SITES.filter(x => x.tpls.includes(tpl.id)).map(x => x.id);
    const covered = new Set(ANLEGG.filter(a => a.cov.some(c => c.t === tpl.id)).map(a => a.id));
    const prev = Object.values(S.ins).filter(i => i.templateId === tpl.id && i.status === 'complete' && i.id !== ins.id && (i.date || '') <= (ins.date || ''))
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
    const after = prev ? (prev.completedAt || parseISO(prev.date).getTime()) : 0, until = ins.completedAt || Date.now();
    const av = Object.values(S.ins).filter(i => i.templateId === 'avvik' && i.status === 'complete' && sites.includes(i.siteId || ANL[i.anl]?.site)
      && (i.annet || covered.has(i.anl)) && (i.completedAt || 0) > after && (i.completedAt || 0) <= until).sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    if (av.length) {
      secHeader('Avvik meldt siden forrige runde', `${av.length} ${av.length === 1 ? 'avviksmelding' : 'avviksmeldinger'}${prev ? ' etter ' + fmt(prev.date) : ''}`);
      for (const i of av) {
        need(14);
        d.text(`${fmt(i.date)} · ${i.anl && ANL[i.anl] ? ANL[i.anl].name : 'Annet'}${(i.where || '').trim() ? ' · ' + i.where.trim() : ''} · meldt av ${i.by || '-'}`, M + 2, y + 4, { size: 8, color: C.muted }); y += 5.5;
        for (const a of Object.values(i.answers)) for (const act of a.actions || []) actBlock(act);
      }
    }
  }

  // Alle seksjoner
  let last = null;
  for (const x of items) {
    const id = x.sec.id + '#' + x.i;
    if (id !== last) { last = id; secHeader(x.sec.title + (x.sec.repeat ? ` – ${x.sec.unit} ${x.i + 1}` : '')); }
    itemBlock(x);
  }

  // Bildeoversikt
  if (pc) {
    secHeader('Bildeoversikt', `${pc} ${pc === 1 ? 'bilde' : 'bilder'}`);
    const colW = (CW - 8) / 2, maxH = 95; const list = Object.keys(pnum).sort((a, b) => pnum[a] - pnum[b]);
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2).map(p => {
        const pi = pinfo[p]; let w = colW, h = w * pi.h / pi.w; if (h > maxH) { h = maxH; w = h * pi.w / pi.h; }
        return { p, pi, w, h, cap: d.wrap(`Bilde ${pnum[p]} – ${pi.label}`, 8.5, false, colW) };
      });
      const rowH = Math.max(...pair.map(o => o.h + 3 + o.cap.length * 3.8)) + 5;
      need(rowH);
      pair.forEach((o, j) => {
        const x0 = M + j * (colW + 8);
        d.image(o.pi.data, o.pi.w, o.pi.h, x0, y + 2, o.w, o.h);
        o.cap.forEach((l, k) => d.text(l, x0, y + o.h + 6 + k * 3.8, { size: 8.5, color: C.muted }));
      });
      y += rowH;
    }
  }

  // Bunntekst
  const n = d.pages.length;
  for (let i = 0; i < n; i++) {
    d.usePage(i);
    d.line(M, 297 - 13, W - M, 297 - 13, C.line);
    d.text(`${tpl.name} · ${ins.site} · ${fmt(ins.date)}`, M, 297 - 8.5, { size: 8, color: C.muted });
    d.text(`Side ${i + 1} av ${n}`, W - M, 297 - 8.5, { size: 8, color: C.muted, align: 'right' });
  }
  return d.output();
}

/* ---------- Sikkerhetskopi ---------- */
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function exportBackup() {
  toast('Lager sikkerhetskopi…', 8000);
  await flushAll();
  const photos = [];
  for (const p of await DB.all('photos')) photos.push({ id: p.id, w: p.w, h: p.h, data: await blobToB64(p.blob) });
  const data = { app: 'oseberg-inspeksjon', version: 1, exportedAt: new Date().toISOString(), settings: { ...S.settings, trello: undefined }, inspections: await DB.all('inspections'), photos };
  const file = new File([JSON.stringify(data)], `inspeksjoner-sikkerhetskopi-${todayISO()}.json`, { type: 'application/json' });
  S.settings.lastBackup = todayISO(); saveSettings();
  S.ready_file = { file, title: 'Sikkerhetskopien er klar' };
  $('#toast').hidden = true; renderSheet();
}
$('#importpick').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'oseberg-inspeksjon') throw new Error('Filen er ikke en sikkerhetskopi fra denne appen.');
    let added = 0;
    if (data.settings && data.settings.notes) { S.settings.notes = { ...data.settings.notes, ...S.settings.notes }; saveSettings(); }
    for (const p of data.photos || []) {
      const bin = Uint8Array.from(atob(p.data), c => c.charCodeAt(0));
      await DB.put('photos', { id: p.id, w: p.w, h: p.h, blob: new Blob([bin], { type: 'image/jpeg' }) });
    }
    for (const i of data.inspections || []) {
      const mine = S.ins[i.id];
      if (!mine || (i.updatedAt || 0) > (mine.updatedAt || 0)) { S.ins[i.id] = i; await DB.put('inspections', i); added++; }
    }
    render(); toast(`Gjenopprettet ${added} inspeksjoner`);
  } catch (err) { toast('Kunne ikke gjenopprette: ' + err.message, 5000); }
});

/* ---------- Trello ---------- */
const trelloCfg = () => { const t = S.settings.trello || {}; return t.key && t.token ? t : null; };
async function tfetch(method, path, params = {}, body) {
  const cfg = trelloCfg(); if (!cfg) throw new Error('Ikke koblet til Trello');
  const q = new URLSearchParams({ ...params, key: cfg.key, token: cfg.token }).toString();
  const r = await fetch(`https://api.trello.com/1/${path}?${q}`, { method, body });
  if (!r.ok) { const e = new Error('Trello ' + r.status); e.status = r.status; e.body = (await r.text().catch(() => '')).slice(0, 160); throw e; }
  return r.json();
}
function trelloErr(e) {
  if (e.status === 401) return 'Trello avviste nøkkel eller token. Sjekk at begge er limt inn riktig, uten mellomrom.';
  if (e.status === 404) return 'Trello finner ikke tavlen Vaktmester. Har kontoen din tilgang?';
  if (e.status) return `Trello ga feil ${e.status}. ${e.body || ''}`;
  return navigator.onLine ? 'Fikk ikke kontakt med Trello. Sjekk at https://heose.github.io er lagt til under Allowed origins for API-nøkkelen.' : 'Ingen nett. Handlingene sendes når du har dekning igjen.';
}
async function trelloMembers() {
  const t = S.settings.trello;
  if (t.members && Date.now() - (t.membersAt || 0) < 7 * 864e5) return t.members;
  t.members = await tfetch('GET', `boards/${TRELLO.board}/members`, { fields: 'fullName,username' });
  t.membersAt = Date.now(); saveSettings(); return t.members;
}
const nrm = s => String(s || '').trim().toLowerCase();
function findMember(list, who) {
  const w = nrm(who); if (!w) return null;
  return list.find(m => nrm(m.fullName) === w || nrm(m.username) === w) || list.find(m => nrm(m.fullName).split(' ')[0] === w) || null;
}
function cardDesc(ins, tpl, key, a, act) {
  const { sec, it, inst } = findItem(tpl, key);
  const val = Array.isArray(a.value) ? a.value.join(', ') : (a.value ?? '');
  const L = [];
  if ((act.text || '').includes('\n')) L.push(act.text.trim(), '');
  L.push(`**Sjekkliste:** ${tpl.name}`, `**Sted:** ${ins.site}`, `**Dato:** ${fmt(ins.date)}`);
  if (ins.anl && ANL[ins.anl]) L.push(`**Anlegg:** ${ANL[ins.anl].name}`); else if (ins.annet) L.push('**Anlegg:** Annet');
  if ((ins.where || '').trim()) L.push(`**Hvor:** ${ins.where.trim()}`);
  L.push(`**Punkt:** ${sec ? sec.title + (sec.repeat ? ' – ' + sec.unit + ' ' + (inst + 1) : '') : ''}${it ? ' › ' + it.label : ''}`);
  if (val !== '') L.push(`**Svar:** ${val}`);
  if (a.note) L.push(`**Notat:** ${a.note}`);
  L.push(`**Prioritet:** ${act.prio || 'Lav'}`, `**Ansvarlig:** ${act.who || '-'}`, `**Utført av:** ${ins.by}`);
  return L.join('\n');
}
const saveIns = ins => { ins.updatedAt = Date.now(); scheduleSave(ins.id); return flush(ins.id); };
const PRIO_LABEL = { 'Høy': ['Prioritet høy', 'red'], 'Middels': ['Prioritet middels', 'orange'], 'Lav': ['Prioritet lav', 'yellow'] };
async function prioLabel(prio) {
  const def = PRIO_LABEL[prio || 'Lav']; if (!def) return null;
  const t = S.settings.trello; t.labels ||= {};
  if (t.labels[def[0]]) return t.labels[def[0]];
  const all = await tfetch('GET', `boards/${TRELLO.board}/labels`, { fields: 'name,color', limit: 100 });
  let l = all.find(x => (x.name || '').toLowerCase() === def[0].toLowerCase());
  if (!l) l = await tfetch('POST', 'labels', { name: def[0], color: def[1], idBoard: TRELLO.board });
  t.labels[def[0]] = l.id; saveSettings(); return l.id;
}
async function sendCard(ins, tpl, key, a, act, listId) {
  const members = await trelloMembers().catch(() => []);
  const lab = await prioLabel(act.prio).catch(e => { toast('Prioritetsetikett feilet: ' + trelloErr(e), 6000); return null; });
  const mem = findMember(members, act.who);
  const params = { idList: listId, name: (act.text || '').trim().split('\n')[0].slice(0, 150), desc: cardDesc(ins, tpl, key, a, act), pos: 'top' };
  if (act.due) params.due = new Date(parseISO(act.due).getTime() + 12 * 36e5).toISOString();
  if (mem) params.idMembers = mem.id;
  if (lab) params.idLabels = lab;
  let c;
  try { c = await tfetch('POST', 'cards', params); }
  catch (e) { if (!lab || e.status !== 400) throw e; S.settings.trello.labels = {}; saveSettings(); delete params.idLabels; c = await tfetch('POST', 'cards', params); }
  act.trello = { id: c.id, url: c.shortUrl || c.url, done: false, pics: 0 };
  await saveIns(ins);
}
async function sendPhotos(ins, a, act) {
  const pics = a.photos || [];
  while (act.trello.pics < pics.length) {
    const n = act.trello.pics, rec = await DB.get('photos', pics[n]);
    if (rec) { const f = new FormData(); f.append('file', rec.blob, `bilde-${n + 1}.jpg`); f.append('name', `Bilde ${n + 1}`); await tfetch('POST', `cards/${act.trello.id}/attachments`, {}, f); }
    act.trello.pics = n + 1; await saveIns(ins);
  }
}
function trelloPending() {
  let n = 0, empty = 0;
  for (const ins of Object.values(S.ins)) {
    if (ins.status !== 'complete') continue;
    for (const a of Object.values(ins.answers)) for (const act of a.actions || []) {
      if (!act.trello) { if ((act.text || '').trim()) n++; else empty++; }
      else if (!!act.done !== !!act.trello.done || act.trello.pics < (a.photos || []).length) n++;
    }
  }
  return { n, empty };
}
function trelloHomeLine() {
  const { n, empty } = trelloPending();
  if (!trelloCfg()) return Object.values(S.ins).some(i => i.status === 'complete') ? '<p class="muted small">Koble til Trello under Innstillinger for å sende handlingene automatisk.</p>' : '';
  if (!n && !empty) return '';
  return `<div class="tr-line"><span class="muted small">${n ? n + ' venter på sending til Trello' : ''}${empty ? (n ? ' · ' : '') + empty + ' uten tekst (sendes ikke)' : ''}</span>${n ? '<button class="link" data-act="tr-sync">Send nå</button>' : ''}</div>`;
}
const trTag = (act, sent) => act.trello && act.trello.id
  ? `<a class="tr-tag" href="${esc(act.trello.url)}" target="_blank" rel="noopener">${act.closedIn ? 'Lukket i ' + esc(act.closedIn) : 'I Trello'} ↗</a>`
  : (sent ? '<span class="tr-tag wait">Venter på Trello</span>' : '');
async function syncTrello(manual) {
  if (S.syncing) return;
  if (!trelloCfg()) { if (manual === true) toast('Legg inn API-nøkkel og token under Innstillinger først.'); return; }
  if (!navigator.onLine) { if (manual === true) toast('Ingen nett. Handlingene sendes når du har dekning igjen.'); return; }
  S.syncing = true; let sent = 0, upd = 0, err = null, closed = 0;
  try {
    const tracked = [];
    for (const ins of Object.values(S.ins)) for (const a of Object.values(ins.answers)) for (const act of a.actions || []) if (act.trello?.id && !act.done) tracked.push({ ins, act });
    if (tracked.length) {
      const cards = await tfetch('GET', `boards/${TRELLO.board}/cards/all`, { fields: 'closed,dueComplete' });
      if (Array.isArray(cards)) {
        const byId = Object.fromEntries(cards.map(c => [c.id, c]));
        for (const { ins, act } of tracked) {
          let c = byId[act.trello.id];
          if (!c) { try { c = await tfetch('GET', `cards/${act.trello.id}`, { fields: 'closed,dueComplete' }); } catch (e) { if (e.status !== 404) continue; c = null; } }
          if (!c || c.closed || c.dueComplete) { act.done = true; act.doneAt = todayISO(); act.closedIn = !c ? 'Trello (kortet er slettet)' : c.closed ? 'Trello (arkivert)' : 'Trello'; act.trello.done = true; closed++; await saveIns(ins); }
        }
      }
    }
    for (const ins of Object.values(S.ins)) {
      if (ins.status !== 'complete') continue;
      const tpl = TPL[ins.templateId]; if (!tpl) continue;
      for (const [key, a] of Object.entries(ins.answers)) for (const act of a.actions || []) {
        const listId = TRELLO.lists[listKey(ins, key)];
        if (!act.trello) { if (!listId || !(act.text || '').trim()) continue; await sendCard(ins, tpl, key, a, act, listId); sent++; }
        if (!act.trello) continue;
        if (act.trello.pics < (a.photos || []).length) await sendPhotos(ins, a, act);
        if (!!act.done !== !!act.trello.done) {
          if (act.due) await tfetch('PUT', `cards/${act.trello.id}`, { dueComplete: act.done ? 'true' : 'false' });
          act.trello.done = !!act.done; upd++; await saveIns(ins);
        }
      }
    }
  } catch (e) { err = e; }
  S.syncing = false;
  await flushAll();
  if (err) { if (err.status || manual === true) toast(trelloErr(err), 7000); }
  else if (sent || closed) toast([sent ? `${sent} ${sent === 1 ? 'handling' : 'handlinger'} sendt til Trello` : '', closed ? `${closed} lukket i Trello` : ''].filter(Boolean).join(' · '));
  else if (manual === true) toast(upd ? 'Trello er oppdatert' : 'Ingen handlinger venter');
  if (S.view !== 'ins' && !S.showSettings) render();
}

/* ---------- Oppstart ---------- */
(async () => {
  render();
  try {
    await DB.open();
    for (const i of await DB.all('inspections')) S.ins[i.id] = i;
    S.ready = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    S.error = 'Lagringen på enheten er ikke tilgjengelig. Privat nettlesing blokkerer den; åpne appen fra hjemskjermen.';
  }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded && S.view !== 'ins') { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }
  syncTrello();
  window.addEventListener('online', () => syncTrello());
})();
