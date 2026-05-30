const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(debugEnabled = false) {
  const threshold = debugEnabled ? LEVELS.debug : LEVELS.info;

  function write(level, ...args) {
    if (LEVELS[level] < threshold) {
      return;
    }

    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    // Keep output deterministic and lightweight for CLI use.
    console.log(prefix, ...args);
  }

  return {
    debug: (...args) => write("debug", ...args),
    info: (...args) => write("info", ...args),
    warn: (...args) => write("warn", ...args),
    error: (...args) => write("error", ...args)
  };
}
