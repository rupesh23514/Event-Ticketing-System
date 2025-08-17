# Event Ticketing System

A full-stack MERN application for event ticketing and management.

## Features

- User authentication and authorization
- Event creation and management
- Booking system
- Payment integration
- Responsive web interface

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB Atlas
- **Authentication**: JWT
- **Payment**: Stripe (planned)

## Project Structure

```
Event Ticketing/
├── backend/          # Node.js + Express server
├── frontend/         # React application
└── docs/            # API documentation
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- MongoDB Atlas account
- npm or yarn

### Backend Setup
```bash
cd backend
npm install
# Create .env file with your MongoDB URI
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/events` - List all events
- `POST /api/events` - Create new event
- `GET /api/bookings` - Get user bookings
- `POST /api/bookings` - Create new booking

## Environment Variables

Create a `.env` file in the backend directory:
```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
CORS_ORIGIN=http://localhost:5173
```

## License

MIT License
