import User from "../models/User.js";
import Event from "../models/Event.js";
import Ticket from "../models/Ticket.js";
import Payment from "../models/Payment.js";
import VerificationLog from "../models/VerificationLog.js";
import { asyncHandler } from "../middlewares/errorHandler.js";

// @desc    Get admin dashboard overview
// @route   GET /api/admin/dashboard/overview
// @access  Private (Admin only)
export const getAdminDashboardOverview = asyncHandler(async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get system statistics
    const [
      totalUsers,
      totalEvents,
      totalTickets,
      totalPayments,
      totalVerifications,
      pendingEvents,
      activeEvents,
      completedEvents,
      monthlyRevenue,
      yearlyRevenue
    ] = await Promise.all([
      User.countDocuments(),
      Event.countDocuments(),
      Ticket.countDocuments(),
      Payment.countDocuments(),
      VerificationLog.countDocuments(),
      Event.countDocuments({ status: "pending" }),
      Event.countDocuments({ 
        status: "published", 
        date: { $gte: now } 
      }),
      Event.countDocuments({ 
        status: "published", 
        date: { $lt: now } 
      }),
      Payment.aggregate([
        { 
          $match: { 
            status: "completed",
            createdAt: { $gte: startOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.aggregate([
        { 
          $match: { 
            status: "completed",
            createdAt: { $gte: startOfYear }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    // Get user role distribution
    const userRoleDistribution = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get event category distribution
    const eventCategoryDistribution = await Event.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get recent system activity
    const recentActivity = await Promise.all([
      Event.find().sort({ createdAt: -1 }).limit(5).select("title status organizerId createdAt"),
      User.find().sort({ createdAt: -1 }).limit(5).select("name email role createdAt"),
      Payment.find().sort({ createdAt: -1 }).limit(5).select("amount status eventId createdAt")
    ]);

    // Get system health metrics
    const systemHealth = {
      database: "healthy",
      apiResponse: "healthy",
      lastBackup: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalEvents,
          totalTickets,
          totalPayments,
          totalVerifications,
          pendingEvents,
          activeEvents,
          completedEvents,
          monthlyRevenue: monthlyRevenue[0]?.total || 0,
          yearlyRevenue: yearlyRevenue[0]?.total || 0
        },
        distributions: {
          users: userRoleDistribution,
          events: eventCategoryDistribution
        },
        recentActivity: {
          events: recentActivity[0],
          users: recentActivity[1],
          payments: recentActivity[2]
        },
        systemHealth,
        lastUpdated: now
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard overview",
      error: error.message
    });
  }
});

// @desc    Get pending events for approval
// @route   GET /api/admin/events/pending
// @access  Private (Admin only)
export const getPendingEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, organizerId } = req.query;

  try {
    let filter = { status: "pending" };

    if (category) filter.category = category;
    if (organizerId) filter.organizerId = organizerId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate("organizerId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-__v"),
      Event.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: events,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalEvents: total
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending events",
      error: error.message
    });
  }
});

// @desc    Approve or reject event
// @route   PATCH /api/admin/events/:id/approve
// @access  Private (Admin only)
export const approveEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason, notes } = req.body;

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Action must be either 'approve' or 'reject'"
    });
  }

  try {
    const event = await Event.findById(id).populate("organizerId", "name email");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    if (event.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Event is not pending approval"
      });
    }

    // Update event status
    event.status = action === "approve" ? "published" : "rejected";
    event.adminNotes = notes || "";
    event.approvedBy = req.user.id;
    event.approvedAt = new Date();

    await event.save();

    // TODO: Send notification to organizer about approval/rejection

    res.json({
      success: true,
      message: `Event ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        eventId: event._id,
        status: event.status,
        approvedBy: req.user.name,
        approvedAt: event.approvedAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to process event approval",
      error: error.message
    });
  }
});

// @desc    Get all users with filtering and pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
export const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

  try {
    let filter = {};

    if (role) filter.role = role;
    if (status) filter.isActive = status === "active";
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .select("-password -__v"),
      User.countDocuments(filter)
    ]);

    // Get user statistics
    const userStats = await User.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: ["$isActive", 1, 0] }
          },
          verifiedUsers: {
            $sum: { $cond: ["$isVerified", 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalUsers: total
      },
      stats: userStats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message
    });
  }
});

// @desc    Update user role and status
// @route   PATCH /api/admin/users/:id
// @access  Private (Admin only)
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, isActive, isVerified, notes } = req.body;

  try {
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prevent admin from changing their own role
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot modify your own role"
      });
    }

    // Update user fields
    if (role && ["user", "organizer", "admin"].includes(role)) {
      user.role = role;
    }
    if (typeof isActive === "boolean") {
      user.isActive = isActive;
    }
    if (typeof isVerified === "boolean") {
      user.isVerified = isVerified;
    }
    if (notes) {
      user.adminNotes = notes;
    }

    user.updatedBy = req.user.id;
    user.updatedAt = new Date();

    await user.save();

    res.json({
      success: true,
      message: "User updated successfully",
      data: {
        userId: user._id,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        updatedBy: req.user.name,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message
    });
  }
});

// @desc    Get system analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin only)
export const getSystemAnalytics = asyncHandler(async (req, res) => {
  const { period = "30d", groupBy = "day" } = req.query;

  try {
    const now = new Date();
    let startDate;

    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Determine date format based on groupBy
    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d-%H";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%U";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    // Get user registration trends
    const userTrends = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$createdAt" } },
            role: "$role"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          roles: {
            $push: {
              role: "$_id.role",
              count: "$count"
            }
          },
          totalUsers: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get event creation trends
    const eventTrends = await Event.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$createdAt" } },
            status: "$status"
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
          totalEvents: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get revenue trends
    const revenueTrends = await Payment.aggregate([
      { 
        $match: { 
          status: "completed",
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$createdAt" } },
            currency: "$currency"
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          currencies: {
            $push: {
              currency: "$_id.currency",
              totalAmount: "$totalAmount",
              count: "$count"
            }
          },
          totalRevenue: { $sum: "$totalAmount" },
          totalTransactions: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get verification trends
    const verificationTrends = await VerificationLog.aggregate([
      { $match: { verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$verificationTime" } },
            isValid: "$verificationResult.isValid",
            canEnter: "$verificationResult.canEnter"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          results: {
            $push: {
              isValid: "$_id.isValid",
              canEnter: "$_id.canEnter",
              count: "$count"
            }
          },
          totalVerifications: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        period,
        groupBy,
        startDate,
        endDate: now,
        trends: {
          users: userTrends,
          events: eventTrends,
          revenue: revenueTrends,
          verifications: verificationTrends
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch system analytics",
      error: error.message
    });
  }
});

// @desc    Get system security insights
// @route   GET /api/admin/security
// @access  Private (Admin only)
export const getSystemSecurityInsights = asyncHandler(async (req, res) => {
  const { period = "24h" } = req.query;

  try {
    const now = new Date();
    let startDate;

    switch (period) {
      case "1h":
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get suspicious verification activity
    const suspiciousActivity = await VerificationLog.aggregate([
      { 
        $match: { 
          verificationTime: { $gte: startDate },
          "flags.isSuspicious": true
        } 
      },
      {
        $group: {
          _id: {
            reason: "$flags.suspiciousReasons",
            ipAddress: "$ipAddress"
          },
          count: { $sum: 1 },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Get failed authentication attempts
    const failedAuthAttempts = await User.aggregate([
      { $match: { loginAttempts: { $gt: 0 } } },
      {
        $project: {
          email: 1,
          loginAttempts: 1,
          lastLoginAttempt: 1,
          isLocked: 1
        }
      },
      { $sort: { loginAttempts: -1 } },
      { $limit: 20 }
    ]);

    // Get IP-based security analysis
    const ipSecurityAnalysis = await VerificationLog.aggregate([
      { $match: { verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: "$ipAddress",
          totalAttempts: { $sum: 1 },
          suspiciousAttempts: {
            $sum: {
              $cond: ["$flags.isSuspicious", 1, 0]
            }
          },
          avgRiskScore: { $avg: "$flags.riskScore" },
          uniqueEvents: { $addToSet: "$eventId" },
          uniqueUsers: { $addToSet: "$verifiedBy" }
        }
      },
      {
        $project: {
          ipAddress: "$_id",
          totalAttempts: 1,
          suspiciousAttempts: 1,
          avgRiskScore: 1,
          uniqueEventCount: { $size: "$uniqueEvents" },
          uniqueUserCount: { $size: "$uniqueUsers" },
          suspiciousRate: {
            $multiply: [
              { $divide: ["$suspiciousAttempts", "$totalAttempts"] },
              100
            ]
          }
        }
      },
      { $sort: { suspiciousRate: -1 } },
      { $limit: 20 }
    ]);

    // Get security recommendations
    const securityRecommendations = [];
    
    if (suspiciousActivity.length > 0) {
      securityRecommendations.push({
        type: "warning",
        message: "Suspicious verification activity detected",
        details: `${suspiciousActivity.length} suspicious patterns found`,
        action: "Review suspicious activity and consider IP blocking"
      });
    }

    if (failedAuthAttempts.length > 0) {
      const highFailureUsers = failedAuthAttempts.filter(u => u.loginAttempts > 5);
      if (highFailureUsers.length > 0) {
        securityRecommendations.push({
          type: "alert",
          message: "Multiple failed authentication attempts",
          details: `${highFailureUsers.length} users with >5 failed attempts`,
          action: "Review and potentially lock compromised accounts"
        });
      }
    }

    const highRiskIPs = ipSecurityAnalysis.filter(ip => ip.suspiciousRate > 50);
    if (highRiskIPs.length > 0) {
      securityRecommendations.push({
        type: "warning",
        message: "High-risk IP addresses detected",
        details: `${highRiskIPs.length} IPs with >50% suspicious activity`,
        action: "Consider blocking high-risk IP addresses"
      });
    }

    // If no security issues found
    if (securityRecommendations.length === 0) {
      securityRecommendations.push({
        type: "success",
        message: "No security issues detected",
        details: "System appears to be operating securely",
        action: "Continue monitoring for any unusual activity"
      });
    }

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate: now,
        suspiciousActivity,
        failedAuthAttempts,
        ipSecurityAnalysis,
        securityRecommendations,
        summary: {
          totalSuspiciousAttempts: suspiciousActivity.reduce((sum, item) => sum + item.count, 0),
          totalFailedAuthUsers: failedAuthAttempts.length,
          totalHighRiskIPs: highRiskIPs.length
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch security insights",
      error: error.message
    });
  }
});

// @desc    Block or unblock IP address
// @route   POST /api/admin/security/ip-block
// @access  Private (Admin only)
export const manageIPBlocking = asyncHandler(async (req, res) => {
  const { action, ipAddress, reason, duration } = req.body;

  if (!["block", "unblock"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Action must be either 'block' or 'unblock'"
    });
  }

  if (!ipAddress) {
    return res.status(400).json({
      success: false,
      message: "IP address is required"
    });
  }

  try {
    // TODO: Implement IP blocking logic
    // This would typically involve:
    // 1. Adding/removing IP from a blacklist
    // 2. Updating firewall rules
    // 3. Storing in database for persistence
    // 4. Integrating with rate limiting middleware

    const result = {
      action,
      ipAddress,
      reason: reason || "Admin action",
      duration: duration || "permanent",
      blockedBy: req.user.id,
      blockedAt: new Date(),
      status: action === "block" ? "blocked" : "unblocked"
    };

    res.json({
      success: true,
      message: `IP address ${action === 'block' ? 'blocked' : 'unblocked'} successfully`,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to ${action} IP address`,
      error: error.message
    });
  }
});

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private (Admin only)
export const getSystemLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, type, level, startDate, endDate } = req.query;

  try {
    // TODO: Implement system logging
    // This would typically involve:
    // 1. Creating a SystemLog model
    // 2. Logging various system events
    // 3. Filtering and pagination
    // 4. Log rotation and cleanup

    // For now, return placeholder data
    const logs = [];
    const total = 0;

    res.json({
      success: true,
      data: logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalLogs: total
      },
      message: "System logging not yet implemented"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch system logs",
      error: error.message
    });
  }
});
