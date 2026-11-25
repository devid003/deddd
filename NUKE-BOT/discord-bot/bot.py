import os
import time
import asyncio
import logging
import json

import discord
from discord.ext import commands, tasks
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nuke-bot")

TOKEN = os.getenv("DISCORD_TOKEN")
API = os.getenv("API_BASE_URL", "").rstrip("/")
SECRET = os.getenv("WORKER_SECRET")
PORT = int(os.getenv("PORT", "10000"))

TEST_GUILD_ID = int(os.getenv("TEST_GUILD_ID", "0"))
TEST_CHANNEL_ID = int(os.getenv("TEST_CHANNEL_ID", "0"))

HEADERS = {"X-Worker-Secret": SECRET or ""}

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)

active_test = None
last_test_at = 0


def api_get(path):
    return requests.get(f"{API}{path}", headers=HEADERS, timeout=15)


def api_post(path, data):
    return requests.post(
        f"{API}{path}", headers=HEADERS, json=data, timeout=15
    )


async def report_result(item, status, result):
    try:
        await asyncio.to_thread(
            api_post,
            f"/internal/commands/{item['_id']}/result",
            {"status": status, "result": result},
        )
    except Exception:
        log.exception("Could not report command result")


async def run_simulation(item, channel, count):
    global active_test

    try:
        for index in range(count):
            await channel.send(
                f"[NUKE BOT TEST {index + 1}/{count}] "
                "Controlled capstone message simulation."
            )
            await asyncio.sleep(3)

        await report_result(
            item, "completed",
            f"Completed {count} controlled test messages."
        )

    except asyncio.CancelledError:
        await report_result(
            item, "cancelled", "Test simulation cancelled."
        )
        raise

    except Exception as exc:
        log.exception("Test simulation failed")
        await report_result(item, "failed", str(exc)[:400])

    finally:
        active_test = None


async def execute_command(item):
    global active_test, last_test_at

    name = item.get("name")

    try:
        if name == "ping":
            result = f"Bot latency: {round(bot.latency * 1000)} ms"

        elif name == "status":
            result = f"Online as {bot.user}"

        elif name == "serverinfo":
            guild = bot.get_guild(TEST_GUILD_ID)
            result = (
                f"Test server: {guild.name} ({guild.member_count} members)"
                if guild else
                "Configured test server is not available."
            )

        elif name == "stop":
            if active_test and not active_test.done():
                active_test.cancel()
                result = "Active test simulation stopped."
            else:
                result = "No active test simulation."

        elif name == "testspam":
            if not TEST_GUILD_ID or not TEST_CHANNEL_ID:
                raise ValueError("Set TEST_GUILD_ID and TEST_CHANNEL_ID first.")

            if time.time() - last_test_at < 600:
                raise ValueError("Test simulation is on a 10-minute cooldown.")

            if active_test and not active_test.done():
                raise ValueError("A test simulation is already running.")

            channel = bot.get_channel(TEST_CHANNEL_ID)
            guild = bot.get_guild(TEST_GUILD_ID)

            if (
                not channel or not guild
                or channel.guild.id != TEST_GUILD_ID
            ):
                raise ValueError(
                    "Configured test channel must belong to "
                    "the configured private test server."
                )

            count = min(
                5, max(1, int(item.get("payload", {}).get("count", 3)))
            )

            last_test_at = time.time()
            active_test = asyncio.create_task(
                run_simulation(item, channel, count)
            )
            return

        else:
            raise ValueError("Unsupported command.")

        await report_result(item, "completed", result)

    except Exception as exc:
        log.exception("Command execution failed")
        await report_result(item, "failed", str(exc)[:400])


@tasks.loop(seconds=3)
async def poll_commands():
    if not API or not SECRET:
        return

    try:
        response = await asyncio.to_thread(
            api_get, "/internal/commands/next"
        )
        response.raise_for_status()
        item = response.json()

        if item:
            await execute_command(item)

    except Exception:
        log.exception("Command polling failed")


@poll_commands.before_loop
async def before_poll():
    await bot.wait_until_ready()


@bot.event
async def on_ready():
    log.info("Connected as %s", bot.user)

    if not poll_commands.is_running():
        poll_commands.start()


async def health_handler(reader, writer):
    try:
        request_line = await asyncio.wait_for(reader.readline(), timeout=5)

        while True:
            header = await asyncio.wait_for(reader.readline(), timeout=5)
            if header in (b"\r\n", b"\n", b""):
                break

        body = json.dumps({
            "ok": True,
            "service": "nuke-bot-worker",
            "discord_connected": bot.is_ready()
        }).encode()

        response = (
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            + f"Content-Length: {len(body)}\r\n".encode()
            + b"Connection: close\r\n\r\n"
            + body
        )

        writer.write(response)
        await writer.drain()

    except Exception:
        log.exception("Health request failed")

    finally:
        writer.close()
        await writer.wait_closed()


async def main():
    if not TOKEN or not API or not SECRET:
        raise RuntimeError(
            "Configure DISCORD_TOKEN, API_BASE_URL and WORKER_SECRET."
        )

    server = await asyncio.start_server(
        health_handler, "0.0.0.0", PORT
    )

    log.info("Health server listening on port %s", PORT)

    async with server:
        await asyncio.gather(
            bot.start(TOKEN),
            server.serve_forever()
        )


if __name__ == "__main__":
    asyncio.run(main())
