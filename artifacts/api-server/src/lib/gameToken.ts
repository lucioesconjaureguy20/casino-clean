import crypto from "crypto";

const GAME_TOKEN_ISS = "mander-casino-game";
const GAME_TOKEN_TTL = 30 * 24 * 3600; // 30 días

function b64url(s: string) { return Buffer.from(s).toString("base64url"); }
function fromb64url(s: string) { return Buffer.from(s, "base64url").toString("utf-8"); }

export function signGameToken(profileId: string, username: string): string {
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pay = b64url(JSON.stringify({ iss: GAME_TOKEN_ISS, sub: profileId, username, iat: now, exp: now + GAME_TOKEN_TTL }));
  const sig = crypto.createHmac("sha256", key).update(`${hdr}.${pay}`).digest("base64url");
  return `${hdr}.${pay}.${sig}`;
}

export function verifyGameToken(token: string): { profileId: string; username: string } | null {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [hdr, pay, sig] = parts;
  const expected = crypto.createHmac("sha256", key).update(`${hdr}.${pay}`).digest("base64url");
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(fromb64url(pay));
    if (payload.iss !== GAME_TOKEN_ISS) return null;
    if (!payload.sub || !payload.username) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { profileId: payload.sub, username: payload.username };
  } catch { return null; }
}
