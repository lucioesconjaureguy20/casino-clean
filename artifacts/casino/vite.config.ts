import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROUTE_META: Record<string, { title: string; desc: string }> = {
  "/dice":      { title: "Dice Online – Provably Fair | Mander Originals",      desc: "Play Dice. Set your target, roll over or under — fast crypto payouts." },
  "/plinko":    { title: "Plinko Online – Provably Fair | Mander Originals",    desc: "Play Plinko. Drop the ball and watch the multipliers fly — fast crypto wins." },
  "/keno":      { title: "Keno Online – Provably Fair | Mander Originals",      desc: "Play Keno. Pick your numbers, watch the draw — fast crypto payouts." },
  "/blackjack": { title: "Blackjack Online – Provably Fair | Mander Originals", desc: "Play Blackjack. Hit, stand, double down, or split — fast crypto payouts." },
  "/mines":     { title: "Mines Online – Provably Fair | Mander Originals",     desc: "Play Mines. Reveal gems, avoid bombs, cash out anytime — crypto on every bet." },
  "/hilo":      { title: "HiLo Online – Provably Fair | Mander Originals",      desc: "Play HiLo. Guess higher or lower on every card — build your multiplier and cash out." },
  "/roulette":  { title: "Roulette Online – Provably Fair | Mander Originals",  desc: "Play Roulette. Bet on numbers, colors or dozens — provably fair crypto spins." },
  "/baccarat":  { title: "Baccarat Online – Provably Fair | Mander Originals",  desc: "Play Baccarat. Back the Player, Banker or Tie — quick rounds, fast crypto payouts." },
  "/limbo":     { title: "Limbo Online – Provably Fair | Mander Originals",     desc: "Play Limbo. Set your target multiplier up to 1,000,000x and bet on the outcome — provably fair, fast crypto payouts." },
  "/originals": { title: "Mander Originals – Provably Fair Crypto Casino Games", desc: "All Mander original games in one place. Provably fair, fast payouts, no waiting." },
  "/fairness":  { title: "Provably Fair Casino | ManderBet",                    desc: "Every bet at ManderBet is verifiable on-chain. Check our provably fair algorithm and verify any game result yourself." },
  "/rewards":   { title: "VIP Rewards & Bonuses | ManderBet",                   desc: "Level up your VIP status and unlock exclusive rewards and bonus drops. The more you play, the more you earn." },
  "/referrals": { title: "Affiliate Program | ManderBet",                       desc: "Share your referral link and earn lifetime commissions. Climb the leaderboard and unlock bonus rewards at ManderBet." },
  "/about":     { title: "About ManderBet Casino",                              desc: "ManderBet is an original-only crypto casino. Every game is developed in-house with provably fair mechanics, instant payouts, and full transparency." },
  "/contact":   { title: "Contact Us | Mander Casino",                          desc: "Get in touch with the Mander Casino team. Reach our support or marketing department, or start a live chat for instant help." },
};

const BOT_UA = /bot|crawl|slack|discord|telegram|whatsapp|twitter|facebook|linkedin|preview|fetch|python|curl|wget|java|ruby|go-http/i;

function injectBotMeta(html: string, pathname: string): string {
  const meta = ROUTE_META[pathname];
  if (!meta) return html;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return html
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${esc(meta.title)}$2`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${esc(meta.desc)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${esc(meta.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${esc(meta.desc)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1https://manderbet.com${pathname}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/i, `$1${esc(meta.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/i, `$1${esc(meta.desc)}$2`);
}

function botMetaPlugin(): Plugin {
  return {
    name: "bot-meta",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const ua = req.headers["user-agent"] ?? "";
        const pathname = (req.url ?? "/").split("?")[0];
        if (!BOT_UA.test(ua) || !ROUTE_META[pathname]) return next();
        const indexPath = path.resolve(import.meta.dirname, "index.html");
        try {
          const html = injectBotMeta(readFileSync(indexPath, "utf-8"), pathname);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch { next(); }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const ua = req.headers["user-agent"] ?? "";
        const pathname = (req.url ?? "/").split("?")[0];
        if (!BOT_UA.test(ua) || !ROUTE_META[pathname]) return next();
        const distPath = path.resolve(import.meta.dirname, "dist/public/index.html");
        try {
          const html = injectBotMeta(readFileSync(distPath, "utf-8"), pathname);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch { next(); }
      });
    },
  };
}

const rawPort = process.env.PORT;
const isBuild = process.argv.includes("build");

if (!rawPort && !isBuild) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort ?? "3000");

if (!isBuild && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

function scanPublicAssets(dir: string, prefix = ""): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = prefix + "/" + entry;
      if (statSync(full).isDirectory()) {
        Object.assign(map, scanPublicAssets(full, rel));
      } else if (/\.(webp|png|jpg|jpeg|gif|svg|ico)$/.test(entry)) {
        const hash = createHash("sha256")
          .update(readFileSync(full))
          .digest("hex")
          .slice(0, 8);
        map[rel] = hash;
      }
    }
  } catch {}
  return map;
}

// Critical images to preload on every page — injected into <head> with the
// correct ?v=<hash> so the browser cache matches what assetUrl() generates.
const PRELOAD_CRITICAL = [
  // ── Hero / auth ──────────────────────────────────────────────────────────
  { path: "/auth-left-bg.webp",           priority: "high" },
  { path: "/mander-logo.webp",            priority: "high" },
  // ── Home banners ─────────────────────────────────────────────────────────
  { path: "/banner-slots.webp",           priority: "high" },
  { path: "/banner-loyalty.webp",         priority: "auto" },
  { path: "/banner-anon.webp",            priority: "auto" },
  // ── Originals game cards ─────────────────────────────────────────────────
  { path: "/dice-card.webp",              priority: "auto" },
  { path: "/plinko-thumb.webp",           priority: "auto" },
  { path: "/keno-thumb.webp",             priority: "auto" },
  { path: "/blackjack-thumb.webp",        priority: "auto" },
  { path: "/mines-card.webp",             priority: "auto" },
  { path: "/hilo-card.webp",              priority: "auto" },
  { path: "/roulette-card.webp",          priority: "auto" },
  { path: "/baccarat-card.webp",          priority: "auto" },
  { path: "/limbo-thumb.webp",            priority: "auto" },
  // ── In-game assets ───────────────────────────────────────────────────────
  { path: "/gem.webp",                    priority: "auto" },
  { path: "/keno-gem.webp",               priority: "auto" },
  { path: "/diamond.webp",                priority: "auto" },
  { path: "/bomb2.webp",                  priority: "auto" },
  // ── Emoji / notification icons ───────────────────────────────────────────
  { path: "/emoji-bigwin.webp",           priority: "auto" },
  { path: "/emoji-megawin.webp",          priority: "auto" },
  { path: "/emoji-suerte.webp",           priority: "auto" },
  { path: "/emoji-ganancia.webp",         priority: "auto" },
  { path: "/emoji-freespins.webp",        priority: "auto" },
  { path: "/emoji-repartiendo.webp",      priority: "auto" },
  // ── UI icons ─────────────────────────────────────────────────────────────
  { path: "/support-icon.png",            priority: "auto" },
  { path: "/icon-notificaciones.png",     priority: "auto" },
  { path: "/icon-recompensas.png",        priority: "auto" },
  // ── Marketing / referrals ────────────────────────────────────────────────
  { path: "/referral-banner.webp",        priority: "auto" },
  { path: "/affiliate-banner-mobile.webp",priority: "auto" },
  { path: "/affiliate-bg.webp",           priority: "auto" },
];

function preloadCriticalPlugin(): Plugin {
  const publicDir = path.resolve(import.meta.dirname, "public");

  function versionedHref(assetPath: string): string {
    try {
      const hash = createHash("sha256")
        .update(readFileSync(join(publicDir, assetPath)))
        .digest("hex")
        .slice(0, 8);
      return `${assetPath}?v=${hash}`;
    } catch { return assetPath; }
  }

  return {
    name: "preload-critical",
    transformIndexHtml(html) {
      const lines: string[] = [];

      // Static critical assets
      for (const { path: assetPath, priority } of PRELOAD_CRITICAL) {
        const href = versionedHref(assetPath);
        const mime = assetPath.endsWith(".svg") ? "image/svg+xml"
          : assetPath.endsWith(".png") ? "image/png"
          : "image/webp";
        lines.push(`    <link rel="preload" as="image" href="${href}" type="${mime}" fetchpriority="${priority}" />`);
      }

      // All rank SVGs — scanned automatically so new tiers are picked up
      try {
        const ranksDir = join(publicDir, "ranks");
        for (const file of readdirSync(ranksDir)) {
          if (!file.endsWith(".svg")) continue;
          const href = versionedHref(`/ranks/${file}`);
          lines.push(`    <link rel="preload" as="image" href="${href}" type="image/svg+xml" fetchpriority="auto" />`);
        }
      } catch { /* ranks dir missing */ }

      return html.replace("</head>", `${lines.join("\n")}\n  </head>`);
    },
  };
}

function assetVersionsPlugin(): Plugin {
  const VIRTUAL = "virtual:asset-versions";
  const RESOLVED = "\0" + VIRTUAL;
  const publicDir = path.resolve(import.meta.dirname, "public");

  return {
    name: "asset-versions",
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id === RESOLVED) {
        const map = scanPublicAssets(publicDir);
        return `export default ${JSON.stringify(map, null, 0)};`;
      }
    },
    handleHotUpdate({ file }) {
      if (file.startsWith(publicDir)) {
        this.server?.moduleGraph.invalidateAll();
      }
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    botMetaPlugin(),
    preloadCriticalPlugin(),
    assetVersionsPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
        ]
      : []),
  ],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ""),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  },
});
