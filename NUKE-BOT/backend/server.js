import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { User, Command } from "./models.js";
import { requireAuth, requireAdmin } from "./auth.js";

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(",") || "http://localhost:5173" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "nuke-bot-api" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12)
      return res.status(400).json({ error: "Use a valid email and a password of at least 12 characters." });
    if (await User.findOne({ email })) return res.status(409).json({ error: "Email already registered" });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash, role: "user" });
    res.status(201).json({ message: "Account created. Sign in to continue.", user: { email: user.email, role: user.role } });
  } catch { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ email });
  const ok = user && await bcrypt.compare(String(req.body.password || ""), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { email: user.email, role: user.role } });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ email: req.user.email, role: req.user.role }));

app.get("/api/dashboard", requireAuth, async (_req, res) => {
  const [queued, recent] = await Promise.all([
    Command.countDocuments({ status: { $in: ["queued", "running"] } }),
    Command.find().sort({ createdAt: -1 }).limit(8).select("name status requestedBy createdAt")
  ]);
  res.json({ queued, recent });
});

const allowedCommands = new Set(["ping", "status", "serverinfo", "testspam", "stop"]);
app.post("/api/commands", requireAuth, async (req, res) => {
  const name = String(req.body.name || "").toLowerCase();
  if (!allowedCommands.has(name)) return res.status(400).json({ error: "Unsupported command" });
  if (name === "testspam" && req.user.role !== "admin")
    return res.status(403).json({ error: "Admin access required for test simulation" });
  const payload = name === "testspam" ? { count: Math.min(5, Math.max(1, Number(req.body.count) || 3)) } : {};
  const command = await Command.create({ name, requestedBy: req.user.email, payload });
  res.status(202).json({ message: "Command queued", commandId: command.id });
});

app.get("/api/commands", requireAuth, async (req, res) => {
  const rows = await Command.find().sort({ createdAt: -1 }).limit(30);
  res.json(rows);
});

// Private worker API: shared secret is never exposed to the browser.
function requireWorker(req, res, next) {
  if (!process.env.WORKER_SECRET || req.headers["x-worker-secret"] !== process.env.WORKER_SECRET)
    return res.status(401).json({ error: "Worker authentication failed" });
  next();
}
app.get("/internal/commands/next", requireWorker, async (_req, res) => {
  const cmd = await Command.findOneAndUpdate({ status: "queued" }, { status: "running" }, { sort: { createdAt: 1 }, new: true });
  res.json(cmd || null);
});
app.post("/internal/commands/:id/result", requireWorker, async (req, res) => {
  const status = ["completed", "failed", "cancelled"].includes(req.body.status) ? req.body.status : "failed";
  const command = await Command.findByIdAndUpdate(req.params.id, { status, result: String(req.body.result || "").slice(0, 500) }, { new: true });
  if (!command) return res.status(404).json({ error: "Command not found" });
  res.json({ ok: true });
});

const port = process.env.PORT || 4000;
await mongoose.connect(process.env.MONGODB_URI);
app.listen(port, () => console.log(`NUKE BOT API listening on ${port}`));
