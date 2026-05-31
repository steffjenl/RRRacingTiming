import fs from "node:fs";
import { fileURLToPath } from "node:url";

function matchesContains(source, needle) {
  if (!needle) {
    return true;
  }
  return String(source ?? "").toLowerCase().includes(String(needle).toLowerCase());
}

function toFixed(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(digits);
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

function getOrCreateDriver(statsByDriver, driverId) {
  if (!statsByDriver.has(driverId)) {
    statsByDriver.set(driverId, {
      driver_id: driverId,
      driver_name: null,
      kart_number: null,
      lap_times: [],
      sectors_1: [],
      sectors_2: [],
      sectors_3: [],
      pit_events: 0,
      best_lap_recorded: null,
      best_sector_recorded: {
        sector_1: null,
        sector_2: null,
        sector_3: null
      }
    });
  }
  return statsByDriver.get(driverId);
}

function parseJsonl(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function buildDriverReport(driver) {
  const lapTimes = driver.lap_times.filter((value) => Number.isFinite(value) && value > 0);
  const s1 = driver.sectors_1.filter((value) => Number.isFinite(value) && value > 0);
  const s2 = driver.sectors_2.filter((value) => Number.isFinite(value) && value > 0);
  const s3 = driver.sectors_3.filter((value) => Number.isFinite(value) && value > 0);

  if (lapTimes.length === 0) {
    return null;
  }

  const bestLap = Math.min(...lapTimes);
  const avgLap = mean(lapTimes);
  const lapStddev = stddev(lapTimes);

  const minS1 = s1.length > 0 ? Math.min(...s1) : null;
  const minS2 = s2.length > 0 ? Math.min(...s2) : null;
  const minS3 = s3.length > 0 ? Math.min(...s3) : null;
  const idealLap = [minS1, minS2, minS3].every(Number.isFinite) ? minS1 + minS2 + minS3 : null;

  const avgS1 = mean(s1);
  const avgS2 = mean(s2);
  const avgS3 = mean(s3);

  const sectorLosses = [
    {
      key: "sector_1",
      avg: avgS1,
      best: minS1,
      loss: Number.isFinite(avgS1) && Number.isFinite(minS1) ? avgS1 - minS1 : null
    },
    {
      key: "sector_2",
      avg: avgS2,
      best: minS2,
      loss: Number.isFinite(avgS2) && Number.isFinite(minS2) ? avgS2 - minS2 : null
    },
    {
      key: "sector_3",
      avg: avgS3,
      best: minS3,
      loss: Number.isFinite(avgS3) && Number.isFinite(minS3) ? avgS3 - minS3 : null
    }
  ].sort((a, b) => (b.loss || -1) - (a.loss || -1));

  const worstSector = sectorLosses.find((sector) => Number.isFinite(sector.loss));

  const last5 = lapTimes.slice(-5);
  const prev5 = lapTimes.slice(-10, -5);
  const trendMs = last5.length >= 3 && prev5.length >= 3 ? mean(last5) - mean(prev5) : null;

  const coachingTips = [];

  if (Number.isFinite(lapStddev) && lapStddev > 250) {
    coachingTips.push("Werk aan consistentie: rij 5 opeenvolgende ronden binnen 0.25s van elkaar.");
  }

  if (Number.isFinite(idealLap) && bestLap - idealLap > 250) {
    coachingTips.push("Er zit theoretische winst in je ronde: combineer je beste sectoren in een clean lap.");
  }

  if (worstSector?.key === "sector_1") {
    coachingTips.push("Sector 1 is je grootste verlies: focus op rempunt en vroege rotatie bij de eerste bochten.");
  }
  if (worstSector?.key === "sector_2") {
    coachingTips.push("Sector 2 verliest het meest: werk aan lijnkeuze en minimale stuurinput in de middensectie.");
  }
  if (worstSector?.key === "sector_3") {
    coachingTips.push("Sector 3 is verbeterpunt: prioriteer exit-snelheid op de laatste bocht richting start/finish.");
  }

  if (Number.isFinite(trendMs)) {
    if (trendMs < -100) {
      coachingTips.push("Goede progressie: je laatste stint is sneller dan de vorige. Behoud dit ritme.");
    } else if (trendMs > 100) {
      coachingTips.push("Tempo zakt in de laatste stint: probeer rustiger insturen en slip beperken bij corner exit.");
    }
  }

  if (coachingTips.length === 0) {
    coachingTips.push("Basis is stabiel. Volgende stap: experimenteer met rem-release timing per sector voor extra marge.");
  }

  return {
    driver_id: driver.driver_id,
    driver_name: driver.driver_name,
    kart_number: driver.kart_number,
    laps_analyzed: lapTimes.length,
    pit_events: driver.pit_events,
    best_lap_ms: bestLap,
    average_lap_ms: avgLap,
    lap_consistency_stddev_ms: lapStddev,
    ideal_lap_ms: idealLap,
    best_vs_ideal_gap_ms: Number.isFinite(idealLap) ? bestLap - idealLap : null,
    sectors: {
      sector_1: { avg_ms: avgS1, best_ms: minS1 },
      sector_2: { avg_ms: avgS2, best_ms: minS2 },
      sector_3: { avg_ms: avgS3, best_ms: minS3 }
    },
    trend_last5_vs_prev5_ms: trendMs,
    coaching_tips: coachingTips
  };
}

function printDriverReport(report) {
  const displayName = report.driver_name || `Driver ${report.driver_id}`;
  const kart = report.kart_number ? ` (#${report.kart_number})` : "";

  console.log(`\n=== ${displayName}${kart} ===`);
  console.log(`Laps analyzed: ${report.laps_analyzed} | Pit events: ${report.pit_events}`);
  console.log(`Best lap: ${formatMs(report.best_lap_ms)} | Avg lap: ${formatMs(report.average_lap_ms)}`);
  console.log(`Consistency (stddev): ${toFixed(report.lap_consistency_stddev_ms, 0)} ms`);
  console.log(`Ideal lap: ${formatMs(report.ideal_lap_ms)} | Gap best->ideal: ${toFixed(report.best_vs_ideal_gap_ms, 0)} ms`);
  console.log(
    `S1 avg/best: ${formatMs(report.sectors.sector_1.avg_ms)} / ${formatMs(report.sectors.sector_1.best_ms)} | ` +
    `S2 avg/best: ${formatMs(report.sectors.sector_2.avg_ms)} / ${formatMs(report.sectors.sector_2.best_ms)} | ` +
    `S3 avg/best: ${formatMs(report.sectors.sector_3.avg_ms)} / ${formatMs(report.sectors.sector_3.best_ms)}`
  );

  if (Number.isFinite(report.trend_last5_vs_prev5_ms)) {
    const trendLabel = report.trend_last5_vs_prev5_ms < 0 ? "faster" : "slower";
    console.log(`Trend (last5 vs prev5): ${toFixed(Math.abs(report.trend_last5_vs_prev5_ms), 0)} ms ${trendLabel}`);
  } else {
    console.log("Trend (last5 vs prev5): not enough laps");
  }

  console.log("Coaching tips:");
  for (const tip of report.coaching_tips) {
    console.log(`- ${tip}`);
  }
}

export function runKartCoachAnalysis(options) {
  const defaultInputPath = fileURLToPath(new URL("../../logs/normalized-test.jsonl", import.meta.url));
  const inputPath = typeof options.analyze === "string" && options.analyze.length > 0 ? options.analyze : defaultInputPath;
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Analyze input file does not exist: ${inputPath}`);
  }

  const rows = parseJsonl(inputPath);
  const statsByDriver = new Map();

  for (const row of rows) {
    const domain = row?.normalized?.domain_record;
    if (!domain || !domain.driverId) {
      continue;
    }

    const driver = getOrCreateDriver(statsByDriver, String(domain.driverId));

    if (domain.domainType === "driver_info_fragment" && domain.driver_info) {
      driver.driver_name = domain.driver_info.driver_name || driver.driver_name;
      driver.kart_number = domain.driver_info.kart_number || driver.kart_number;
    }

    if (domain.domainType === "lap" && domain.lap) {
      const lap = domain.lap;
      if (Number.isFinite(lap.lap_time) && lap.lap_time > 0) {
        driver.lap_times.push(lap.lap_time);
      }
      if (Number.isFinite(lap.sector_1) && lap.sector_1 > 0) {
        driver.sectors_1.push(lap.sector_1);
      }
      if (Number.isFinite(lap.sector_2) && lap.sector_2 > 0) {
        driver.sectors_2.push(lap.sector_2);
      }
      if (Number.isFinite(lap.sector_3) && lap.sector_3 > 0) {
        driver.sectors_3.push(lap.sector_3);
      }
    }

    if (domain.domainType === "pit_event") {
      driver.pit_events += 1;
    }

    if (domain.domainType === "best_lap" && domain.best_lap?.lap_time) {
      driver.best_lap_recorded = domain.best_lap.lap_time;
    }

    if (domain.domainType === "best_sectors" && domain.best_sectors) {
      driver.best_sector_recorded = {
        sector_1: domain.best_sectors.sector_1 || driver.best_sector_recorded.sector_1,
        sector_2: domain.best_sectors.sector_2 || driver.best_sector_recorded.sector_2,
        sector_3: domain.best_sectors.sector_3 || driver.best_sector_recorded.sector_3
      };
    }
  }

  const reports = [];
  for (const driver of statsByDriver.values()) {
    const report = buildDriverReport(driver);
    if (!report) {
      continue;
    }

    const label = `${report.driver_name || ""} ${report.driver_id} ${report.kart_number || ""}`.trim();
    if (!matchesContains(label, options.coachDriver) && !matchesContains(report.driver_name, options.driver) && !matchesContains(report.kart_number, options.driverNumber)) {
      continue;
    }

    reports.push(report);
  }

  reports.sort((a, b) => a.best_lap_ms - b.best_lap_ms);

  const result = {
    generated_at: new Date().toISOString(),
    source_file: inputPath,
    drivers_analyzed: reports.length,
    reports
  };

  if (reports.length === 0) {
    console.log("No analyzable driver laps found for the selected filters.");
  } else {
    console.log("Kart Coaching Analysis Report");
    console.log(`Source: ${inputPath}`);
    console.log(`Drivers analyzed: ${reports.length}`);
    for (const report of reports) {
      printDriverReport(report);
    }
  }

  if (options.report) {
    fs.writeFileSync(options.report, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`\nSaved report: ${options.report}`);
  }

  return result;
}
