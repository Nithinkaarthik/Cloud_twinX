import "./env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import { getLivePricingCatalog } from "./pricingService.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({
  origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
  credentials: true,
}));
app.use(cookieParser());

connectDB();

app.get("/", (req, res) => {
  res.status(200).json({
    name: "CloudTwin API",
    status: "ok",
    frontend: "http://localhost:5173",
    docs: "Use /api/auth and /api/pricing/live endpoints",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.get("/api/pricing/live", async (req, res) => {
  try {
    const gcpApiKey = (process.env.GCP_API_KEY || process.env.FREE_PRICING_API_KEY || "").trim();

    const data = await getLivePricingCatalog({
      gcpApiKey,
      enableAws: process.env.ENABLE_AWS_PRICING === "true",
      enableAzure: process.env.ENABLE_AZURE_PRICING !== "false",
      enableGcp: process.env.ENABLE_GCP_PRICING !== "false",
      awsTimeoutMs: Number(process.env.AWS_PRICING_TIMEOUT_MS || 45000),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Pricing fetch failed", details: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down server...`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log("✓ MongoDB connection closed");
    } catch (error) {
      console.error("✗ Error closing MongoDB connection:", error.message);
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.error("✗ Force exit after timeout");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
