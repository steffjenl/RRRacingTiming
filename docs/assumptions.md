# Aannames en onzekerheden

## Bewezen basis

- Port default is 9460 (site config snippet)
- GMT default is 2 (site config snippet)
- WebSocket-first met polling fallback

## Aannames in huidige CLI

1. `--url` met `http(s)` betekent polling endpoint.
2. `--url` met `ws(s)` betekent directe ws connectie.
3. Zonder `--url` worden host/port defaults gebruikt en URLs opgebouwd.

## Nog te testen hypotheses

1. Sommige field ids in element updates zijn center- of eventspecifiek.
2. Niet elke feed levert teaminformatie consistent in de grid.
3. Polling endpoint kan per deploymentpad relatief anders zijn.

## Legacy beperkingen

- Flash XMLSocket pad wordt niet in Node geïmplementeerd.
