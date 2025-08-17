import Ticket from "../models/Ticket.js";
import Event from "../models/Event.js";
import User from "../models/User.js";
import VerificationLog from "../models/VerificationLog.js";
import { asyncHandler } from "../middlewares/errorHandler.js";

// @desc    Get verification dashboard overview
// @route   GET /api/verification/dashboard/overview
// @access  Private (Organizer/Admin)
export const getDashboardOverview = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { eventId, period = "24h" } = req.query;

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
          message: "Not authorized to view verification dashboard for this event"
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

    // Calculate time period
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
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get verification statistics
    const verificationStats = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          totalVerifications: { $sum: 1 },
          successfulVerifications: {
            $sum: {
              $cond: [
                { $and: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                1,
                0
              ]
            }
          },
          failedVerifications: {
            $sum: {
              $cond: [
                { $or: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                0,
                1
              ]
            }
          },
          suspiciousAttempts: {
            $sum: {
              $cond: ["$flags.isSuspicious", 1, 0]
            }
          },
          avgResponseTime: { $avg: "$responseTime" },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      }
    ]);

    // Get hourly verification trends
    const hourlyTrends = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: {
            hour: { $hour: "$verificationTime" },
            date: { $dateToString: { format: "%Y-%m-%d", date: "$verificationTime" } }
          },
          count: { $sum: 1 },
          successful: {
            $sum: {
              $cond: [
                { $and: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "_id.date": 1, "_id.hour": 1 } }
    ]);

    // Get top verification methods
    const verificationMethods = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: "$verificationMethod",
          count: { $sum: 1 },
          successRate: {
            $avg: {
              $cond: [
                { $and: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get device type distribution
    const deviceDistribution = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: "$device",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get top IP addresses (for security monitoring)
    const topIPs = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: "$ipAddress",
          count: { $sum: 1 },
          suspiciousAttempts: {
            $sum: {
              $cond: ["$flags.isSuspicious", 1, 0]
            }
          },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get recent verification activity
    const recentActivity = await VerificationLog.find(filter)
      .sort({ verificationTime: -1 })
      .limit(20)
      .populate("ticketId", "ticketNumber")
      .populate("eventId", "title")
      .populate("userId", "name email")
      .populate("verifiedBy", "name")
      .select("-__v");

    const stats = verificationStats[0] || {
      totalVerifications: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      suspiciousAttempts: 0,
      avgResponseTime: 0,
      avgRiskScore: 0
    };

    const successRate = stats.totalVerifications > 0 
      ? (stats.successfulVerifications / stats.totalVerifications) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate: now,
        overview: {
          totalVerifications: stats.totalVerifications,
          successfulVerifications: stats.successfulVerifications,
          failedVerifications: stats.failedVerifications,
          suspiciousAttempts: stats.suspiciousAttempts,
          successRate: Math.round(successRate * 100) / 100,
          avgResponseTime: Math.round(stats.avgResponseTime * 100) / 100,
          avgRiskScore: Math.round(stats.avgRiskScore * 100) / 100
        },
        trends: {
          hourly: hourlyTrends,
          methods: verificationMethods,
          devices: deviceDistribution
        },
        security: {
          topIPs,
          suspiciousActivity: stats.suspiciousAttempts > 0
        },
        recentActivity
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard overview",
      error: error.message
    });
  }
});

// @desc    Get verification analytics
// @route   GET /api/verification/dashboard/analytics
// @access  Private (Organizer/Admin)
export const getVerificationAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { eventId, period = "7d", groupBy = "day" } = req.query;

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
          message: "Not authorized to view verification analytics for this event"
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

    // Calculate time period
    const now = new Date();
    let startDate;

    switch (period) {
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
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
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
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

    // Get time-series analytics
    const timeSeriesData = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$verificationTime" } },
            isValid: "$verificationResult.isValid",
            canEnter: "$verificationResult.canEnter",
            isSuspicious: "$flags.isSuspicious"
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$responseTime" },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          totalVerifications: { $sum: "$count" },
          successfulVerifications: {
            $sum: {
              $cond: [
                { $and: ["$_id.isValid", "$_id.canEnter"] },
                "$count",
                0
              ]
            }
          },
          failedVerifications: {
            $sum: {
              $cond: [
                { $or: ["$_id.isValid", "$_id.canEnter"] },
                0,
                "$count"
              ]
            }
          },
          suspiciousAttempts: {
            $sum: {
              $cond: ["$_id.isSuspicious", "$count", 0]
            }
          },
          avgResponseTime: { $avg: "$avgResponseTime" },
          avgRiskScore: { $avg: "$avgRiskScore" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get verification method analytics
    const methodAnalytics = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: "$verificationMethod",
          totalAttempts: { $sum: 1 },
          successfulVerifications: {
            $sum: {
              $cond: [
                { $and: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                1,
                0
              ]
            }
          },
          avgResponseTime: { $avg: "$responseTime" },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      },
      {
        $project: {
          method: "$_id",
          totalAttempts: 1,
          successfulVerifications: 1,
          failedVerifications: { $subtract: ["$totalAttempts", "$successfulVerifications"] },
          successRate: {
            $multiply: [
              { $divide: ["$successfulVerifications", "$totalAttempts"] },
              100
            ]
          },
          avgResponseTime: 1,
          avgRiskScore: 1
        }
      },
      { $sort: { totalAttempts: -1 } }
    ]);

    // Get device analytics
    const deviceAnalytics = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: "$device",
          totalAttempts: { $sum: 1 },
          successfulVerifications: {
            $sum: {
              $cond: [
                { $and: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                1,
                0
              ]
            }
          },
          avgResponseTime: { $avg: "$responseTime" }
        }
      },
      {
        $project: {
          device: "$_id",
          totalAttempts: 1,
          successfulVerifications: 1,
          failedVerifications: { $subtract: ["$totalAttempts", "$successfulVerifications"] },
          successRate: {
            $multiply: [
              { $divide: ["$successfulVerifications", "$totalAttempts"] },
              100
            ]
          },
          avgResponseTime: 1
        }
      },
      { $sort: { totalAttempts: -1 } }
    ]);

    // Get peak hours analysis
    const peakHoursAnalysis = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: { $hour: "$verificationTime" },
          totalVerifications: { $sum: 1 },
          successfulVerifications: {
            $sum: {
              $cond: [
                { $and: ["$verificationResult.isValid", "$verificationResult.canEnter"] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          hour: "$_id",
          totalVerifications: 1,
          successfulVerifications: 1,
          failedVerifications: { $subtract: ["$totalVerifications", "$successfulVerifications"] },
          successRate: {
            $multiply: [
              { $divide: ["$successfulVerifications", "$totalVerifications"] },
              100
            ]
          }
        }
      },
      { $sort: { hour: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        period,
        groupBy,
        startDate,
        endDate: now,
        timeSeries: timeSeriesData,
        methods: methodAnalytics,
        devices: deviceAnalytics,
        peakHours: peakHoursAnalysis
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch verification analytics",
      error: error.message
    });
  }
});

// @desc    Get security insights
// @route   GET /api/verification/dashboard/security
// @access  Private (Organizer/Admin)
export const getSecurityInsights = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { eventId, period = "24h" } = req.query;

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
          message: "Not authorized to view security insights for this event"
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

    // Calculate time period
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

    // Get suspicious activity analysis
    const suspiciousActivity = await VerificationLog.aggregate([
      { $match: { ...filter, verificationTime: { $gte: startDate } } },
      {
        $group: {
          _id: {
            reason: "$flags.suspiciousReasons",
            ipAddress: "$ipAddress",
            device: "$device"
          },
          count: { $sum: 1 },
          avgRiskScore: { $avg: "$flags.riskScore" },
          maxRiskScore: { $max: "$flags.riskScore" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Get IP risk analysis
    const ipRiskAnalysis = await VerificationLog.getIPRiskAnalysis(filter.ipAddress, 24);

    // Get failed verification patterns
    const failedVerificationPatterns = await VerificationLog.aggregate([
      { 
        $match: { 
          ...filter, 
          verificationTime: { $gte: startDate },
          $or: [
            { "verificationResult.isValid": false },
            { "verificationResult.canEnter": false }
          ]
        } 
      },
      {
        $group: {
          _id: "$verificationResult.reason",
          count: { $sum: 1 },
          uniqueIPs: { $addToSet: "$ipAddress" },
          uniqueDevices: { $addToSet: "$device" },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      },
      {
        $project: {
          reason: "$_id",
          count: 1,
          uniqueIPs: 1,
          uniqueIPCount: { $size: "$uniqueIPs" },
          uniqueDevices: 1,
          uniqueDeviceCount: { $size: "$uniqueDevices" },
          avgRiskScore: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get rate limiting violations
    const rateLimitViolations = await VerificationLog.aggregate([
      { 
        $match: { 
          ...filter, 
          verificationTime: { $gte: startDate },
          "rateLimit.attemptsInWindow": { $gt: 10 }
        } 
      },
      {
        $group: {
          _id: "$ipAddress",
          totalAttempts: { $sum: 1 },
          maxAttemptsInWindow: { $max: "$rateLimit.attemptsInWindow" },
          avgRiskScore: { $avg: "$flags.riskScore" }
        }
      },
      { $sort: { maxAttemptsInWindow: -1 } },
      { $limit: 10 }
    ]);

    // Get security recommendations
    const securityRecommendations = [];
    
    if (suspiciousActivity.length > 0) {
      securityRecommendations.push({
        type: "warning",
        message: "Suspicious activity detected",
        details: `${suspiciousActivity.length} suspicious verification attempts found`,
        action: "Review suspicious activity logs and consider IP blocking"
      });
    }

    if (failedVerificationPatterns.length > 0) {
      const highFailureReasons = failedVerificationPatterns.filter(p => p.count > 10);
      if (highFailureReasons.length > 0) {
        securityRecommendations.push({
          type: "alert",
          message: "High failure rate detected",
          details: `${highFailureReasons.length} failure patterns with >10 attempts`,
          action: "Investigate failure patterns and improve validation logic"
        });
      }
    }

    if (rateLimitViolations.length > 0) {
      securityRecommendations.push({
        type: "warning",
        message: "Rate limiting violations detected",
        details: `${rateLimitViolations.length} IPs exceeded rate limits`,
        action: "Review rate limiting configuration and consider stricter limits"
      });
    }

    // If no security issues found
    if (securityRecommendations.length === 0) {
      securityRecommendations.push({
        type: "success",
        message: "No security issues detected",
        details: "Verification system appears to be operating securely",
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
        ipRiskAnalysis,
        failedVerificationPatterns,
        rateLimitViolations,
        securityRecommendations,
        summary: {
          totalSuspiciousAttempts: suspiciousActivity.reduce((sum, item) => sum + item.count, 0),
          totalFailedVerifications: failedVerificationPatterns.reduce((sum, item) => sum + item.count, 0),
          totalRateLimitViolations: rateLimitViolations.reduce((sum, item) => sum + item.totalAttempts, 0)
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
