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

function mean(values) {
  if (!values || values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (!values || values.length < 2) {
    return null;
  }
  const avg = mean(values);
  if (!Number.isFinite(avg)) {
    return null;
  }
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "-";
  }
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function buildSparkline(history, width = 320, height = 88) {
  const values = (history || [])
    .map((item) => item?.avg_lap_ms)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const points = values.map((value, idx) => {
    const x = (idx / (values.length - 1)) * (width - 12) + 6;
    const y = height - 8 - (((value - min) / range) * (height - 16));
    return { x, y, value };
  });

  return {
    width,
    height,
    min,
    max,
    first: values[0],
    last: values[values.length - 1],
    points,
    pointsAttr: points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")
  };
}

function scorePenalty(value, maxPenalty, threshold) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(threshold) || threshold <= 0) {
    return 0;
  }
  return Math.min(maxPenalty, (value / threshold) * maxPenalty);
}

function sectorTone(lossMs) {
  if (!Number.isFinite(lossMs)) {
    return "neutral";
  }
  if (lossMs <= 80) {
    return "good";
  }
  if (lossMs <= 180) {
    return "warn";
  }
  return "risk";
}

function buildDriverInsights(state, driver) {
  if (!state || !driver || !driver.id) {
    return null;
  }

  const driverId = String(driver.id);
  const laps = state?.laps_by_driver?.[driverId] || [];
  const lapTimes = laps.map((lap) => lap?.lap_time).filter((value) => Number.isFinite(value) && value > 0);
  const s1 = laps.map((lap) => lap?.sector_1).filter((value) => Number.isFinite(value) && value > 0);
  const s2 = laps.map((lap) => lap?.sector_2).filter((value) => Number.isFinite(value) && value > 0);
  const s3 = laps.map((lap) => lap?.sector_3).filter((value) => Number.isFinite(value) && value > 0);

  if (lapTimes.length === 0) {
    return {
      hasData: false,
      tips: [
        "Nog onvoldoende rondedata voor persoonlijke tips.",
        "Rij een paar complete ronden zodat sectoranalyse en trend zichtbaar worden."
      ],
      attention: []
    };
  }

  const bestLap = Math.min(...lapTimes);
  const avgLap = mean(lapTimes);
  const consistency = stddev(lapTimes);
  const idealLap =
    s1.length > 0 && s2.length > 0 && s3.length > 0
      ? Math.min(...s1) + Math.min(...s2) + Math.min(...s3)
      : null;

  const sectors = [
    {
      key: "Sector 1",
      avg: mean(s1),
      best: s1.length > 0 ? Math.min(...s1) : null
    },
    {
      key: "Sector 2",
      avg: mean(s2),
      best: s2.length > 0 ? Math.min(...s2) : null
    },
    {
      key: "Sector 3",
      avg: mean(s3),
      best: s3.length > 0 ? Math.min(...s3) : null
    }
  ].map((sector) => ({
    ...sector,
    loss: Number.isFinite(sector.avg) && Number.isFinite(sector.best) ? sector.avg - sector.best : null
  }));

  const worstSector = sectors
    .filter((sector) => Number.isFinite(sector.loss))
    .sort((a, b) => b.loss - a.loss)[0];

  const last4 = lapTimes.slice(-4);
  const prev4 = lapTimes.slice(-8, -4);
  const trend = last4.length >= 3 && prev4.length >= 3 ? mean(last4) - mean(prev4) : null;

  const tips = [];
  const attention = [];
  const actions = [];

  if (Number.isFinite(consistency) && consistency > 250) {
    tips.push("Werk aan consistentie: mik op 4 ronden binnen 0.25s.");
    attention.push("Let op te agressieve stuurinput in snelle bochten; dat kost stabiliteit.");
    actions.push("Rij 4 control laps met focus op vloeiende inputs en vaste rempunten.");
  }

  if (Number.isFinite(idealLap) && bestLap - idealLap > 200) {
    tips.push("Er zit nog rondetijd in je ideale ronde door beste sectoren te combineren.");
    attention.push("Let op flow tussen sectoren: focus op exit-snelheid richting volgende remzone.");
    actions.push("Plan je volgende stint op clean exits; minimaliseer wheelspin bij uitaccelereren.");
  }

  if (worstSector?.key === "Sector 1") {
    tips.push("Sector 1 is grootste verlies: rem iets eerder en draai rustiger in.");
    attention.push("Let op oversturen bij insturen van de openingsbochten.");
    actions.push("Verplaats rempunt in Sector 1 met kleine stappen van 1-2 meter totdat instuur stabiel is.");
  }
  if (worstSector?.key === "Sector 2") {
    tips.push("Sector 2 verliest het meest: houd een strakkere lijn en beperk correcties.");
    attention.push("Let op middencorner snelheid; niet te vroeg op het gas.");
    actions.push("Kies in Sector 2 voor late apex op de sleutelbocht om mid-corner snelheid op te bouwen.");
  }
  if (worstSector?.key === "Sector 3") {
    tips.push("Sector 3 is verbeterpunt: prioriteer een sterke exit naar start/finish.");
    attention.push("Let op tractie bij uitaccelereren van de laatste bocht.");
    actions.push("Focus in Sector 3 op progressief gas openen vanaf apex voor maximale exitsnelheid.");
  }

  if (Number.isFinite(trend) && trend > 120) {
    tips.push("Laatste stint is trager: bouw iets meer marge in je rempunt en herpak ritme.");
    attention.push("Let op vermoeidheid of overdriven in de slotfase van de run.");
    actions.push("Neem 1 ronde reset pace en bouw daarna per ronde gecontroleerd op.");
  }
  if (Number.isFinite(trend) && trend < -120) {
    tips.push("Goede progressie: je wordt sneller in recente ronden. Houd dit ritme vast.");
  }

  if (tips.length === 0) {
    tips.push("Stabiele pace. Volgende stap: experimenteer met rem-losmoment per sector.");
    attention.push("Let op kleine line-variaties; die bepalen je laatste tienden.");
    actions.push("Voer een A/B stint uit: per ronde 1 variabele aanpassen en direct vergelijken.");
  }

  const sectorWithTone = sectors.map((sector) => ({
    ...sector,
    tone: sectorTone(sector.loss)
  }));

  const penalty =
    scorePenalty(consistency, 30, 400) +
    scorePenalty(Number.isFinite(idealLap) ? bestLap - idealLap : 0, 30, 600) +
    scorePenalty(trend > 0 ? trend : 0, 20, 350) +
    scorePenalty((worstSector?.loss || 0), 20, 300);

  const coachingScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return {
    hasData: true,
    laps: lapTimes.length,
    bestLap,
    avgLap,
    consistency,
    idealLap,
    trend,
    sectors: sectorWithTone,
    coachingScore,
    topActions: actions.slice(0, 3),
    tips,
    attention
  };
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
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [driverAnalytics, setDriverAnalytics] = useState(null);

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

  useEffect(() => {
    if (drivers.length === 0) {
      setSelectedDriverId(null);
      return;
    }
    const selectedExists = drivers.some((driver) => String(driver.id || "") === String(selectedDriverId || ""));
    if (!selectedExists) {
      setSelectedDriverId(String(drivers[0].id || ""));
    }
  }, [drivers, selectedDriverId]);

  const selectedDriver = useMemo(() => {
    return drivers.find((driver) => String(driver.id || "") === String(selectedDriverId || "")) || null;
  }, [drivers, selectedDriverId]);

  const insights = useMemo(() => {
    return buildDriverInsights(state, selectedDriver);
  }, [state, selectedDriver]);

  useEffect(() => {
    if (!selectedDriver?.id) {
      setDriverAnalytics(null);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/analytics/${selectedDriver.id}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setDriverAnalytics(json?.analytics || null);
      })
      .catch(() => {
        setDriverAnalytics(null);
      });

    return () => {
      controller.abort();
    };
  }, [selectedDriver?.id, state?.session?.connection_state]);

  const statusText = `${connectionState} | ${mode}`;
  const statusClass = connectionState.includes("connected") ? "status-dot connected" : "status-dot";
  const sparkline = useMemo(() => {
    return buildSparkline(driverAnalytics?.history || []);
  }, [driverAnalytics]);

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
        : [
            e("div", { className: "table-wrap desktop-only", key: "tableWrap" }, [
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
                  e("tr", {
                    key: driver.id || `${driver.number}-${driver.name}`,
                    className: String(driver.id || "") === String(selectedDriverId || "") ? "driver-row selected" : "driver-row",
                    onClick: () => setSelectedDriverId(String(driver.id || ""))
                  }, [
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
          ]),
          e(
            "div",
            { className: "mobile-cards mobile-only", key: "mobileCards" },
            drivers.map((driver) =>
              e(
                "button",
                {
                  type: "button",
                  key: `card-${driver.id || `${driver.number}-${driver.name}`}`,
                  className: String(driver.id || "") === String(selectedDriverId || "") ? "driver-card selected" : "driver-card",
                  onClick: () => setSelectedDriverId(String(driver.id || ""))
                },
                [
                  e("div", { className: "driver-card-top", key: "top" }, [
                    e("strong", { key: "name" }, `${formatValue(driver.name)} (#${formatValue(driver.number)})`),
                    e("span", { key: "pos" }, `P${formatValue(driver.position)}`)
                  ]),
                  e("div", { className: "driver-card-team", key: "team" }, formatValue(driver.team)),
                  e("div", { className: "driver-card-metrics", key: "metrics" }, [
                    e("span", { key: "best" }, `Best ${formatValue(driver.best_lap)}`),
                    e("span", { key: "last" }, `Last ${formatValue(driver.last_lap)}`),
                    e("span", { key: "gap" }, `Gap ${formatValue(driver.gap)}`),
                    e("span", { key: "laps" }, `Laps ${formatValue(driver.lap_count)}`)
                  ])
                ]
              )
            )
          )
        ]
    ]),
    e("section", { className: "coach-panel", key: "coach" }, [
      e("h2", { key: "coachTitle" }, "Kart Coaching"),
      selectedDriver
        ? e("p", { className: "coach-driver", key: "coachDriver" }, `Driver: ${formatValue(selectedDriver.name)} (#${formatValue(selectedDriver.number)})`)
        : e("p", { className: "coach-driver", key: "coachDriver" }, "Klik op een driver in de tabel voor tips."),
      insights && insights.hasData
        ? e("div", { className: "coach-metrics", key: "metrics" }, [
            e("div", { className: "score", key: "score" }, [
              e("span", { key: "scoreLabel" }, "Coaching score"),
              e("b", { key: "scoreValue" }, `${insights.coachingScore}/100`)
            ]),
            e("div", { key: "best" }, [`Best lap: `, e("b", { key: "bestv" }, formatMs(insights.bestLap))]),
            e("div", { key: "avg" }, [`Gem. lap: `, e("b", { key: "avgv" }, formatMs(insights.avgLap))]),
            e("div", { key: "cons" }, [`Consistentie: `, e("b", { key: "consv" }, `${Math.round(insights.consistency || 0)} ms`)]),
            e("div", { key: "ideal" }, [`Ideal lap: `, e("b", { key: "idealv" }, formatMs(insights.idealLap))])
          ])
        : null,
      insights && insights.hasData
        ? e("div", { className: "sector-grid", key: "sectorGrid" },
            insights.sectors.map((sector) =>
              e("div", { className: `sector-chip ${sector.tone}`, key: sector.key }, [
                e("strong", { key: `${sector.key}-name` }, sector.key),
                e("span", { key: `${sector.key}-vals` }, `avg ${formatMs(sector.avg)} | best ${formatMs(sector.best)}`),
                e("span", { key: `${sector.key}-loss` }, `verlies ${Math.round(sector.loss || 0)} ms`)
              ])
            )
          )
        : null,
      e("div", { className: "coach-columns", key: "coachColumns" }, [
        e("div", { className: "coach-block", key: "actions" }, [
          e("h3", { key: "actionsTitle" }, "Top 3 acties voor volgende stint"),
          e(
            "ol",
            { key: "actionsList" },
            (insights?.topActions || ["Selecteer een driver met rondedata voor actiegerichte tips."]).map((item, idx) =>
              e("li", { key: `action-${idx}` }, item)
            )
          )
        ]),
        e("div", { className: "coach-block", key: "tips" }, [
          e("h3", { key: "tipsTitle" }, "Verbeter tips"),
          e(
            "ul",
            { key: "tipsList" },
            (insights?.tips || ["Klik een driver aan om tips te zien."]).map((tip, idx) => e("li", { key: `tip-${idx}` }, tip))
          )
        ]),
        e("div", { className: "coach-block", key: "attention" }, [
          e("h3", { key: "attTitle" }, "Waar op letten"),
          e(
            "ul",
            { key: "attList" },
            (insights?.attention || ["Zodra sectors/laps binnenkomen verschijnen hier aandachtspunten."]).map((item, idx) =>
              e("li", { key: `att-${idx}` }, item)
            )
          )
        ])
      ]),
      e("div", { className: "coach-db", key: "coachDb" }, [
        e("h3", { key: "dbTitle" }, "Historische analytics"),
        driverAnalytics
          ? e("p", { key: "dbSummary" }, `Samples: ${driverAnalytics.samples} | Trend avg lap: ${formatMs(driverAnalytics.trend_avg_lap_ms)}`)
          : e("p", { key: "dbSummary" }, "Nog geen historische samples opgeslagen voor deze driver."),
        sparkline
          ? e("div", { className: "spark-wrap", key: "sparkWrap" }, [
              e(
                "svg",
                {
                  className: "sparkline",
                  viewBox: `0 0 ${sparkline.width} ${sparkline.height}`,
                  key: "sparkSvg",
                  role: "img",
                  "aria-label": "Trend gemiddelde rondetijd"
                },
                [
                  e("polyline", {
                    key: "sparkLine",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    points: sparkline.pointsAttr
                  }),
                  e("circle", {
                    key: "sparkLast",
                    cx: sparkline.points[sparkline.points.length - 1].x,
                    cy: sparkline.points[sparkline.points.length - 1].y,
                    r: "3"
                  })
                ]
              ),
              e("div", { className: "spark-meta", key: "sparkMeta" }, [
                e("span", { key: "sparkMin" }, `Snelst avg: ${formatMs(sparkline.min)}`),
                e("span", { key: "sparkMax" }, `Langzaamst avg: ${formatMs(sparkline.max)}`),
                e("span", { key: "sparkDelta" }, `Delta: ${Math.round((sparkline.last || 0) - (sparkline.first || 0))} ms`)
              ])
            ])
          : null
      ])
    ]),
    e(
      "div",
      { className: "footer-note", key: "foot" },
      [
        e("div", { key: "copyright" }, [
          "Copyright 2026 ",
          e("a", {
            key: "monkeysoft",
            href: "https://monkeysoft.nl/",
            target: "_blank",
            rel: "noreferrer noopener"
          }, "MonkeySoft")
        ]),
        e("div", { key: "made" }, "Made with ♥ in The Netherlands"),
        e("div", { key: "version" }, "0.0.0-dev")
      ]
    )
  ]);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
