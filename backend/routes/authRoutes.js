import { Router } from "express";
import { register, login, me, changePassword } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

// Public routes (no authentication required)
router.post("/register", register);
router.post("/login", login);

// Protected routes (authentication required)
router.get("/me", requireAuth, me);
router.put("/change-password", requireAuth, changePassword);

export default router;
