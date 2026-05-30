import EventEmitter from "node:events";
import { LiveTransportManager } from "../connection/transport-selector.js";
import { parsePollingResponse } from "../parsers/polling-response-parser.js";
import { parseLiveFrames } from "../parsers/live-frame-parser.js";
import { normalizeFrame } from "../normalizers/event-normalizer.js";
import { ModelProjector } from "../normalizers/model-projector.js";
import { EventWriter } from "../storage/event-writer.js";
import { StateSnapshotWriter } from "../storage/state-snapshot.js";

function createEventSummary(event) {
  return `${event.category} ${event.parsed?.field0 || ""}`.trim();
}

export class LiveRuntime extends EventEmitter {
  constructor(runtimeConfig, logger, options = {}) {
    super();
    this.runtimeConfig = runtimeConfig;
    this.logger = logger;
    this.options = options;
    this.projector = new ModelProjector(runtimeConfig);
    this.manager = new LiveTransportManager(runtimeConfig, logger, { once: Boolean(options.once) });

    this.sequence = 0;
    this.latestSummary = "waiting for data";
    this.latestState = this.projector.state;
    this.latestRecord = null;
    this.stopped = false;
    this.onceEmitted = false;

    this.rawWriter = new EventWriter(options.persistRawPath || null);
    this.normalizedWriter = new EventWriter(options.persistNormalizedPath || null);
    this.snapshotWriter = new StateSnapshotWriter(
      options.snapshotPath || null,
      Number.isFinite(options.snapshotIntervalMs) ? options.snapshotIntervalMs : 30000
    );

    this.bindManagerEvents();
  }

  bindManagerEvents() {
    this.manager.on("mode", ({ mode }) => {
      this.projector.setConnectionState(mode === "ws" ? "connecting-websocket" : "polling");
      this.emit("status", { connection_state: this.projector.state.session.connection_state, mode });
    });

    this.manager.on("open", ({ mode }) => {
      this.projector.setConnectionState(mode === "ws" ? "connected-websocket" : "connected-polling");
      this.emit("status", { connection_state: this.projector.state.session.connection_state, mode });
    });

    this.manager.on("close", ({ mode }) => {
      this.projector.setConnectionState(mode === "ws" ? "disconnected-websocket" : "disconnected-polling");
      this.emit("status", { connection_state: this.projector.state.session.connection_state, mode });
    });

    this.manager.on("warn", ({ warning }) => {
      this.logger.warn("Transport warning", warning);
      this.emit("warn", { warning });
    });

    this.manager.on("error", ({ error }) => {
      this.logger.error("Transport error", error?.message || error);
      this.emit("error", { error });
    });

    this.manager.on("message", ({ mode, payload }) => {
      this.handleMessage(mode, payload);
    });
  }

  async start() {
    this.rawWriter.open();
    this.normalizedWriter.open();
    this.snapshotWriter.start();

    // Transport startup can remain active indefinitely while connected.
    // Run it in the background so app/server startup is not blocked.
    this.manager.start().catch((error) => {
      this.logger.error("Runtime start failure", error?.message || error);
      this.emit("error", { error });
    });
  }

  stop() {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.manager.stop();
    this.rawWriter.close();
    this.normalizedWriter.close();
    this.snapshotWriter.stop();
  }

  getState() {
    return this.latestState;
  }

  getLatestSummary() {
    return this.latestSummary;
  }

  handleMessage(mode, payload) {
    const receivedAt = new Date().toISOString();
    const sourceUrl = mode === "ws" ? this.runtimeConfig.wsUrl : this.runtimeConfig.pollingUrl;

    const rawEvent = {
      received_at: receivedAt,
      transport: mode,
      source_url: sourceUrl,
      message: payload
    };

    this.rawWriter.write(rawEvent);
    this.emit("raw", rawEvent);

    let payloadToParse = payload;
    if (mode === "polling") {
      const parsedPolling = parsePollingResponse(payload);
      this.manager.updatePollingState({ init: parsedPolling.init, index: parsedPolling.index });
      payloadToParse = parsedPolling.payload;
    }

    const frames = parseLiveFrames(payloadToParse);
    for (const frame of frames) {
      this.sequence += 1;
      const normalized = normalizeFrame(frame, {
        sequence: this.sequence,
        receivedAt,
        transport: mode,
        sourceUrl
      });

      const projection = this.projector.apply(normalized);
      this.latestState = projection.state;
      this.latestSummary = createEventSummary(normalized);

      const record = {
        ...normalized,
        change_detection: projection.change_detection
      };

      this.latestRecord = record;
      this.normalizedWriter.write(record);
      this.snapshotWriter.update(projection.state);

      this.emit("record", {
        record,
        summary: this.latestSummary,
        state: projection.state,
        mode
      });

      this.emit("state", {
        state: projection.state,
        summary: this.latestSummary,
        sequence: this.sequence,
        received_at: receivedAt,
        mode
      });
    }

    if (this.options.once && frames.length > 0 && !this.onceEmitted) {
      this.onceEmitted = true;
      this.emit("once");
      this.stop();
    }
  }
}
