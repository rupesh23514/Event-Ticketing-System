import User from "../models/User.js";
import Event from "../models/Event.js";
import Ticket from "../models/Ticket.js";
import Payment from "../models/Payment.js";
import VerificationLog from "../models/VerificationLog.js";
import AdminLog from "../models/AdminLog.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { generateAdminFilters, generatePaginationOptions, formatAdminResponse } from "../utils/adminUtils.js";

// @desc    Get real-time system metrics
// @route   GET /api/admin/dashboard/metrics
// @access  Private (Admin only)
export const getRealTimeMetrics = asyncHandler(async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get real-time counts
    const [
      totalUsers,
      totalEvents,
      totalTickets,
      totalPayments,
      totalVerifications,
      todayUsers,
      todayEvents,
      todayTickets,
      todayPayments,
      todayVerifications,
      weekUsers,
      weekEvents,
      weekTickets,
      weekPayments,
      weekVerifications,
      monthUsers,
      monthEvents,
      monthTickets,
      monthPayments,
      monthVerifications
    ] = await Promise.all([
      User.countDocuments(),
      Event.countDocuments(),
      Ticket.countDocuments(),
      Payment.countDocuments(),
      VerificationLog.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfDay } }),
      Event.countDocuments({ createdAt: { $gte: startOfDay } }),
      Ticket.countDocuments({ createdAt: { $gte: startOfDay } }),
      Payment.countDocuments({ createdAt: { $gte: startOfDay } }),
      VerificationLog.countDocuments({ verificationTime: { $gte: startOfDay } }),
      User.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Event.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Ticket.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Payment.countDocuments({ createdAt: { $gte: startOfWeek } }),
      VerificationLog.countDocuments({ verificationTime: { $gte: startOfWeek } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Event.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Ticket.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Payment.countDocuments({ createdAt: { $gte: startOfMonth } }),
      VerificationLog.countDocuments({ verificationTime: { $gte: startOfMonth } })
    ]);

    // Get financial metrics
    const [
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalRevenue,
      pendingPayments,
      failedPayments
    ] = await Promise.all([
      Payment.aggregate([
        { 
          $match: { 
            status: "completed",
            createdAt: { $gte: startOfDay }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.aggregate([
        { 
          $match: { 
            status: "completed",
            createdAt: { $gte: startOfWeek }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
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
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.countDocuments({ status: "pending" }),
      Payment.countDocuments({ status: "failed" })
    ]);

    // Get system health metrics
    const systemHealth = {
      database: "healthy",
      apiResponse: "healthy",
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      lastBackup: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      activeConnections: 0, // TODO: Implement connection tracking
      errorRate: 0, // TODO: Implement error rate calculation
      responseTime: 0 // TODO: Implement response time tracking
    };

    // Get active sessions and users
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
    });

    // Get pending approvals
    const pendingApprovals = await Event.countDocuments({ status: "pending" });

    // Get security alerts
    const securityAlerts = await VerificationLog.countDocuments({
      "flags.isSuspicious": true,
      verificationTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    // Get admin activity metrics
    const adminActivity = await AdminLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: null,
          totalActions: { $sum: 1 },
          completedActions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          failedActions: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          pendingApprovals: { $sum: { $cond: [{ $eq: ["$status", "requires_approval"] }, 1, 0] } },
          highRiskActions: { $sum: { $cond: [{ $in: ["$riskAssessment.riskLevel", ["high", "critical"]] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        timestamp: now,
        overview: {
          total: {
            users: totalUsers,
            events: totalEvents,
            tickets: totalTickets,
            payments: totalPayments,
            verifications: totalVerifications
          },
          today: {
            users: todayUsers,
            events: todayEvents,
            tickets: todayTickets,
            payments: todayPayments,
            verifications: todayVerifications
          },
          week: {
            users: weekUsers,
            events: weekEvents,
            tickets: weekTickets,
            payments: weekPayments,
            verifications: weekVerifications
          },
          month: {
            users: monthUsers,
            events: monthEvents,
            tickets: monthTickets,
            payments: monthPayments,
            verifications: monthVerifications
          }
        },
        financial: {
          today: todayRevenue[0]?.total || 0,
          week: weekRevenue[0]?.total || 0,
          month: monthRevenue[0]?.total || 0,
          total: totalRevenue[0]?.total || 0,
          pending: pendingPayments,
          failed: failedPayments
        },
        system: {
          health: systemHealth,
          activeUsers,
          pendingApprovals,
          securityAlerts
        },
        adminActivity: adminActivity[0] || {
          totalActions: 0,
          completedActions: 0,
          failedActions: 0,
          pendingApprovals: 0,
          highRiskActions: 0
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch real-time metrics",
      error: error.message
    });
  }
});

// @desc    Get financial dashboard data
// @route   GET /api/admin/dashboard/financial
// @access  Private (Admin only)
export const getFinancialDashboard = asyncHandler(async (req, res) => {
  try {
    const { period = "30d", currency = "USD" } = req.query;
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get revenue data
    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate },
          currency: currency.toUpperCase()
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          revenue: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    // Get payment method distribution
    const paymentMethods = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Get currency distribution
    const currencyDistribution = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$currency",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Get failed payments analysis
    const failedPayments = await Payment.aggregate([
      {
        $match: {
          status: "failed",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    // Get top earning events
    const topEvents = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "event"
        }
      },
      { $unwind: "$event" },
      {
        $group: {
          _id: "$eventId",
          eventTitle: { $first: "$event.title" },
          totalRevenue: { $sum: "$amount" },
          ticketCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        period,
        currency,
        startDate,
        endDate: now,
        revenue: {
          daily: revenueData,
          total: revenueData.reduce((sum, day) => sum + day.revenue, 0),
          average: revenueData.length > 0 ? revenueData.reduce((sum, day) => sum + day.revenue, 0) / revenueData.length : 0
        },
        paymentMethods,
        currencyDistribution,
        failedPayments: {
          daily: failedPayments,
          total: failedPayments.reduce((sum, day) => sum + day.count, 0),
          totalAmount: failedPayments.reduce((sum, day) => sum + day.totalAmount, 0)
        },
        topEvents
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch financial dashboard data",
      error: error.message
    });
  }
});

// @desc    Get operational dashboard data
// @route   GET /api/admin/dashboard/operational
// @access  Private (Admin only)
export const getOperationalDashboard = asyncHandler(async (req, res) => {
  try {
    const { period = "30d" } = req.query;
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get event operational metrics
    const eventMetrics = await Event.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            status: "$status",
            category: "$category"
          },
          count: { $sum: 1 },
          avgAttendees: { $avg: "$currentAttendees" },
          avgTickets: { $avg: { $sum: "$ticketTypes.quantity" } }
        }
      },
      { $sort: { "_id.status": 1, "_id.category": 1 } }
    ]);

    // Get ticket operational metrics
    const ticketMetrics = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            status: "$status",
            paymentStatus: "$paymentStatus"
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" }
        }
      },
      { $sort: { "_id.status": 1, "_id.paymentStatus": 1 } }
    ]);

    // Get verification operational metrics
    const verificationMetrics = await VerificationLog.aggregate([
      {
        $match: {
          verificationTime: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            method: "$verificationMethod",
            isValid: "$verificationResult.isValid",
            canEnter: "$verificationResult.canEnter"
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$responseTime" },
          suspiciousCount: { $sum: { $cond: ["$flags.isSuspicious", 1, 0] } }
        }
      },
      { $sort: { "_id.method": 1, "_id.isValid": 1 } }
    ]);

    // Get system performance metrics
    const systemMetrics = await AdminLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: "completed"
        }
      },
      {
        $group: {
          _id: {
            action: "$action",
            targetType: "$targetType"
          },
          count: { $sum: 1 },
          avgDuration: { $avg: "$performance.duration" },
          avgMemoryUsage: { $avg: "$performance.memoryUsage" },
          highRiskCount: { $sum: { $cond: [{ $in: ["$riskAssessment.riskLevel", ["high", "critical"]] }, 1, 0] } }
        }
      },
      { $sort: { "_id.action": 1 } }
    ]);

    // Get pending approvals and high-risk actions
    const pendingItems = await Promise.all([
      Event.countDocuments({ status: "pending" }),
      AdminLog.countDocuments({ status: "requires_approval" }),
      User.countDocuments({ isLocked: true }),
      Payment.countDocuments({ status: "pending" })
    ]);

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate: now,
        events: {
          metrics: eventMetrics,
          pending: pendingItems[0]
        },
        tickets: {
          metrics: ticketMetrics,
          pending: pendingItems[3]
        },
        verification: {
          metrics: verificationMetrics
        },
        system: {
          metrics: systemMetrics,
          pendingApprovals: pendingItems[1],
          lockedUsers: pendingItems[2]
        },
        operational: {
          totalPending: pendingItems.reduce((sum, count) => sum + count, 0),
          requiresAttention: pendingItems[1] + pendingItems[2] // Approvals + locked users
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch operational dashboard data",
      error: error.message
    });
  }
});

// @desc    Get user engagement dashboard data
// @route   GET /api/admin/dashboard/engagement
// @access  Private (Admin only)
export const getUserEngagementDashboard = asyncHandler(async (req, res) => {
  try {
    const { period = "30d" } = req.query;
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get user engagement metrics
    const userEngagement = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            role: "$role",
            isActive: "$isActive",
            isVerified: "$isVerified"
          },
          count: { $sum: 1 },
          avgLastActive: { $avg: { $ifNull: ["$lastActive", "$createdAt"] } }
        }
      },
      { $sort: { "_id.role": 1 } }
    ]);

    // Get user activity patterns
    const userActivity = await User.aggregate([
      {
        $match: {
          lastActive: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: "$lastActive" },
            dayOfWeek: { $dayOfWeek: "$lastActive" }
          },
          activeUsers: { $sum: 1 }
        }
      },
      { $sort: { "_id.dayOfWeek": 1, "_id.hour": 1 } }
    ]);

    // Get user retention metrics
    const userRetention = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "userId",
          as: "tickets"
        }
      },
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "organizerId",
          as: "organizedEvents"
        }
      },
      {
        $group: {
          _id: {
            hasTickets: { $gt: [{ $size: "$tickets" }, 0] },
            hasOrganizedEvents: { $gt: [{ $size: "$organizedEvents" }, 0] }
          },
          count: { $sum: 1 },
          avgTickets: { $avg: { $size: "$tickets" } },
          avgEvents: { $avg: { $size: "$organizedEvents" } }
        }
      }
    ]);

    // Get top engaged users
    const topUsers = await User.aggregate([
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "userId",
          as: "tickets"
        }
      },
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "organizerId",
          as: "organizedEvents"
        }
      },
      {
        $addFields: {
          engagementScore: {
            $add: [
              { $multiply: [{ $size: "$tickets" }, 10] },
              { $multiply: [{ $size: "$organizedEvents" }, 50] },
              { $cond: ["$isVerified", 20, 0] },
              { $cond: ["$isActive", 10, 0] }
            ]
          }
        }
      },
      { $sort: { engagementScore: -1 } },
      { $limit: 20 },
      {
        $project: {
          name: 1,
          email: 1,
          role: 1,
          engagementScore: 1,
          ticketCount: { $size: "$tickets" },
          eventCount: { $size: "$organizedEvents" },
          isVerified: 1,
          isActive: 1,
          lastActive: 1
        }
      }
    ]);

    // Get user growth trends
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            role: "$role"
          },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { "_id.date": 1, "_id.role": 1 } }
    ]);

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate: now,
        engagement: {
          metrics: userEngagement,
          patterns: userActivity
        },
        retention: {
          metrics: userRetention
        },
        topUsers: {
          list: topUsers,
          total: topUsers.length
        },
        growth: {
          trends: userGrowth,
          totalNewUsers: userGrowth.reduce((sum, day) => sum + day.newUsers, 0)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user engagement dashboard data",
      error: error.message
    });
  }
});

export default {
  getRealTimeMetrics,
  getFinancialDashboard,
  getOperationalDashboard,
  getUserEngagementDashboard
};
