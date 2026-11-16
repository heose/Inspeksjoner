/* Sjekkliste: Legionellaspyling av tappevann (fjernvarme med legionellaknapp, f.eks. Skagerak Varme).
   Lim funksjonen inn i content.js (innholdsfilen i Hub), og legg til én mal per bygg i TEMPLATES, f.eks.:

     legionella('leg_op', 'Bygg A', 'op', ['Butikk A', 'Kafé B', 'Kontor 2. etg', 'Felles garderobe'])

   og legg id-en ('leg_op') i tpls for bygget i SITES. Last opp content.js i Argus (Mer → Administrator).

   Leietakerlisten er bare utgangspunktet første gang. Senere runder starter med samme leietakere som forrige
   fullførte runde. Leietakere kan legges til nederst i skjemaet, og «Ikke aktuelt» brukes for de som ikke har tappepunkter.

   Grenser og råd bygger på brevet fra fjernvarmeleverandøren (75 °C, 10 min per tappepunkt, bypass over blandeventil,
   ikke for mange tappepunkt samtidig) og Helsedirektoratets legionellaveileder (minst 60 °C ved tappested innen 1 min
   i normal drift, minst 70 °C ved sjokkoppvarming, kaldtvann under 20 °C). */
const legionella = (id, site, tl, leietakere = []) => ({
  id, name: 'Legionellaspyling ' + site, site, months: 6, tl,
  sections: [
    { id: 'forb', title: 'Før spyledagen', items: [
      { id: 'i1', type: 'info', label: 'Kl. 08–10 kan tappevannet bli 75 °C uten at knappen er trykket. Kl. 10–14 holder sentralen minst 75 °C, og legionellaknappen kan brukes.' },
      { id: 'varslet', type: 'yn', label: 'Alle leietakere og brukere er varslet om dato, tidsrom og skoldefare (opptil 75 °C)' },
      { id: 'skilt', type: 'yn', label: 'Varselskilt om skoldefare er satt opp ved inngang, dusjer og håndvasker' },
      { id: 'tilgang', type: 'yn', label: 'Tilgang til alle lokaler er avtalt (nøkler eller kontaktperson)' },
      { id: 'sarbar', type: 'yn', label: 'Tappesteder der barn, eldre eller andre sårbare kan bruke vannet er stengt eller bevoktet', help: 'Svar N/A hvis bygget ikke har slike brukere.' },
      { id: 'termometer', type: 'yn', label: 'Termometer som måler over 80 °C, verneutstyr (hansker, briller) og klokke er med' },
    ] },
    { id: 'sentral', title: 'Kundesentral og teknisk rom', items: [
      { id: 'vv_for', type: 'number', label: 'Varmtvann ut fra sentralen før aktivering', unit: '°C', short: 'Før' },
      { id: 'foto_sentral', type: 'photo', label: 'Bilde av temperaturvisning i sentralen før aktivering', opt: true },
      { id: 'blandeventil', type: 'choice', label: 'Er det blandeventil på varmtvannet i teknisk rom?', options: ['Ja', 'Nei'], help: 'Med blandeventil blir maks 65 °C ut til tappepunktene.' },
      { id: 'bypass', type: 'yn', label: 'Bypass over blandeventilen er etablert', showIf: { item: 'blandeventil', eq: 'Ja' } },
      { id: 'knapp', type: 'ok', label: 'Legionellaknappen er holdt inne ca. 3 sekunder, og lampen lyser', help: 'Knappen står på skapdøren til kundesentralen. Funksjonen slår seg av etter 2 timer. Trykk på nytt hvis spylingen ikke er ferdig.' },
      { id: 'knapp_kl', type: 'text', label: 'Klokkeslett knappen ble aktivert' },
      { id: 'vv_under', type: 'number', label: 'Varmtvann ut fra sentralen etter aktivering', unit: '°C', min: 70 },
      { id: 'vvc', type: 'number', label: 'Temperatur på VVC-retur (sirkulasjon) under spyling', unit: '°C', min: 60, opt: true, help: 'Hvis måler finnes. Under 60 °C tyder på at deler av nettet ikke blir varmt nok.' },
    ] },
    { id: 'lt', title: 'Leietaker', repeat: true, unit: 'Leietaker', nameItem: 'navn', names: leietakere,
      overview: ['status', 'antall', 't_for', 't_spyl'], overviewTitle: 'Leietakeroversikt', items: [
      { id: 'navn', type: 'text', label: 'Leietaker / lokale' },
      { id: 'status', type: 'choice', label: 'Status', options: ['Spylt', 'Ikke tilgang', 'Ikke aktuelt'], flag: ['Ikke tilgang'], short: 'Resultat' },
      { id: 'antall', type: 'number', label: 'Antall tappepunkter spylt (vask, dusj, tekjøkken, oppvaskmaskin o.l.)', unit: 'stk', short: 'Punkter', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'foto_for', type: 'photo', label: 'Bilde av termometeret: temperatur før spyling', short: 'Bilde', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 't_for', type: 'number', label: 'Temperatur før spyling (etter 1 min tapping)', unit: '°C', short: 'Før', showIf: { item: 'status', eq: 'Spylt' }, help: 'I normal drift bør vannet nå minst 60 °C innen 1 minutt.' },
      { id: 't_spyl', type: 'number', label: 'Høyeste temperatur under spyling, ved det fjerneste tappepunktet', unit: '°C', short: 'Spyling', min: 65, showIf: { item: 'status', eq: 'Spylt' }, help: 'Mål: 70 °C eller mer. Under 65 °C har spylingen liten effekt.' },
      { id: 'tid', type: 'yn', label: 'Hvert tappepunkt rant med fullt varmt vann i minst 10 minutter', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'samtidig', type: 'yn', label: 'Ikke for mange tappepunkter åpne samtidig (temperaturen holdt seg)', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'dusj', type: 'okm', label: 'Dusjhoder og perlatorer er tatt av under spyling, og rengjort eller avkalket ved behov', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'kaldt', type: 'yn', label: 'Kaldtvann er spylt på de samme tappepunktene', showIf: { item: 'status', eq: 'Spylt' } },
      { id: 'lite_brukt', type: 'yn', label: 'Lokalet har tappepunkter som sjelden brukes', options: ['Ja', 'Nei', 'N/A'], flag: [], showIf: { item: 'status', eq: 'Spylt' }, help: 'Ja: skriv hvilke i notat. De bør spyles ukentlig.' },
      { id: 'foto_spyl', type: 'photo', label: 'Bilde av termometeret under spyling', opt: true, showIf: { item: 'status', eq: 'Spylt' } },
    ] },
    { id: 'avsl', title: 'Avslutning', items: [
      { id: 'knapp_av', type: 'ok', label: 'Legionellafunksjonen er avsluttet (lampen er av), eller har gått ut etter 2 timer' },
      { id: 'tilbake', type: 'yn', label: 'Bypass er fjernet og blandeventilen fungerer som normalt', showIf: { item: 'blandeventil', eq: 'Ja' } },
      { id: 'vv_etter', type: 'number', label: 'Varmtvann ved et tappepunkt etter avslutning', unit: '°C', max: 65, help: 'Skal være tilbake på normal temperatur, så ingen skolder seg.' },
      { id: 'lekk', type: 'ok', label: 'Ingen lekkasjer eller skader etter spylingen (pakninger, koblinger, berederrom)' },
      { id: 'info_ferdig', type: 'yn', label: 'Leietakere er informert om at spylingen er ferdig, og varselskilt er tatt ned' },
      { id: 'i2', type: 'info', label: 'Ved problemer med sentralen: ring fjernvarmeleverandørens vakttelefon. Mangler tilgang hos en leietaker, avtal ny spyling (f.eks. en dag med utetemperatur under -15 °C).' },
    ] },
  ],
});
