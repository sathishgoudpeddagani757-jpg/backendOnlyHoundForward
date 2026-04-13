# Hound Forward Backend

Backend API for the Hound Forward canine health platform.

This service manages authentication, dog profile data, video uploads, report data, dashboard summaries, consent handling, and admin-related features.

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Cloudinary
- Multer

## Features

- User registration and login
- JWT-based authentication
- Dog profile creation and management
- Video upload support
- Health report endpoints
- Dashboard summary endpoints
- Consent management
- Admin-only routes
- Security and rate-limiting middleware

## Project Structure

```bash
.
├── config/
├── middleware/
├── models/
├── routes/
├── scripts/
├── services/
├── tests/
├── uploads/
├── utils/
├── server.js
├── package.json
└── README.md


Prerequisites

Before running this project, make sure you have installed:

Node.js (v18 or later recommended)
npm
MongoDB Atlas account or local MongoDB
Cloudinary account
Installation
Clone or download the project.
Open the backend folder in a terminal.


Install dependencies:
npm install


Create a .env file in the root of the backend project and add the following:
PORT=5001
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_UPLOAD_FOLDER=hound-forward/uploads



To start the backend in development mode:
npm run dev


The backend will run on:
http://localhost:5001



Health Check
To confirm the backend is running correctly, open:
http://localhost:5001/api/health


Main API Routes
/api/auth
/api/profile
/api/upload
/api/report
/api/dashboard
/api/admin
/api/consent


Allowed frontend origins

The backend currently allows requests from:

http://localhost:5173
https://team3houndforward.netlify.app

For local development, run the frontend on port 5173.

File upload rules
Only video files are allowed
Maximum file size is 10MB




