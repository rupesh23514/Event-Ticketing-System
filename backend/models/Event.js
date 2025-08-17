import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Event title is required"],
    trim: true,
    maxlength: [200, "Event title cannot exceed 200 characters"]
  },

  description: {
    type: String,
    required: [true, "Event description is required"],
    trim: true,
    maxlength: [2000, "Event description cannot exceed 2000 characters"]
  },

  category: {
    type: String,
    required: [true, "Event category is required"],
    enum: {
      values: ["music", "sports", "technology", "business", "education", "entertainment", "food", "art", "other"],
      message: "Invalid event category"
    }
  },

  date: {
    type: Date,
    required: [true, "Event date is required"],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: "Event date must be in the future"
    }
  },

  startTime: {
    type: String,
    required: [true, "Start time is required"],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"]
  },

  endTime: {
    type: String,
    required: [true, "End time is required"],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"],
    validate: {
      validator: function(value) {
        return value > this.startTime;
      },
      message: "End time must be after start time"
    }
  },

  venue: {
    type: String,
    required: [true, "Venue is required"],
    trim: true,
    maxlength: [200, "Venue cannot exceed 200 characters"]
  },

  address: {
    street: {
      type: String,
      required: [true, "Street address is required"],
      trim: true,
      maxlength: [200, "Street address cannot exceed 200 characters"]
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      maxlength: [100, "City cannot exceed 100 characters"]
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
      maxlength: [100, "State cannot exceed 100 characters"]
    },
    zipCode: {
      type: String,
      required: [true, "ZIP code is required"],
      trim: true,
      maxlength: [20, "ZIP code cannot exceed 20 characters"]
    },
    country: {
      type: String,
      required: [true, "Country is required"],
      trim: true,
      maxlength: [100, "Country cannot exceed 100 characters"]
    }
  },

  images: [{
    url: {
      type: String,
      required: [true, "Image URL is required"],
      validate: {
        validator: function(v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: "Invalid image URL"
      }
    },
    alt: {
      type: String,
      trim: true,
      maxlength: [100, "Image alt text cannot exceed 100 characters"]
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],

  status: {
    type: String,
    enum: {
      values: ["draft", "pending", "published", "rejected", "cancelled"],
      message: "Invalid event status"
    },
    default: "draft"
  },

  // Admin approval fields
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [1000, "Admin notes cannot exceed 1000 characters"]
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  approvedAt: {
    type: Date
  },

  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, "Rejection reason cannot exceed 500 characters"]
  },

  // Event workflow
  workflowStatus: {
    type: String,
    enum: {
      values: ["draft", "submitted", "under_review", "approved", "rejected", "published"],
      message: "Invalid workflow status"
    },
    default: "draft"
  },

  workflowHistory: [{
    status: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: ["created", "submitted", "reviewed", "approved", "rejected", "published", "cancelled"]
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Workflow notes cannot exceed 500 characters"]
    }
  }],

  // ... existing fields ...
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Organizer is required"]
  },

  ticketTypes: [{
    name: {
      type: String,
      required: [true, "Ticket type name is required"],
      trim: true,
      maxlength: [100, "Ticket type name cannot exceed 100 characters"]
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Ticket type description cannot exceed 500 characters"]
    },
    price: {
      type: Number,
      required: [true, "Ticket price is required"],
      min: [0, "Ticket price cannot be negative"]
    },
    currency: {
      type: String,
      default: "USD",
      enum: {
        values: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"],
        message: "Invalid currency"
      }
    },
    quantity: {
      type: Number,
      required: [true, "Ticket quantity is required"],
      min: [1, "Ticket quantity must be at least 1"]
    },
    sold: {
      type: Number,
      default: 0,
      min: [0, "Sold tickets cannot be negative"]
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],

  maxAttendees: {
    type: Number,
    required: [true, "Maximum attendees is required"],
    min: [1, "Maximum attendees must be at least 1"]
  },

  currentAttendees: {
    type: Number,
    default: 0,
    min: [0, "Current attendees cannot be negative"]
  },

  isFeatured: {
    type: Boolean,
    default: false
  },

  tags: [{
    type: String,
    trim: true,
    maxlength: [50, "Tag cannot exceed 50 characters"]
  }],

  discount: {
    type: Number,
    min: [0, "Discount cannot be negative"],
    max: [100, "Discount cannot exceed 100%"]
  },

  discountEndDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !this.discount || value > new Date();
      },
      message: "Discount end date must be in the future"
    }
  },

  refundPolicy: {
    type: String,
    trim: true,
    maxlength: [1000, "Refund policy cannot exceed 1000 characters"]
  },

  termsAndConditions: {
    type: String,
    trim: true,
    maxlength: [2000, "Terms and conditions cannot exceed 2000 characters"]
  },

  contactInfo: {
    email: {
      type: String,
      required: [true, "Contact email is required"],
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Invalid email format"]
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"]
    },
    website: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Invalid website URL"
      }
    }
  },

  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
eventSchema.index({ organizerId: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ isFeatured: 1 });
eventSchema.index({ isActive: 1 });
eventSchema.index({ workflowStatus: 1 });
eventSchema.index({ "address.city": 1 });
eventSchema.index({ "address.state": 1 });
eventSchema.index({ "address.country": 1 });

// Compound indexes for common queries
eventSchema.index({ status: 1, date: 1 });
eventSchema.index({ category: 1, status: 1 });
eventSchema.index({ organizerId: 1, status: 1 });
eventSchema.index({ isFeatured: 1, status: 1, date: 1 });

// Virtual for checking if event is sold out
eventSchema.virtual("isSoldOut").get(function() {
  return this.currentAttendees >= this.maxAttendees;
});

// Virtual for checking if event can be booked
eventSchema.virtual("canBookTickets").get(function() {
  return this.status === "published" &&
         this.isActive &&
         !this.isSoldOut &&
         this.date > new Date();
});

// Virtual for getting available tickets
eventSchema.virtual("availableTickets").get(function() {
  return this.maxAttendees - this.currentAttendees;
});

// Virtual for getting total revenue potential
eventSchema.virtual("totalRevenuePotential").get(function() {
  return this.ticketTypes.reduce((total, ticketType) => {
    return total + (ticketType.price * ticketType.quantity);
  }, 0);
});

// Virtual for getting current revenue
eventSchema.virtual("currentRevenue").get(function() {
  return this.ticketTypes.reduce((total, ticketType) => {
    return total + (ticketType.price * ticketType.sold);
  }, 0);
});

// Pre-save middleware to update workflow history
eventSchema.pre("save", function(next) {
  if (this.isModified("status") || this.isModified("workflowStatus")) {
    const action = this.status === "published" ? "published" :
                   this.status === "rejected" ? "rejected" :
                   this.status === "pending" ? "submitted" :
                   this.status === "draft" ? "created" : "updated";

    this.workflowHistory.push({
      status: this.status,
      action,
      performedBy: this.approvedBy || this.organizerId,
      performedAt: new Date(),
      notes: this.adminNotes || ""
    });
  }

  // Update workflow status based on main status
  if (this.status === "published") {
    this.workflowStatus = "published";
  } else if (this.status === "rejected") {
    this.workflowStatus = "rejected";
  } else if (this.status === "pending") {
    this.workflowStatus = "under_review";
  } else if (this.status === "draft") {
    this.workflowStatus = "draft";
  }

  next();
});

// Method to submit event for approval
eventSchema.methods.submitForApproval = function() {
  if (this.status !== "draft") {
    throw new Error("Only draft events can be submitted for approval");
  }

  this.status = "pending";
  this.workflowStatus = "under_review";

  return this.save();
};

// Method to approve event
eventSchema.methods.approve = function(adminId, notes = "") {
  if (this.status !== "pending") {
    throw new Error("Only pending events can be approved");
  }

  this.status = "published";
  this.workflowStatus = "published";
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  this.adminNotes = notes;

  return this.save();
};

// Method to reject event
eventSchema.methods.reject = function(adminId, reason = "") {
  if (this.status !== "pending") {
    throw new Error("Only pending events can be rejected");
  }

  this.status = "rejected";
  this.workflowStatus = "rejected";
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  this.rejectionReason = reason;

  return this.save();
};

// Method to reduce available tickets
eventSchema.methods.reduceTickets = function(quantity) {
  if (this.currentAttendees + quantity > this.maxAttendees) {
    throw new Error("Not enough tickets available");
  }

  this.currentAttendees += quantity;
  return this.save();
};

// Method to check if user can book tickets
eventSchema.methods.canBookTickets = function(userId, quantity) {
  // Check if event is active and published
  if (!this.isActive || this.status !== "published") {
    return { canBook: false, reason: "Event is not available for booking" };
  }

  // Check if event is in the future
  if (this.date <= new Date()) {
    return { canBook: false, reason: "Event has already passed" };
  }

  // Check if enough tickets are available
  if (this.currentAttendees + quantity > this.maxAttendees) {
    return { canBook: false, reason: "Not enough tickets available" };
  }

  return { canBook: true, reason: "Tickets can be booked" };
};

// Static method to get featured events
eventSchema.statics.getFeaturedEvents = function(limit = 10) {
  return this.find({
    isFeatured: true,
    status: "published",
    isActive: true,
    date: { $gt: new Date() }
  })
  .populate("organizerId", "name")
  .sort({ date: 1 })
  .limit(limit);
};

// Static method to get events by category
eventSchema.statics.getEventsByCategory = function(category, limit = 20) {
  return this.find({
    category,
    status: "published",
    isActive: true,
    date: { $gt: new Date() }
  })
  .populate("organizerId", "name")
  .sort({ date: 1 })
  .limit(limit);
};

// Static method to get upcoming events
eventSchema.statics.getUpcomingEvents = function(limit = 20) {
  return this.find({
    status: "published",
    isActive: true,
    date: { $gt: new Date() }
  })
  .populate("organizerId", "name")
  .sort({ date: 1 })
  .limit(limit);
};

// Static method to get events by organizer
eventSchema.statics.getEventsByOrganizer = function(organizerId, status = null) {
  const filter = { organizerId };
  if (status) filter.status = status;

  return this.find(filter)
    .populate("organizerId", "name email")
    .sort({ createdAt: -1 });
};

// Static method to get pending events for admin
eventSchema.statics.getPendingEvents = function() {
  return this.find({ status: "pending" })
    .populate("organizerId", "name email")
    .sort({ createdAt: 1 });
};

export default mongoose.model("Event", eventSchema);
