# API Overview

## Auth
POST /api/auth/register { name, email, password, role? }
POST /api/auth/login { email, password }
GET  /api/auth/me  (Bearer token)

## Events
GET  /api/events
GET  /api/events/:id
POST /api/events (organizer/admin) { title, description, date, venue, totalTickets, price }
PUT  /api/events/:id (organizer/admin)
DELETE /api/events/:id (organizer/admin)

## Bookings
POST /api/bookings { eventId, quantity }
GET  /api/bookings/me

## Payments (Mock)
POST /api/payments/create-intent { bookingId }
POST /api/payments/confirm { bookingId }
