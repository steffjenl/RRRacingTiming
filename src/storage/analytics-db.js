import fs from "node:fs";
import path from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

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

function computeDriverSnapshot(state, driver, capturedAt) {
  const driverId = String(driver?.id || "");
  if (!driverId) {
    return null;
  }

  const laps = state?.laps_by_driver?.[driverId] || [];
  const lapTimes = laps.map((lap) => lap?.lap_time).filter((value) => Number.isFinite(value) && value > 0);
  if (lapTimes.length === 0) {
    return null;
  }

  const s1 = laps.map((lap) => lap?.sector_1).filter((value) => Number.isFinite(value) && value > 0);
  const s2 = laps.map((lap) => lap?.sector_2).filter((value) => Number.isFinite(value) && value > 0);
  const s3 = laps.map((lap) => lap?.sector_3).filter((value) => Number.isFinite(value) && value > 0);

  const bestLap = Math.min(...lapTimes);
  const avgLap = mean(lapTimes);
  const consistency = stddev(lapTimes);
  const idealLap =
    s1.length > 0 && s2.length > 0 && s3.length > 0
      ? Math.min(...s1) + Math.min(...s2) + Math.min(...s3)
      : null;

  return {
    captured_at: capturedAt,
    laps: lapTimes.length,
    best_lap_ms: bestLap,
    avg_lap_ms: avgLap,
    consistency_ms: consistency,
    ideal_lap_ms: idealLap,
    gap_to_ideal_ms: Number.isFinite(idealLap) ? bestLap - idealLap : null,
    position: driver?.position || null
  };
}

export class AnalyticsDb {
  constructor(filePath, logger, options = {}) {
    this.filePath = filePath;
    this.logger = logger;
    this.maxHistory = Number.isFinite(options.maxHistory) ? options.maxHistory : 200;
    this.minWriteIntervalMs = Number.isFinite(options.minWriteIntervalMs) ? options.minWriteIntervalMs : 10000;
    this.lastWriteByDriver = new Map();
    this.db = null;
  }

  async init() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const adapter = new JSONFile(this.filePath);
    this.db = new Low(adapter, { drivers: {} });
    await this.db.read();
    this.db.data ||= { drivers: {} };
    this.db.data.drivers ||= {};
    await this.db.write();
  }

  async recordState(state) {
    if (!this.db || !state?.grid?.drivers) {
      return;
    }

    const capturedAt = new Date().toISOString();

    for (const driver of state.grid.drivers) {
      const driverId = String(driver?.id || "");
      if (!driverId) {
        continue;
      }

      const now = Date.now();
      const lastWrite = this.lastWriteByDriver.get(driverId) || 0;
      if (now - lastWrite < this.minWriteIntervalMs) {
        continue;
      }

      const snapshot = computeDriverSnapshot(state, driver, capturedAt);
      if (!snapshot) {
        continue;
      }

      this.lastWriteByDriver.set(driverId, now);
      const entry = this.db.data.drivers[driverId] || {
        driver_id: driverId,
        name: driver?.name || null,
        number: driver?.number || null,
        team: driver?.team || null,
        history: []
      };

      entry.name = driver?.name || entry.name;
      entry.number = driver?.number || entry.number;
      entry.team = driver?.team || entry.team;
      entry.history.push(snapshot);
      entry.history = entry.history.slice(-this.maxHistory);

      this.db.data.drivers[driverId] = entry;
    }

    await this.db.write();
  }

  async getDriverAnalytics(driverId) {
    if (!this.db) {
      return null;
    }
    const entry = this.db.data.drivers[String(driverId)];
    if (!entry) {
      return null;
    }

    const history = entry.history || [];
    const latest = history[history.length - 1] || null;
    const recent = history.slice(-10);

    const trendMs =
      recent.length >= 6
        ? mean(recent.slice(-5).map((item) => item.avg_lap_ms).filter(Number.isFinite)) -
          mean(recent.slice(0, 5).map((item) => item.avg_lap_ms).filter(Number.isFinite))
        : null;

    return {
      driver_id: entry.driver_id,
      name: entry.name,
      number: entry.number,
      team: entry.team,
      samples: history.length,
      latest,
      trend_avg_lap_ms: trendMs,
      history: history.slice(-30)
    };
  }
}
