const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const applicationRoutes = require("./routes/applications");

const app = express();

app.use(cors());
app.use(express.json());

// API welcome route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Job Application Tracker API is running!",
    data: null
  });
});

// Job application API routes
app.use("/api/applications", applicationRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
    data: null
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start the server:", error.message);
    process.exit(1);
  }
}

startServer();