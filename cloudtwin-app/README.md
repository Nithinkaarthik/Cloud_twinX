# CloudTwin

CloudTwin is a full-stack cloud planning and analytics app built with React, Vite, Express, and MongoDB. It combines authenticated user management, a live dashboard, AI-assisted cloud guidance, and cloud pricing simulation in one workspace.

## Overview

The application has two main parts:

- A React frontend that handles authentication, cloud simulation, pricing views, and the dashboard experience.
- An Express backend that manages JWT authentication, MongoDB-backed user data, dashboard metrics, and live pricing APIs.

## Features

- Email/password signup, login, session restore, and logout.
- MongoDB-backed dashboard metrics for total users, recent signups, and company-profile coverage.
- Live cloud pricing catalog with AWS, Azure, and GCP support.
- AI-assisted cloud workload guidance through Groq-powered chat and simulation helpers.
- Responsive dark-themed UI with a strong analytics-focused visual style.

## Tech Stack

- Frontend: React 19, Vite, Tailwind CSS v4
- Backend: Node.js, Express, MongoDB, Mongoose
- Auth: JWT + HTTP-only cookie support
- External services: Groq API, Google Cloud Billing Catalog API, Azure Retail Prices API, AWS pricing feeds

## Prerequisites

- Node.js 18 or newer
- MongoDB Atlas or another MongoDB-compatible database
- A Groq API key if you want the AI chat and scenario generation features
- A Google Cloud API key if you want live GCP pricing from the Cloud Billing Catalog API

## Installation

1. Install dependencies.

```bash
npm install
```

2. Create a `.env` file in the project root with the values you need.

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cloudtwin
JWT_SECRET=replace-with-a-long-random-secret
PORT=5000

VITE_GROQ_API_KEY=your_groq_api_key
VITE_GROQ_MODEL=llama-3.1-8b-instant

GCP_API_KEY=your_google_cloud_api_key
# or
FREE_PRICING_API_KEY=your_google_cloud_api_key

ENABLE_AWS_PRICING=true
ENABLE_AZURE_PRICING=true
ENABLE_GCP_PRICING=true
AWS_PRICING_TIMEOUT_MS=45000
```

## Running the App

Run the frontend and backend together:

```bash
npm run dev:all
```

Or run them separately:

```bash
npm run server
```

```bash
npm run dev
```

The frontend runs on Vite's default port, and the backend listens on `http://localhost:5000` by default.

## Available Scripts

- `npm run dev` - start the Vite frontend
- `npm run server` - start the Express API server
- `npm run dev:all` - run frontend and backend together
- `npm run build` - build the frontend for production
- `npm run lint` - run ESLint across the project
- `npm run preview` - preview the production build locally

## Environment Variables

### Backend

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - signing secret for auth tokens
- `PORT` - backend port, defaults to `5000`
- `GCP_API_KEY` - Google Cloud Billing Catalog API key
- `FREE_PRICING_API_KEY` - fallback Google Cloud API key name supported by the backend
- `ENABLE_AWS_PRICING` - set to `true` to enable live AWS pricing refresh
- `ENABLE_AZURE_PRICING` - set to `false` to disable Azure live pricing
- `ENABLE_GCP_PRICING` - set to `false` to disable GCP live pricing
- `AWS_PRICING_TIMEOUT_MS` - timeout for AWS pricing fetches

### Frontend

- `VITE_GROQ_API_KEY` - Groq API key used by the AI assistant
- `VITE_GROQ_MODEL` - optional Groq model name
- `VITE_API_BASE_URL` - optional backend base URL for the pricing client

## Project Structure

```text
cloudtwin-app/
├── server/                # Express API, MongoDB connection, pricing service
├── src/                   # React frontend
│   ├── cloudtwin/         # Main CloudTwin app experience
│   ├── context/           # Auth context
│   └── pages/             # Login, signup, dashboard, analytics pages
└── public/                # Static assets
```

## API Highlights

- `GET /api/health` - health check
- `POST /api/auth/signup` - create a new user
- `POST /api/auth/login` - authenticate a user
- `POST /api/auth/logout` - clear the current session
- `GET /api/auth/me` - fetch the current user
- `GET /api/dashboard/summary` - dashboard summary metrics
- `GET /api/dashboard/signup-trend` - seven-day signup trend
- `GET /api/pricing/live` - live cloud pricing catalog

## Troubleshooting

If the app cannot reach MongoDB, verify the connection string, network access rules, and `JWT_SECRET` value.

If Groq-powered features fail, confirm `VITE_GROQ_API_KEY` is set and valid.

If live pricing looks incomplete, check the Google Cloud API key and the pricing enable flags in your `.env` file.

## Notes

The backend is configured for local development origins by default. If you deploy the app, update the CORS settings in the server to match your production frontend URL.
