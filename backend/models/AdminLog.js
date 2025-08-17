import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema({
  // Admin who performed the action
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  // Action details
  action: {
    type: String,
    required: true,
    enum: [
      "user_create", "user_update", "user_delete", "user_deactivate", "user_reactivate",
      "event_approve", "event_reject", "event_publish", "event_unpublish",
      "ticket_verify", "ticket_cancel", "ticket_refund",
      "payment_process", "payment_refund", "payment_fail",
      "system_config", "system_backup", "system_maintenance",
      "security_alert", "ip_block", "ip_unblock",
      "role_change", "permission_update", "audit_log"
    ]
  },
  
  // Target of the action
  targetType: {
    type: String,
    required: true,
    enum: ["user", "event", "ticket", "payment", "system", "security", "other"]
  },
  
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "targetModel"
  },
  
  targetModel: {
    type: String,
    required: true,
    enum: ["User", "Event", "Ticket", "Payment", "System", "Security"]
  },
  
  // Action details
  details: {
    before: mongoose.Schema.Types.Mixed, // Previous state
    after: mongoose.Schema.Types.Mixed,  // New state
    changes: [String],                   // List of changed fields
    reason: String,                      // Reason for action
    notes: String                        // Additional notes
  },
  
  // Context information
  context: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    requestId: String,
    endpoint: String,
    method: String
  },
  
  // Risk assessment
  riskAssessment: {
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low"
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    riskFactors: [String],
    requiresReview: {
      type: Boolean,
      default: false
    }
  },
  
  // Approval workflow (for high-risk actions)
  approval: {
    required: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    approvedAt: Date,
    approvalNotes: String
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "cancelled", "requires_approval"],
    default: "completed"
  },
  
  // Error information (if action failed)
  error: {
    code: String,
    message: String,
    stack: String
  },
  
  // Performance metrics
  performance: {
    startTime: Date,
    endTime: Date,
    duration: Number, // in milliseconds
    memoryUsage: Number,
    cpuUsage: Number
  }
}, {
  timestamps: true
});

// Indexes for query performance
adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1 });
adminLogSchema.index({ "riskAssessment.riskLevel": 1, createdAt: -1 });
adminLogSchema.index({ status: 1, createdAt: -1 });
adminLogSchema.index({ "context.ipAddress": 1, createdAt: -1 });
adminLogSchema.index({ createdAt: -1 });

// Compound indexes for common queries
adminLogSchema.index({ adminId: 1, action: 1, createdAt: -1 });
adminLogSchema.index({ targetType: 1, action: 1, createdAt: -1 });
adminLogSchema.index({ "riskAssessment.riskLevel": 1, status: 1, createdAt: -1 });

// Virtuals
adminLogSchema.virtual("duration").get(function() {
  if (this.performance && this.performance.startTime && this.performance.endTime) {
    return this.performance.endTime - this.performance.startTime;
  }
  return null;
});

adminLogSchema.virtual("isHighRisk").get(function() {
  return this.riskAssessment.riskLevel === "high" || this.riskAssessment.riskLevel === "critical";
});

adminLogSchema.virtual("requiresApproval").get(function() {
  return this.approval.required && !this.approval.approvedBy;
});

// Pre-save middleware to calculate risk score
adminLogSchema.pre("save", function(next) {
  let riskScore = 0;
  const riskFactors = [];

  // Base risk based on action type
  switch (this.action) {
    case "user_delete":
    case "system_config":
    case "security_alert":
      riskScore += 30;
      riskFactors.push("high_risk_action");
      break;
    
    case "role_change":
    case "permission_update":
      riskScore += 25;
      riskFactors.push("privilege_modification");
      break;
    
    case "event_reject":
    case "ticket_refund":
      riskScore += 15;
      riskFactors.push("content_moderation");
      break;
    
    case "user_deactivate":
    case "ip_block":
      riskScore += 20;
      riskFactors.push("access_control");
      break;
  }

  // Risk based on target type
  if (this.targetType === "system" || this.targetType === "security") {
    riskScore += 10;
    riskFactors.push("system_target");
  }

  // Risk based on context
  if (this.context && this.context.ipAddress) {
    // Check if IP is from suspicious location (placeholder)
    if (this.context.ipAddress.startsWith("192.168.")) {
      riskScore += 5;
      riskFactors.push("internal_network");
    }
  }

  // Risk based on timing
  const now = new Date();
  const hour = now.getHours();
  if (hour < 6 || hour > 22) {
    riskScore += 10;
    riskFactors.push("off_hours_activity");
  }

  // Set risk level based on score
  if (riskScore >= 50) {
    this.riskAssessment.riskLevel = "critical";
    this.approval.required = true;
    this.status = "requires_approval";
  } else if (riskScore >= 30) {
    this.riskAssessment.riskLevel = "high";
    this.approval.required = true;
    this.status = "requires_approval";
  } else if (riskScore >= 15) {
    this.riskAssessment.riskLevel = "medium";
  } else {
    this.riskAssessment.riskLevel = "low";
  }

  this.riskAssessment.riskScore = riskScore;
  this.riskAssessment.riskFactors = riskFactors;
  this.riskAssessment.requiresReview = riskScore >= 30;

  next();
});

// Methods
adminLogSchema.methods.approve = function(approverId, notes = "") {
  if (!this.approval.required) {
    throw new Error("This action does not require approval");
  }

  this.approval.approvedBy = approverId;
  this.approval.approvedAt = new Date();
  this.approval.approvalNotes = notes;
  this.status = "completed";

  return this.save();
};

adminLogSchema.methods.reject = function(rejectorId, reason = "") {
  if (!this.approval.required) {
    throw new Error("This action does not require approval");
  }

  this.status = "cancelled";
  this.details.notes = `Rejected by ${rejectorId}: ${reason}`;

  return this.save();
};

adminLogSchema.methods.addContext = function(contextData) {
  this.context = { ...this.context, ...contextData };
  return this.save();
};

adminLogSchema.methods.markFailed = function(error) {
  this.status = "failed";
  this.error = {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "Unknown error occurred",
    stack: error.stack
  };
  this.performance.endTime = new Date();
  if (this.performance.startTime) {
    this.performance.duration = this.performance.endTime - this.performance.startTime;
  }

  return this.save();
};

// Static methods for analytics
adminLogSchema.statics.getAdminActivityStats = async function(filter = {}, groupBy = null) {
  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: groupBy,
        totalActions: { $sum: 1 },
        completedActions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        failedActions: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        pendingApprovals: { $sum: { $cond: [{ $eq: ["$status", "requires_approval"] }, 1, 0] } },
        highRiskActions: { $sum: { $cond: [{ $in: ["$riskAssessment.riskLevel", ["high", "critical"]] }, 1, 0] } },
        avgRiskScore: { $avg: "$riskAssessment.riskScore" },
        avgDuration: { $avg: "$performance.duration" }
      }
    },
    { $sort: { _id: 1 } }
  ];

  return this.aggregate(pipeline);
};

adminLogSchema.statics.getHighRiskActions = async function(filter = {}, limit = 20) {
  return this.find({
    ...filter,
    "riskAssessment.riskLevel": { $in: ["high", "critical"] }
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate("adminId", "name email role")
  .populate("targetId")
  .populate("approval.approvedBy", "name email");
};

adminLogSchema.statics.getPendingApprovals = async function(filter = {}) {
  return this.find({
    ...filter,
    status: "requires_approval"
  })
  .sort({ createdAt: 1 })
  .populate("adminId", "name email role")
  .populate("targetId");
};

adminLogSchema.statics.getAdminPerformance = async function(adminId, period = "30d") {
  const startDate = new Date();
  switch (period) {
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  return this.aggregate([
    {
      $match: {
        adminId: new mongoose.Types.ObjectId(adminId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalActions: { $sum: 1 },
        avgDuration: { $avg: "$performance.duration" },
        successRate: {
          $avg: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
        },
        avgRiskScore: { $avg: "$riskAssessment.riskScore" },
        highRiskActions: {
          $sum: { $cond: [{ $in: ["$riskAssessment.riskLevel", ["high", "critical"]] }, 1, 0] }
        }
      }
    }
  ]);
};

export default mongoose.model("AdminLog", adminLogSchema);
