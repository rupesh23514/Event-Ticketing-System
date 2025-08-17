import { Router } from "express";
import {
  scanTicket,
  verifyByTicketNumber,
  bulkVerifyTickets,
  getVerificationHistory,
  getVerificationStats
} from "../controllers/verificationController.js";
import {
  getDashboardOverview,
  getVerificationAnalytics,
  getSecurityInsights
} from "../controllers/verificationDashboardController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";
import {
  qrScanRateLimiter,
  manualVerificationRateLimiter,
  bulkVerificationRateLimiter,
  verificationRateLimiter,
  suspiciousIPBlocker,
  deviceFingerprinter
} from "../middlewares/rateLimiter.js";

const router = Router();

// All verification routes require authentication and organizer/admin role
router.use(requireAuth);
router.use(requireRole("organizer", "admin"));

// Apply security middleware
router.use(suspiciousIPBlocker);
router.use(deviceFingerprinter);

// Ticket verification endpoints with rate limiting
router.post("/scan", qrScanRateLimiter, scanTicket);
router.post("/ticket-number", manualVerificationRateLimiter, verifyByTicketNumber);
router.post("/bulk", bulkVerificationRateLimiter, bulkVerifyTickets);

// Verification history and statistics with general rate limiting
router.get("/history", verificationRateLimiter, getVerificationHistory);
router.get("/stats", verificationRateLimiter, getVerificationStats);

// Dashboard and analytics routes
router.get("/dashboard/overview", verificationRateLimiter, getDashboardOverview);
router.get("/dashboard/analytics", verificationRateLimiter, getVerificationAnalytics);
router.get("/dashboard/security", verificationRateLimiter, getSecurityInsights);

export default router;
