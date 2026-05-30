export function printRawEvent(rawEvent) {
  const message = typeof rawEvent.message === "string" ? rawEvent.message : JSON.stringify(rawEvent.message);
  console.log(`[RAW ${rawEvent.transport}] ${rawEvent.received_at} ${message}`);
}
