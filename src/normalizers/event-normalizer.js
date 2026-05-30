import { classifyFrame } from "../parsers/live-frame-parser.js";

function parseColorValue(raw) {
  const text = String(raw ?? "");
  const numeric = text.replace(/[a-zA-Z]/g, "");
  const color = text.replace(/[0-9]/g, "") || "";
  return {
    value: Number.parseInt(numeric || "0", 10) || 0,
    color
  };
}

function parseXmlAttributes(fragment) {
  const attrs = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(fragment)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseDriverInfoXml(rawXml) {
  const xml = String(rawXml ?? "");
  if (!xml) {
    return null;
  }

  const rootMatch = /<([a-zA-Z0-9_:-]+)([^>]*)>/.exec(xml);
  const rootAttrs = rootMatch ? parseXmlAttributes(rootMatch[2] || "") : {};

  const infos = [];
  const infoRegex = /<inf([^>]*)\/?>(?:<\/inf>)?/gi;
  let infoMatch;
  while ((infoMatch = infoRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(infoMatch[1] || "");
    infos.push({
      type: attrs.type || "",
      title: attrs.title || "",
      value: attrs.value || "",
      flag: attrs.nat || ""
    });
  }

  return {
    id: rootAttrs.id || "",
    member_id: rootAttrs.member || "",
    center_id: rootAttrs.center || "",
    kart_number: rootAttrs.num || "",
    driver_name: rootAttrs.name || "",
    driver_flag: rootAttrs.nat || "",
    infos
  };
}

function parseDomainRecord(rawLine) {
  const line = String(rawLine ?? "");
  const lapMatch = /^D(\d+)\.L(\d+)#(.+)$/.exec(line);
  if (lapMatch) {
    const driverId = lapMatch[1];
    const lapNo = Number.parseInt(lapMatch[2], 10) || 0;
    const parts = lapMatch[3].split("|");
    const s1 = parseColorValue(parts[0]);
    const s2 = parseColorValue(parts[1]);
    const s3 = parseColorValue(parts[2]);
    const lap = parseColorValue(parts[3]);
    return {
      domainType: "lap",
      driverId,
      lap: {
        lap_no: lapNo,
        sector_1: s1.value,
        sector_1_color: s1.color,
        sector_2: s2.value,
        sector_2_color: s2.color,
        sector_3: s3.value,
        sector_3_color: s3.color,
        lap_time: lap.value,
        lap_time_color: lap.color
      }
    };
  }

  const pitMatch = /^D(\d+)\.P\d+#(.+)$/.exec(line);
  if (pitMatch) {
    const driverId = pitMatch[1];
    const parts = pitMatch[2].split("|");
    const num = (i) => Number.parseInt((parts[i] || "").replace(/[a-zA-Z]/g, ""), 10) || 0;
    return {
      domainType: "pit_event",
      driverId,
      pit_event: {
        pit: num(0),
        lap: num(1),
        in_hour: num(2),
        out_hour: num(3),
        pit_time: num(4),
        track_time: num(5),
        relay_laps_number: num(6),
        relay_driver_id: num(7),
        driver_total_time: num(8)
      }
    };
  }

  const bestLapMatch = /^D(\d+)\.BL#(.+)$/.exec(line);
  if (bestLapMatch) {
    const driverId = bestLapMatch[1];
    const parts = bestLapMatch[2].split("|");
    return {
      domainType: "best_lap",
      driverId,
      best_lap: {
        sector_1: Number.parseInt(parts[0] || "0", 10) || 0,
        sector_2: Number.parseInt(parts[1] || "0", 10) || 0,
        sector_3: Number.parseInt(parts[2] || "0", 10) || 0,
        lap_time: Number.parseInt(parts[3] || "0", 10) || 0
      }
    };
  }

  const bestSectorsMatch = /^D(\d+)\.BS#(.+)$/.exec(line);
  if (bestSectorsMatch) {
    const driverId = bestSectorsMatch[1];
    const parts = bestSectorsMatch[2].split("|");
    return {
      domainType: "best_sectors",
      driverId,
      best_sectors: {
        sector_1: Number.parseInt(parts[0] || "0", 10) || 0,
        sector_2: Number.parseInt(parts[1] || "0", 10) || 0,
        sector_3: Number.parseInt(parts[2] || "0", 10) || 0
      }
    };
  }

  const infoMatch = /^D(\d+)\.INF/.exec(line);
  if (infoMatch) {
    const rawXml = line.includes("<") ? line.slice(line.indexOf("<")) : "";
    return {
      domainType: "driver_info_fragment",
      driverId: infoMatch[1],
      raw_xml: rawXml,
      driver_info: parseDriverInfoXml(rawXml)
    };
  }

  return null;
}

export function normalizeFrame(frame, context) {
  const category = classifyFrame(frame);
  const domainRecord = parseDomainRecord(frame.line);

  return {
    id: `${Date.now()}-${context.sequence}`,
    received_at: context.receivedAt,
    transport: context.transport,
    source_url: context.sourceUrl,
    category,
    raw_line: frame.line,
    parsed: {
      field0: frame.field0,
      field1: frame.field1,
      field2: frame.field2,
      extras: frame.extras
    },
    normalized: {
      session: category === "init" ? { mode: frame.field1 } : null,
      race_status: category === "message" ? { message: frame.field2 } : null,
      timing_entry: category === "driver_stream_update" ? {
        driver_id: frame.field0,
        update_type: frame.field1,
        value: frame.field2
      } : null,
      domain_record: domainRecord
    },
    unknown_fields: {
      all_fields: frame.fields,
      extras: frame.extras
    }
  };
}
