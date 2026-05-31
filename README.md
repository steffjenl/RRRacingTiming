# RRRacingTiming

Node.js runtime voor het consumeren van Apex live timing data met WebSocket-first en polling fallback.

Dit project bevat nu:
- CLI mode (bestaand)
- Web dashboard mode (nieuw) via Express + WebSocket

Beide varianten gebruiken dezelfde ingest/parsing/normalization/projection pipeline, zodat er geen dubbele logica ontstaat.

## Waarom deze aanpak

De implementatie is gebaseerd op bewezen gedrag uit:
- `specs/apex-timing/javascript_live_timing.min.js`

Belangrijkste bewezen punten:
- Startup via `tzfir(configHost, configPort)`.
- Transportvolgorde: WebSocket -> (legacy Flash) -> AJAX polling fallback.
- Polling endpoint: `live_ajax.php` met `init/index/counter/duration/id/ignored`.
- Frame parsing: newline split, daarna `|` split.

## Vereisten

- Node.js 20+

## Installatie

```bash
npm install
```

## Configuratie

Gebruik `.env.example` als referentie. Defaults zijn al gebaseerd op de gevonden site-config:
- `APEX_PORT=9460`
- `APEX_GMT=2`

## Run

```bash
npm start -- --pretty
```

CLI expliciet starten:

```bash
npm run start:cli -- --pretty
```

Web dashboard starten:

```bash
npm run start:web
```

Open daarna:

```text
http://localhost:3000
```

## CLI opties

- `--url <value>` override endpoint (ws/wss/http/https)
- `--driver <value>` filter op drivernaam
- `--driver-number <value>` filter op drivernummer
- `--team <value>` filter op team
- `--raw` toon raw inkomende events
- `--pretty` toon terminalweergave
- `--json` toon genormaliseerde JSON events
- `--save <path>` sla raw events op als JSONL
- `--save-normalized <path>` sla genormaliseerde events op als JSONL
- `--once` één connect/cycle en stop
- `--debug` extra logging
- `--learn` activeer WebSocket frame learning in de CLI

Extra (optioneel):
- `--host <value>`
- `--port <value>`
- `--gmt <value>`
- `--secure`

## Voorbeelden

```bash
node src/index.js --pretty --driver "Max"
node src/index.js --raw --save logs/raw.jsonl
node src/index.js --json --save-normalized logs/normalized.jsonl
node src/index.js --url ws://www.apex-timing.com:9462/ --once --debug
```

## Web dashboard

- Live updates worden gepusht via WebSocket endpoint `/ws`.
- Driverfilters (driver, driver number, team) worden ingesteld in de UI.
- Filters worden server-side toegepast met dezelfde filterfunctie als CLI (`filterDrivers`).
- Health endpoint: `/health`.
- `dyn1|countdown|<ms>` wordt als gesynchroniseerde countdown in `mm:ss` getoond in CLI en web.

## Kart Coaching CLI (offline analyse)

Je kunt een ontvangen normalized JSONL bestand analyseren om coaching-inzichten te krijgen:

```bash
node src/index.js --analyze logs/normalized-session.jsonl
```

Of met npm script:

```bash
npm run analyze -- logs/normalized-session.jsonl
```

Met filter op driver en opslag als rapport:

```bash
node src/index.js --analyze logs/normalized-session.jsonl --coach-driver "12" --report logs/kart-coach-report.json
```

Tip voor morgen: log live data eerst met normalized output, bijvoorbeeld:

```bash
node src/index.js --json --save-normalized logs/normalized-$(date +%Y%m%d)-session.jsonl
```

Daarna kun je dat bestand direct als input voor `--analyze` gebruiken.

Belangrijke env vars voor web mode:
- `WEB_PORT` (default `3000`)
- `LOG_LEVEL` (`info` of `debug`)
- `WEB_SAVE_RAW` (optioneel)
- `WEB_SAVE_NORMALIZED` (optioneel)
- `WEB_SNAPSHOT_PATH` (optioneel)
- `LEARNING_MODE=true` activeer WebSocket frame learning in de webserver

Reverse proxy tip (404 polling warning):
- Als je `{"type":"warning","warning":{"status":404}}` ziet, komt dat meestal van polling fallback naar een verkeerde URL.
- Zet in dat geval expliciet:
	- `APEX_WS_URL=wss://www.apex-timing.com:9463/`
	- `APEX_POLLING_URL=https://www.apex-timing.com/commonv2/functions/live_ajax.php`

## Docker

Build image:

```bash
docker build -t rrracingtiming-web .
```

Run container:

```bash
docker run --rm -p 3000:3000 --env-file .env rrracingtiming-web
```

Of met compose:

```bash
docker compose up --build
```

## Opslag en analyse

- Raw en normalized worden apart opgeslagen.
- Elke event krijgt `received_at`.
- Unknown fields blijven bewaard onder `unknown_fields`.
- Change detection per driver zit in `change_detection.driver_changes`.

Zie ook:
- `docs/analysis.md`
- `docs/protocol-notes.md`
- `docs/assumptions.md`
- `docs/usage.md`
- `docs/roadmap.md`
