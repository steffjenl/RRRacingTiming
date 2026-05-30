import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { WebSocket, WebSocketServer } from "ws";
import { buildRuntimeConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { LiveRuntime } from "../app/live-runtime.js";
import { filterDrivers } from "../filters/driver-filter.js";
import { AnalyticsDb } from "../storage/analytics-db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: "/ws" });

const webPort = Number(process.env.WEB_PORT || 3000);
const debugEnabled = String(process.env.LOG_LEVEL || "").toLowerCase() === "debug";
const logger = createLogger(debugEnabled);
const runtimeConfig = buildRuntimeConfig({});
const packageJsonPath = path.resolve(__dirname, "../../package.json");
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version || "0.0.0-dev";
const maxWsClients = Number(process.env.WEB_MAX_WS_CLIENTS || 80);
const allowedCorsOrigin = process.env.CORS_ORIGIN || "*";
const trustProxy = Number(process.env.WEB_TRUST_PROXY || 1);

const runtime = new LiveRuntime(runtimeConfig, logger, {
  once: false,
  persistRawPath: process.env.WEB_SAVE_RAW || null,
  persistNormalizedPath: process.env.WEB_SAVE_NORMALIZED || null,
  snapshotPath: process.env.WEB_SNAPSHOT_PATH || "logs/state-snapshots.jsonl"
});

const analyticsDb = new AnalyticsDb(process.env.ANALYTICS_DB_PATH || "logs/analytics-db.json", logger, {
  maxHistory: 300,
  minWriteIntervalMs: 10000
});
await analyticsDb.init();

const socketFilters = new WeakMap();

app.disable("x-powered-by");
app.set("trust proxy", trustProxy);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "16kb" }));
app.use(cors({
  origin: allowedCorsOrigin === "*" ? true : allowedCorsOrigin,
  methods: ["GET"]
}));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Too many requests" }
});

app.use("/api", apiLimiter);

function normalizeClientFilters(input) {
  const MAX_FILTER_LENGTH = 64;
  return {
    driver: String(input?.driver || "").trim().slice(0, MAX_FILTER_LENGTH) || null,
    driverNumber: String(input?.driverNumber || "").trim().slice(0, MAX_FILTER_LENGTH) || null,
    team: String(input?.team || "").trim().slice(0, MAX_FILTER_LENGTH) || null
  };
}

function buildClientState(state, filters) {
  const drivers = filterDrivers(state?.grid?.drivers || [], filters);
  return {
    ...state,
    grid: {
      ...(state?.grid || {}),
      drivers
    }
  };
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function broadcastState(type, state, summary, meta = {}) {
  for (const ws of wsServer.clients) {
    const filters = socketFilters.get(ws) || normalizeClientFilters({});
    sendJson(ws, {
      type,
      summary,
      state: buildClientState(state, filters),
      meta
    });
  }
}

function serveIndexHtml(req, res) {
  const indexPath = path.join(__dirname, "public", "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replaceAll("__APP_VERSION_PLACEHOLDER__", appVersion);
  res.type("html").send(html);
}

app.get(["/", "/index.html"], serveIndexHtml);

wsServer.on("connection", (ws) => {
  if (wsServer.clients.size > maxWsClients) {
    ws.close(1008, "Server busy");
    return;
  }

  const defaultFilters = normalizeClientFilters({});
  socketFilters.set(ws, defaultFilters);

  sendJson(ws, {
    type: "hello",
    filters: defaultFilters,
    config: {
      host: runtimeConfig.host,
      port: runtimeConfig.port,
      gmt: runtimeConfig.gmt
    }
  });

  const state = runtime.getState();
  if (state) {
    sendJson(ws, {
      type: "snapshot",
      summary: runtime.getLatestSummary(),
      state: buildClientState(state, defaultFilters),
      meta: {
        transport: state?.session?.connection_state || null
      }
    });
  }

  ws.on("message", (data) => {
    try {
      if (typeof data === "string" && data.length > 8 * 1024) {
        sendJson(ws, {
          type: "error",
          message: "Message too large"
        });
        return;
      }

      const message = JSON.parse(String(data));
      if (!message || typeof message !== "object" || typeof message.type !== "string") {
        sendJson(ws, {
          type: "error",
          message: "Invalid message shape"
        });
        return;
      }

      if (message.type === "set_filters") {
        const filters = normalizeClientFilters(message.filters);
        socketFilters.set(ws, filters);
        const latestState = runtime.getState();
        if (latestState) {
          sendJson(ws, {
            type: "snapshot",
            summary: runtime.getLatestSummary(),
            state: buildClientState(latestState, filters),
            meta: {
              reason: "filters_updated"
            }
          });
        }
        return;
      }

      sendJson(ws, {
        type: "error",
        message: "Unsupported message type"
      });
    } catch (error) {
      sendJson(ws, {
        type: "error",
        message: error?.message || "Invalid client message"
      });
    }
  });
});

runtime.on("state", ({ state, summary, sequence, mode }) => {
  analyticsDb.recordState(state).catch((error) => {
    logger.warn("Analytics DB write failed", error?.message || error);
  });

  broadcastState("update", state, summary, {
    sequence,
    mode
  });
});

runtime.on("status", (status) => {
  for (const ws of wsServer.clients) {
    sendJson(ws, {
      type: "status",
      status
    });
  }
});

runtime.on("warn", ({ warning }) => {
  for (const ws of wsServer.clients) {
    sendJson(ws, {
      type: "warning",
      warning
    });
  }
});

runtime.on("error", ({ error }) => {
  for (const ws of wsServer.clients) {
    sendJson(ws, {
      type: "error",
      message: error?.message || String(error)
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    connection_state: runtime.getState()?.session?.connection_state || "unknown",
    summary: runtime.getLatestSummary()
  });
});

app.get("/api/analytics/:driverId", async (req, res) => {
  const result = await analyticsDb.getDriverAnalytics(req.params.driverId);
  if (!result) {
    res.status(404).json({
      ok: false,
      message: "No analytics available for this driver yet"
    });
    return;
  }

  res.json({
    ok: true,
    analytics: result
  });
});

app.get("/vendor/react.production.min.js", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../../node_modules/react/umd/react.production.min.js"));
});

app.get("/vendor/react-dom.production.min.js", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../../node_modules/react-dom/umd/react-dom.production.min.js"));
});

app.use(express.static(path.join(__dirname, "public")));

const shutdown = () => {
  logger.info("Stopping web server");
  runtime.stop();
  wsServer.close();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await runtime.start();
server.listen(webPort, () => {
  logger.info(`RRRacingTiming web server listening on http://localhost:${webPort}`);
});
