import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
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

app.use("/api", router);
app.use("/", router);

// Serve casino static files in production (Render: one service = api + frontend)
// In Render, the monorepo structure is preserved so we can reference the casino build.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casinoPublicDir = path.resolve(__dirname, "..", "..", "casino", "dist", "public");

app.use(express.static(casinoPublicDir));

// SPA fallback: all non-API routes return index.html
app.use((req, res) => {
  const indexFile = path.join(casinoPublicDir, "index.html");
  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(200).send("OK");
    }
  });
});

export default app;
