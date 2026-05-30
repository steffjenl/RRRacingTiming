function readValue(args, i, flag) {
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    url: null,
    host: null,
    port: null,
    gmt: null,
    secure: false,
    driver: null,
    driverNumber: null,
    team: null,
    raw: false,
    pretty: false,
    json: false,
    save: null,
    saveNormalized: null,
    once: false,
    debug: false,
    help: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--url":
        options.url = readValue(args, i, arg);
        i += 1;
        break;
      case "--host":
        options.host = readValue(args, i, arg);
        i += 1;
        break;
      case "--port":
        options.port = Number(readValue(args, i, arg));
        i += 1;
        break;
      case "--gmt":
        options.gmt = Number(readValue(args, i, arg));
        i += 1;
        break;
      case "--secure":
        options.secure = true;
        break;
      case "--driver":
        options.driver = readValue(args, i, arg);
        i += 1;
        break;
      case "--driver-number":
        options.driverNumber = readValue(args, i, arg);
        i += 1;
        break;
      case "--team":
        options.team = readValue(args, i, arg);
        i += 1;
        break;
      case "--raw":
        options.raw = true;
        break;
      case "--pretty":
        options.pretty = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--save":
        options.save = readValue(args, i, arg);
        i += 1;
        break;
      case "--save-normalized":
        options.saveNormalized = readValue(args, i, arg);
        i += 1;
        break;
      case "--once":
        options.once = true;
        break;
      case "--debug":
        options.debug = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.raw && !options.pretty && !options.json) {
    options.pretty = true;
  }

  return options;
}

export function printHelp() {
  const lines = [
    "Usage: node src/index.js [options]",
    "",
    "Required behavior options:",
    "  --url <value>                 override endpoint (ws/wss/http/https)",
    "  --driver <value>              filter by driver name",
    "  --driver-number <value>       filter by driver number",
    "  --team <value>                filter by team",
    "  --raw                         print raw inbound events",
    "  --pretty                      print formatted terminal table",
    "  --json                        print normalized events as JSON",
    "  --save <path>                 append raw events to JSONL",
    "  --save-normalized <path>      append normalized events to JSONL",
    "  --once                        process first cycle/event then stop",
    "  --debug                       verbose internal logging",
    "",
    "Optional transport config:",
    "  --host <value>                Apex host override",
    "  --port <value>                base Apex port override",
    "  --gmt <value>                 GMT offset override",
    "  --secure                      force secure ws defaults",
    "  --help                        show this help"
  ];

  console.log(lines.join("\n"));
}
