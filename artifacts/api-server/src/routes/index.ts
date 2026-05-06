import { Router, type IRouter, type Request, type Response } from "express";
import healthRouter from "./health";
import supportChatRouter from "./support-chat";
import usersRouter from "./users";
import affiliateRouter from "./affiliate";
import authRouter from "./auth";
import transactionsRouter from "./transactions";
import depositRouter from "./deposit";
import adminRouter from "./admin";
import withdrawalsRouter from "./withdrawals";
import statsRouter from "./stats";
import alertsRouter from "./alerts";
import rewardsRouter from "./rewards";
import notificationsRouter from "./notifications";
import plisioWebhookRouter from "./plisio-webhook";
import cryptomusWebhookRouter from "./cryptomus-webhook";
import liveBetsRouter from "./live-bets";
import { LIVE_PRICES } from "../lib/prices";

const router: IRouter = Router();

router.get("/api/live-prices", (_req: Request, res: Response) => {
  res.json(LIVE_PRICES);
});

router.use(healthRouter);
router.use(supportChatRouter);
router.use(usersRouter);
router.use(affiliateRouter);
router.use(authRouter);
router.use(transactionsRouter);
router.use(depositRouter);
router.use("/api/admin", adminRouter);
router.use("/api", withdrawalsRouter);
router.use("/api", statsRouter);
router.use("/api", alertsRouter);
router.use("/api", rewardsRouter);
router.use("/api", notificationsRouter);
router.use("/api", plisioWebhookRouter);
router.use("/api", cryptomusWebhookRouter);
router.use("/api", liveBetsRouter);

export default router;
