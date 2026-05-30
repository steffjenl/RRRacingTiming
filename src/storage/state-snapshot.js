import fs from "node:fs";
import path from "node:path";

export class StateSnapshotWriter {
  constructor(filePath, intervalMs = 30000) {
    this.filePath = filePath;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.latestState = null;
  }

  start() {
    if (!this.filePath) {
      return;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.timer = setInterval(() => {
      if (!this.latestState) {
        return;
      }
      const snapshot = {
        captured_at: new Date().toISOString(),
        state: this.latestState
      };
      fs.appendFileSync(this.filePath, `${JSON.stringify(snapshot)}\n`, "utf8");
    }, this.intervalMs);
  }

  update(state) {
    this.latestState = state;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
