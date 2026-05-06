import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));

// Captura raw body para Plisio — rawBody es la fuente de verdad, req.body queda vacío
const captureRawBody = [
  express.raw({ type: "*/*", limit: "10mb" }),
  (req: any, _res: any, next: any) => {
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString("binary"); // binary preserva bytes exactos para busboy
    }
    req.body = {}; // Siempre vacío — el webhook handler usa rawBody directamente
    next();
  },
];
app.use("/api/webhooks/plisio", ...captureRawBody);
app.use("/webhooks/plisio", ...captureRawBody);

app.use(express.json({
  limit: "10mb",
  verify: (req: any, _res, buf) => {
    if (req.url?.includes("/webhooks/")) {
      req.rawBody = buf.toString("utf8");
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check — no auth, no heavy logic, fast response
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", router);
app.use("/", router);

// Serve casino static files in production (Render: one service = api + frontend)
// In Render, the monorepo structure is preserved so we can reference the casino build.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casinoPublicDir = path.resolve(__dirname, "..", "..", "casino", "dist", "public");

app.use(express.static(casinoPublicDir));

// Serve favicon files explicitly — must come BEFORE the SPA fallback so they
// are never redirected to index.html
const FAVICON_FILES = [
  "favicon.ico",
  "favicon.png",
  "favicon-32x32.png",
  "favicon-64x64.png",
  "favicon-96x96.png",
  "apple-touch-icon.png",
  "site.webmanifest",
  "sitemap.xml",
  "robots.txt",
];
for (const file of FAVICON_FILES) {
  app.get(`/${file}`, (_req: Request, res: Response) => {
    const filePath = path.join(casinoPublicDir, file);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).end();
    }
  });
}

// ── OG tag metadata per page path ──────────────────────────────────────────────
// Discord/Telegram/WhatsApp crawlers read the raw HTML — they don't execute JS.
// We inject the correct og: tags server-side based on the URL path.
const BASE_URL = "https://manderbet.com";
const DEFAULT_IMAGE = `${BASE_URL}/og-preview.png`;

interface PageMeta {
  title: string;
  description: string;
  image?: string;
}

const PAGE_META: Record<string, PageMeta> = {
  "/": {
    title: "Crypto Casino Games | ManderBet",
    description: "ManderBet is a no KYC crypto casino with original games like Dice, Plinko and Mines. Enjoy fast deposits, quick withdrawals and a private gaming experience.",
  },
  "/dice": {
    title: "Dice – Mander Casino",
    description: "Roll the dice and win big with crypto. Adjust risk, multiplier and chance on ManderBet's provably fair Dice game.",
  },
  "/plinko": {
    title: "Plinko – Mander Casino",
    description: "Drop the ball and watch it bounce. Classic Plinko with multiple risk levels and big multipliers on ManderBet.",
  },
  "/mines": {
    title: "Mines – Mander Casino",
    description: "Avoid the mines and cash out before it's too late. High-stakes provably fair Mines on ManderBet.",
  },
  "/keno": {
    title: "Keno – Mander Casino",
    description: "Pick your numbers and hit the jackpot. Keno with instant results and crypto payouts on ManderBet.",
  },
  "/blackjack": {
    title: "Blackjack – Mander Casino",
    description: "Beat the dealer and hit 21. Classic Blackjack with crypto betting on ManderBet.",
  },
  "/roulette": {
    title: "Roulette – Mander Casino",
    description: "Spin the wheel and win. European Roulette with crypto payouts on ManderBet.",
  },
  "/baccarat": {
    title: "Baccarat – Mander Casino",
    description: "Bet on Banker or Player in the classic game of Baccarat with crypto on ManderBet.",
  },
  "/hilo": {
    title: "HiLo – Mander Casino",
    description: "Guess Higher or Lower in this fast-paced card game. Play HiLo with crypto on ManderBet.",
  },
  "/rewards": {
    title: "VIP Rewards & Bonuses | ManderBet",
    description: "Level up your VIP status and unlock exclusive rewards and bonus drops. The more you play, the more you earn at ManderBet.",
  },
  "/referrals": {
    title: "Affiliate Program | ManderBet",
    description: "Earn commissions by referring players to ManderBet. Join our affiliate program and grow your income.",
  },
  "/fairness": {
    title: "Provably Fair Casino | ManderBet",
    description: "Every bet at ManderBet is verifiable on-chain. Check our provably fair algorithm and verify any game result yourself.",
  },
  "/about": {
    title: "About ManderBet Casino",
    description: "ManderBet is an original-only crypto casino. Every game is developed in-house with provably fair mechanics, instant payouts, and full transparency.",
  },
  "/contact": {
    title: "Contact Us | ManderBet Casino",
    description: "Get in touch with the ManderBet team. Reach our support or marketing department for instant help.",
  },
  "/terms": {
    title: "Terms & Conditions | ManderBet Casino",
    description: "Read the full terms and conditions of ManderBet Casino. Play responsibly and know your rights.",
  },
  "/privacy": {
    title: "Privacy Policy | ManderBet Casino",
    description: "Your data is safe with us. Read our full privacy policy and learn how ManderBet handles your information.",
  },
  "/deposit": {
    title: "Deposit Crypto – Mander Casino",
    description: "Instant USDT, BTC, ETH deposits on ManderBet. No minimums, no KYC required.",
  },
  "/withdraw": {
    title: "Withdraw Crypto – Mander Casino",
    description: "Fast crypto withdrawals on ManderBet. USDT, BTC, ETH and more — processed instantly.",
  },
};

// Crawler bot User-Agent fragments (Discord, Telegram, WhatsApp, Twitter, Facebook, Slack, iMessage, etc.)
const CRAWLER_UA = [
  "Discordbot",
  "TelegramBot",
  "WhatsApp",
  "Twitterbot",
  "facebookexternalhit",
  "Slackbot",
  "LinkedInBot",
  "Googlebot",
  "bingbot",
  "Applebot",
  "SkypeUriPreview",
  "iMessage",
  "Viber",
  "Line",
];

function isCrawler(ua: string): boolean {
  const lower = ua.toLowerCase();
  return CRAWLER_UA.some(bot => lower.includes(bot.toLowerCase()));
}

function injectOgTags(html: string, meta: PageMeta, canonicalUrl: string): string {
  const image = meta.image || DEFAULT_IMAGE;
  const replacements: [RegExp, string][] = [
    [/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`],
    [/<meta name="description"[^>]*>/, `<meta name="description" content="${meta.description}" />`],
    [/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonicalUrl}" />`],
    [/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${meta.title}" />`],
    [/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${meta.description}" />`],
    [/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${image}" />`],
    [/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="summary" />`],
    [/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${meta.title}" />`],
    [/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${meta.description}" />`],
    [/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${image}" />`],
  ];
  let result = html;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// SPA fallback: all non-API routes return index.html
// For crawler bots: inject page-specific OG tags before serving.
app.use((req: Request, res: Response, _next: NextFunction) => {
  const indexFile = path.join(casinoPublicDir, "index.html");

  const ua = req.headers["user-agent"] || "";
  const pagePath = req.path.toLowerCase().split("?")[0];
  const meta = PAGE_META[pagePath] || PAGE_META["/"];

  if (isCrawler(ua)) {
    try {
      const html = fs.readFileSync(indexFile, "utf8");
      const canonicalUrl = `${BASE_URL}${pagePath === "/" ? "" : pagePath}`;
      const injected = injectOgTags(html, meta, canonicalUrl);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(injected);
      return;
    } catch {
      // fall through to sendFile
    }
  }

  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(200).send("OK");
    }
  });
});

export default app;
