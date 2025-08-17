import { Router } from "express";
import { 
  listEvents, 
  getEvent, 
  createEvent, 
  updateEvent, 
  deleteEvent,
  publishEvent,
  getMyEvents,
  getFeaturedEvents,
  getEventCategories
} from "../controllers/eventController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// Public routes (no authentication required)
router.get("/", listEvents);
router.get("/featured", getFeaturedEvents);
router.get("/categories", getEventCategories);
router.get("/:id", getEvent);

// Protected routes (authentication required)
router.use(requireAuth);

// Organizer routes (organizer/admin role required)
router.post("/", requireRole("organizer", "admin"), createEvent);
router.put("/:id", requireRole("organizer", "admin"), updateEvent);
router.delete("/:id", requireRole("organizer", "admin"), deleteEvent);
router.patch("/:id/publish", requireRole("organizer", "admin"), publishEvent);

// User routes (any authenticated user)
router.get("/organizer/me", getMyEvents);

export default router;
