import { Router } from "express";
import { createIntent, confirmPayment } from "../controllers/paymentController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();
router.post("/create-intent", requireAuth, createIntent);
router.post("/confirm", requireAuth, confirmPayment);

export default router;
