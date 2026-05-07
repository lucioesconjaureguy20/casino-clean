import app from "./app";
import { logger } from "./lib/logger";
import { startPlisioPoller } from "./lib/plisio-poller";
import { startPlisioHashEnricher } from "./lib/plisio-hash-enricher";
import { initCounters } from "./lib/counters";
import { startDemoBetsCorrector } from "./lib/fixDemoBets";
import { runMigration } from "./lib/migration";
import { initDeviceStore } from "./lib/deviceStore";

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
          // Kick off initial wallet analysis after 60s (non-blocking)
          setTimeout(() => { import("./lib/walletStore.js").then(m => m.analyzeWallets()).catch(() => {}); }, 60_000);
          // Stagger background tasks to avoid Supabase overload on startup
          setTimeout(() => startPlisioPoller(),        30_000);   // +30s
          setTimeout(() => startPlisioHashEnricher(),  15_000);   // +15s
          // Auto-correct mis-classified demo bets every 5 min.
          setTimeout(() => startDemoBetsCorrector(300_000), 30_000); // +30s
        });
      }),
  );
