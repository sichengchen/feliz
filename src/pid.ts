import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const PID_FILENAME = "feliz.pid";

export function writePidFile(dataDir: string): void {
  writeFileSync(join(dataDir, PID_FILENAME), String(process.pid) + "\n");
}

export function removePidFile(dataDir: string): void {
  const path = join(dataDir, PID_FILENAME);
  if (existsSync(path)) unlinkSync(path);
}

export function readPidFile(dataDir: string): number | null {
  const path = join(dataDir, PID_FILENAME);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return null;
  const pid = Number(content);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}
