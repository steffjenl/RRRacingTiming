import { loadDotEnv } from "./utils/env.js";

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
}

function parseEndpointUrl(urlValue) {
  if (!urlValue) {
    return null;
  }

  const url = new URL(urlValue);
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return { wsUrl: url.toString(), pollingUrl: null, secure: url.protocol === "wss:" };
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return { wsUrl: null, pollingUrl: url.toString(), secure: url.protocol === "https:" };
  }

  throw new Error(`Unsupported URL protocol: ${url.protocol}`);
}

export function buildRuntimeConfig(cliOptions) {
  loadDotEnv();

  const defaults = {
    host: process.env.APEX_HOST || "www.apex-timing.com",
    port: Number(process.env.APEX_PORT || 9460),
    gmt: Number(process.env.APEX_GMT || 2),
    secure: toBool(process.env.APEX_SECURE, false),
    pollingUrlOverride: process.env.APEX_POLLING_URL || null
  };

  const host = cliOptions.host || defaults.host;
  const port = Number.isFinite(cliOptions.port) ? cliOptions.port : defaults.port;
  const gmt = Number.isFinite(cliOptions.gmt) ? cliOptions.gmt : defaults.gmt;
  const secure = cliOptions.secure || defaults.secure;

  let wsUrl = secure ? `wss://${host}:${port + 3}/` : `ws://${host}:${port + 2}/`;
  let pollingUrl = defaults.pollingUrlOverride || `https://${host}/commonv2/functions/live_ajax.php`;

  if (cliOptions.url) {
    const parsed = parseEndpointUrl(cliOptions.url);
    if (parsed.wsUrl) {
      wsUrl = parsed.wsUrl;
    }
    if (parsed.pollingUrl) {
      pollingUrl = parsed.pollingUrl;
      wsUrl = null;
    }
  }

  return {
    host,
    port,
    gmt,
    secure,
    comVersion: "1.0.0",
    wsUrl,
    pollingUrl,
    once: Boolean(cliOptions.once),
    debug: Boolean(cliOptions.debug)
  };
}
