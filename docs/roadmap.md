# Roadmap voor analyse

## Korte termijn

1. CSV export naast JSONL voor raw/normalized.
2. Compact state snapshots per x seconden.
3. Replay tool die JSONL events opnieuw afspeelt.

## Analysefeatures

1. Delta tussen opeenvolgende rondes per driver.
2. Trendanalyse van lap times en sector times.
3. Pitstrategie analyse (duur, frequentie, timing).
4. Consistentie scoring per driver.
5. Fastest sectors leaderboard over sessie.
6. Positiewijzigingen timeline.
7. Event timeline (status, messages, pit, track).

## Robuustheid

1. Contract tests tegen bekende captured feeds.
2. Auto ws->polling fallback metrics.
3. Event schema versioning voor backward compatibility.

## UX uitbreidingen

1. TUI dashboard mode (split views).
2. Focus mode: toon alle velden van een geselecteerde driver.
3. Highlight mode: alleen gewijzigde velden tonen.
