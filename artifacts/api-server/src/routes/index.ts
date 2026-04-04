import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supportChatRouter from "./support-chat";
import usersRouter from "./users";
import affiliateRouter from "./affiliate";
import authRouter from "./auth";
import transactionsRouter from "./transactions";
import depositRouter from "./deposit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(supportChatRouter);
router.use(usersRouter);
router.use(affiliateRouter);
router.use(authRouter);
router.use(transactionsRouter);
router.use(depositRouter);

export default router;
