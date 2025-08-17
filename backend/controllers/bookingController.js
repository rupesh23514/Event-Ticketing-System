import crypto from "crypto";
import Event from "../models/Event.js";
import Booking from "../models/Booking.js";

export const createBooking = async (req,res) => {
  const { eventId, quantity } = req.body;
  if (!eventId || !quantity || quantity < 1) return res.status(400).json({ message: "Invalid input" });

  // Atomically decrement tickets if available
  const event = await Event.findOneAndUpdate(
    { _id: eventId, availableTickets: { $gte: quantity } },
    { $inc: { availableTickets: -quantity } },
    { new: true }
  );
  if (!event) return res.status(400).json({ message: "Not enough tickets available" });

  const totalAmount = event.price * quantity;
  const ticketCodes = Array.from({ length: quantity }, () => crypto.randomUUID());

  const booking = await Booking.create({
    userId: req.user.id,
    eventId,
    quantity,
    status: "pending",
    totalAmount,
    ticketCodes
  });

  res.status(201).json({ booking });
};

export const myBookings = async (req,res) => {
  const bookings = await Booking.find({ userId: req.user.id }).populate("eventId");
  res.json(bookings);
};
