import EventEmitter from "node:events";
import WebSocket from "ws";

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

    this.socket.on("open", () => {
      this.openedAt = Date.now();
      this.emit("open");
    });

    this.socket.on("message", (data) => {
      this.emit("message", String(data ?? ""));
    });

    this.socket.on("error", (error) => {
      this.emit("error", error);
    });

    this.socket.on("close", (code, reasonBuffer) => {
      const openDurationMs = this.openedAt > 0 ? Date.now() - this.openedAt : 0;
      this.emit("close", {
        code,
        reason: String(reasonBuffer ?? ""),
        openDurationMs
      });
    });
  }

  close() {
    if (this.socket && this.socket.readyState < 2) {
      this.socket.close();
    }
  }
}
