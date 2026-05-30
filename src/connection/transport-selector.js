import EventEmitter from "node:events";
import { PollingClient } from "./polling-client.js";
import { WsClient } from "./ws-client.js";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class LiveTransportManager extends EventEmitter {
  constructor(runtimeConfig, logger, options = {}) {
    super();
    this.runtimeConfig = runtimeConfig;
    this.logger = logger;
    this.options = options;
    this.mode = null;
    this.wsClient = null;
    this.pollingClient = null;
    this.running = false;
    this.wsFailures = 0;
  }

  async start() {
    this.running = true;

    if (this.runtimeConfig.wsUrl) {
      await this.startWebSocketWithFallback();
      return;
    }

    this.startPolling();
  }

  stop() {
    this.running = false;
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    if (this.pollingClient) {
      this.pollingClient.stop();
      this.pollingClient = null;
    }
  }

  async startWebSocketWithFallback() {
    this.mode = "ws";
    this.emit("mode", { mode: this.mode });

    while (this.running && this.wsFailures < 5) {
      const wsResult = await this.openWsCycle();
      if (!this.running) {
        return;
      }
      if (wsResult === "open_once_done") {
        return;
      }
      if (wsResult === "switch_polling") {
        break;
      }

      this.wsFailures += 1;
      const backoff = Math.min(1000 * 2 ** this.wsFailures, 15000);
      this.logger.warn(`WebSocket reconnect in ${backoff}ms`);
      await wait(backoff);
    }

    if (this.running) {
      this.logger.warn("Switching to polling fallback");
      this.startPolling();
    }
  }

  openWsCycle() {
    return new Promise((resolve) => {
      let messageSeen = false;
      this.wsClient = new WsClient(this.runtimeConfig.wsUrl, this.logger);

      this.wsClient.on("open", () => {
        this.wsFailures = 0;
        this.emit("open", { mode: "ws" });
      });

      this.wsClient.on("message", (payload) => {
        messageSeen = true;
        this.emit("message", { mode: "ws", payload });
        if (this.options.once) {
          this.stop();
          resolve("open_once_done");
        }
      });

      this.wsClient.on("error", (error) => {
        this.emit("error", { mode: "ws", error });
      });

      this.wsClient.on("close", ({ openDurationMs }) => {
        this.emit("close", { mode: "ws", openDurationMs });
        if (!this.running) {
          resolve("stopped");
          return;
        }
        // Mirror browser logic: if connection dies very quickly, fallback directly.
        if (openDurationMs < 2000 && !messageSeen) {
          resolve("switch_polling");
          return;
        }
        resolve("retry_ws");
      });

      try {
        this.wsClient.connect();
      } catch (error) {
        this.emit("error", { mode: "ws", error });
        resolve("switch_polling");
      }
    });
  }

  startPolling() {
    this.mode = "polling";
    this.emit("mode", { mode: this.mode });
    this.pollingClient = new PollingClient(this.runtimeConfig, this.logger);

    this.pollingClient.on("open", () => {
      this.emit("open", { mode: "polling" });
    });

    this.pollingClient.on("message", (payload) => {
      this.emit("message", { mode: "polling", payload });
      if (this.options.once) {
        this.stop();
      }
    });

    this.pollingClient.on("warn", (warning) => {
      this.emit("warn", { mode: "polling", warning });
    });

    this.pollingClient.on("error", (error) => {
      this.emit("error", { mode: "polling", error });
    });

    this.pollingClient.on("close", () => {
      this.emit("close", { mode: "polling" });
    });

    this.pollingClient.start();
  }

  updatePollingState(nextState) {
    if (this.pollingClient) {
      this.pollingClient.updateState(nextState);
    }
  }
}
