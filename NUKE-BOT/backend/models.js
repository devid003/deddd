import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" }
}, { timestamps: true });

const commandSchema = new mongoose.Schema({
  name: { type: String, required: true },
  requestedBy: { type: String, required: true },
  status: { type: String, enum: ["queued", "running", "completed", "failed", "cancelled"], default: "queued" },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  result: { type: String, default: "" }
}, { timestamps: true });

export const User = mongoose.model("User", userSchema);
export const Command = mongoose.model("Command", commandSchema);
