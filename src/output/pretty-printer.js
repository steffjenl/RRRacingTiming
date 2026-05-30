import { filterDrivers } from "../filters/driver-filter.js";

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function formatCellSafe(value, width, align = "left") {
  const raw = formatValue(value);
  const truncated = raw.length > width ? `${raw.slice(0, width - 1)}.` : raw;
  if (align === "right") {
    return truncated.padStart(width, " ");
  }
  return truncated.padEnd(width, " ");
}

function formatRemarkTime(isoString) {
  if (!isoString) {
    return "--:--:--";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

export function printPrettyState(state, options, lastEventSummary = "") {
  const drivers = filterDrivers(state.grid?.drivers || [], options);
  const latestRemark = state.race_status?.last_message || "Nog geen opmerkingen ontvangen.";
  const remarkHistory = state.race_status?.message_history || [];

  process.stdout.write("\x1Bc");
  console.log("RRRacingTiming CLI - Apex Live");
  console.log(`Connection: ${state.session.connection_state} | Mode: ${state.session.live_mode || "-"} | GMT: ${state.session.gmt}`);
  console.log(`Event: ${lastEventSummary}`);
  console.log("");

  if (drivers.length === 0) {
    console.log("No drivers matched current filters yet.");
    console.log("Filters:", {
      driver: options.driver || null,
      driverNumber: options.driverNumber || null,
      team: options.team || null
    });
    console.log("\nOpmerkingen (laatste 5):");
    if (remarkHistory.length === 0) {
      console.log(`- ${latestRemark}`);
    } else {
      for (const item of remarkHistory) {
        console.log(`- [${formatRemarkTime(item.received_at)}] ${item.text}`);
      }
    }
    return;
  }

  console.log("POS | NO | DRIVER               | TEAM         | LAST      | BEST      | GAP      | PIT      | LAPS ");
  console.log("----+----+----------------------+--------------+-----------+-----------+----------+----------+------");

  for (const driver of drivers) {
    console.log([
      formatCellSafe(driver.position, 3, "right"),
      formatCellSafe(driver.number, 2, "right"),
      formatCellSafe(driver.name, 20, "left"),
      formatCellSafe(driver.team, 12, "left"),
      formatCellSafe(driver.last_lap, 9, "left"),
      formatCellSafe(driver.best_lap, 9, "left"),
      formatCellSafe(driver.gap, 8, "left"),
      formatCellSafe(driver.pit_status, 8, "left"),
      formatCellSafe(driver.lap_count, 4, "right")
    ].join(" | "));
  }

  if (drivers.length === 1) {
    console.log("\nSingle-driver detail (raw_fields):");
    console.log(JSON.stringify(drivers[0].raw_fields || {}, null, 2));
  }

  console.log("\nOpmerkingen (laatste 5):");
  if (remarkHistory.length === 0) {
    console.log(`- ${latestRemark}`);
  } else {
    for (const item of remarkHistory) {
      console.log(`- [${formatRemarkTime(item.received_at)}] ${item.text}`);
    }
  }
}
