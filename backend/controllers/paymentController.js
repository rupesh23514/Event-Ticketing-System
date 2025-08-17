import Booking from "../models/Booking.js";

/** MOCK PAYMENT FLOW
 * createIntent: returns a fake clientSecret for UI
 * confirm: marks booking as 'paid' (no real gateway call)
 */

export const createIntent = async (req,res) => {
  const { bookingId } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.userId.toString() !== req.user.id) return res.status(403).json({ message: "Not allowed" });

  const clientSecret = `mock_secret_${booking._id}`;
  res.json({ clientSecret, amount: booking.totalAmount, currency: "INR" });
};

export const confirmPayment = async (req,res) => {
  const { bookingId } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.userId.toString() !== req.user.id) return res.status(403).json({ message: "Not allowed" });

  booking.status = "paid";
  await booking.save();
  res.json({ message: "Payment confirmed (mock)", booking });
};
