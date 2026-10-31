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

1. Worker → Settings → Variables and Secrets → legg til to secrets: `TRELLO_KEY` (API-nøkkelen) og `TRELLO_TOKEN`.
2. Lim inn nyeste `hub/worker.js` under Edit code og Deploy.
3. I Argus: Innstillinger → Test tilkobling. Når Hub-kode er satt, brukes Hub automatisk og feltene for nøkkel og token skjules.

Hub tillater bare kallene appen trenger mot tavlen Vaktmester. Bytter du token i Trello, oppdaterer du `TRELLO_TOKEN` her.
