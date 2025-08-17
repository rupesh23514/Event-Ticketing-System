import mongoose from "mongoose";

const verificationLogSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket",
    required: true
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
  
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  verificationMethod: {
    type: String,
    enum: ["qr", "manual", "bulk"],
    required: true
  },
  
  verificationResult: {
    isValid: {
      type: Boolean,
      required: true
    },
    canEnter: {
      type: Boolean,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  
  // Security information
  ipAddress: {
    type: String,
    required: true
  },
  
  userAgent: {
    type: String
  },
  
  location: {
    country: String,
    city: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Device information
  device: {
    type: String,
    enum: ["mobile", "tablet", "desktop", "unknown"]
  },
  
  // Verification metadata
  verificationTime: {
    type: Date,
    default: Date.now
  },
  
  responseTime: {
    type: Number, // in milliseconds
    required: true
  },
  
  // Additional context
  notes: {
    type: String,
    trim: true,
    maxlength: [500, "Notes cannot exceed 500 characters"]
  },
  
  // Flags for suspicious activity
  flags: {
    isSuspicious: {
      type: Boolean,
      default: false
    },
    suspiciousReasons: [{
      type: String,
      enum: [
        "multiple_failed_attempts",
        "unusual_location",
        "unusual_time",
        "suspicious_ip",
        "rate_limit_exceeded",
        "signature_mismatch"
      ]
    }],
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  
  // Rate limiting information
  rateLimit: {
    attemptsInWindow: {
      type: Number,
      default: 1
    },
    windowStart: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
verificationLogSchema.index({ ticketId: 1 });
verificationLogSchema.index({ eventId: 1 });
verificationLogSchema.index({ verifiedBy: 1 });
verificationLogSchema.index({ verificationTime: -1 });
verificationLogSchema.index({ ipAddress: 1 });
verificationLogSchema.index({ "verificationResult.isValid": 1 });
verificationLogSchema.index({ "flags.isSuspicious": 1 });

// Compound indexes for common queries
verificationLogSchema.index({ eventId: 1, verificationTime: -1 });
verificationLogSchema.index({ verifiedBy: 1, verificationTime: -1 });
verificationLogSchema.index({ ipAddress: 1, verificationTime: -1 });

// Virtual for checking if verification was successful
verificationLogSchema.virtual("isSuccessful").get(function() {
  return this.verificationResult.isValid && this.verificationResult.canEnter;
});

// Virtual for checking if verification was suspicious
verificationLogSchema.virtual("isSuspicious").get(function() {
  return this.flags.isSuspicious;
});

// Pre-save middleware to calculate risk score
verificationLogSchema.pre("save", function(next) {
  let riskScore = 0;
  
  // Base risk factors
  if (!this.verificationResult.isValid) riskScore += 20;
  if (this.verificationResult.reason.includes("signature")) riskScore += 30;
  if (this.verificationResult.reason.includes("not found")) riskScore += 25;
  
  // Time-based risk (verifications outside normal hours)
  const hour = this.verificationTime.getHours();
  if (hour < 6 || hour > 22) riskScore += 15;
  
  // Rate limiting risk
  if (this.rateLimit.attemptsInWindow > 10) riskScore += 20;
  
  // Location risk (if available)
  if (this.location && this.location.coordinates) {
    // You can implement location-based risk calculation here
    // For now, we'll add a small risk for any location data
    riskScore += 5;
  }
  
  // Cap risk score at 100
  this.flags.riskScore = Math.min(riskScore, 100);
  
  // Mark as suspicious if risk score is high
  if (this.flags.riskScore > 70) {
    this.flags.isSuspicious = true;
  }
  
  next();
});

// Method to add suspicious flag
verificationLogSchema.methods.addSuspiciousFlag = function(reason) {
  if (!this.flags.suspiciousReasons.includes(reason)) {
    this.flags.suspiciousReasons.push(reason);
  }
  
  // Recalculate risk score
  this.flags.riskScore = Math.min(this.flags.riskScore + 20, 100);
  
  if (this.flags.riskScore > 70) {
    this.flags.isSuspicious = true;
  }
  
  return this.save();
};

// Method to update rate limiting information
verificationLogSchema.methods.updateRateLimit = function(windowSize = 15 * 60 * 1000) { // 15 minutes
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSize);
  
  if (this.rateLimit.windowStart < windowStart) {
    // Reset window
    this.rateLimit.attemptsInWindow = 1;
    this.rateLimit.windowStart = now;
  } else {
    // Increment attempts in current window
    this.rateLimit.attemptsInWindow += 1;
  }
  
  return this.save();
};

// Static method to get verification statistics
verificationLogSchema.statics.getVerificationStats = function(filter = {}, period = "24h") {
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
  
  const timeFilter = { verificationTime: { $gte: startDate } };
  const finalFilter = { ...filter, ...timeFilter };
  
  return this.aggregate([
    { $match: finalFilter },
    {
      $group: {
        _id: {
          isValid: "$verificationResult.isValid",
          canEnter: "$verificationResult.canEnter",
          isSuspicious: "$flags.isSuspicious"
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: "$responseTime" },
        avgRiskScore: { $avg: "$flags.riskScore" }
      }
    }
  ]);
};

// Static method to get suspicious activity
verificationLogSchema.statics.getSuspiciousActivity = function(filter = {}, limit = 50) {
  const suspiciousFilter = { ...filter, "flags.isSuspicious": true };
  
  return this.find(suspiciousFilter)
    .sort({ "flags.riskScore": -1, verificationTime: -1 })
    .limit(limit)
    .populate("ticketId", "ticketNumber")
    .populate("eventId", "title")
    .populate("userId", "name email")
    .populate("verifiedBy", "name")
    .select("-__v");
};

// Static method to get IP-based risk analysis
verificationLogSchema.statics.getIPRiskAnalysis = function(ipAddress, hours = 24) {
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        ipAddress,
        verificationTime: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: "$ipAddress",
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
        avgRiskScore: { $avg: "$flags.riskScore" },
        maxRiskScore: { $max: "$flags.riskScore" },
        uniqueEvents: { $addToSet: "$eventId" },
        uniqueUsers: { $addToSet: "$verifiedBy" }
      }
    },
    {
      $project: {
        ipAddress: "$_id",
        totalAttempts: 1,
        successfulVerifications: 1,
        failedVerifications: 1,
        suspiciousAttempts: 1,
        avgRiskScore: 1,
        maxRiskScore: 1,
        uniqueEventCount: { $size: "$uniqueEvents" },
        uniqueUserCount: { $size: "$uniqueUsers" },
        successRate: {
          $multiply: [
            { $divide: ["$successfulVerifications", "$totalAttempts"] },
            100
          ]
        }
      }
    }
  ]);
};

export default mongoose.model("VerificationLog", verificationLogSchema);
