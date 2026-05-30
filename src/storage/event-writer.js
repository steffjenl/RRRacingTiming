import fs from "node:fs";
import path from "node:path";

export class EventWriter {
  constructor(filePath) {
    this.filePath = filePath;
    this.stream = null;
  }

  open() {
    if (!this.filePath) {
      return;
    }
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
  }

  write(entry) {
    if (!this.stream) {
      return;
    }
    this.stream.write(`${JSON.stringify(entry)}\n`);
  }

  close() {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}
