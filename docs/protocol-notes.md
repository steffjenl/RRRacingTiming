# Protocol Notes

## Transportvolgorde

1. WebSocket (voorkeur)
2. Legacy Flash XMLSocket (browser fallback)
3. AJAX polling (`live_ajax.php`)

## Polling wrapper

Polling respons bevat:
- `init@index@payload`

Statevelden:
- `init` en `index` worden teruggestuurd in volgende request
- `counter`, `duration`, `id`, `ignored` worden client-side bijgehouden

## Frame encoding

- Payload split op newline
- Per line split op `|`
- Minimaal velden:
  - field0
  - field1
  - field2
  - optionele extras

## Belangrijke frame categorieen

- `init`
- `gmt`
- `grid`
- `msg`
- `css`
- element updates (`*`, `#`, etc.)

## Domain records (detail endpoints)

- `D<id>.L<n>#...` lap
- `D<id>.P...#...` pit
- `D<id>.BL#...` best lap
- `D<id>.BS#...` best sectors
- `D<id>.INF...` driver info

## Node CLI mapping

- Raw transport -> parser -> normalized envelope
- State projector onderhoudt:
  - session
  - race_status
  - grid/drivers
  - laps/pits/best per driver
- Unknown data blijft behouden in event envelope
