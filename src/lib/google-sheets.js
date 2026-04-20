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

async function getSheetMetadata(sheets, sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: appConfig.googleSpreadsheetId,
    fields: "sheets(properties(sheetId,title),charts(chartId,position))"
  });

  const sheet = spreadsheet.data.sheets?.find(
    (item) => item.properties?.title === sheetName
  );

  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`No encontre la hoja '${sheetName}' en el spreadsheet.`);
  }

  return {
    sheetId: sheet.properties.sheetId,
    charts: sheet.charts ?? []
  };
}

async function ensureSheetExists(sheets, sheetName) {
  try {
    return await getSheetMetadata(sheets, sheetName);
  } catch (error) {
    if (!String(error?.message ?? "").includes("No encontre la hoja")) {
      throw error;
    }
  }

  const addSheetResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: appConfig.googleSpreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
              index: 1
            }
          }
        }
      ]
    }
  });

  const addedSheet = addSheetResponse.data.replies?.[0]?.addSheet?.properties;

  if (!addedSheet?.sheetId && addedSheet?.sheetId !== 0) {
    throw new Error(`No pude crear la hoja '${sheetName}'.`);
  }

  return {
    sheetId: addedSheet.sheetId,
    charts: []
  };
}

function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildDashboardSummaries(rows) {
  const entryTotals = new Map([
    ["Gasto", 0],
    ["Ingreso", 0]
  ]);
  const categoryTotals = new Map();

  for (const row of rows) {
    const entry = row[5] ?? "";
    const amount = Math.abs(toNumber(row[3]));
    const category = row[7] ?? "Desconocido";

    if (entry === "Gasto") {
      entryTotals.set("Gasto", (entryTotals.get("Gasto") ?? 0) + amount);
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
    } else if (entry === "Ingreso") {
      entryTotals.set("Ingreso", (entryTotals.get("Ingreso") ?? 0) + amount);
    }
  }

  return {
    entryRows: [
      ["Entrada", "Monto"],
      ["Gasto", entryTotals.get("Gasto") ?? 0],
      ["Ingreso", entryTotals.get("Ingreso") ?? 0]
    ],
    categoryRows: [
      ["Categoria", "Monto"],
      ...([...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([category, total]) => [
        category,
        total
      ]))
    ]
  };
}

function buildPieChartSpec({ title, sheetId, domainColumnIndex, seriesColumnIndex, endRowIndex }) {
  return {
    title,
    pieChart: {
      legendPosition: "LABELED_LEGEND",
      pieHole: 0.35,
      domain: {
        sourceRange: {
          sources: [
            {
              sheetId,
              startRowIndex: 0,
              endRowIndex,
              startColumnIndex: domainColumnIndex,
              endColumnIndex: domainColumnIndex + 1
            }
          ]
        }
      },
      series: {
        sourceRange: {
          sources: [
            {
              sheetId,
              startRowIndex: 0,
              endRowIndex,
              startColumnIndex: seriesColumnIndex,
              endColumnIndex: seriesColumnIndex + 1
            }
          ]
        }
      }
    }
  };
}

async function syncDashboard(sheets, sourceSheetName) {
  const dashboardSheetName = "Dashboard";
  const dashboardSheet = await ensureSheetExists(sheets, dashboardSheetName);

  const sourceRowsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: `${sourceSheetName}!A:H`
  });

  const allRows = sourceRowsResponse.data.values ?? [];
  const dataRows = allRows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  const summaries = buildDashboardSummaries(dataRows);

  const categoryRows =
    summaries.categoryRows.length > 1 ? summaries.categoryRows : [["Categoria", "Monto"], ["Sin datos", 0]];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: `${dashboardSheetName}!J1:N200`
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: `${dashboardSheetName}!J1:K${summaries.entryRows.length}`,
    valueInputOption: "RAW",
    requestBody: {
      values: summaries.entryRows
    }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: appConfig.googleSpreadsheetId,
    range: `${dashboardSheetName}!M1:N${categoryRows.length}`,
    valueInputOption: "RAW",
    requestBody: {
      values: categoryRows
    }
  });

  await ensureSheetFormatting(sheets, dashboardSheetName);

  const chartRequests = [];

  for (const chart of dashboardSheet.charts ?? []) {
    if (chart.chartId || chart.chartId === 0) {
      chartRequests.push({
        deleteEmbeddedObject: {
          objectId: chart.chartId
        }
      });
    }
  }

  chartRequests.push(
    {
      addChart: {
        chart: {
          spec: buildPieChartSpec({
            title: "Ingresos vs Gastos",
            sheetId: dashboardSheet.sheetId,
            domainColumnIndex: 9,
            seriesColumnIndex: 10,
            endRowIndex: summaries.entryRows.length
          }),
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: dashboardSheet.sheetId,
                rowIndex: 0,
                columnIndex: 0
              },
              offsetXPixels: 20,
              offsetYPixels: 20,
              widthPixels: 520,
              heightPixels: 320
            }
          }
        }
      }
    },
    {
      addChart: {
        chart: {
          spec: buildPieChartSpec({
            title: "Gastos por Categoria",
            sheetId: dashboardSheet.sheetId,
            domainColumnIndex: 12,
            seriesColumnIndex: 13,
            endRowIndex: categoryRows.length
          }),
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: dashboardSheet.sheetId,
                rowIndex: 18,
                columnIndex: 0
              },
              offsetXPixels: 20,
              offsetYPixels: 20,
              widthPixels: 520,
              heightPixels: 320
            }
          }
        }
      }
    }
  );

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: appConfig.googleSpreadsheetId,
    requestBody: {
      requests: chartRequests
    }
  });
}

async function ensureSheetFormatting(sheets, sheetName) {
  const { sheetId } = await getSheetMetadata(sheets, sheetName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: appConfig.googleSpreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: "TEXT"
                }
              }
            },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startColumnIndex: 1,
              endColumnIndex: 3
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: "TEXT"
                }
              }
            },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startColumnIndex: 3,
              endColumnIndex: 4
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: "NUMBER",
                  pattern: "#,##0.##"
                }
              }
            },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startColumnIndex: 4,
              endColumnIndex: 8
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: "TEXT"
                }
              }
            },
            fields: "userEnteredFormat.numberFormat"
          }
        }
      ]
    }
  });
}

export async function appendRows(rows) {
  if (!rows.length) {
    return { updates: { updatedRows: 0 } };
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const parsedRange = parseRange(appConfig.googleSheetsRange);
  const headers = getSpreadsheetHeaders();

  await ensureSheetFormatting(sheets, parsedRange.sheetName);

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

  await syncDashboard(sheets, parsedRange.sheetName);

  return response.data;
}
