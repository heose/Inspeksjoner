/* Sjekkliste: Legionellaspyling av tappevann (fjernvarme med legionellaknapp, f.eks. Skagerak Varme).
   Lim funksjonen inn i content.js (innholdsfilen i Hub), og legg til én mal per bygg i TEMPLATES, f.eks.:

     legionella('leg_op', 'Bygg A', 'op')

   og legg id-en ('leg_op') i tpls for bygget i SITES. Last opp content.js i Argus (Mer → Administrator).

   Ingen leietakere er forhåndsdefinert. Hver runde starter med én tom leietaker, og flere legges til med
   «+ Legg til leietaker» (i leietakeroversikten og nederst i skjemaet).

   Grenser og råd bygger på brevet fra fjernvarmeleverandøren (75 °C, 10 min per tappepunkt, bypass over blandeventil,
   ikke for mange tappepunkt samtidig) og Helsedirektoratets legionellaveileder (minst 70 °C ved sjokkoppvarming).
   Punktene er gjennomgått og redigert i regnearket «Legionellaspyling sjekkpunkter». */
const legionella = (id, site, tl) => ({
  id, name: 'Legionellaspyling ' + site, site, months: 6, tl,
  sections: [
    { id: 'forb', title: 'Før spyledagen', items: [
      { id: 'varslet', type: 'yn', label: 'Alle leietakere og brukere er varslet om dato, tidsrom og skoldefare (opptil 75 °C)' },
      { id: 'skilt', type: 'yn', label: 'Varsel om skoldefare er gitt til brukere som har regelmessig bruk av varmtvann (frisør, legesenter osv.)' },
      { id: 'tilgang', type: 'yn', label: 'Tilgang til alle lokaler er avtalt (nøkler eller kontaktperson)' },
      { id: 'sarbar', type: 'choice', label: 'Tappesteder der barn, eldre eller andre sårbare kan bruke vannet er stengt eller bevoktet', options: ['Ja', 'Nei', 'N/A'], flag: ['Nei'], help: 'Svar N/A hvis bygget ikke har slike brukere.' },
      { id: 'termometer', type: 'yn', label: 'Termometer som måler over 80 °C.' },
    ] },
    { id: 'sentral', title: 'Kundesentral og teknisk rom', items: [
      { id: 'vv_for', type: 'number', label: 'Varmtvann ut fra sentralen før aktivering', unit: '°C' },
      { id: 'foto_sentral', type: 'photo', label: 'Bilde av temperaturvisning i sentralen før aktivering', opt: true },
      { id: 'blandeventil', type: 'yn', label: 'Er det blandeventil på varmtvannet i teknisk rom?', options: ['Ja', 'Nei'], flag: [], help: 'Med blandeventil blir maks 65 °C ut til tappepunktene.' },
      { id: 'bypass', type: 'yn', label: 'Bypass over blandeventilen er etablert', showIf: { item: 'blandeventil', eq: 'Ja' }, help: 'Svar N/A hvis bygget ikke har slike.' },
      { id: 'knapp', type: 'ok', label: 'Legionellaknappen er holdt inne ca. 3 sekunder, og lampen lyser', help: 'Knappen står på skapdøren til kundesentralen. Funksjonen slår seg av etter 2 timer. Trykk på nytt hvis spylingen ikke er ferdig.' },
      { id: 'vv_under', type: 'number', label: 'Varmtvann ut fra sentralen etter aktivering', unit: '°C', min: 70 },
      { id: 'vvc', type: 'number', label: 'Temperatur på VVC-retur (sirkulasjon) under spyling', unit: '°C', min: 60, opt: true, help: 'Hvis måler finnes. Under 60 °C tyder på at deler av nettet ikke blir varmt nok.' },
    ] },
    { id: 'lt', title: 'Leietaker', repeat: true, unit: 'Leietaker', nameItem: 'navn',
      overview: ['status', 'antall'], overviewTitle: 'Leietakeroversikt', items: [
      { id: 'tid', type: 'info', label: 'Hvert tappepunkt tappes med fullt varmt vann (varmest) i minst 10 minutter', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'navn', type: 'text', label: 'Leietaker / lokale' },
      { id: 'status', type: 'choice', label: 'Status', options: ['Spylt', 'Ikke tilgang', 'Ikke aktuelt'], flag: ['Ikke tilgang'], short: 'Resultat' },
      { id: 'antall', type: 'number', label: 'Antall tappepunkter spylt (vask, dusj, tekjøkken, oppvaskmaskin o.l.)', unit: 'stk', short: 'Punkter', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'samtidig', type: 'yn', label: 'Ikke for mange tappepunkter åpne samtidig (temperaturen holdt seg)', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'kaldt', type: 'yn', label: 'Kaldtvann er spylt på de samme tappepunktene', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'lite_brukt', type: 'yn', label: 'Lokalet har tappepunkter som sjelden brukes', options: ['Ja', 'Nei', 'N/A'], flag: [], showIf: { item: 'status', eq: 'Spylt' }, help: 'Ja: skriv hvilke i notat. De bør spyles ukentlig.' },
    ] },
    { id: 'avsl', title: 'Avslutning', items: [
      { id: 'knapp_av', type: 'ok', label: 'Legionellafunksjonen er avsluttet (lampen er av), eller har gått ut etter 2 timer' },
      { id: 'tilbake', type: 'yn', label: 'Bypass er fjernet og blandeventilen fungerer som normalt', showIf: { item: 'blandeventil', eq: 'Ja' } },
      { id: 'vv_etter', type: 'number', label: 'Varmtvann ved et tappepunkt etter avslutning', unit: '°C', max: 65, help: 'Skal være tilbake på normal temperatur, så ingen skolder seg.' },
      { id: 'lekk', type: 'ok', label: 'Ingen lekkasjer eller skader etter spylingen (pakninger, koblinger, berederrom)' },
      { id: 'info_ferdig', type: 'yn', label: 'Leietakere er informert om at spylingen er ferdig.' },
      { id: 'i2', type: 'info', label: 'Ved problemer med sentralen: ring fjernvarmeleverandørens vakttelefon. Mangler tilgang hos en leietaker, avtal ny spyling (f.eks. en dag med utetemperatur under -15 °C).' },
    ] },
  ],
});
