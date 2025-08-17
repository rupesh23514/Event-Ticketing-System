import { Router } from "express";
import { listEvents, getEvent, createEvent, updateEvent, deleteEvent } from "../controllers/eventController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();
router.get("/", listEvents);
router.get("/:id", getEvent);
router.post("/", requireAuth, requireRole("organizer","admin"), createEvent);
router.put("/:id", requireAuth, requireRole("organizer","admin"), updateEvent);
router.delete("/:id", requireAuth, requireRole("organizer","admin"), deleteEvent);

export default router;
