import Event from "../models/Event.js";
import { asyncHandler } from "../middlewares/errorHandler.js";

// @desc    Get all events with filtering, sorting, and pagination
// @route   GET /api/events
// @access  Public
export const listEvents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    status = "published",
    search,
    sortBy = "date",
    sortOrder = "asc",
    minPrice,
    maxPrice,
    city,
    state,
    featured
  } = req.query;

  // Build filter object
  const filter = { status: "published" };
  
  if (category) filter.category = category;
  if (status !== "published") filter.status = status;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }
  if (city) filter["address.city"] = { $regex: city, $options: "i" };
  if (state) filter["address.state"] = { $regex: state, $options: "i" };
  if (featured === "true") filter.isFeatured = true;

  // Text search
  if (search) {
    filter.$text = { $search: search };
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Execute query
  const events = await Event.find(filter)
    .populate("organizerId", "name email")
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .select("-__v");

  // Get total count for pagination
  const total = await Event.countDocuments(filter);

  res.json({
    success: true,
    data: events,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalEvents: total,
      hasNextPage: skip + events.length < total,
      hasPrevPage: parseInt(page) > 1
    }
  });
});

// @desc    Get single event by ID
// @route   GET /api/events/:id
// @access  Public
export const getEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id)
    .populate("organizerId", "name email phone")
    .select("-__v");

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  res.json({
    success: true,
    data: event
  });
});

// @desc    Create new event
// @route   POST /api/events
// @access  Private (Organizer/Admin)
export const createEvent = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    category,
    date,
    startTime,
    endTime,
    venue,
    address,
    coordinates,
    totalTickets,
    price,
    currency,
    discount,
    discountEndDate,
    images,
    tags,
    maxTicketsPerUser,
    refundPolicy,
    termsAndConditions,
    socialLinks
  } = req.body;

  // Validate required fields
  if (!title || !description || !category || !date || !startTime || !endTime || !venue || !totalTickets || !price) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  // Validate date is in future
  if (new Date(date) <= new Date()) {
    return res.status(400).json({
      success: false,
      message: "Event date must be in the future"
    });
  }

  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return res.status(400).json({
      success: false,
      message: "Invalid time format. Use HH:MM format"
    });
  }

  // Create event
  const event = await Event.create({
    title,
    description,
    category,
    date,
    startTime,
    endTime,
    venue,
    address,
    coordinates,
    totalTickets: parseInt(totalTickets),
    availableTickets: parseInt(totalTickets),
    price: parseFloat(price),
    currency: currency || "USD",
    discount: discount ? parseFloat(discount) : 0,
    discountEndDate: discountEndDate || null,
    images: images || [],
    tags: tags || [],
    maxTicketsPerUser: maxTicketsPerUser || 10,
    refundPolicy: refundPolicy || "No refunds available",
    termsAndConditions,
    socialLinks,
    organizerId: req.user.id,
    status: "draft" // Start as draft, organizer can publish later
  });

  const populatedEvent = await Event.findById(event._id)
    .populate("organizerId", "name email")
    .select("-__v");

  res.status(201).json({
    success: true,
    message: "Event created successfully",
    data: populatedEvent
  });
});

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private (Organizer/Admin)
export const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  // Check permissions
  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to update this event"
    });
  }

  // Prevent updates if event is completed or cancelled
  if (event.status === "completed" || event.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: "Cannot update completed or cancelled events"
    });
  }

  // Update event
  Object.assign(event, req.body);
  
  // Ensure availableTickets doesn't exceed totalTickets
  if (req.body.totalTickets && req.body.totalTickets < event.availableTickets) {
    event.availableTickets = req.body.totalTickets;
  }

  await event.save();

  const updatedEvent = await Event.findById(event._id)
    .populate("organizerId", "name email")
    .select("-__v");

  res.json({
    success: true,
    message: "Event updated successfully",
    data: updatedEvent
  });
});

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private (Organizer/Admin)
export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  // Check permissions
  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to delete this event"
    });
  }

  // Check if event has bookings (you might want to implement this later)
  // For now, we'll allow deletion

  await event.deleteOne();

  res.json({
    success: true,
    message: "Event deleted successfully"
  });
});

// @desc    Publish event
// @route   PATCH /api/events/:id/publish
// @access  Private (Organizer/Admin)
export const publishEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  // Check permissions
  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Not authorized to publish this event"
    });
  }

  // Validate event can be published
  if (event.status !== "draft") {
    return res.status(400).json({
      success: false,
      message: "Only draft events can be published"
    });
  }

  // Check if event has all required fields
  if (!event.images || event.images.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Event must have at least one image to be published"
    });
  }

  event.status = "published";
  await event.save();

  res.json({
    success: true,
    message: "Event published successfully",
    data: event
  });
});

// @desc    Get events by organizer
// @route   GET /api/events/organizer/me
// @access  Private (Organizer/Admin)
export const getMyEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const filter = { organizerId: req.user.id };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const events = await Event.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select("-__v");

  const total = await Event.countDocuments(filter);

  res.json({
    success: true,
    data: events,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalEvents: total
    }
  });
});

// @desc    Get featured events
// @route   GET /api/events/featured
// @access  Public
export const getFeaturedEvents = asyncHandler(async (req, res) => {
  const { limit = 6 } = req.query;

  const events = await Event.find({
    isFeatured: true,
    status: "published",
    date: { $gt: new Date() }
  })
    .sort({ date: 1 })
    .limit(parseInt(limit))
    .populate("organizerId", "name")
    .select("-__v");

  res.json({
    success: true,
    data: events
  });
});

// @desc    Get event categories
// @route   GET /api/events/categories
// @access  Public
export const getEventCategories = asyncHandler(async (req, res) => {
  const categories = [
    { value: "music", label: "Music", icon: "🎵" },
    { value: "sports", label: "Sports", icon: "⚽" },
    { value: "technology", label: "Technology", icon: "💻" },
    { value: "business", label: "Business", icon: "💼" },
    { value: "education", label: "Education", icon: "📚" },
    { value: "entertainment", label: "Entertainment", icon: "🎭" },
    { value: "food", label: "Food & Drink", icon: "🍕" },
    { value: "art", label: "Art & Culture", icon: "🎨" },
    { value: "other", label: "Other", icon: "🎪" }
  ];

  res.json({
    success: true,
    data: categories
  });
});
