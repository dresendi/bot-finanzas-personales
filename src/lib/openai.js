import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { toFile } from "openai/uploads";

import { appConfig } from "../config.js";
import { bankStatementSchema, singleMovementSchema } from "../schemas.js";

const client = new OpenAI({
  apiKey: appConfig.openAiApiKey,
  maxRetries: 2,
  timeout: 120000
});

function isRetryableNetworkError(error) {
  const code = error?.cause?.code ?? error?.code;
  return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code);
}

function formatOpenAiError(error) {
  const code = error?.cause?.code ?? error?.code ?? "unknown";
  const type = error?.type ?? "unknown";
  const status = error?.status ?? "sin_status";
  const message = error?.message ?? "Error desconocido";
  return `${message} | tipo=${type} status=${status} code=${code}`;
}

async function withOpenAiRetry(operationName, action) {
  const attempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const shouldRetry = isRetryableNetworkError(error) && attempt < attempts;

      console.error(
        `[openai] ${operationName} fallo en intento ${attempt}/${attempts}: ${formatOpenAiError(error)}`
      );

      if (!shouldRetry) {
        break;
      }

      const backoffMs = 1000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

export function explainOpenAiError(error) {
  if (isRetryableNetworkError(error)) {
    return (
      "No pude conectarme a OpenAI por un problema de red temporal. " +
      `Detalle tecnico: ${formatOpenAiError(error)}`
    );
  }

  return `Error al llamar OpenAI. Detalle tecnico: ${formatOpenAiError(error)}`;
}

export async function transcribeAudio(filePath) {
  return withOpenAiRetry("audio.transcriptions.fetch", async () => {
    const audioBuffer = fs.readFileSync(filePath);
    const formData = new FormData();

    formData.append(
      "file",
      new Blob([audioBuffer], { type: "audio/ogg" }),
      path.basename(filePath)
    );
    formData.append("model", appConfig.openAiTranscriptionModel);
    formData.append("language", "es");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appConfig.openAiApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Transcripcion rechazada por OpenAI con status ${response.status}: ${responseText}`
      );
    }

    const data = await response.json();
    return data.text?.trim() ?? "";
  });
}

async function parseSingleMovement(inputLabel, inputText) {
  const response = await withOpenAiRetry(`responses.parse.${inputLabel}`, async () =>
    client.responses.parse({
      model: appConfig.openAiReasoningModel,
      input: [
        {
          role: "system",
          content:
            "Extrae un movimiento financiero personal a partir de texto libre. Devuelve datos estructurados en JSON. " +
            "Usa fechas ISO YYYY-MM-DD. Si no hay fecha explicita, devuelve null. " +
            "El monto debe ser positivo y el tipo de movimiento indica si luego se convertira a positivo o negativo. " +
            "Si el texto describe compra o gasto, movementType=expense. Si describe entrada de dinero, movementType=income. " +
            "Infiere una categoria util cuando sea posible, por ejemplo comida, transporte, hogar, salud, entretenimiento o ingresos. " +
            "Asume paymentMethod=cash cuando el texto no indique claramente tarjeta, transferencia, debito o credito."
        },
        {
          role: "user",
          content: inputText
        }
      ],
      text: {
        format: zodTextFormat(singleMovementSchema, "single_movement")
      }
    })
  );

  return singleMovementSchema.parse(response.output_parsed);
}

export async function parseVoiceMovement(transcript) {
  return parseSingleMovement("voice", `Transcripcion del usuario:\n${transcript}`);
}

export async function parseTextMovement(messageText) {
  return parseSingleMovement(
    "text",
    `Mensaje de texto del usuario:\n${messageText}\n\nInterpreta el movimiento aunque venga abreviado.`
  );
}

export async function extractTransactionsFromPdf(filePath, originalFileName) {
  const pdfBuffer = fs.readFileSync(filePath);
  const pdfFile = await toFile(pdfBuffer, originalFileName || path.basename(filePath));

  const uploadedFile = await withOpenAiRetry("files.create.pdf", async () =>
    client.files.create({
      file: pdfFile,
      purpose: "user_data"
    })
  );

  const response = await withOpenAiRetry("responses.parse.pdf", async () =>
    client.responses.parse({
      model: appConfig.openAiPdfModel,
      input: [
        {
          role: "system",
          content:
            "Extrae movimientos financieros de un estado de cuenta bancario en PDF. " +
            "Devuelve un JSON estricto. Usa fechas ISO YYYY-MM-DD cuando sea posible. " +
            "No inventes transacciones. El monto debe ir positivo y el campo movementType indica si es gasto, ingreso o transferencia."
        },
        {
          role: "user",
          content: [
            {
              type: "input_file",
              file_id: uploadedFile.id
            },
            {
              type: "input_text",
              text:
                `Archivo recibido: ${originalFileName}\n` +
                "Extrae el mayor numero posible de movimientos utiles para registrar en una hoja de finanzas personales."
            }
          ]
        }
      ],
      text: {
        format: zodTextFormat(bankStatementSchema, "bank_statement")
      }
    })
  );

  return bankStatementSchema.parse(response.output_parsed);
}
