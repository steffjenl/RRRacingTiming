import { diffObjects, indexBy } from "../utils/change-diff.js";

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGridHtml(gridHtml) {
  const rowRegex = /<tr([^>]*)data-id="([^"]+)"([^>]*)>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
  const columnTypeByIndex = [];

  const drivers = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(gridHtml)) !== null) {
    const attrs = `${rowMatch[1] || ""} ${rowMatch[3] || ""}`;
    const isHead = /\bhead\b/.test(attrs);
    if (isHead) {
      let headerIndex = 0;
      let headerCell;
      while ((headerCell = cellRegex.exec(rowMatch[4] || "")) !== null) {
        const headerAttrs = headerCell[1] || "";
        const typeMatch = /data-type="([^"]+)"/.exec(headerAttrs);
        columnTypeByIndex[headerIndex] = typeMatch ? typeMatch[1] : null;
        headerIndex += 1;
      }
      continue;
    }

    if (/progress_lap/.test(attrs)) {
      continue;
    }

    const driverId = rowMatch[2];
    const rowBody = rowMatch[4] || "";
    const rawFields = {};
    let cellIndex = 0;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const cellAttrs = cellMatch[1] || "";
      const mappedType = columnTypeByIndex[cellIndex];
      const classMatch = /class="([^"]+)"/.exec(cellAttrs);
      const className = classMatch ? classMatch[1].split(/\s+/)[0] : null;
      const value = stripHtml(cellMatch[2]);

      if (mappedType) {
        rawFields[mappedType] = value;
      }

      if (className && !rawFields[className]) {
        rawFields[className] = value;
      }

      cellIndex += 1;
    }

    drivers.push({
      id: driverId,
      position: Number.parseInt((/data-pos="([^"]+)"/.exec(attrs) || [])[1] || "0", 10) || null,
      rank: rawFields.rk || rawFields.rku || null,
      number: rawFields.no || null,
      name: rawFields.dr || null,
      team: rawFields.grp || null,
      status: rawFields.sta || null,
      best_lap: rawFields.blp || null,
      last_lap: rawFields.llp || null,
      gap: rawFields.gap || null,
      pit_status: rawFields.pit || null,
      lap_count: rawFields.int || null,
      raw_fields: rawFields
    });
  }

  return drivers.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
}

function pickTeamFromInfo(driverInfo) {
  if (!driverInfo || !Array.isArray(driverInfo.infos)) {
    return null;
  }

  for (const info of driverInfo.infos) {
    const type = String(info.type || "").toLowerCase();
    const title = String(info.title || "").toLowerCase();
    const value = String(info.value || "").trim();
    if (!value) {
      continue;
    }

    if (type.includes("team") || title.includes("team") || title.includes("équipe") || title.includes("equipe") || title.includes("scuderia")) {
      return value;
    }
  }

  return null;
}

function enrichTeams(drivers, driverInfoByDriverId) {
  return (drivers || []).map((driver) => {
    if (driver.team) {
      return driver;
    }

    const numericId = String(driver.id || "").replace(/^[^0-9]+/, "");
    const info = driverInfoByDriverId[numericId];
    const team = pickTeamFromInfo(info);
    if (!team) {
      return driver;
    }

    return {
      ...driver,
      team,
      raw_fields: {
        ...(driver.raw_fields || {}),
        team
      }
    };
  });
}

function buildFrameSignature(event) {
  return [event.category, event.parsed?.field0 || "", event.parsed?.field1 || ""].join("|");
}

function updateFrameLearning(frameLearning, event) {
  const signature = buildFrameSignature(event);
  const preview = String(event.raw_line || "").slice(0, 140);
  const countsByCategory = { ...(frameLearning.counts_by_category || {}) };
  const countsBySignature = { ...(frameLearning.counts_by_signature || {}) };
  const recentSamples = Array.isArray(frameLearning.recent_samples) ? frameLearning.recent_samples.slice() : [];

  countsByCategory[event.category] = (countsByCategory[event.category] || 0) + 1;
  countsBySignature[signature] = (countsBySignature[signature] || 0) + 1;

  const latest = recentSamples[recentSamples.length - 1];
  const isDuplicate = latest?.signature === signature && latest?.preview === preview;
  if (!isDuplicate) {
    recentSamples.push({
      received_at: event.received_at,
      category: event.category,
      signature,
      preview
    });
  }

  return {
    total_frames: (frameLearning.total_frames || 0) + 1,
    counts_by_category: countsByCategory,
    counts_by_signature: countsBySignature,
    recent_samples: recentSamples.slice(-12)
  };
}

function buildDeadlineAt(receivedAt, durationMs) {
  const receivedAtMs = Date.parse(receivedAt);
  if (!Number.isFinite(receivedAtMs)) {
    return receivedAt;
  }
  return new Date(receivedAtMs + durationMs).toISOString();
}

function getRowIdFromCellId(cellId) {
  return String(cellId || "").replace(/c\d+$/, "") || null;
}

export class ModelProjector {
  constructor(baseConfig) {
    this.learningEnabled = Boolean(baseConfig.learningEnabled);
    this.state = {
      session: {
        host: baseConfig.host,
        base_port: baseConfig.port,
        gmt: baseConfig.gmt,
        live_mode: null,
        connection_state: "connecting",
        countdown: null,
        last_checkpoint: null,
        checkpoint_history: [],
        checkpoint_count: 0
      },
      race_status: {
        last_message: null,
        last_update_at: null,
        message_history: []
      },
      grid: {
        html: "",
        drivers: []
      },
      raw_elements: {},
      driver_info_by_driver_id: {},
      laps_by_driver: {},
      pits_by_driver: {},
      best_lap_by_driver: {},
      best_sectors_by_driver: {},
      frame_learning: {
        enabled: this.learningEnabled,
        total_frames: 0,
        counts_by_category: {},
        counts_by_signature: {},
        recent_samples: []
      }
    };
  }

  setConnectionState(connectionState) {
    this.state.session.connection_state = connectionState;
  }

  apply(event) {
    const previousGrid = this.state.grid.drivers;
    const previousById = indexBy(previousGrid, "id");

    if (this.learningEnabled) {
      this.state.frame_learning = updateFrameLearning(this.state.frame_learning, event);
    }

    const { category } = event;
    const normalized = event.normalized || {};

    if (category === "init") {
      this.state.session.live_mode = event.parsed?.field1 || null;
    }

    if (category === "gmt_update") {
      const parsedGmt = Number.parseInt(event.parsed?.field2 || "", 10);
      if (Number.isFinite(parsedGmt)) {
        this.state.session.gmt = parsedGmt;
      }
    }

    if (category === "message") {
      const messageText = event.parsed?.field2 || null;
      this.state.race_status.last_message = messageText;
      this.state.race_status.last_update_at = event.received_at;
      if (messageText) {
        const history = this.state.race_status.message_history || [];
        const latest = history[history.length - 1];
        const isDuplicate = latest?.text === messageText;
        if (!isDuplicate) {
          history.push({ text: messageText, received_at: event.received_at });
          this.state.race_status.message_history = history.slice(-5);
        }
      }
    }

    if (category === "dynamic_banner" && event.parsed?.field1 === "countdown") {
      const remainingMs = Number.parseInt(event.parsed?.field2 || "", 10);
      if (Number.isFinite(remainingMs) && remainingMs >= 0) {
        const deadlineAt = buildDeadlineAt(event.received_at, remainingMs);
        this.state.session.countdown = {
          label: "countdown",
          remaining_ms: remainingMs,
          deadline_at: deadlineAt,
          updated_at: event.received_at
        };
      }
    }

    if (category === "grid") {
      this.state.grid.html = event.parsed?.field2 || "";
      const parsedDrivers = parseGridHtml(this.state.grid.html);
      this.state.grid.drivers = enrichTeams(parsedDrivers, this.state.driver_info_by_driver_id);
    }

    if (category === "element_update" || category === "driver_stream_update" || category === "position_update") {
      const id = event.parsed?.field0;
      if (id) {
        this.state.raw_elements[id] = {
          class_name: event.parsed?.field1 || "",
          value: event.parsed?.field2 || "",
          updated_at: event.received_at
        };
      }

      if (category === "element_update" && event.parsed?.field1 === "in") {
        const checkpoint = {
          element_id: event.parsed?.field0 || null,
          row_id: getRowIdFromCellId(event.parsed?.field0 || ""),
          class_name: "in",
          value: event.parsed?.field2 || "",
          updated_at: event.received_at,
          deadline_at: buildDeadlineAt(event.received_at, 8000)
        };

        this.state.session.last_checkpoint = checkpoint;
        this.state.session.checkpoint_count = (this.state.session.checkpoint_count || 0) + 1;

        const history = this.state.session.checkpoint_history || [];
        const latest = history[history.length - 1];
        const isDuplicate = latest?.element_id === checkpoint.element_id && latest?.updated_at === checkpoint.updated_at && latest?.value === checkpoint.value;
        if (!isDuplicate) {
          history.push(checkpoint);
          this.state.session.checkpoint_history = history.slice(-5);
        }
      }
    }

    const domainRecord = normalized.domain_record;
    if (domainRecord?.driverId) {
      const driverId = String(domainRecord.driverId);
      if (domainRecord.domainType === "lap") {
        this.state.laps_by_driver[driverId] = this.state.laps_by_driver[driverId] || [];
        this.state.laps_by_driver[driverId].push(domainRecord.lap);
      }
      if (domainRecord.domainType === "pit_event") {
        this.state.pits_by_driver[driverId] = this.state.pits_by_driver[driverId] || [];
        this.state.pits_by_driver[driverId].push(domainRecord.pit_event);
      }
      if (domainRecord.domainType === "best_lap") {
        this.state.best_lap_by_driver[driverId] = domainRecord.best_lap;
      }
      if (domainRecord.domainType === "best_sectors") {
        this.state.best_sectors_by_driver[driverId] = domainRecord.best_sectors;
      }
      if (domainRecord.domainType === "driver_info_fragment" && domainRecord.driver_info) {
        this.state.driver_info_by_driver_id[driverId] = domainRecord.driver_info;
        this.state.grid.drivers = enrichTeams(this.state.grid.drivers, this.state.driver_info_by_driver_id);
      }
    }

    const currentById = indexBy(this.state.grid.drivers, "id");
    const driverChanges = [];
    for (const [driverId, currentDriver] of currentById.entries()) {
      const previousDriver = previousById.get(driverId);
      const changes = diffObjects(previousDriver, currentDriver);
      if (changes.length > 0) {
        driverChanges.push({ driver_id: driverId, changes });
      }
    }

    return {
      state: this.state,
      change_detection: {
        driver_changes: driverChanges,
        session_changed: category === "init" || category === "gmt_update"
      }
    };
  }
}
