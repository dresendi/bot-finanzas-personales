import { createBot } from "../src/bot.js";

const bot = createBot();
const callback = bot.webhookCallback();

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, route: "telegram-webhook" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  return callback(req, res);
}
