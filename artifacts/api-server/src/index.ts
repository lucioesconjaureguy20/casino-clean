import app from "./app";
import { logger } from "./lib/logger";
import { startPlisioPoller } from "./lib/plisio-poller";
import { startPlisioHashEnricher } from "./lib/plisio-hash-enricher";
import { initCounters } from "./lib/counters";
import { startDemoBetsCorrector } from "./lib/fixDemoBets";
import { runMigration } from "./lib/migration";
import { initDeviceStore } from "./lib/deviceStore";
import { initWalletTracer } from "./lib/walletTracer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run DB migrations and initialize TX counters BEFORE accepting connections.
runMigration()
  .catch((e) => logger.error({ err: e }, "[migration] failed"))
  .finally(() =>
    initCounters()
      .catch((e) => logger.error({ err: e }, "[counters] init failed — using fallback defaults"))
      .finally(() => {
        app.listen(port, (err) => {
          if (err) {
            logger.error({ err }, "Error listening on port");
            process.exit(1);
          }
          logger.info({ port }, "Server listening");
          initDeviceStore();
          initWalletTracer();
          // Kick off initial wallet analysis + trace queue after startup
          setTimeout(() => { import("./lib/walletStore.js").then(m => m.analyzeWallets()).catch(() => {}); }, 60_000);
          // Queue untraced confirmed deposits for blockchain tracing after 90s
          setTimeout(async () => {
            try {
              const { queueMultiple } = await import("./lib/walletTracer.js");
              const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
              const SB_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
              const r = await fetch(`${SB_URL}/rest/v1/deposits?status=eq.confirmed&address=neq.pending&order=created_at.desc&limit=500&select=id,user_id,amount,currency,network,address,created_at`, {
                headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
              });
              if (r.ok) {
                const rows: any[] = await r.json();
                const items = rows.map((d: any) => ({
                  depositId: d.id, casinoAddr: d.address ?? "", network: d.network ?? "",
                  currency: d.currency ?? "", amount: parseFloat(d.amount ?? 0),
                  timestamp: d.created_at ?? "", userId: d.user_id ?? "", username: d.user_id ?? "",
                })).filter((d: any) => d.casinoAddr.length > 5);
                const n = queueMultiple(items);
                logger.info({ n }, "[wallet-tracer] queued deposits for blockchain tracing");
              }
            } catch (e) { logger.error({ err: e }, "[wallet-tracer] startup queue failed"); }
          }, 90_000);
          // Stagger background tasks to avoid Supabase overload on startup
          setTimeout(() => startPlisioPoller(),        30_000);   // +30s
          setTimeout(() => startPlisioHashEnricher(),  15_000);   // +15s
          // Auto-correct mis-classified demo bets every 5 min.
          setTimeout(() => startDemoBetsCorrector(300_000), 30_000); // +30s
        });
      }),
  );
