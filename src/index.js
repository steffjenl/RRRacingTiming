#!/usr/bin/env node
import { parseArgs, printHelp } from "./cli/args.js";
import { buildRuntimeConfig } from "./config.js";
import { createLogger } from "./utils/logger.js";
import { printRawEvent } from "./output/raw-printer.js";
import { printPrettyState } from "./output/pretty-printer.js";
import { printJsonEvent } from "./output/json-printer.js";
import { LiveRuntime } from "./app/live-runtime.js";

async function main() {
  const cliOptions = parseArgs(process.argv);
  if (cliOptions.help) {
    printHelp();
    return;
  }

  const logger = createLogger(cliOptions.debug);
  const runtimeConfig = buildRuntimeConfig(cliOptions);

  logger.info("Runtime config", {
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    wsUrl: runtimeConfig.wsUrl,
    pollingUrl: runtimeConfig.pollingUrl,
    gmt: runtimeConfig.gmt,
    once: runtimeConfig.once
  });

  const runtime = new LiveRuntime(runtimeConfig, logger, {
    once: cliOptions.once,
    persistRawPath: cliOptions.save,
    persistNormalizedPath: cliOptions.saveNormalized,
    snapshotPath: "logs/state-snapshots.jsonl"
  });

  runtime.on("raw", (rawEvent) => {
    if (cliOptions.raw) {
      printRawEvent(rawEvent);
    }
  });

  runtime.on("record", ({ record }) => {
    if (cliOptions.json) {
      printJsonEvent(record);
    }
  });

  runtime.on("warn", ({ warning }) => {
    logger.warn("Runtime warning", warning);
  });

  runtime.on("error", ({ error }) => {
    logger.error("Runtime error", error?.message || error);
  });

  runtime.on("state", ({ state, summary }) => {
    if (cliOptions.pretty) {
      printPrettyState(state, cliOptions, summary);
    }
  });

  const shutdown = () => {
    logger.info("Stopping live client");
    runtime.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const onceCompleted = cliOptions.once
    ? new Promise((resolve) => {
      runtime.once("once", resolve);
    })
    : null;

  await runtime.start();

  if (onceCompleted) {
    await onceCompleted;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
