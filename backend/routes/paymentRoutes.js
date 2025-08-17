import { Router } from "express";
import {
  createPaymentIntent,
  processPayment,
  getPayment,
  getMyPayments,
  processRefund,
  getEventPayments,
  handleWebhook
} from "../controllers/paymentController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// Public routes (no authentication required)
router.post("/webhook", handleWebhook);

// Protected routes (authentication required)
router.use(requireAuth);

// User routes (any authenticated user)
router.post("/create-intent", createPaymentIntent);
router.post("/process", processPayment);
router.get("/my-payments", getMyPayments);
router.get("/:id", getPayment);

// Organizer/Admin routes
router.post("/:id/refund", requireRole("organizer", "admin"), processRefund);
router.get("/event/:eventId", requireRole("organizer", "admin"), getEventPayments);

export default router;
