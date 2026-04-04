/**
 * Production server for the casino frontend.
 * Serves static files from dist/public and proxies /api/* to the API server.
 *
 * Required env vars:
 *   PORT          — port to listen on (set automatically by Render)
 *   API_SERVER_URL — full URL of the API server, e.g. https://my-api.onrender.com
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const API_URL = (process.env.API_SERVER_URL || "").replace(/\/$/, "");

if (!API_URL) {
  console.warn(
    "[serve] WARNING: API_SERVER_URL no está configurado. " +
    "Las llamadas a /api/* van a fallar. Ejemplo: https://mi-api.onrender.com",
  );
}

const STATIC_DIR = path.join(__dirname, "dist/public");

const MIME = {
  ".html":  "text/html; charset=utf-8",
  ".js":    "application/javascript",
  ".mjs":   "application/javascript",
  ".css":   "text/css",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".svg":   "image/svg+xml",
  ".json":  "application/json",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".ico":   "image/x-icon",
  ".webp":  "image/webp",
  ".mp3":   "audio/mpeg",
  ".mp4":   "video/mp4",
};

function proxyRequest(req, res) {
  const target = new URL(API_URL);
  const isHttps = target.protocol === "https:";
  const defaultPort = isHttps ? 443 : 80;

  const options = {
    hostname: target.hostname,
    port:     target.port ? Number(target.port) : defaultPort,
    path:     req.url,
    method:   req.method,
    headers:  {
      ...req.headers,
      host: target.hostname,
    },
  };

  const client = isHttps ? https : http;

  const proxyReq = client.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy] error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Gateway", detail: err.message }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let filePath = path.join(STATIC_DIR, url.pathname);

  // Fallback: si no existe o es un directorio → index.html (SPA)
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(STATIC_DIR, "index.html");
  } catch {
    filePath = path.join(STATIC_DIR, "index.html");
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type":  mime,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
    if (!API_URL) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API_SERVER_URL no configurado" }));
      return;
    }
    proxyRequest(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`[serve] Casino corriendo en puerto ${PORT}`);
  console.log(`[serve] API proxy → ${API_URL || "(no configurado)"}`);
  console.log(`[serve] Archivos estáticos desde: ${STATIC_DIR}`);
});
