import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  quantity: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["pending","paid","cancelled"], default: "pending" },
  totalAmount: { type: Number, required: true },
  ticketCodes: [{ type: String }]
}, { timestamps: true });

export default mongoose.model("Booking", bookingSchema);
