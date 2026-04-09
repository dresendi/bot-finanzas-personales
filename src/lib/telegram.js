import fs from "node:fs/promises";
import path from "node:path";

import { appConfig } from "../config.js";

export async function ensureTempDir() {
  await fs.mkdir(appConfig.tempDir, { recursive: true });
}

function guessExtension(fileName, mimeType) {
  const originalExtension = fileName ? path.extname(fileName) : "";
  if (originalExtension) {
    return originalExtension;
  }

  if (mimeType === "audio/ogg") {
    return ".ogg";
  }

  if (mimeType === "audio/mpeg") {
    return ".mp3";
  }

  if (mimeType === "application/pdf") {
    return ".pdf";
  }

  return ".bin";
}

export async function downloadTelegramFile(bot, fileId, options = {}) {
  const { fileName, mimeType } = options;
  const fileUrl = await bot.telegram.getFileLink(fileId);
  const response = await fetch(fileUrl.toString());

  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo desde Telegram: ${response.status}`);
  }

  const extension = guessExtension(fileName, mimeType);
  const tempFilePath = path.join(
    appConfig.tempDir,
    `${Date.now()}-${fileId.replace(/[^a-zA-Z0-9_-]/g, "")}${extension}`
  );

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));

  return tempFilePath;
}

export async function removeTempFile(filePath) {
  if (!filePath) {
    return;
  }

  await fs.rm(filePath, { force: true });
}
