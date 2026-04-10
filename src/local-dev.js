import { appConfig } from "./config.js";
import http from "node:http";

import { createBot } from "./bot.js";

const bot = createBot();

async function startPolling() {
  await bot.launch();
  console.log("Bot iniciado en modo polling.");
}

async function startWebhook() {
  const webhookCallback = bot.webhookCallback();

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === appConfig.telegramWebhookPath) {
      webhookCallback(req, res);
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  await new Promise((resolve) => {
    server.listen(appConfig.port, resolve);
  });

  const webhookUrl = `${appConfig.telegramWebhookDomain}${appConfig.telegramWebhookPath}`;
  await bot.telegram.setWebhook(webhookUrl);
  console.log(`Bot iniciado en modo webhook en ${webhookUrl}`);
}

if (appConfig.telegramMode === "webhook") {
  await startWebhook();
} else {
  await startPolling();
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
