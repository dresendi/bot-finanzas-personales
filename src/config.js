import path from "node:path";
import fs from "node:fs";
import { config as loadEnv } from "dotenv";

const envPath = path.join(process.cwd(), ".env");
const envFileExists = fs.existsSync(envPath);

loadEnv({ path: envPath });

function readRequired(name) {
  const value = process.env[name];
  if (!value) {
    const envHint = envFileExists
      ? `Revisa el valor de ${name} en ${envPath}.`
      : `No existe ${envPath}. Crea ese archivo copiando .env.example y completa tus credenciales.`;

    throw new Error(`Falta la variable de entorno requerida: ${name}. ${envHint}`);
  }

  return value;
}

function readOptional(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

function normalizeMode(value) {
  return value === "webhook" ? "webhook" : "polling";
}

export const appConfig = {
  nodeEnv: readOptional("NODE_ENV", "development"),
  port: Number(readOptional("PORT", "3000")),
  telegramMode: normalizeMode(readOptional("TELEGRAM_MODE", "polling")),
  telegramBotToken: readRequired("TELEGRAM_BOT_TOKEN"),
  telegramWebhookDomain: readOptional("TELEGRAM_WEBHOOK_DOMAIN"),
  telegramWebhookPath: readOptional("TELEGRAM_WEBHOOK_PATH", "/telegram/webhook"),
  openAiApiKey: readRequired("OPENAI_API_KEY"),
  openAiTranscriptionModel: readOptional("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
  openAiReasoningModel: readOptional("OPENAI_REASONING_MODEL", "gpt-4.1-mini"),
  openAiPdfModel: readOptional("OPENAI_PDF_MODEL", "gpt-4.1-mini"),
  googleSpreadsheetId: readRequired("GOOGLE_SPREADSHEET_ID"),
  googleSheetsRange: readOptional("GOOGLE_SHEETS_RANGE", "Movimientos!A:O"),
  googleSpreadsheetUrl: readOptional(
    "GOOGLE_SPREADSHEET_URL",
    "https://docs.google.com/spreadsheets/d/17DnEqx8vKgM5p9Xn-eH0BPEzh0FTUvYCidnBwof5wWE/edit?gid=0#gid=0"
  ),
  googleServiceAccountJson: readOptional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  googleServiceAccountFile: readOptional("GOOGLE_SERVICE_ACCOUNT_FILE"),
  tempDir: path.join(process.cwd(), ".tmp")
};

if (!appConfig.googleServiceAccountJson && !appConfig.googleServiceAccountFile) {
  throw new Error(
    "Debes definir GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_FILE para Google Sheets."
  );
}

if (appConfig.telegramMode === "webhook" && !appConfig.telegramWebhookDomain) {
  throw new Error("TELEGRAM_WEBHOOK_DOMAIN es requerido cuando TELEGRAM_MODE=webhook.");
}
