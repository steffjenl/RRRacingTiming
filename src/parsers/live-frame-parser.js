export function parseLiveFrames(payloadText) {
  const payload = String(payloadText ?? "");
  const lines = payload.split(/\r?\n/).filter((line) => line.length > 0);

  return lines.map((line, lineIndex) => {
    const parts = line.split("|");
    const field0 = parts[0] ?? "";
    const field1 = parts[1] ?? "";
    const field2 = parts[2] ?? "";
    const extras = parts.length > 3 ? parts.slice(3) : [];

    return {
      line,
      lineIndex,
      field0,
      field1,
      field2,
      extras,
      fields: parts
    };
  });
}

export function classifyFrame(frame) {
  if (frame.field0 === "init") {
    return "init";
  }
  if (frame.field0 === "gmt") {
    return "gmt_update";
  }
  if (frame.field0 === "grid") {
    return "grid";
  }
  if (frame.field0 === "css") {
    return "css";
  }
  if (frame.field0 === "dyn1" || frame.field0 === "dyn2") {
    return "dynamic_banner";
  }
  if (frame.field0 === "msg") {
    return "message";
  }
  if (frame.field1 === "*" || frame.field1.startsWith("*")) {
    return "driver_stream_update";
  }
  if (frame.field1 === "#") {
    return "position_update";
  }
  return "element_update";
}
