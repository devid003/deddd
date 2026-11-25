# NUKE BOT — Capstone Starter

A web-controlled Discord bot starter with:
- React + Vite cyberpunk dashboard
- Node.js + Express API (JWT authentication)
- Python `discord.py` worker
- Render deployment blueprints
- Controlled spam-test simulation (max 5 messages, allowlisted test channel, cooldown)

## Architecture
React dashboard -> Node/Express API -> Python worker -> private Discord test server.

The browser never receives the Discord bot token or internal worker secret.

## Requirements
- Node.js 20+
- Python 3.11+
- MongoDB database
- Discord application/bot created in the Discord Developer Portal
- Render account

## 1. Configure Discord
1. Create an application and bot in the Discord Developer Portal.
2. Enable the Server Members Intent only if you later add member lookup features.
3. Invite the bot to a private test server with only the permissions it needs: View Channels, Send Messages, Read Message History.
4. Create a dedicated test channel and copy its channel ID (enable Developer Mode in Discord).
5. Do not enable Administrator permission.

## 2. Configure environment variables
Copy `.env.example` to `.env` in `backend/` and `discord-bot/` separately, then fill in real values.

Backend:
- `MONGODB_URI`
- `JWT_SECRET` (long random value)
- `WORKER_SECRET` (long random value; must match the Python worker)
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Bot:
- `DISCORD_TOKEN`
- `API_BASE_URL` (backend URL, e.g. https://your-api.onrender.com)
- `WORKER_SECRET` (same value as backend)
- `TEST_GUILD_ID`
- `TEST_CHANNEL_ID`

Never commit `.env` files or share tokens.

## 3. Run locally
### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run seed-admin
npm run dev
```

### Python bot worker
```bash
cd discord-bot
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python bot.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL shown in the terminal. Set `VITE_API_URL=http://localhost:4000` in `frontend/.env.local` if needed.

## 4. Render deployment
Deploy three services:
1. `nuke-bot-api` — Web Service, root directory `backend`, build `npm install`, start `npm start`.
2. `nuke-bot-worker` — Background Worker, root directory `discord-bot`, build `pip install -r requirements.txt`, start `python bot.py`.
3. `nuke-bot-web` — Static Site, root directory `frontend`, build `npm install && npm run build`, publish `dist`.

Set environment variables from the relevant `.env.example` files in each Render service. Set `VITE_API_URL` to the public backend URL before building the Static Site. Use `render.yaml` as a reference; configure secrets in the Render dashboard, not in the YAML.

## 5. First login
The backend bootstrap script creates the admin account from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. Run it once after configuring MongoDB. Registration creates standard user accounts; only the seeded admin has admin privileges.

## Safety limits
`/testspam` is intentionally a controlled test, not a raid or mass-message tool:
- admin only
- configured test guild and channel only
- maximum 5 messages per run
- 10-minute cooldown
- fixed neutral test message
- stop command cancels an active run
Do not point this at public servers or channels. The feature is for a private test server you own/control.

## Capstone notes
This is a functional starter foundation, not a finished production security audit. Before public deployment add HTTPS/custom domain, rate limiting at the edge, audit retention policy, backups, monitoring, and review of Discord permissions and platform policies.
