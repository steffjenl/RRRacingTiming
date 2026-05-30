# Usage

## Basis

```bash
npm start -- --pretty
```

## Kart Coaching analyse (offline)

Analyseer een genormaliseerd JSONL logbestand met coaching-inzichten:

```bash
node src/index.js --analyze logs/normalized-test.jsonl
```

Analyseer alleen een specifieke driver en sla JSON rapport op:

```bash
node src/index.js --analyze logs/normalized-test.jsonl --coach-driver "12" --report logs/kart-coach-report.json
```

## Filter voorbeelden

```bash
node src/index.js --pretty --driver "Verstappen"
node src/index.js --pretty --driver-number "12"
node src/index.js --pretty --team "Monkey"
```

## Raw en opslag

```bash
node src/index.js --raw --save logs/raw-events.jsonl
```

## Normalized output en opslag

```bash
node src/index.js --json --save-normalized logs/normalized-events.jsonl
```

## Eenmalig ophalen

```bash
node src/index.js --once --raw
```

## Endpoint override

```bash
node src/index.js --url ws://www.apex-timing.com:9462/ --pretty
node src/index.js --url https://www.apex-timing.com/commonv2/functions/live_ajax.php --raw
```

## Debug

```bash
node src/index.js --debug --pretty
```
