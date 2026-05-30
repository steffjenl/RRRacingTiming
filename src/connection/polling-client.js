import EventEmitter from "node:events";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class PollingClient extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.running = false;
    this.counter = -1;
    this.ignored = 0;
    this.randomId = Math.floor(Math.random() * 1_000_000_000) || 1;
    this.startedAt = Date.now();
    this.init = 0;
    this.index = 0;
    this.lastRequestAt = 0;
  }

  buildPollingUrl() {
    const url = new URL(this.config.pollingUrl);
    url.searchParams.set("version", this.config.comVersion);
    url.searchParams.set("init", String(this.init));
    url.searchParams.set("index", String(this.index));
    url.searchParams.set("port", String(this.config.port + 4));
    url.searchParams.set("counter", String(this.counter));
    url.searchParams.set("duration", String(Date.now() - this.startedAt));
    url.searchParams.set("id", String(this.randomId));
    url.searchParams.set("ignored", String(this.ignored));
    return url.toString();
  }

  updateState({ init, index }) {
    if (init !== null && init !== undefined && init !== "") {
      this.init = init;
    }
    if (index !== null && index !== undefined && index !== "") {
      this.index = index;
    }
  }

  async start() {
    this.running = true;
    this.emit("open");

    while (this.running) {
      this.counter += 1;
      const now = Date.now();
      const sinceLast = this.lastRequestAt === 0 ? Infinity : now - this.lastRequestAt;
      this.lastRequestAt = now;

      if (sinceLast < 7500) {
        this.ignored += 1;
        await sleep(10_000);
        continue;
      }

      try {
        const requestUrl = this.buildPollingUrl();
        this.logger.debug("Polling", requestUrl);
        const response = await fetch(requestUrl, { method: "GET" });
        if (!this.running) {
          break;
        }

        if (response.status === 200 || response.status === 0) {
          const body = await response.text();
          this.emit("message", body);
          await sleep(10_000);
          continue;
        }

        this.emit("warn", { status: response.status });
        await sleep(25_000);
      } catch (error) {
        this.emit("error", error);
        await sleep(25_000);
      }

      if (this.counter % 10 === 0) {
        this.emit("reconnect_hint", { reason: "counter_mod_10" });
      }
    }

    this.emit("close");
  }

  stop() {
    this.running = false;
  }
}
