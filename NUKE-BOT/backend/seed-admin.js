import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "./models.js";

if (!process.env.BOOTSTRAP_ADMIN_EMAIL || !process.env.BOOTSTRAP_ADMIN_PASSWORD)
  throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD first.");
if (process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 16)
  throw new Error("Admin password must be at least 16 characters.");
await mongoose.connect(process.env.MONGODB_URI);
const email = process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
const passwordHash = await bcrypt.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD, 12);
await User.findOneAndUpdate({ email }, { email, passwordHash, role: "admin" }, { upsert: true, new: true });
console.log(`Admin account ready: ${email}`);
await mongoose.disconnect();
