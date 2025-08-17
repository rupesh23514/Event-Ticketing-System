import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  venue: { type: String, required: true },
  totalTickets: { type: Number, required: true },
  availableTickets: { type: Number, required: true },
  price: { type: Number, required: true },
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default mongoose.model("Event", eventSchema);
