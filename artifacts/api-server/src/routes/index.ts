import { Router, type IRouter } from "express";
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
import nowpaymentsWebhookRouter from "./nowpayments-webhook";

const router: IRouter = Router();

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
router.use("/api", nowpaymentsWebhookRouter);

export default router;
