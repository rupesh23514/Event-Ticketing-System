import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI missing");
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("DB connection failed", err.message);
    process.exit(1);
  }
};

export default connectDB;
