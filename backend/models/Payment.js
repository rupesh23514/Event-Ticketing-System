import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true
  },
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0, "Amount cannot be negative"]
  },
  currency: {
    type: String,
    default: "USD",
    enum: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"]
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ["stripe", "razorpay", "paypal", "cash", "bank_transfer"]
  },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed", "cancelled", "refunded"],
    default: "pending"
  },
  gatewayResponse: {
    gateway: String,
    transactionId: String,
    responseCode: String,
    responseMessage: String,
    rawResponse: mongoose.Schema.Types.Mixed
  },
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  refundDetails: {
    refundId: String,
    refundAmount: Number,
    refundReason: String,
    refundedAt: Date,
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { 
  timestamps: true 
});

// Indexes for better query performance
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ ticketId: 1 });
paymentSchema.index({ userId: 1 });
paymentSchema.index({ eventId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ createdAt: 1 });

// Virtual for checking if payment is successful
paymentSchema.virtual("isSuccessful").get(function() {
  return this.status === "completed";
});

// Virtual for checking if payment can be refunded
paymentSchema.virtual("canBeRefunded").get(function() {
  return this.status === "completed" && !this.refundDetails.refundId;
});

// Pre-save middleware to generate payment ID
paymentSchema.pre("save", async function(next) {
  if (this.isNew && !this.paymentId) {
    this.paymentId = await generatePaymentId();
  }
  next();
});

// Method to mark payment as completed
paymentSchema.methods.markAsCompleted = function(gatewayResponse) {
  this.status = "completed";
  this.gatewayResponse = gatewayResponse;
  return this.save();
};

// Method to mark payment as failed
paymentSchema.methods.markAsFailed = function(gatewayResponse) {
  this.status = "failed";
  this.gatewayResponse = gatewayResponse;
  return this.save();
};

// Method to process refund
paymentSchema.methods.processRefund = function(refundAmount, reason, refundedBy) {
  this.status = "refunded";
  this.refundDetails = {
    refundId: generateRefundId(),
    refundAmount,
    refundReason: reason,
    refundedAt: new Date(),
    refundedBy
  };
  return this.save();
};

// Generate unique payment ID
async function generatePaymentId() {
  const prefix = "PAY";
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  const paymentId = `${prefix}${timestamp}${random}`;
  
  // Check if payment ID already exists
  const existingPayment = await mongoose.model("Payment").findOne({ paymentId });
  if (existingPayment) {
    return generatePaymentId(); // Recursive call if duplicate
  }
  
  return paymentId;
}

// Generate unique refund ID
function generateRefundId() {
  const prefix = "REF";
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

export default mongoose.model("Payment", paymentSchema);
