import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface UserIpEntry {
  userId:   string;
  username: string;
  ips:      string[];
  lastIp:   string;
  lastSeen: string;
  pending?: boolean;
}

export interface IpReport {
  duplicates: { ip: string; users: string[] }[];
  all:        UserIpEntry[];
}

const DATA_DIR = join(process.cwd(), "data");
const IP_FILE  = join(DATA_DIR, "ip-store.json");

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

const store = new Map<string, UserIpEntry>();

// ── Supabase backup helpers ───────────────────────────────────────────────────

async function saveIpToSupabase(entry: UserIpEntry): Promise<void> {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(entry.userId)}`, {
      method: "PUT",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_metadata: {
          tracked_ips:    entry.ips,
          last_tracked_ip: entry.lastIp,
          ip_last_seen:   entry.lastSeen,
        },
      }),
    });
  } catch { /* non-critical backup — ignore errors */ }
}

/**
 * Restore from Supabase app_metadata and MERGE with existing in-memory store.
 * - New users (not in store) are added.
 * - Existing users get their IP lists MERGED (union) with Supabase data.
 * - The most recent lastSeen wins.
 * Always runs at startup so Supabase acts as the authoritative persistent store.
 */
async function restoreFromSupabase(): Promise<number> {
  if (!SB_URL || !SB_KEY) return 0;
  let merged = 0;
  try {
    let page = 1;
    while (true) {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (!r.ok) break;
      const data: { users?: any[] } = await r.json();
      const users = data.users ?? [];
      if (users.length === 0) break;

      for (const u of users) {
        const meta = u.app_metadata ?? {};
        const sbIps: string[] = Array.isArray(meta.tracked_ips) ? meta.tracked_ips : [];
        if (sbIps.length === 0) continue;

        const username: string = u.user_metadata?.username ?? u.email ?? u.id;
        const sbLastIp:   string = meta.last_tracked_ip ?? sbIps[sbIps.length - 1] ?? "";
        const sbLastSeen: string = meta.ip_last_seen ?? u.last_sign_in_at ?? new Date().toISOString();

        const existing = store.get(u.id);
        if (!existing) {
          // Brand-new entry — add it
          store.set(u.id, { userId: u.id, username, ips: sbIps, lastIp: sbLastIp, lastSeen: sbLastSeen });
          merged++;
        } else {
          // Merge IPs: union of both lists
          let changed = false;
          for (const ip of sbIps) {
            if (!existing.ips.includes(ip)) {
              existing.ips.push(ip);
              changed = true;
            }
          }
          // Use the more recent lastSeen
          if (sbLastSeen > existing.lastSeen) {
            existing.lastIp   = sbLastIp;
            existing.lastSeen = sbLastSeen;
            changed = true;
          }
          if (changed) merged++;
        }
      }

      if (users.length < 1000) break;
      page++;
    }
  } catch (e: any) {
    console.warn("[ip-store] restore from Supabase failed:", e.message);
  }
  return merged;
}

// ── Load persisted data on startup ───────────────────────────────────────────
try {
  mkdirSync(DATA_DIR, { recursive: true });
  const arr: UserIpEntry[] = JSON.parse(readFileSync(IP_FILE, "utf-8"));
  for (const e of arr) store.set(e.userId, e);
  console.log(`[ip-store] loaded ${store.size} entries from disk`);
} catch {}

// Always merge Supabase data at startup — Supabase is the authoritative
// persistent store. This fills in IPs that were missing from the disk file
// (e.g. after a server restart where the file was stale or partially written).
restoreFromSupabase().then(n => {
  if (n > 0) {
    persist();
    console.log(`[ip-store] merged ${n} entries from Supabase backup`);
  }
});

function persist() {
  try {
    writeFileSync(IP_FILE, JSON.stringify([...store.values()], null, 2));
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Called on login or profile poll — records a real IP for the user.
 *  Returns true if something changed (triggers a disk write), false if no-op. */
export function recordIp(userId: string, username: string, rawIp: string): boolean {
  const ip = rawIp?.split(",")[0]?.trim() ?? "";
  if (!ip) return false;

  const existing = store.get(userId);
  if (existing) {
    const changed = !existing.ips.includes(ip);
    if (changed) existing.ips.push(ip);
    existing.lastIp   = ip;
    existing.lastSeen = new Date().toISOString();
    existing.username = username;
    const wasPending  = existing.pending;
    delete existing.pending;
    if (changed || wasPending) {
      persist();
      saveIpToSupabase(existing); // async backup to Supabase
      return true;
    }
    return false;
  } else {
    const entry: UserIpEntry = { userId, username, ips: [ip], lastIp: ip, lastSeen: new Date().toISOString() };
    store.set(userId, entry);
    persist();
    saveIpToSupabase(entry); // async backup to Supabase
    return true;
  }
}

/** Seed a user without a known IP (imported from profiles).
 *  Skipped if the user already has a real IP recorded. */
export function seedUser(userId: string, username: string, createdAt: string): void {
  if (store.has(userId)) return;
  store.set(userId, { userId, username, ips: [], lastIp: "", lastSeen: createdAt, pending: true });
}

export function flushSeeds(): void {
  persist();
}

export function getIpReport(): IpReport {
  const byIp = new Map<string, string[]>();
  for (const entry of store.values()) {
    for (const ip of entry.ips) {
      if (!ip) continue;
      const list = byIp.get(ip) ?? [];
      if (!list.includes(entry.username)) list.push(entry.username);
      byIp.set(ip, list);
    }
  }
  const duplicates = [...byIp.entries()]
    .filter(([, users]) => users.length > 1)
    .map(([ip, users]) => ({ ip, users }))
    .sort((a, b) => b.users.length - a.users.length);

  return {
    duplicates,
    all: [...store.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
  };
}
