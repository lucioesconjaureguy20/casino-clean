import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface DeviceEntry {
  hash:      string;
  info:      string;
  firstSeen: string;
  lastSeen:  string;
}

export interface UserDeviceEntry {
  userId:   string;
  username: string;
  devices:  DeviceEntry[];
  lastHash: string;
  lastInfo: string;
  lastSeen: string;
}

export interface DeviceReport {
  duplicates: { hash: string; info: string; users: string[] }[];
  all:        UserDeviceEntry[];
}

const DATA_DIR    = join(process.cwd(), "data");
const DEVICE_FILE = join(DATA_DIR, "device-store.json");

const store = new Map<string, UserDeviceEntry>();

function persist() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DEVICE_FILE, JSON.stringify([...store.values()], null, 2));
  } catch {}
}

function load(): number {
  try {
    const raw     = readFileSync(DEVICE_FILE, "utf-8");
    const entries = JSON.parse(raw) as UserDeviceEntry[];
    for (const e of entries) store.set(e.userId, e);
    return entries.length;
  } catch { return 0; }
}

export function initDeviceStore(): void {
  const n = load();
  console.log(`[device-store] loaded ${n} entries from disk`);
}

export function recordDevice(
  userId:   string,
  username: string,
  hash:     string,
  info:     string,
): boolean {
  if (!hash || !userId) return false;
  const now      = new Date().toISOString();
  const existing = store.get(userId);

  if (existing) {
    existing.username = username;
    existing.lastSeen = now;
    existing.lastHash = hash;
    existing.lastInfo = info;
    const known = existing.devices.find(d => d.hash === hash);
    if (known) {
      known.lastSeen = now;
    } else {
      existing.devices.push({ hash, info, firstSeen: now, lastSeen: now });
    }
  } else {
    store.set(userId, {
      userId, username, lastHash: hash, lastInfo: info, lastSeen: now,
      devices: [{ hash, info, firstSeen: now, lastSeen: now }],
    });
  }
  persist();
  return true;
}

export function getDeviceReport(): DeviceReport {
  const byHash = new Map<string, { info: string; users: string[] }>();
  for (const entry of store.values()) {
    for (const d of entry.devices) {
      const existing = byHash.get(d.hash);
      if (existing) {
        if (!existing.users.includes(entry.username)) existing.users.push(entry.username);
      } else {
        byHash.set(d.hash, { info: d.info, users: [entry.username] });
      }
    }
  }
  const duplicates = [...byHash.entries()]
    .filter(([, v]) => v.users.length > 1)
    .map(([hash, v]) => ({ hash, info: v.info, users: v.users }))
    .sort((a, b) => b.users.length - a.users.length);

  return {
    duplicates,
    all: [...store.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
  };
}
