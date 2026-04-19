export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { createBot } = await import("../src/bot.js");
      const bot = createBot();

      res.status(200).json({
        ok: true,
        route: "telegram-webhook",
        botConfigured: Boolean(bot)
      });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const { createBot } = await import("../src/bot.js");
    const bot = createBot();
    const update = req.body;

    if (!update || typeof update !== "object") {
      res.status(400).json({
        ok: false,
        route: "telegram-webhook",
        error: "Request body vacio o invalido"
      });
      return;
    }

    await bot.handleUpdate(update, res);
  } catch (error) {
    console.error("Error inicializando telegram-webhook:", error);
    res.status(500).json({
      ok: false,
      route: "telegram-webhook",
      error: error?.message ?? "Error desconocido"
    });
  }
}
