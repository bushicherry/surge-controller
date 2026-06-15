import { promises as fs } from "node:fs";
import { dirname, basename, join } from "node:path";

const MAX_BACKUPS = 5;

export async function readProfile(path: string): Promise<string> {
  return await fs.readFile(path, "utf8");
}

export async function writeProfileAtomic(path: string, content: string) {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  // backup current
  try {
    const cur = await fs.readFile(path, "utf8");
    const backup = `${path}.bak.${Date.now()}`;
    await fs.writeFile(backup, cur, "utf8");
    await rotateBackups(path);
  } catch {
    // no existing file
  }
  await fs.rename(tmp, path);
}

async function rotateBackups(path: string) {
  const dir = dirname(path);
  const base = basename(path);
  const entries = await fs.readdir(dir);
  const backups = entries
    .filter(n => n.startsWith(`${base}.bak.`))
    .sort()
    .reverse(); // newest first
  for (const stale of backups.slice(MAX_BACKUPS)) {
    await fs.unlink(join(dir, stale)).catch(() => {});
  }
}
