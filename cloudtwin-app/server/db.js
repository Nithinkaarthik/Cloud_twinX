import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb+srv://username:password@cluster.mongodb.net/cloudtwin?retryWrites=true&w=majority";

export async function connectDB() {
  try {
    await mongoose.connect(mongoUri);
    console.log("✓ MongoDB connected");
  } catch (error) {
    console.error("✗ MongoDB connection failed:", error.message);
    // Keep API alive so frontend receives a clear error instead of network failure.
  }
}

export default mongoose;
