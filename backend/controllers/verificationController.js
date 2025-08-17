import Ticket from "../models/Ticket.js";
import Event from "../models/Event.js";
import User from "../models/User.js";
import VerificationLog from "../models/VerificationLog.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { ticketGenerator } from "../utils/ticketGenerator.js";

// @desc    Verify ticket by QR code
// @route   POST /api/verification/scan
// @access  Private (Organizer/Admin)
export const scanTicket = asyncHandler(async (req, res) => {
  const { qrData, verificationMethod = "qr" } = req.body;
  const verifiedBy = req.user.id;
  const startTime = Date.now();

  if (!qrData) {
    return res.status(400).json({
      success: false,
      message: "QR data is required"
    });
  }

  try {
    let ticketData;
    
    // Parse QR data based on verification method
    if (verificationMethod === "qr") {
      try {
        ticketData = JSON.parse(qrData);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid QR code data format"
        });
      }
    } else if (verificationMethod === "manual") {
      ticketData = qrData; // Direct ticket number input
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid verification method"
      });
    }

    // Find ticket by ticket number
    const ticket = await Ticket.findOne({ 
      ticketNumber: ticketData.ticketNumber || qrData 
    }).populate("eventId", "title date venue startTime endTime organizerId")
      .populate("userId", "name email phone");

    if (!ticket) {
      // Log failed verification attempt
      await logVerificationAttempt({
        ticketId: null,
        eventId: null,
        userId: null,
        verifiedBy,
        verificationMethod,
        verificationResult: {
          isValid: false,
          canEnter: false,
          reason: "Ticket not found in system",
          details: { qrData }
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.deviceInfo?.type || 'unknown',
        responseTime: Date.now() - startTime,
        notes: "Ticket not found during QR scan"
      });

      return res.status(404).json({
        success: false,
        message: "Ticket not found",
        verificationResult: {
          isValid: false,
          reason: "Ticket not found in system"
        }
      });
    }

    // Check if user is organizer of the event or admin
    if (ticket.eventId.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
      // Log unauthorized verification attempt
      await logVerificationAttempt({
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userId: ticket.userId._id,
        verifiedBy,
        verificationMethod,
        verificationResult: {
          isValid: false,
          canEnter: false,
          reason: "Not authorized to verify tickets for this event",
          details: { organizerId: ticket.eventId.organizerId, verifiedBy }
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.deviceInfo?.type || 'unknown',
        responseTime: Date.now() - startTime,
        notes: "Unauthorized verification attempt"
      });

      return res.status(403).json({
        success: false,
        message: "Not authorized to verify tickets for this event"
      });
    }

    // Perform comprehensive ticket validation
    const validationResult = await validateTicketForEntry(ticket, ticketData);

    if (!validationResult.isValid) {
      // Log failed verification
      await logVerificationAttempt({
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userId: ticket.userId._id,
        verifiedBy,
        verificationMethod,
        verificationResult: validationResult,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.deviceInfo?.type || 'unknown',
        responseTime: Date.now() - startTime,
        notes: `Verification failed: ${validationResult.reason}`
      });

      return res.json({
        success: true,
        message: "Ticket verification completed",
        verificationResult: validationResult,
        ticket: {
          ticketNumber: ticket.ticketNumber,
          eventTitle: ticket.eventId.title,
          attendeeName: ticket.userId.name,
          status: ticket.status
        }
      });
    }

    // Mark ticket as used if valid
    if (validationResult.canEnter) {
      await ticket.markAsUsed(verifiedBy);
    }

    // Log successful verification
    await logVerificationAttempt({
      ticketId: ticket._id,
      eventId: ticket.eventId._id,
      userId: ticket.userId._id,
      verifiedBy,
      verificationMethod,
      verificationResult: validationResult,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      device: req.deviceInfo?.type || 'unknown',
      responseTime: Date.now() - startTime,
      notes: "Ticket verified successfully"
    });

    res.json({
      success: true,
      message: "Ticket verification completed",
      verificationResult: validationResult,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        eventTitle: ticket.eventId.title,
        attendeeName: ticket.userId.name,
        status: ticket.status,
        verifiedAt: ticket.verifiedAt,
        verifiedBy: req.user.name
      }
    });

  } catch (error) {
    // Log error
    await logVerificationAttempt({
      ticketId: null,
      eventId: null,
      userId: null,
      verifiedBy,
      verificationMethod,
      verificationResult: {
        isValid: false,
        canEnter: false,
        reason: "Verification error occurred",
        details: { error: error.message }
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      device: req.deviceInfo?.type || 'unknown',
      responseTime: Date.now() - startTime,
      notes: `Verification error: ${error.message}`
    });

    res.status(500).json({
      success: false,
      message: "Verification failed",
      error: error.message
    });
  }
});

// @desc    Verify ticket by ticket number
// @route   POST /api/verification/ticket-number
// @access  Private (Organizer/Admin)
export const verifyByTicketNumber = asyncHandler(async (req, res) => {
  const { ticketNumber } = req.body;
  const verifiedBy = req.user.id;
  const startTime = Date.now();

  if (!ticketNumber) {
    return res.status(400).json({
      success: false,
      message: "Ticket number is required"
    });
  }

  try {
    // Find ticket by ticket number
    const ticket = await Ticket.findOne({ ticketNumber })
      .populate("eventId", "title date venue startTime endTime organizerId")
      .populate("userId", "name email phone");

    if (!ticket) {
      // Log failed verification attempt
      await logVerificationAttempt({
        ticketId: null,
        eventId: null,
        userId: null,
        verifiedBy,
        verificationMethod: "manual",
        verificationResult: {
          isValid: false,
          canEnter: false,
          reason: "Ticket not found",
          details: { ticketNumber }
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.deviceInfo?.type || 'unknown',
        responseTime: Date.now() - startTime,
        notes: "Ticket not found during manual verification"
      });

      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    // Check if user is organizer of the event or admin
    if (ticket.eventId.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
      // Log unauthorized verification attempt
      await logVerificationAttempt({
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userId: ticket.userId._id,
        verifiedBy,
        verificationMethod: "manual",
        verificationResult: {
          isValid: false,
          canEnter: false,
          reason: "Not authorized to verify tickets for this event",
          details: { organizerId: ticket.eventId.organizerId, verifiedBy }
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.deviceInfo?.type || 'unknown',
        responseTime: Date.now() - startTime,
        notes: "Unauthorized manual verification attempt"
      });

      return res.status(403).json({
        success: false,
        message: "Not authorized to verify tickets for this event"
      });
    }

    // Perform comprehensive ticket validation
    const validationResult = await validateTicketForEntry(ticket);

    if (!validationResult.isValid) {
      // Log failed verification
      await logVerificationAttempt({
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userId: ticket.userId._id,
        verifiedBy,
        verificationMethod: "manual",
        verificationResult: validationResult,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.deviceInfo?.type || 'unknown',
        responseTime: Date.now() - startTime,
        notes: `Manual verification failed: ${validationResult.reason}`
      });

      return res.json({
        success: true,
        message: "Ticket verification completed",
        verificationResult: validationResult,
        ticket: {
          ticketNumber: ticket.ticketNumber,
          eventTitle: ticket.eventId.title,
          attendeeName: ticket.userId.name,
          status: ticket.status
        }
      });
    }

    // Mark ticket as used if valid
    if (validationResult.canEnter) {
      await ticket.markAsUsed(verifiedBy);
    }

    // Log successful verification
    await logVerificationAttempt({
      ticketId: ticket._id,
      eventId: ticket.eventId._id,
      userId: ticket.userId._id,
      verifiedBy,
      verificationMethod: "manual",
      verificationResult: validationResult,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      device: req.deviceInfo?.type || 'unknown',
      responseTime: Date.now() - startTime,
      notes: "Manual verification successful"
    });

    res.json({
      success: true,
      message: "Ticket verification completed",
      verificationResult: validationResult,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        eventTitle: ticket.eventId.title,
        attendeeName: ticket.userId.name,
        status: ticket.status,
        verifiedAt: ticket.verifiedAt,
        verifiedBy: req.user.name
      }
    });

  } catch (error) {
    // Log error
    await logVerificationAttempt({
      ticketId: null,
      eventId: null,
      userId: null,
      verifiedBy,
      verificationMethod: "manual",
      verificationResult: {
        isValid: false,
        canEnter: false,
        reason: "Verification error occurred",
        details: { error: error.message }
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      device: req.deviceInfo?.type || 'unknown',
      responseTime: Date.now() - startTime,
      notes: `Manual verification error: ${error.message}`
    });

    res.status(500).json({
      success: false,
      message: "Verification failed",
      error: error.message
    });
  }
});

// @desc    Bulk verify multiple tickets
// @route   POST /api/verification/bulk
// @access  Private (Organizer/Admin)
export const bulkVerifyTickets = asyncHandler(async (req, res) => {
  const { tickets, verificationMethod = "qr" } = req.body;
  const verifiedBy = req.user.id;
  const startTime = Date.now();

  if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Tickets array is required"
    });
  }

  if (tickets.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Maximum 100 tickets can be verified at once"
    });
  }

  try {
    const results = [];
    const errors = [];

    for (const ticketData of tickets) {
      try {
        let ticketNumber;
        
        if (verificationMethod === "qr") {
          try {
            const parsed = JSON.parse(ticketData);
            ticketNumber = parsed.ticketNumber;
          } catch (error) {
            errors.push({
              ticketData,
              error: "Invalid QR code format"
            });
            continue;
          }
        } else {
          ticketNumber = ticketData;
        }

        const ticket = await Ticket.findOne({ ticketNumber })
          .populate("eventId", "title date venue startTime endTime organizerId")
          .populate("userId", "name email phone");

        if (!ticket) {
          errors.push({
            ticketNumber,
            error: "Ticket not found"
          });
          continue;
        }

        // Check if user is organizer of the event or admin
        if (ticket.eventId.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
          errors.push({
            ticketNumber,
            error: "Not authorized to verify this ticket"
          });
          continue;
        }

        // Perform ticket validation
        const validationResult = await validateTicketForEntry(ticket);

        if (validationResult.canEnter) {
          await ticket.markAsUsed(verifiedBy);
        }

        // Log verification attempt
        await logVerificationAttempt({
          ticketId: ticket._id,
          eventId: ticket.eventId._id,
          userId: ticket.userId._id,
          verifiedBy,
          verificationMethod: "bulk",
          verificationResult: validationResult,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          device: req.deviceInfo?.type || 'unknown',
          responseTime: Date.now() - startTime,
          notes: "Bulk verification attempt"
        });

        results.push({
          ticketNumber: ticket.ticketNumber,
          eventTitle: ticket.eventId.title,
          attendeeName: ticket.userId.name,
          verificationResult: validationResult,
          verifiedAt: validationResult.canEnter ? new Date() : null
        });

      } catch (error) {
        errors.push({
          ticketData,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: "Bulk verification completed",
      results: {
        successful: results.length,
        failed: errors.length,
        total: tickets.length
      },
      verifiedTickets: results,
      errors
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Bulk verification failed",
      error: error.message
    });
  }
});

// @desc    Get verification history
// @route   GET /api/verification/history
// @access  Private (Organizer/Admin)
export const getVerificationHistory = asyncHandler(async (req, res) => {
  const { eventId, page = 1, limit = 20, status, date } = req.query;
  const userId = req.user.id;

  try {
    let filter = {};

    // If eventId is provided, check authorization
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found"
        });
      }

      if (event.organizerId.toString() !== userId && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view verification history for this event"
        });
      }

      filter.eventId = eventId;
    } else {
      // If no eventId, show only events organized by the user
      if (req.user.role !== "admin") {
        const userEvents = await Event.find({ organizerId: userId }).select("_id");
        filter.eventId = { $in: userEvents.map(e => e._id) };
      }
    }

    // Add status filter
    if (status) {
      filter.status = status;
    }

    // Add date filter
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      filter.verifiedAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tickets = await Ticket.find(filter)
      .populate("eventId", "title date venue")
      .populate("userId", "name email")
      .populate("verifiedBy", "name")
      .sort({ verifiedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-__v");

    const total = await Ticket.countDocuments(filter);

    // Get verification statistics
    const stats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
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

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch verification history",
      error: error.message
    });
  }
});

// @desc    Get verification statistics
// @route   GET /api/verification/stats
// @access  Private (Organizer/Admin)
export const getVerificationStats = asyncHandler(async (req, res) => {
  const { eventId, period = "today" } = req.query;
  const userId = req.user.id;

  try {
    let filter = {};

    // If eventId is provided, check authorization
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found"
        });
      }

      if (event.organizerId.toString() !== userId && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view verification stats for this event"
        });
      }

      filter.eventId = eventId;
    } else {
      // If no eventId, show only events organized by the user
      if (req.user.role !== "admin") {
        const userEvents = await Event.find({ organizerId: userId }).select("_id");
        filter.eventId = { $in: userEvents.map(e => e._id) };
      }
    }

    // Add time period filter
    const now = new Date();
    let startDate;

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
    }

    filter.verifiedAt = { $gte: startDate };

    // Get verification statistics
    const stats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            status: "$status",
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$verifiedAt"
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          statuses: {
            $push: {
              status: "$_id.status",
              count: "$count"
            }
          },
          totalCount: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get total counts
    const totalStats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate: now,
        dailyStats: stats,
        totalStats,
        summary: {
          totalVerified: totalStats.find(s => s._id === "used")?.count || 0,
          totalPending: totalStats.find(s => s._id === "confirmed")?.count || 0,
          totalCancelled: totalStats.find(s => s._id === "cancelled")?.count || 0
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch verification statistics",
      error: error.message
    });
  }
});

// Helper function to validate ticket for entry
async function validateTicketForEntry(ticket, qrData = null) {
  const result = {
    isValid: false,
    canEnter: false,
    reason: "",
    details: {}
  };

  try {
    // Check if ticket is confirmed
    if (ticket.status !== "confirmed") {
      result.reason = `Ticket status is ${ticket.status}`;
      result.details.status = ticket.status;
      return result;
    }

    // Check if ticket is already used
    if (ticket.isVerified) {
      result.reason = "Ticket has already been used";
      result.details.verifiedAt = ticket.verifiedAt;
      result.details.verifiedBy = ticket.verifiedBy;
      return result;
    }

    // Check if event date is today
    const eventDate = new Date(ticket.eventId.date);
    const today = new Date();
    const isEventToday = eventDate.toDateString() === today.toDateString();

    if (!isEventToday) {
      result.reason = "Event is not today";
      result.details.eventDate = ticket.eventId.date;
      result.details.today = today.toDateString();
      return result;
    }

    // Check if event time is appropriate (within 2 hours before start time)
    const eventStartTime = new Date(ticket.eventId.date + " " + ticket.eventId.startTime);
    const twoHoursBefore = new Date(eventStartTime.getTime() - 2 * 60 * 60 * 1000);
    const now = new Date();

    if (now < twoHoursBefore) {
      result.reason = "Event has not started yet";
      result.details.eventStartTime = eventStartTime;
      result.details.twoHoursBefore = twoHoursBefore;
      result.details.currentTime = now;
      return result;
    }

    // Check if event has ended (within 2 hours after end time)
    const eventEndTime = new Date(ticket.eventId.date + " " + ticket.eventId.endTime);
    const twoHoursAfter = new Date(eventEndTime.getTime() + 2 * 60 * 60 * 1000);

    if (now > twoHoursAfter) {
      result.reason = "Event has ended";
      result.details.eventEndTime = eventEndTime;
      result.details.twoHoursAfter = twoHoursAfter;
      result.details.currentTime = now;
      return result;
    }

    // Validate QR code signature if provided
    if (qrData && qrData.signature) {
      const expectedSignature = ticketGenerator.generateSignature(ticket);
      if (qrData.signature !== expectedSignature) {
        result.reason = "Invalid QR code signature";
        result.details.signatureMismatch = true;
        return result;
      }
    }

    // All validations passed
    result.isValid = true;
    result.canEnter = true;
    result.reason = "Ticket is valid for entry";
    result.details = {
      eventTitle: ticket.eventId.title,
      eventDate: ticket.eventId.date,
      eventTime: `${ticket.eventId.startTime} - ${ticket.eventId.endTime}`,
      venue: ticket.eventId.venue,
      attendeeName: ticket.userId.name,
      ticketNumber: ticket.ticketNumber
    };

    return result;

  } catch (error) {
    result.reason = "Validation error occurred";
    result.details.error = error.message;
    return result;
  }
}

// Helper function to log verification attempts using VerificationLog model
async function logVerificationAttempt(logData) {
  try {
    // Create verification log entry
    const verificationLog = new VerificationLog({
      ticketId: logData.ticketId,
      eventId: logData.eventId,
      userId: logData.userId,
      verifiedBy: logData.verifiedBy,
      verificationMethod: logData.verificationMethod,
      verificationResult: logData.verificationResult,
      ipAddress: logData.ipAddress,
      userAgent: logData.userAgent,
      device: logData.device,
      responseTime: logData.responseTime,
      notes: logData.notes
    });

    // Update rate limiting information
    await verificationLog.updateRateLimit();

    // Save the log
    await verificationLog.save();

    // Check for suspicious activity and add flags if needed
    if (logData.verificationResult.reason.includes("signature")) {
      await verificationLog.addSuspiciousFlag("signature_mismatch");
    }

    if (logData.verificationResult.reason.includes("not found")) {
      await verificationLog.addSuspiciousFlag("multiple_failed_attempts");
    }

    // Add rate limiting flag if exceeded
    if (verificationLog.rateLimit.attemptsInWindow > 10) {
      await verificationLog.addSuspiciousFlag("rate_limit_exceeded");
    }

  } catch (error) {
    console.error("Failed to log verification attempt:", error);
  }
}
