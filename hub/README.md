# Argus Hub – oppsett (Cloudflare, gratis)

Tar ca. 10 minutter. Gjøres i nettleser på cloudflare.com, helst på PC.

1. Opprett gratis konto på dash.cloudflare.com (ingen betalingskort).
2. **Lagring:** Storage & Databases → KV → Create namespace. Navn: `argus`.
3. **Worker:** Workers & Pages → Create → Start with Hello World → Deploy. Navn: `argus-hub`.
4. Åpne Workers → argus-hub → **Edit code**. Slett alt, lim inn hele `hub/worker.js`, trykk Deploy.
5. **Binding:** argus-hub → Settings → Bindings → Add → KV namespace. Variabelnavn: `ARGUS`. Velg `argus`. Deploy.
6. **Kode:** Settings → Variables and Secrets → Add. Type: Secret. Navn: `CODE`. Verdi: en lang, tilfeldig kode (minst 20 tegn). Deploy.
7. Kopier adressen til Worker (typisk `https://argus-hub.<navn>.workers.dev`).
8. I Argus: Innstillinger → Argus Hub. Lim inn adresse og kode, trykk **Test Hub**.
   Samme adresse og kode legges inn på alle enheter.

Kostnad: 0 kr. Gratisgrensene (100 000 kall/dag, 1 000 skrivinger/dag til KV, 1 GB) er langt over behovet.

## Trello via Hub

Hub sender Trello-kall for appen, så nye enheter ikke trenger nøkkel og token.

1. Worker → Settings → Variables and Secrets → legg til to secrets: `TRELLO_KEY` (API-nøkkelen) og `TRELLO_TOKEN` (store eller små bokstaver spiller ingen rolle).
2. Lim inn nyeste `hub/worker.js` under Edit code og Deploy.
3. I Argus: Innstillinger → Test tilkobling. Når Hub-kode er satt, brukes Hub automatisk og feltene for nøkkel og token skjules.

Hub tillater bare kallene appen trenger mot tavlen Vaktmester. Bytter du token i Trello, oppdaterer du `TRELLO_TOKEN` her.

## Hub v2: koder per bruker, innhold i Hub

**Koder per bruker (valgfritt, anbefalt)**
1. Settings → Variables and Secrets → legg til secret `CODES` med JSON, én kode per person:
   `{"henrik":"kode-til-henrik","kari":"kode-til-kari"}`. Bruk lange koder av små bokstaver og tall.
2. Legg til secret `ADMINS` med navnene som får laste opp innhold, f.eks. `henrik`.
3. Den gamle `CODE` virker fortsatt som felles administratorkode. Slett den når alle har fått sin egen.
4. Vil du stenge ute én person, fjerner du vedkommende fra `CODES`.

**Sikkerhet**
- Etter 10 gale koder fra samme adresse blir den sperret i 15 minutter.
- Loggen får navnet fra koden (`user`), ikke bare det som står i appen.

**Innhold (sjekklister, bygg, anlegg)**
- Ligger ikke lenger i appen på GitHub, men i Hub. Appen henter det etter at koden er lagt inn, og lagrer det på enheten så alt virker uten nett.
- Selve filen holdes utenfor repoet. Last opp ny versjon i Argus: Innstillinger → Last opp innholdsfil (bare administrator).
- Appen sjekker for nytt innhold ved hver synk og bytter det ut når du ikke er midt i en inspeksjon.

**Rekkefølge ved innføring**
1. Lim inn ny `worker.js` i Cloudflare og Deploy.
2. Publiser ny app (main).
3. Åpne appen på PC, legg inn adresse og administratorkode, trykk «last opp innholdsfil» og velg `content.js`.
4. Telefonene henter innholdet selv neste gang de åpnes med nett.

## Ekstern innmelding (leietakere og andre)

Åpen side: `https://heose.github.io/Inspeksjoner/melding.html` (del lenken på SMS, eller bruk QR-koden).

1. Cloudflare → Turnstile → Add widget. Hostname `heose.github.io`, modus Managed. Site key står i `melding.html`.
2. Worker → Variables and Secrets → secret `TURNSTILE_SECRET` (Secret key fra Turnstile).
3. Lim inn nyeste `hub/worker.js` og Deploy.
4. Avsender skriver bygg eller leietaker i fritekst (ingen bygg vises på siden, så den kan brukes for flere kunder). I Argus dukker meldinger opp som «Innmeldinger» på forsiden (oppdateres ved synk, eller trykk Oppdater nå). Velg bygg, rediger tittel og trykk Godkjenn til Trello. Kortet får etikett «Ekstern melding», bilder og kontaktinfo.

Vern: robotsjekk (Turnstile), skjult felt mot roboter, maks 5 meldinger per time per avsender, maks 100 per døgn totalt, maks 3 JPEG-bilder per melding og 6 MB totalt. Meldinger og bilder slettes automatisk etter 90 dager.
