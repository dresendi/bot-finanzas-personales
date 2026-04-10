export async function downloadTelegramFileBuffer(bot, fileId) {
  const fileUrl = await bot.telegram.getFileLink(fileId);
  const response = await fetch(fileUrl.toString());

  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo desde Telegram: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
