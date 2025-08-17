import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    maxlength: [100, "Name cannot exceed 100 characters"]
  },
  
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"]
  },
  
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters"],
    select: false // Don't include password in queries by default
  },
  
  role: {
    type: String,
    enum: {
      values: ["user", "organizer", "admin"],
      message: "Invalid user role"
    },
    default: "user"
  },
  
  phone: {
    type: String,
    trim: true,
    maxlength: [20, "Phone number cannot exceed 20 characters"]
  },
  
  profilePicture: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: "Invalid profile picture URL"
    }
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  verificationToken: String,
  
  resetPasswordToken: String,
  
  resetPasswordExpires: Date,
  
  // Admin management fields
  isActive: {
    type: Boolean,
    default: true
  },
  
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [1000, "Admin notes cannot exceed 1000 characters"]
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  
  updatedAt: {
    type: Date
  },
  
  // Security and login tracking
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lastLoginAttempt: {
    type: Date
  },
  
  isLocked: {
    type: Boolean,
    default: false
  },
  
  lockExpires: {
    type: Date
  },
  
  lastLogin: {
    type: Date
  },
  
  lastActive: {
    type: Date
  },
  
  // User preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: false
    },
    marketingEmails: {
      type: Boolean,
      default: false
    },
    language: {
      type: String,
      default: "en",
      enum: ["en", "es", "fr", "de", "hi", "zh"]
    },
    timezone: {
      type: String,
      default: "UTC"
    }
  },
  
  // Profile information
  bio: {
    type: String,
    trim: true,
    maxlength: [500, "Bio cannot exceed 500 characters"]
  },
  
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value < new Date();
      },
      message: "Date of birth must be in the past"
    }
  },
  
  gender: {
    type: String,
    enum: ["male", "female", "other", "prefer_not_to_say"]
  },
  
  location: {
    city: String,
    state: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Social media links
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    website: String
  },
  
  // Account statistics
  stats: {
    totalEvents: {
      type: Number,
      default: 0
    },
    totalTickets: {
      type: Number,
      default: 0
    },
    totalSpent: {
      type: Number,
      default: 0
    },
    memberSince: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ lastLogin: 1 });
userSchema.index({ "location.city": 1 });
userSchema.index({ "location.country": 1 });

// Compound indexes for common queries
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ role: 1, isVerified: 1 });
userSchema.index({ isActive: 1, isLocked: 1 });

// Virtual for checking if user is locked
userSchema.virtual("isAccountLocked").get(function() {
  if (!this.isLocked) return false;
  if (!this.lockExpires) return true;
  return this.lockExpires > new Date();
});

// Virtual for checking if user can login
userSchema.virtual("canLogin").get(function() {
  return this.isActive && !this.isAccountLocked;
});

// Virtual for getting user display name
userSchema.virtual("displayName").get(function() {
  return this.name || this.email.split('@')[0];
});

// Virtual for checking if user is admin
userSchema.virtual("isAdmin").get(function() {
  return this.role === "admin";
});

// Virtual for checking if user is organizer
userSchema.virtual("isOrganizer").get(function() {
  return this.role === "organizer" || this.role === "admin";
});

// Pre-save middleware to hash password
userSchema.pre("save", async function(next) {
  // Only hash password if it's modified
  if (!this.isModified("password")) return next();
  
  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.password, 12);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to update timestamps
userSchema.pre("save", function(next) {
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

// Method to validate password strength
userSchema.methods.validatePassword = function(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!hasLowerCase) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!hasNumbers) {
    errors.push("Password must contain at least one number");
  }
  if (!hasSpecialChar) {
    errors.push("Password must contain at least one special character");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Method to increment login attempts
userSchema.methods.incrementLoginAttempts = function() {
  this.loginAttempts += 1;
  this.lastLoginAttempt = new Date();
  
  // Lock account after 5 failed attempts
  if (this.loginAttempts >= 5) {
    this.isLocked = true;
    this.lockExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  }
  
  return this.save();
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  this.loginAttempts = 0;
  this.isLocked = false;
  this.lockExpires = undefined;
  this.lastLogin = new Date();
  this.lastActive = new Date();
  
  return this.save();
};

// Method to lock account
userSchema.methods.lockAccount = function(duration = 30 * 60 * 1000) { // 30 minutes default
  this.isLocked = true;
  this.lockExpires = new Date(Date.now() + duration);
  
  return this.save();
};

// Method to unlock account
userSchema.methods.unlockAccount = function() {
  this.isLocked = false;
  this.lockExpires = undefined;
  this.loginAttempts = 0;
  
  return this.save();
};

// Method to update last active
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

// Method to change role
userSchema.methods.changeRole = function(newRole, adminId) {
  if (!["user", "organizer", "admin"].includes(newRole)) {
    throw new Error("Invalid role");
  }
  
  this.role = newRole;
  this.updatedBy = adminId;
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to deactivate account
userSchema.methods.deactivateAccount = function(adminId, reason = "") {
  this.isActive = false;
  this.adminNotes = reason;
  this.updatedBy = adminId;
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to reactivate account
userSchema.methods.reactivateAccount = function(adminId) {
  this.isActive = true;
  this.adminNotes = "";
  this.updatedBy = adminId;
  this.updatedAt = new Date();
  
  return this.save();
};

// Static method to get users by role
userSchema.statics.getUsersByRole = function(role) {
  return this.find({ role, isActive: true })
    .select("-password")
    .sort({ createdAt: -1 });
};

// Static method to get active users
userSchema.statics.getActiveUsers = function() {
  return this.find({ isActive: true })
    .select("-password")
    .sort({ lastActive: -1 });
};

// Static method to get locked users
userSchema.statics.getLockedUsers = function() {
  return this.find({ isLocked: true })
    .select("-password")
    .sort({ lockExpires: 1 });
};

// Static method to get users with failed login attempts
userSchema.statics.getUsersWithFailedLogins = function(threshold = 3) {
  return this.find({ loginAttempts: { $gte: threshold } })
    .select("-password")
    .sort({ loginAttempts: -1 });
};

// Static method to get user statistics
userSchema.statics.getUserStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: ["$isActive", 1, 0] }
        },
        verifiedUsers: {
          $sum: { $cond: ["$isVerified", 1, 0] }
        },
        lockedUsers: {
          $sum: { $cond: ["$isLocked", 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

export default mongoose.model("User", userSchema);
