import { Router } from "express";
import { createBooking, myBookings } from "../controllers/bookingController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();
router.post("/", requireAuth, createBooking);
router.get("/me", requireAuth, myBookings);

export default router;
