import Ticket from "../models/Ticket.js";
import Event from "../models/Event.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { ticketGenerator } from "../utils/ticketGenerator.js";

// @desc    Book tickets for an event
// @route   POST /api/tickets/book
// @access  Private
export const bookTickets = asyncHandler(async (req, res) => {
  const { eventId, quantity } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!eventId || !quantity) {
    return res.status(400).json({
      success: false,
      message: "Event ID and quantity are required"
    });
  }

  if (quantity < 1 || quantity > 10) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be between 1 and 10"
    });
  }

  // Start a session for transaction
  const session = await Ticket.startSession();
  session.startTransaction();

  try {
    // Find the event and lock it for update
    const event = await Event.findById(eventId).session(session);
    
    if (!event) {
      throw new Error("Event not found");
    }

    // Check if event is published and can accept bookings
    if (event.status !== "published") {
      throw new Error("Event is not available for booking");
    }

    // Check if event date is in the future
    if (event.date <= new Date()) {
      throw new Error("Cannot book tickets for past events");
    }

    // Check if enough tickets are available
    if (event.availableTickets < quantity) {
      throw new Error(`Only ${event.availableTickets} tickets available`);
    }

    // Check if user has already booked maximum allowed tickets
    const existingBookings = await Ticket.countDocuments({
      eventId,
      userId,
      status: { $in: ["pending", "confirmed"] }
    }).session(session);

    if (existingBookings + quantity > event.maxTicketsPerUser) {
      throw new Error(`You can only book up to ${event.maxTicketsPerUser} tickets for this event`);
    }

    // Calculate total amount
    let totalAmount = event.price * quantity;
    
    // Apply discount if available
    if (event.discount && event.discount > 0) {
      const discountEndDate = event.discountEndDate || event.date;
      if (new Date() < discountEndDate) {
        totalAmount = totalAmount * (1 - event.discount / 100);
      }
    }

    // Create ticket
    const ticket = await Ticket.create([{
      eventId,
      userId,
      quantity,
      totalAmount: Math.round(totalAmount * 100) / 100, // Round to 2 decimal places
      currency: event.currency,
      eventDate: event.date
    }], { session });

    // Generate QR code for the ticket
    const qrCodeResult = await ticketGenerator.generateQRCode(ticket[0]);
    if (qrCodeResult.success) {
      ticket[0].qrCode = qrCodeResult.dataURL;
      await ticket[0].save({ session });
    }

    // Reduce available tickets
    event.availableTickets -= quantity;
    await event.save({ session });

    // Commit transaction
    await session.commitTransaction();

    // Populate ticket with event and user details
    const populatedTicket = await Ticket.findById(ticket[0]._id)
      .populate("eventId", "title date venue")
      .populate("userId", "name email")
      .select("-__v");

    res.status(201).json({
      success: true,
      message: "Tickets booked successfully",
      data: populatedTicket
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    
    res.status(400).json({
      success: false,
      message: error.message
    });
  } finally {
    session.endSession();
  }
});

// @desc    Get user's tickets
// @route   GET /api/tickets/my-tickets
// @access  Private
export const getMyTickets = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const userId = req.user.id;

  const filter = { userId };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const tickets = await Ticket.find(filter)
    .populate("eventId", "title date venue images category")
    .sort({ bookingDate: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select("-__v");

  const total = await Ticket.countDocuments(filter);

  res.json({
    success: true,
    data: tickets,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalTickets: total
    }
  });
});

// @desc    Get ticket by ID
// @route   GET /api/tickets/:id
// @access  Private
export const getTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate("eventId", "title date venue images category organizerId")
    .populate("userId", "name email")
    .populate("verifiedBy", "name")
    .select("-__v");

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user owns the ticket or is admin/organizer
  if (ticket.userId._id.toString() !== req.user.id && 
      req.user.role !== "admin" && 
      ticket.eventId.organizerId.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this ticket"
    });
  }

  res.json({
    success: true,
    data: ticket
  });
});

// @desc    Cancel ticket
// @route   PATCH /api/tickets/:id/cancel
// @access  Private
export const cancelTicket = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const ticketId = req.params.id;
  const userId = req.user.id;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: "Cancellation reason is required"
    });
  }

  // Start transaction
  const session = await Ticket.startSession();
  session.startTransaction();

  try {
    const ticket = await Ticket.findById(ticketId).session(session);
    
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    // Check if user owns the ticket or is admin
    if (ticket.userId.toString() !== userId && req.user.role !== "admin") {
      throw new Error("Not authorized to cancel this ticket");
    }

    // Check if ticket can be cancelled
    if (!ticket.canBeCancelled) {
      throw new Error("Ticket cannot be cancelled");
    }

    // Cancel ticket
    await ticket.cancelTicket(reason);

    // Refund available tickets to event
    const event = await Event.findById(ticket.eventId).session(session);
    if (event) {
      event.availableTickets += ticket.quantity;
      await event.save({ session });
    }

    // Commit transaction
    await session.commitTransaction();

    const updatedTicket = await Ticket.findById(ticketId)
      .populate("eventId", "title date venue")
      .populate("userId", "name email")
      .select("-__v");

    res.json({
      success: true,
      message: "Ticket cancelled successfully",
      data: updatedTicket
    });

  } catch (error) {
    await session.abortTransaction();
    
    res.status(400).json({
      success: false,
      message: error.message
    });
  } finally {
    session.endSession();
  }
});

// @desc    Verify ticket (for event entry)
// @route   PATCH /api/tickets/:id/verify
// @access  Private (Organizer/Admin)
export const verifyTicket = asyncHandler(async (req, res) => {
  const ticketId = req.params.id;
  const verifiedBy = req.user.id;

  const ticket = await Ticket.findById(ticketId);
  
  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user is organizer of the event or admin
  const event = await Event.findById(ticket.eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to verify this ticket"
    });
  }

  // Check if ticket is valid for entry
  if (!ticket.isValidForEntry) {
    return res.status(400).json({
      success: false,
      message: "Ticket is not valid for entry"
    });
  }

  // Mark ticket as used
  await ticket.markAsUsed(verifiedBy);

  const updatedTicket = await Ticket.findById(ticketId)
    .populate("eventId", "title date venue")
    .populate("userId", "name email")
    .populate("verifiedBy", "name")
    .select("-__v");

  res.json({
    success: true,
    message: "Ticket verified successfully",
    data: updatedTicket
  });
});

// @desc    Get event tickets (for organizers)
// @route   GET /api/tickets/event/:eventId
// @access  Private (Organizer/Admin)
export const getEventTickets = asyncHandler(async (req, res) => {
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
      message: "Not authorized to view tickets for this event"
    });
  }

  const filter = { eventId };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const tickets = await Ticket.find(filter)
    .populate("userId", "name email phone")
    .sort({ bookingDate: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select("-__v");

  const total = await Ticket.countDocuments(filter);

  // Get summary statistics
  const stats = await Ticket.aggregate([
    { $match: { eventId: event._id } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" }
      }
    }
  ]);

  res.json({
    success: true,
    data: tickets,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalTickets: total
    },
    stats
  });
});

// @desc    Generate QR code for ticket
// @route   GET /api/tickets/:id/qr
// @access  Private
export const generateTicketQR = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  
  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user owns the ticket or is admin/organizer
  if (ticket.userId.toString() !== req.user.id && 
      req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this ticket"
    });
  }

  // Generate QR code
  const qrResult = await ticketGenerator.generateQRCode(ticket);
  
  if (qrResult.success) {
    res.json({
      success: true,
      data: {
        qrCode: qrResult.dataURL,
        ticketNumber: ticket.ticketNumber
      }
    });
  } else {
    res.status(500).json({
      success: false,
      message: "Failed to generate QR code"
    });
  }
});

// @desc    Generate PDF ticket
// @route   GET /api/tickets/:id/pdf
// @access  Private
export const generatePDFTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate("eventId", "title date venue startTime endTime currency")
    .populate("userId", "name email");

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user owns the ticket or is admin/organizer
  if (ticket.userId._id.toString() !== req.user.id && 
      req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this ticket"
    });
  }

  try {
    // Generate PDF ticket
    const pdfBuffer = await ticketGenerator.generatePDFTicket(
      ticket,
      ticket.eventId,
      ticket.userId
    );

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticket.ticketNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate PDF ticket",
      error: error.message
    });
  }
});

// @desc    Generate HTML ticket
// @route   GET /api/tickets/:id/html
// @access  Private
export const generateHTMLTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate("eventId", "title date venue startTime endTime currency")
    .populate("userId", "name email");

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user owns the ticket or is admin/organizer
  if (ticket.userId._id.toString() !== req.user.id && 
      req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this ticket"
    });
  }

  try {
    // Generate HTML ticket
    const htmlTicket = ticketGenerator.generateHTMLTicket(
      ticket,
      ticket.eventId,
      ticket.userId
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(htmlTicket);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate HTML ticket",
      error: error.message
    });
  }
});

// @desc    Regenerate QR code for ticket
// @route   POST /api/tickets/:id/regenerate-qr
// @access  Private (Admin/Organizer)
export const regenerateTicketQR = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  
  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found"
    });
  }

  // Check if user is admin or organizer of the event
  const event = await Event.findById(ticket.eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to regenerate QR code for this ticket"
    });
  }

  try {
    // Generate new QR code
    const qrResult = await ticketGenerator.generateQRCode(ticket);
    
    if (qrResult.success) {
      // Update ticket with new QR code
      ticket.qrCode = qrResult.dataURL;
      await ticket.save();

      res.json({
        success: true,
        message: "QR code regenerated successfully",
        data: {
          qrCode: qrResult.dataURL,
          ticketNumber: ticket.ticketNumber
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to regenerate QR code"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to regenerate QR code",
      error: error.message
    });
  }
});
