import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/api/my-ip", async (_req, res) => {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const data = await r.json();
    res.json({ server_ip: data.ip });
  } catch {
    res.status(500).json({ error: "No se pudo obtener el IP" });
  }
});

export default router;
