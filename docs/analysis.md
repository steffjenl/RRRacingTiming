# Analysis van javascript_live_timing.min.js

## Scope

Bronbestand:
- `specs/apex-timing/javascript_live_timing.min.js`

Analysefocus:
- entrypoints
- transportmechanismen
- endpoints
- message flow
- datavelden
- reconnect
- parsing

## Entrypoints

- `window.onload` roept `tzfir(configHost, configPort)`.
- `window.onbeforeunload` roept `tzfjr()` voor cleanup.

## Netwerkmechanismen

Bewezen in code:
1. WebSocket (`WebSocket` / `MozWebSocket`) via `tzfjz()`.
2. Legacy Flash XMLSocket fallback via `tzfkw()` / `jsXMLSocket`.
3. XHR polling via `tzflt()` met `live_ajax.php`.

Geen EventSource gevonden.

## Endpoint patronen

- WebSocket:
  - `ws://HOST:(PORT+2)/`
  - `wss://HOST:(PORT+3)/`
- Polling:
  - `../commonv2/functions/live_ajax.php?version=...&init=...&index=...&port=(PORT+4)&counter=...&duration=...&id=...&ignored=...`

## Message / event flow

- Transportpayload gaat naar parser (`tzfkz` pad).
- Parser splitst op newline, daarna op `|`.
- Pollingresponse heeft wrapper met `init@index@payload`; daarna gaat payload door dezelfde line parser.

## Gevonden data en structuren

Live frame categorieen (afgeleid):
- `init`
- `gmt`
- `grid`
- `css`
- `dyn1`/`dyn2`
- `msg`
- `*`, `*i1`, `*i2`, `*in`, `*out`

Driver/lap/pit structuren (afgeleid uit detail parser):
- lap record: sector1/2/3 + color, lap time + color
- pit record: pit nr, lap, in/out, pit_time, track_time, relay_laps, driver_id, driver_total_time
- best lap
- best sectors
- driver info fragment

## Authenticatie / token

Geen expliciete bearer/auth token flow in dit bestand aangetroffen.
Wel request query params voor sessiecontinuiteit (`init`, `index`, `id`, `counter`).

## Reconnect logica

- WebSocket close/error kan fallback naar polling triggeren.
- Polling gebruikt retry/backoff met verschillende timers.
- Er is periodieke health timer (status updates).

## Relevante codegebieden voor live updates

- connect/select transport: `tzfir`
- ws: `tzfjz`
- polling: `tzflt`, `tzfka`
- parser: `tzfkz`, `tzfjy`
- domeindata parser: `tzflu`, `tzfiq`, `tzfji`, `tzfig`, `tzfjf`, `tzfix`

## Wat weten we zeker

1. Er zijn meerdere transportpaden, met WebSocket als primaire keuze in moderne clients.
2. Polling endpoint en query parameters zijn expliciet zichtbaar.
3. Parser gebruikt line-based en pipe-based framing.
4. Polling gebruikt init/index om serverstate voort te zetten.
5. Driver detail records voor laps/pits bestaan en hebben bekende veldindeling.

## Wat is nog hypothese

1. Exacte semantiek van alle korte field ids in live grid updates is niet volledig gedocumenteerd in plain text.
2. Flash pad is legacy; in Node niet praktisch inzetbaar.
3. Teaminformatie is niet in alle eventtypen gegarandeerd aanwezig en kan per feedvariant verschillen.
