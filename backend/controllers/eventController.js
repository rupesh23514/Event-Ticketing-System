import Event from "../models/Event.js";

export const listEvents = async (req,res) => {
  const events = await Event.find().sort({ date: 1 });
  res.json(events);
};

export const getEvent = async (req,res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found" });
  res.json(event);
};

export const createEvent = async (req,res) => {
  try {
    const { title, description, date, venue, totalTickets, price } = req.body;
    const event = await Event.create({
      title, description, date, venue,
      totalTickets,
      availableTickets: totalTickets,
      price,
      organizerId: req.user.id
    });
    res.status(201).json(event);
  } catch (e) {
    res.status(400).json({ message: "Invalid event data" });
  }
};

export const updateEvent = async (req,res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found" });
  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ message: "Not allowed" });
  Object.assign(event, req.body);
  await event.save();
  res.json(event);
};

export const deleteEvent = async (req,res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found" });
  if (event.organizerId.toString() !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ message: "Not allowed" });
  await event.deleteOne();
  res.json({ message: "Event deleted" });
};
