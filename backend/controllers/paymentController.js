import Payment from "../models/Payment.js";
import Ticket from "../models/Ticket.js";
import Event from "../models/Event.js";
import { asyncHandler } from "../middlewares/errorHandler.js";

// @desc    Create payment intent for ticket booking
// @route   POST /api/payments/create-intent
// @access  Private
export const createPaymentIntent = asyncHandler(async (req, res) => {
  const { ticketId, paymentMethod, billingDetails } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!ticketId || !paymentMethod) {
    return res.status(400).json({
      success: false,
      message: "Ticket ID and payment method are required"
    });
  }

  // Find the ticket
  const ticket = await Ticket.findById(ticketId)
    .populate("eventId", "title date venue")
    .populate("userId", "name email");

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user owns the ticket
  if (ticket.userId._id.toString() !== userId) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to pay for this ticket"
    });
  }

  // Check if ticket is pending payment
  if (ticket.paymentStatus !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Ticket is not pending payment"
    });
  }

  // Check if event is still valid
  if (ticket.eventId.date <= new Date()) {
    return res.status(400).json({
      success: false,
      message: "Cannot pay for past events"
    });
  }

  // Create payment record
  const payment = await Payment.create({
    ticketId: ticket._id,
    userId: ticket.userId._id,
    eventId: ticket.eventId._id,
    amount: ticket.totalAmount,
    currency: ticket.currency,
    paymentMethod,
    billingDetails: billingDetails || {
      name: ticket.userId.name,
      email: ticket.userId.email
    },
    status: "pending"
  });

  // For now, simulate payment gateway response
  // In production, you'd integrate with actual payment gateways
  const gatewayResponse = {
    gateway: paymentMethod,
    transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    responseCode: "200",
    responseMessage: "Payment intent created successfully"
  };

  // Update payment with gateway response
  payment.gatewayResponse = gatewayResponse;
  await payment.save();

  res.json({
    success: true,
    message: "Payment intent created successfully",
    data: {
      paymentId: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      gatewayResponse: payment.gatewayResponse
    }
  });
});

// @desc    Process payment
// @route   POST /api/payments/process
// @access  Private
export const processPayment = asyncHandler(async (req, res) => {
  const { paymentId, paymentToken, paymentMethod } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!paymentId || !paymentToken) {
    return res.status(400).json({
      success: false,
      message: "Payment ID and payment token are required"
    });
  }

  // Find the payment
  const payment = await Payment.findById(paymentId)
    .populate("ticketId")
    .populate("eventId", "title date venue")
    .populate("userId", "name email");

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Payment not found"
    });
  }

  // Check if user owns the payment
  if (payment.userId._id.toString() !== userId) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to process this payment"
    });
  }

  // Check if payment is pending
  if (payment.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Payment is not pending"
    });
  }

  // Start transaction
  const session = await Payment.startSession();
  session.startTransaction();

  try {
    // Simulate payment processing
    // In production, you'd make actual API calls to payment gateways
    const isPaymentSuccessful = await simulatePaymentProcessing(paymentToken, payment.amount);

    if (isPaymentSuccessful) {
      // Mark payment as completed
      await payment.markAsCompleted({
        gateway: paymentMethod || payment.paymentMethod,
        transactionId: payment.gatewayResponse.transactionId,
        responseCode: "200",
        responseMessage: "Payment processed successfully"
      });

      // Update ticket payment status
      const ticket = await Ticket.findById(payment.ticketId._id).session(session);
      if (ticket) {
        ticket.paymentStatus = "completed";
        ticket.status = "confirmed";
        await ticket.save({ session });
      }

      // Commit transaction
      await session.commitTransaction();

      const updatedPayment = await Payment.findById(paymentId)
        .populate("ticketId", "ticketNumber status paymentStatus")
        .populate("eventId", "title date venue")
        .populate("userId", "name email")
        .select("-__v");

      res.json({
        success: true,
        message: "Payment processed successfully",
        data: updatedPayment
      });
    } else {
      // Mark payment as failed
      await payment.markAsFailed({
        gateway: paymentMethod || payment.paymentMethod,
        transactionId: payment.gatewayResponse.transactionId,
        responseCode: "400",
        responseMessage: "Payment processing failed"
      });

      // Commit transaction
      await session.commitTransaction();

      res.status(400).json({
        success: false,
        message: "Payment processing failed"
      });
    }

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    
    res.status(500).json({
      success: false,
      message: "Payment processing error",
      error: error.message
    });
  } finally {
    session.endSession();
  }
});

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private
export const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate("ticketId", "ticketNumber status paymentStatus")
    .populate("eventId", "title date venue")
    .populate("userId", "name email")
    .select("-__v");

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Payment not found"
    });
  }

  // Check if user owns the payment or is admin/organizer
  if (payment.userId._id.toString() !== req.user.id && 
      req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this payment"
    });
  }

  res.json({
    success: true,
    data: payment
  });
});

// @desc    Get user's payments
// @route   GET /api/payments/my-payments
// @access  Private
export const getMyPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const userId = req.user.id;

  const filter = { userId };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const payments = await Payment.find(filter)
    .populate("ticketId", "ticketNumber status")
    .populate("eventId", "title date venue")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select("-__v");

  const total = await Payment.countDocuments(filter);

  res.json({
    success: true,
    data: payments,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalPayments: total
    }
  });
});

// @desc    Process refund
// @route   POST /api/payments/:id/refund
// @access  Private (Admin/Organizer)
export const processRefund = asyncHandler(async (req, res) => {
  const { refundAmount, refundReason } = req.body;
  const paymentId = req.params.id;
  const refundedBy = req.user.id;

  if (!refundAmount || !refundReason) {
    return res.status(400).json({
      success: false,
      message: "Refund amount and reason are required"
    });
  }

  // Find the payment
  const payment = await Payment.findById(paymentId)
    .populate("ticketId")
    .populate("eventId", "organizerId");

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Payment not found"
    });
  }

  // Check if user is admin or organizer of the event
  if (req.user.role !== "admin" && 
      payment.eventId.organizerId.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to process refunds for this payment"
    });
  }

  // Check if payment can be refunded
  if (!payment.canBeRefunded) {
    return res.status(400).json({
      success: false,
      message: "Payment cannot be refunded"
    });
  }

  // Check if refund amount is valid
  if (refundAmount > payment.amount) {
    return res.status(400).json({
      success: false,
      message: "Refund amount cannot exceed payment amount"
    });
  }

  // Start transaction
  const session = await Payment.startSession();
  session.startTransaction();

  try {
    // Process refund
    await payment.processRefund(refundAmount, refundReason, refundedBy);

    // Update ticket status if full refund
    if (refundAmount === payment.amount) {
      const ticket = await Ticket.findById(payment.ticketId._id).session(session);
      if (ticket) {
        ticket.paymentStatus = "refunded";
        ticket.status = "refunded";
        await ticket.save({ session });
      }

      // Refund tickets to event availability
      const event = await Event.findById(payment.eventId._id).session(session);
      if (event) {
        event.availableTickets += payment.ticketId.quantity;
        await event.save({ session });
      }
    }

    // Commit transaction
    await session.commitTransaction();

    const updatedPayment = await Payment.findById(paymentId)
      .populate("ticketId", "ticketNumber status paymentStatus")
      .populate("eventId", "title date venue")
      .populate("userId", "name email")
      .populate("refundDetails.refundedBy", "name")
      .select("-__v");

    res.json({
      success: true,
      message: "Refund processed successfully",
      data: updatedPayment
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    
    res.status(500).json({
      success: false,
      message: "Refund processing error",
      error: error.message
    });
  } finally {
    session.endSession();
  }
});

// @desc    Get event payments (for organizers)
// @route   GET /api/payments/event/:eventId
// @access  Private (Organizer/Admin)
export const getEventPayments = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { page = 1, limit = 20, status } = req.query;

  // Check if user is organizer of the event or admin
  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view payments for this event"
    });
  }

  const filter = { eventId };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const payments = await Payment.find(filter)
    .populate("userId", "name email phone")
    .populate("ticketId", "ticketNumber quantity")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select("-__v");

  const total = await Payment.countDocuments(filter);

  // Get summary statistics
  const stats = await Payment.aggregate([
    { $match: { eventId: event._id } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" }
      }
    }
  ]);

  res.json({
    success: true,
    data: payments,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalPayments: total
    },
    stats
  });
});

// @desc    Payment webhook handler
// @route   POST /api/payments/webhook
// @access  Public (called by payment gateways)
export const handleWebhook = asyncHandler(async (req, res) => {
  const { event, data } = req.body;

  // Verify webhook signature (implement based on your payment gateway)
  // const isValidSignature = verifyWebhookSignature(req.headers, req.body);
  // if (!isValidSignature) {
  //   return res.status(400).json({ message: "Invalid webhook signature" });
  // }

  try {
    switch (event) {
      case "payment_intent.succeeded":
        await handlePaymentSuccess(data);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailure(data);
        break;
      case "charge.refunded":
        await handleRefundSuccess(data);
        break;
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Helper function to simulate payment processing
async function simulatePaymentProcessing(paymentToken, amount) {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simulate 90% success rate
  return Math.random() > 0.1;
}

// Helper function to handle payment success
async function handlePaymentSuccess(data) {
  // Update payment status based on webhook data
  // This would integrate with your actual payment gateway
  console.log("Payment success webhook received:", data);
}

// Helper function to handle payment failure
async function handlePaymentFailure(data) {
  // Update payment status based on webhook data
  console.log("Payment failure webhook received:", data);
}

// Helper function to handle refund success
async function handleRefundSuccess(data) {
  // Update refund status based on webhook data
  console.log("Refund success webhook received:", data);
}
