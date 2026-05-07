let _cached: { hash: string; info: string } | null = null;

export async function getDeviceFingerprint(): Promise<{ hash: string; info: string }> {
  if (_cached) return _cached;

  const components: string[] = [
    navigator.userAgent,
    navigator.language || "",
    String(navigator.hardwareConcurrency || 0),
    navigator.platform || "",
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String((navigator as any).deviceMemory || 0),
    String(navigator.maxTouchPoints || 0),
  ];

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200; canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("ManderBet\u{1F3B0}", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("ManderBet\u{1F3B0}", 4, 17);
      components.push(canvas.toDataURL());
    }
  } catch {}

  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        components.push(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
        components.push(String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)));
      }
    }
  } catch {}

  const str = components.join("|||");
  let hash = "";
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    hash = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    hash = Math.random().toString(36).slice(2, 18);
  }

  const ua     = navigator.userAgent;
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser =
    /Firefox\//.test(ua)      ? "Firefox"  :
    /Edg\//.test(ua)          ? "Edge"     :
    /OPR\/|Opera\//.test(ua)  ? "Opera"    :
    /Chrome\//.test(ua)       ? "Chrome"   :
    /Safari\//.test(ua)       ? "Safari"   : "?";
  const os =
    /Windows/.test(ua)        ? "Windows"  :
    /Mac OS X/.test(ua)       ? "macOS"    :
    /Android/.test(ua)        ? "Android"  :
    /iPhone|iPad/.test(ua)    ? "iOS"      :
    /Linux/.test(ua)          ? "Linux"    : "?";
  const info = `${mobile ? "\u{1F4F1}" : "\u{1F4BB}"} ${os} \u00B7 ${browser} \u00B7 ${screen.width}\u00D7${screen.height}`;

  _cached = { hash, info };
  return _cached;
}

export async function sendDeviceFingerprint(token: string): Promise<void> {
  try {
    const fp = await getDeviceFingerprint();
    await fetch("/api/admin/device-fp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(fp),
    });
  } catch {}
}
