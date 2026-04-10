import { Telegraf } from "telegraf";

import { appConfig } from "./config.js";
import { appendRows } from "./lib/google-sheets.js";
import { buildPdfRows, buildSingleMovementRow, summarizeRows } from "./lib/movements.js";
import {
  explainOpenAiError,
  extractTransactionsFromPdf,
  parseTextMovement,
  parseVoiceMovement,
  transcribeAudio
} from "./lib/openai.js";
import { downloadTelegramFileBuffer } from "./lib/telegram.js";

function explainProcessingError(error) {
  const message = error?.message ?? "Error desconocido";

  if (message.includes("GOOGLE_SERVICE_ACCOUNT_JSON") || message.includes("client_email")) {
    return `Error de Google Sheets. ${message}`;
  }

  if (message.includes("No existe GOOGLE_SERVICE_ACCOUNT_FILE")) {
    return `Error de Google Sheets. ${message}`;
  }

  if (message.includes("Google Sheets API has not been used")) {
    return `Error de Google Sheets. ${message}`;
  }

  return explainOpenAiError(error);
}

function registerHandlers(bot) {
  bot.catch((error, ctx) => {
    console.error("Error no controlado en Telegraf:", {
      updateId: ctx?.update?.update_id,
      message: error?.message,
      stack: error?.stack
    });
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      "Hola. Puedes enviarme una nota de voz, un texto o un PDF.\n\n" +
        "Audio: registrare un movimiento individual.\n" +
        "Texto: interpretare el movimiento y lo registrare.\n" +
        "PDF: extraere movimientos de un estado de cuenta y los guardare en Google Sheets."
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      "Envia:\n" +
        "- una nota de voz o audio con descripcion de monto y concepto\n" +
        "- un mensaje de texto como 'Coca Cola, 25 pesos'\n" +
        "- un PDF con estado de cuenta\n\n" +
        "Si no indicas metodo de pago en texto o audio, asumire efectivo."
    );
  });

  bot.on(["voice", "audio"], async (ctx) => {
    try {
      const audio = ctx.message.voice ?? ctx.message.audio;
      const fileName =
        ctx.message.audio?.file_name ??
        `voice-${ctx.message.voice?.file_unique_id ?? Date.now()}.ogg`;
      const mimeType = ctx.message.audio?.mime_type ?? "audio/ogg";

      await ctx.reply("Procesando el audio y extrayendo el movimiento...");

      const audioBuffer = await downloadTelegramFileBuffer(bot, audio.file_id);
      const transcript = await transcribeAudio(audioBuffer, fileName, mimeType);

      if (!transcript) {
        throw new Error("La transcripcion llego vacia.");
      }

      const movement = await parseVoiceMovement(transcript);
      const row = buildSingleMovementRow(movement, {
        source: "telegram_voice",
        fileName,
        rawText: transcript
      });

      await appendRows([row]);

      await ctx.reply(
        "Movimiento guardado.\n" +
          `Concepto: ${movement.description}\n` +
          `Monto: ${movement.amount} ${movement.currency}\n` +
          `Tipo: ${movement.movementType}\n` +
          `Metodo: ${movement.paymentMethod}\n` +
          `Fecha: ${movement.transactionDate ?? "sin fecha explicita, use la actual"}\n` +
          `Spreadsheet: ${appConfig.googleSpreadsheetUrl}`
      );
    } catch (error) {
      console.error("Error procesando audio:", error);
      await ctx.reply(`No pude procesar ese audio. ${explainProcessingError(error)}`);
    }
  });

  bot.on("document", async (ctx) => {
    try {
      const document = ctx.message.document;
      const fileName = document.file_name ?? `document-${document.file_unique_id}.pdf`;
      const mimeType = document.mime_type ?? "application/octet-stream";

      if (mimeType !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
        await ctx.reply("Por ahora solo puedo procesar documentos PDF.");
        return;
      }

      await ctx.reply("Procesando el PDF. Esto puede tardar un poco...");

      const pdfBuffer = await downloadTelegramFileBuffer(bot, document.file_id);
      const statement = await extractTransactionsFromPdf(pdfBuffer, fileName);
      const rows = buildPdfRows(statement, { fileName });

      if (!rows.length) {
        await ctx.reply("No encontre movimientos claros en ese PDF.");
        return;
      }

      await appendRows(rows);

      const summary = summarizeRows(rows);
      await ctx.reply(
        "PDF procesado y movimientos guardados.\n" +
          `Filas agregadas: ${summary.count}\n` +
          `Suma firmada: ${summary.total}\n` +
          `Spreadsheet: ${appConfig.googleSpreadsheetUrl}`
      );
    } catch (error) {
      console.error("Error procesando PDF:", error);
      await ctx.reply(`No pude procesar ese PDF. ${explainProcessingError(error)}`);
    }
  });

  bot.on("text", async (ctx) => {
    try {
      const messageText = ctx.message.text?.trim();

      if (!messageText || messageText.startsWith("/")) {
        return;
      }

      await ctx.reply("Interpretando el texto y registrando el movimiento...");

      const movement = await parseTextMovement(messageText);
      const row = buildSingleMovementRow(movement, {
        source: "telegram_text",
        fileName: "manual-text",
        rawText: messageText
      });

      await appendRows([row]);

      await ctx.reply(
        "Movimiento guardado desde texto.\n" +
          `Concepto: ${movement.description}\n` +
          `Monto: ${movement.amount} ${movement.currency}\n` +
          `Tipo: ${movement.movementType}\n` +
          `Metodo: ${movement.paymentMethod}\n` +
          `Categoria: ${movement.category ?? "sin categoria"}\n` +
          `Fecha: ${movement.transactionDate ?? "sin fecha explicita, use la actual"}\n` +
          `Spreadsheet: ${appConfig.googleSpreadsheetUrl}`
      );
    } catch (error) {
      console.error("Error procesando texto:", error);
      await ctx.reply(`No pude procesar ese texto. ${explainProcessingError(error)}`);
    }
  });

  bot.on("message", async (ctx) => {
    const supportedTypes = ["voice", "audio", "document", "text"];
    const hasSupportedType = supportedTypes.some((type) => type in ctx.message);

    if (!hasSupportedType) {
      await ctx.reply("Enviame una nota de voz, un texto o un PDF.");
    }
  });
}

export function createBot() {
  const bot = new Telegraf(appConfig.telegramBotToken);
  registerHandlers(bot);
  return bot;
}
