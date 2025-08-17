import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    unique: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
    max: [10, "Quantity cannot exceed 10"]
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [0, "Total amount cannot be negative"]
  },
  currency: {
    type: String,
    default: "USD",
    enum: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"]
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "cancelled", "refunded", "used"],
    default: "pending"
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded"],
    default: "pending"
  },
  paymentId: {
    type: String,
    default: null
  },
  bookingDate: {
    type: Date,
    default: Date.now
  },
  eventDate: {
    type: Date,
    required: true
  },
  qrCode: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  notes: String,
  refundReason: String,
  refundAmount: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

// Indexes for better query performance
ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ eventId: 1 });
ticketSchema.index({ userId: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ paymentStatus: 1 });
ticketSchema.index({ eventDate: 1 });
ticketSchema.index({ qrCode: 1 });

// Virtual for checking if ticket is valid for entry
ticketSchema.virtual("isValidForEntry").get(function() {
  return this.status === "confirmed" && 
         this.paymentStatus === "completed" && 
         !this.isVerified &&
         this.eventDate > new Date();
});

// Virtual for checking if ticket can be cancelled
ticketSchema.virtual("canBeCancelled").get(function() {
  return this.status === "confirmed" && 
         this.paymentStatus === "completed" && 
         this.eventDate > new Date();
});

// Pre-save middleware to generate ticket number
ticketSchema.pre("save", async function(next) {
  if (this.isNew && !this.ticketNumber) {
    this.ticketNumber = await generateTicketNumber();
  }
  next();
});

// Method to mark ticket as used
ticketSchema.methods.markAsUsed = function(verifiedBy) {
  this.status = "used";
  this.isVerified = true;
  this.verifiedAt = new Date();
  this.verifiedBy = verifiedBy;
  return this.save();
};

// Method to cancel ticket
ticketSchema.methods.cancelTicket = function(reason) {
  this.status = "cancelled";
  this.notes = reason;
  return this.save();
};

// Method to refund ticket
ticketSchema.methods.refundTicket = function(amount, reason) {
  this.status = "refunded";
  this.refundAmount = amount;
  this.refundReason = reason;
  return this.save();
};

// Generate unique ticket number
async function generateTicketNumber() {
  const prefix = "TKT";
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  const ticketNumber = `${prefix}${timestamp}${random}`;
  
  // Check if ticket number already exists
  const existingTicket = await mongoose.model("Ticket").findOne({ ticketNumber });
  if (existingTicket) {
    return generateTicketNumber(); // Recursive call if duplicate
  }
  
  return ticketNumber;
}

export default mongoose.model("Ticket", ticketSchema);
