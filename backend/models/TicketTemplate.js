import mongoose from "mongoose";

const ticketTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Template name is required"],
    trim: true,
    maxlength: [100, "Template name cannot exceed 100 characters"]
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  isDefault: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Template configuration
  config: {
    // Layout settings
    layout: {
      type: String,
      enum: ["portrait", "landscape"],
      default: "portrait"
    },
    
    // Page size
    pageSize: {
      type: String,
      enum: ["A4", "A5", "Letter", "Legal"],
      default: "A4"
    },
    
    // Colors
    colors: {
      primary: {
        type: String,
        default: "#2c3e50"
      },
      secondary: {
        type: String,
        default: "#34495e"
      },
      accent: {
        type: String,
        default: "#3498db"
      },
      background: {
        type: String,
        default: "#ffffff"
      }
    },
    
    // Fonts
    fonts: {
      header: {
        type: String,
        default: "Helvetica-Bold"
      },
      body: {
        type: String,
        default: "Helvetica"
      },
      accent: {
        type: String,
        default: "Helvetica-Bold"
      }
    },
    
    // Font sizes
    fontSizes: {
      title: {
        type: Number,
        default: 24
      },
      subtitle: {
        type: Number,
        default: 18
      },
      header: {
        type: Number,
        default: 14
      },
      body: {
        type: Number,
        default: 12
      },
      small: {
        type: Number,
        default: 10
      }
    }
  },
  
  // Template sections
  sections: {
    header: {
      enabled: {
        type: Boolean,
        default: true
      },
      logo: {
        enabled: {
          type: Boolean,
          default: true
        },
        position: {
          x: { type: Number, default: 50 },
          y: { type: Number, default: 50 },
          width: { type: Number, default: 100 },
          height: { type: Number, default: 60 }
        }
      },
      title: {
        enabled: {
          type: Boolean,
          default: true
        },
        text: {
          type: String,
          default: "EVENT TICKET"
        },
        position: {
          x: { type: Number, default: 200 },
          y: { type: Number, default: 60 }
        }
      },
      eventName: {
        enabled: {
          type: Boolean,
          default: true
        },
        position: {
          x: { type: Number, default: 200 },
          y: { type: Number, default: 90 }
        }
      }
    },
    
    details: {
      enabled: {
        type: Boolean,
        default: true
      },
      fields: [{
        name: {
          type: String,
          required: true
        },
        label: {
          type: String,
          required: true
        },
        enabled: {
          type: Boolean,
          default: true
        },
        position: {
          x: { type: Number, required: true },
          y: { type: Number, required: true }
        },
        style: {
          fontSize: { type: Number, default: 12 },
          fontFamily: { type: String, default: "Helvetica" },
          color: { type: String, default: "#2c3e50" }
        }
      }],
      startY: {
        type: Number,
        default: 160
      },
      lineHeight: {
        type: Number,
        default: 25
      }
    },
    
    qrCode: {
      enabled: {
        type: Boolean,
        default: true
      },
      position: {
        x: { type: Number, default: 400 },
        y: { type: Number, default: 160 },
        width: { type: Number, default: 120 },
        height: { type: Number, default: 120 }
      },
      label: {
        enabled: {
          type: Boolean,
          default: true
        },
        text: {
          type: String,
          default: "Scan for verification"
        },
        position: {
          x: { type: Number, default: 400 },
          y: { type: Number, default: 290 }
        }
      }
    },
    
    footer: {
      enabled: {
        type: Boolean,
        default: true
      },
      terms: {
        enabled: {
          type: Boolean,
          default: true
        },
        text: [{
          type: String
        }],
        position: {
          x: { type: Number, default: 50 },
          y: { type: Number, default: 700 }
        }
      },
      contact: {
        enabled: {
          type: Boolean,
          default: true
        },
        text: {
          type: String,
          default: "For support, contact: support@eventticketing.com"
        },
        position: {
          x: { type: Number, default: 50 },
          y: { type: Number, default: 790 }
        }
      }
    }
  },
  
  // Custom CSS for HTML templates
  customCSS: {
    type: String,
    default: ""
  },
  
  // Custom JavaScript for HTML templates
  customJS: {
    type: String,
    default: ""
  },
  
  // Template version
  version: {
    type: String,
    default: "1.0"
  },
  
  // Usage statistics
  usage: {
    totalGenerated: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
ticketTemplateSchema.index({ organizerId: 1 });
ticketTemplateSchema.index({ isDefault: 1 });
ticketTemplateSchema.index({ isActive: 1 });
ticketTemplateSchema.index({ name: 1 });

// Virtual for template display name
ticketTemplateSchema.virtual("displayName").get(function() {
  return this.isDefault ? `${this.name} (Default)` : this.name;
});

// Virtual for checking if template can be deleted
ticketTemplateSchema.virtual("canBeDeleted").get(function() {
  return !this.isDefault && this.usage.totalGenerated === 0;
});

// Pre-save middleware to ensure only one default template per organizer
ticketTemplateSchema.pre("save", async function(next) {
  if (this.isDefault) {
    // Remove default flag from other templates by this organizer
    await this.constructor.updateMany(
      { organizerId: this.organizerId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// Method to increment usage
ticketTemplateSchema.methods.incrementUsage = function() {
  this.usage.totalGenerated += 1;
  this.usage.lastUsed = new Date();
  return this.save();
};

// Method to duplicate template
ticketTemplateSchema.methods.duplicate = function(newName) {
  const duplicate = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    name: newName || `${this.name} (Copy)`,
    isDefault: false,
    usage: {
      totalGenerated: 0,
      lastUsed: null
    }
  });
  
  return duplicate.save();
};

// Static method to get default template for organizer
ticketTemplateSchema.statics.getDefaultTemplate = function(organizerId) {
  return this.findOne({ organizerId, isDefault: true, isActive: true });
};

// Static method to get active templates for organizer
ticketTemplateSchema.statics.getActiveTemplates = function(organizerId) {
  return this.find({ organizerId, isActive: true }).sort({ isDefault: -1, name: 1 });
};

export default mongoose.model("TicketTemplate", ticketTemplateSchema);
