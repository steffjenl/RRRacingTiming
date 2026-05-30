import EventEmitter from "node:events";

export class WsClient extends EventEmitter {
  constructor(url, logger) {
    super();
    this.url = url;
    this.logger = logger;
    this.socket = null;
    this.openedAt = 0;
  }

  connect() {
    if (!this.url) {
      throw new Error("WebSocket URL is required");
    }

    this.logger.debug("Opening WebSocket", this.url);
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.openedAt = Date.now();
      this.emit("open");
    };

    this.socket.onmessage = (event) => {
      this.emit("message", String(event.data ?? ""));
    };

    this.socket.onerror = (error) => {
      this.emit("error", error);
    };

    this.socket.onclose = (event) => {
      const openDurationMs = this.openedAt > 0 ? Date.now() - this.openedAt : 0;
      this.emit("close", {
        code: event.code,
        reason: event.reason,
        openDurationMs
      });
    };
  }

  close() {
    if (this.socket && this.socket.readyState < 2) {
      this.socket.close();
    }
  }
}
