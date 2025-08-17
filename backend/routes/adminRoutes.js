import { Router } from "express";
import {
  getAdminDashboardOverview,
  getPendingEvents,
  approveEvent,
  getAllUsers,
  updateUser,
  getSystemAnalytics,
  getSystemSecurityInsights,
  manageIPBlocking,
  getSystemLogs
} from "../controllers/adminController.js";
import {
  getRealTimeMetrics,
  getFinancialDashboard,
  getOperationalDashboard,
  getUserEngagementDashboard
} from "../controllers/adminDashboardController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";
import { verificationRateLimiter } from "../middlewares/rateLimiter.js";
import {
  logUserAction,
  logEventAction,
  logSystemAction,
  logSecurityAction,
  captureChanges,
  addAdminLogNote
} from "../middlewares/adminLogging.js";

const router = Router();

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole("admin"));

// Apply rate limiting to admin endpoints
router.use(verificationRateLimiter);

// Dashboard and overview
router.get("/dashboard/overview", getAdminDashboardOverview);

// Analytics dashboard
router.get("/dashboard/metrics", getRealTimeMetrics);
router.get("/dashboard/financial", getFinancialDashboard);
router.get("/dashboard/operational", getOperationalDashboard);
router.get("/dashboard/engagement", getUserEngagementDashboard);

// Event management
router.get("/events/pending", getPendingEvents);
router.patch("/events/:id/approve", 
  logEventAction("event_approve"),
  captureChanges,
  addAdminLogNote("Event approval action"),
  approveEvent
);

// User management
router.get("/users", getAllUsers);
router.patch("/users/:id", 
  logUserAction("user_update"),
  captureChanges,
  addAdminLogNote("User update action"),
  updateUser
);

// System analytics and monitoring
router.get("/analytics", getSystemAnalytics);
router.get("/security", getSystemSecurityInsights);
router.post("/security/ip-block", 
  logSecurityAction("ip_block"),
  captureChanges,
  addAdminLogNote("IP blocking action"),
  manageIPBlocking
);
router.get("/logs", getSystemLogs);

export default router;
