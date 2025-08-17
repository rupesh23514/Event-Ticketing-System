import { Router } from "express";
import {
  bookTickets,
  getMyTickets,
  getTicket,
  cancelTicket,
  verifyTicket,
  getEventTickets,
  generateTicketQR
} from "../controllers/ticketController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// All ticket routes require authentication
router.use(requireAuth);

// User routes (any authenticated user)
router.post("/book", bookTickets);
router.get("/my-tickets", getMyTickets);
router.get("/:id", getTicket);
router.patch("/:id/cancel", cancelTicket);
router.get("/:id/qr", generateTicketQR);

// Organizer/Admin routes
router.patch("/:id/verify", requireRole("organizer", "admin"), verifyTicket);
router.get("/event/:eventId", requireRole("organizer", "admin"), getEventTickets);

export default router;
