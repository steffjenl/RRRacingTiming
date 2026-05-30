const { useEffect, useMemo, useRef, useState } = React;

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function App() {
  const [state, setState] = useState(null);
  const [summary, setSummary] = useState("Wachten op data...");
  const [connectionState, setConnectionState] = useState("connecting");
  const [mode, setMode] = useState("-");
  const [filters, setFilters] = useState({
    driver: "",
    driverNumber: "",
    team: ""
  });

  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(getSocketUrl());
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setConnectionState("connected");
      ws.send(
        JSON.stringify({
          type: "set_filters",
          filters
        })
      );
    });

    ws.addEventListener("close", () => {
      setConnectionState("disconnected");
    });

    ws.addEventListener("error", () => {
      setConnectionState("error");
    });

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === "snapshot" || payload.type === "update") {
        setState(payload.state);
        setSummary(payload.summary || "-");
        if (payload.meta?.mode) {
          setMode(payload.meta.mode);
        }
      }

      if (payload.type === "status") {
        if (payload.status?.connection_state) {
          setConnectionState(payload.status.connection_state);
        }
        if (payload.status?.mode) {
          setMode(payload.status.mode);
        }
      }
    });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: "set_filters",
        filters
      })
    );
  }, [filters]);

  const drivers = useMemo(() => {
    return state?.grid?.drivers || [];
  }, [state]);

  const statusText = `${connectionState} | ${mode}`;
  const statusClass = connectionState.includes("connected") ? "status-dot connected" : "status-dot";

  const e = React.createElement;

  return e("div", { className: "page" }, [
    e("header", { className: "hero", key: "hero" }, [
      e("h1", { key: "title" }, "RRRacingTiming Live Dashboard"),
      e("p", { className: "subtitle", key: "subtitle" }, "Live timing data via gedeelde runtime met CLI."),
      e("div", { className: "status-chip", key: "status" }, [
        e("span", { className: statusClass, key: "dot" }),
        e("span", { key: "text" }, statusText)
      ])
    ]),
    e("section", { className: "filters", key: "filters" }, [
      e("label", { key: "driver" }, [
        "Driver",
        e("input", {
          value: filters.driver,
          onChange: (evt) => setFilters((prev) => ({ ...prev, driver: evt.target.value })),
          placeholder: "bijv. Max"
        })
      ]),
      e("label", { key: "driverNumber" }, [
        "Nummer",
        e("input", {
          value: filters.driverNumber,
          onChange: (evt) => setFilters((prev) => ({ ...prev, driverNumber: evt.target.value })),
          placeholder: "bijv. 12"
        })
      ]),
      e("label", { key: "team" }, [
        "Team",
        e("input", {
          value: filters.team,
          onChange: (evt) => setFilters((prev) => ({ ...prev, team: evt.target.value })),
          placeholder: "bijv. Monkey"
        })
      ])
    ]),
    e("section", { className: "panel", key: "panel" }, [
      e("div", { className: "panel-header", key: "panelHeader" }, [
        e("span", { key: "summaryLabel" }, ["Laatste event: ", e("b", { key: "summary" }, summary)]),
        e("span", { key: "count" }, `${drivers.length} drivers zichtbaar`)
      ]),
      drivers.length === 0
        ? e("div", { className: "empty", key: "empty" }, "Nog geen drivers zichtbaar voor deze filters.")
        : e("div", { className: "table-wrap", key: "tableWrap" }, [
            e("table", { key: "table" }, [
              e("thead", { key: "thead" },
                e("tr", { key: "headRow" }, [
                  e("th", { key: "pos" }, "Pos"),
                  e("th", { key: "no" }, "No"),
                  e("th", { key: "driver" }, "Driver"),
                  e("th", { key: "team" }, "Team"),
                  e("th", { key: "last" }, "Last"),
                  e("th", { key: "best" }, "Best"),
                  e("th", { key: "gap" }, "Gap"),
                  e("th", { key: "pit" }, "Pit"),
                  e("th", { key: "laps" }, "Laps")
                ])
              ),
              e(
                "tbody",
                { key: "tbody" },
                drivers.map((driver) =>
                  e("tr", { key: driver.id || `${driver.number}-${driver.name}` }, [
                    e("td", { key: "p" }, formatValue(driver.position)),
                    e("td", { key: "n" }, formatValue(driver.number)),
                    e("td", { key: "d" }, formatValue(driver.name)),
                    e("td", { key: "t" }, formatValue(driver.team)),
                    e("td", { key: "l" }, formatValue(driver.last_lap)),
                    e("td", { key: "b" }, formatValue(driver.best_lap)),
                    e("td", { key: "g" }, formatValue(driver.gap)),
                    e("td", { key: "ps" }, formatValue(driver.pit_status)),
                    e("td", { key: "lc" }, formatValue(driver.lap_count))
                  ])
                )
              )
            ])
          ])
    ]),
    e(
      "p",
      { className: "footer-note", key: "foot" },
      "De filters worden server-side toegepast met dezelfde driver-filterlogica als de CLI-output."
    )
  ]);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
