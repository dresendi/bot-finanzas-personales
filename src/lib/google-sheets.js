import fs from "node:fs";

import { google } from "googleapis";

import { appConfig } from "../config.js";
import { getSpreadsheetHeaders } from "./movements.js";

function buildAuth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];

  if (appConfig.googleServiceAccountJson) {
    let credentials;

    try {
      credentials = JSON.parse(appConfig.googleServiceAccountJson);
    } catch (error) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON no contiene un JSON valido. " +
          "Si lo pegaste en .env, debe ir completo en una sola linea."
      );
    }

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON esta incompleto. Debe incluir al menos client_email y private_key. " +
          "Usa el archivo JSON completo descargado desde Google Cloud."
      );
    }

    return new google.auth.GoogleAuth({
      credentials,
      scopes
    });
  }

  if (appConfig.googleServiceAccountFile) {
    if (!fs.existsSync(appConfig.googleServiceAccountFile)) {
      throw new Error(`No existe GOOGLE_SERVICE_ACCOUNT_FILE: ${appConfig.googleServiceAccountFile}`);
    }

    return new google.auth.GoogleAuth({
      keyFile: appConfig.googleServiceAccountFile,
      scopes
    });
  }

  throw new Error("No se encontraron credenciales validas para Google Sheets.");
}

let auth;

function getAuth() {
  if (!auth) {
    auth = buildAuth();
  }

  return auth;
}

function parseRange(range) {
  const [sheetName, columns = "A:H"] = range.split("!");
  const [startColumn, endColumn] = columns.split(":");

  if (!sheetName || !startColumn || !endColumn) {
    throw new Error(
      `GOOGLE_SHEETS_RANGE invalido: ${range}. Usa un formato como Movimientos!A:O`
    );
  }

  return {
    sheetName,
    startColumn,
    endColumn
  };
}

export async function appendRows(rows) {
  if (!rows.length) {
    return { updates: { updatedRows: 0 } };
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const parsedRange = parseRange(appConfig.googleSheetsRange);
  const headers = getSpreadsheetHeaders();

  const existingRowsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: `${parsedRange.sheetName}!${parsedRange.startColumn}:${parsedRange.startColumn}`
  });

  const existingRows = existingRowsResponse.data.values ?? [];
  let nextRowNumber = existingRows.length + 1;

  if (existingRows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: appConfig.googleSpreadsheetId,
      range: `${parsedRange.sheetName}!${parsedRange.startColumn}1:${parsedRange.endColumn}1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers]
      }
    });

    nextRowNumber = 2;
  }

  const targetRange =
    `${parsedRange.sheetName}!${parsedRange.startColumn}${nextRowNumber}:` +
    `${parsedRange.endColumn}${nextRowNumber + rows.length - 1}`;

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: targetRange,
    valueInputOption: "RAW",
    requestBody: {
      values: rows
    }
  });

  return response.data;
}
