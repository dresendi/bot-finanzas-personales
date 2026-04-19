import fs from "node:fs";

import { google } from "googleapis";

import { appConfig } from "../config.js";

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

export async function appendRows(rows) {
  if (!rows.length) {
    return { updates: { updatedRows: 0 } };
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: appConfig.googleSheetsRange,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows
    }
  });

  return response.data;
}
