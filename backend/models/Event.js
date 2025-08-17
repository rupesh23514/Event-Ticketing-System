import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, "Event title is required"], 
    trim: true,
    minlength: [5, "Title must be at least 5 characters"],
    maxlength: [100, "Title cannot exceed 100 characters"]
  },
  description: { 
    type: String, 
    required: [true, "Event description is required"],
    minlength: [20, "Description must be at least 20 characters"],
    maxlength: [1000, "Description cannot exceed 1000 characters"]
  },
  category: {
    type: String,
    required: [true, "Event category is required"],
    enum: {
      values: ["music", "sports", "technology", "business", "education", "entertainment", "food", "art", "other"],
      message: "Please select a valid category"
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
    required: [true, "Event start time is required"],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Please enter a valid time (HH:MM)"]
  },
  endTime: {
    type: String,
    required: [true, "Event end time is required"],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Please enter a valid time (HH:MM)"]
  },
  venue: { 
    type: String, 
    required: [true, "Event venue is required"],
    trim: true
  },
  address: {
    street: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: String,
    country: { type: String, required: true }
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  totalTickets: { 
    type: Number, 
    required: [true, "Total tickets is required"],
    min: [1, "Total tickets must be at least 1"],
    max: [10000, "Total tickets cannot exceed 10,000"]
  },
  availableTickets: { 
    type: Number, 
    required: [true, "Available tickets is required"],
    min: [0, "Available tickets cannot be negative"],
    validate: {
      validator: function(value) {
        return value <= this.totalTickets;
      },
      message: "Available tickets cannot exceed total tickets"
    }
  },
  price: { 
    type: Number, 
    required: [true, "Ticket price is required"],
    min: [0, "Price cannot be negative"]
  },
  currency: {
    type: String,
    default: "USD",
    enum: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"]
  },
  discount: {
    type: Number,
    min: [0, "Discount cannot be negative"],
    max: [100, "Discount cannot exceed 100%"]
  },
  discountEndDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value < this.date;
      },
      message: "Discount end date must be before event date"
    }
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false }
  }],
  status: {
    type: String,
    enum: ["draft", "published", "cancelled", "completed"],
    default: "draft"
  },
  organizerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: [true, "Organizer is required"]
  },
  tags: [String],
  isFeatured: {
    type: Boolean,
    default: false
  },
  maxTicketsPerUser: {
    type: Number,
    default: 10,
    min: [1, "Max tickets per user must be at least 1"]
  },
  refundPolicy: {
    type: String,
    default: "No refunds available"
  },
  termsAndConditions: String,
  socialLinks: {
    website: String,
    facebook: String,
    twitter: String,
    instagram: String
  }
}, { 
  timestamps: true 
});

// Indexes for better query performance
eventSchema.index({ title: "text", description: "text" });
eventSchema.index({ category: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ organizerId: 1 });
eventSchema.index({ isFeatured: 1 });
eventSchema.index({ "address.city": 1, "address.state": 1 });

// Virtual for checking if event is sold out
eventSchema.virtual("isSoldOut").get(function() {
  return this.availableTickets === 0;
});

// Virtual for checking if event is upcoming
eventSchema.virtual("isUpcoming").get(function() {
  return this.date > new Date() && this.status === "published";
});

// Virtual for calculating discount price
eventSchema.virtual("discountPrice").get(function() {
  if (this.discount && this.discount > 0) {
    return this.price * (1 - this.discount / 100);
  }
  return this.price;
});

// Pre-save middleware to ensure availableTickets doesn't exceed totalTickets
eventSchema.pre("save", function(next) {
  if (this.availableTickets > this.totalTickets) {
    this.availableTickets = this.totalTickets;
  }
  next();
});

// Method to check if user can book tickets
eventSchema.methods.canBookTickets = function(quantity) {
  return this.status === "published" && 
         this.availableTickets >= quantity && 
         this.date > new Date();
};

// Method to reduce available tickets
eventSchema.methods.reduceTickets = function(quantity) {
  if (this.availableTickets >= quantity) {
    this.availableTickets -= quantity;
    return true;
  }
  return false;
};

export default mongoose.model("Event", eventSchema);
