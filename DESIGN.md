# Design: Glass

Godkjent 16.11.2026 (retning B). Skisse: https://claude.ai/artifact/GwWkTt8E3sRyJsbjtoaS4r. Tokens og stil ligger øverst i `index.html`.

## Idé
Samme familie som Planz og Fotfeste: frostet glass over mykt lys i turkis, blått og sand. Funksjonen er uendret, bare drakten er ny.

## Grunnregler
- Lyst og mørkt følger systemet. Alle farger er variabler i `:root`, aldri faste farger i komponenter.
- Én skrift: Schibsted Grotesk, ligger i appen (`fonts/`, OFL-lisens) så den virker offline.
- Kort: halvgjennomsiktige med lys kant og myk skygge, radius 20. Seksjoner i inspeksjon radius 26.
- Uskarphet (backdrop-filter) bare på topp, fremdrift, meny, nederste knapperad, seksjoner og paneler. Listekort har glass uten uskarphet, av hensyn til eldre iPhoner.
- Meny og knapperad i inspeksjon flyter nederst som en glasspille. Valgt fane er mørk.
- Ingen overskrifter med store bokstaver. Setninger med stor forbokstav bare først.
- Trykkflater minst 44 px. Hvit tekst bare på fylte farger som holder AA (`--ok-fill`, `--bad-fill`, `--na-fill`).

## Status og farger
- Grønn: Ok. Rød: Ikke OK og avvik. Grå: N/A og Merknad. Turkis: valgt og hovedhandling. Gul: handling som bør opprettes og innmeldinger.
- Fremdriften i en inspeksjon er én stolpe per punkt i samme farger. Over 48 punkter vises en vanlig stolpe.

## Tekst
Norsk bokmål. Knapper sier hva som skjer: «Start», «Meld avvik», «Neste ubesvarte», «Til fullføring».
