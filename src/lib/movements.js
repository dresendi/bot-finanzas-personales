const SHEET_HEADERS = [
  "Fecha",
  "Fuente",
  "Descripcion",
  "Monto",
  "Moneda",
  "Entrada",
  "Tipo",
  "Categoria"
];

function signedAmount(amount, movementType) {
  if (movementType === "income") {
    return amount;
  }

  if (movementType === "transfer") {
    return 0 - amount;
  }

  if (movementType === "expense") {
    return 0 - amount;
  }

  return 0 - amount;
}

function formatDateTime(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function translateSource(source) {
  if (source === "telegram_pdf") {
    return "Archivo";
  }

  if (source === "telegram_voice") {
    return "Voz";
  }

  if (source === "telegram_text") {
    return "Texto";
  }

  return "Desconocido";
}

function translateMovementType(movementType) {
  if (movementType === "expense") {
    return "Gasto";
  }

  if (movementType === "income") {
    return "Ingreso";
  }

  return "Desconocido";
}

function translatePaymentMethod(paymentMethod, description = "") {
  const normalizedDescription = description.trim().toLowerCase();

  if (normalizedDescription === "pago recibido") {
    return "";
  }

  if (paymentMethod === "cash") {
    return "Efectivo";
  }

  if (["credit", "debit", "card"].includes(paymentMethod)) {
    return "Credito";
  }

  return "Desconocido";
}

function translateCategory(category) {
  if (!category) {
    return "Desconocido";
  }

  const normalizedCategory = category.trim().toLowerCase();

  const translations = {
    comida: "Comida",
    food: "Comida",
    viaje: "Viaje",
    travel: "Viaje",
    hogar: "Hogar",
    home: "Hogar",
    salud: "Salud",
    health: "Salud",
    entretenimiento: "Entretenimiento",
    entertainment: "Entretenimiento",
    ingresos: "Ingresos",
    income: "Ingresos",
    shopping: "Compras",
    compras: "Compras",
    utilities: "Servicios",
    services: "Servicios",
    "digital services": "Servicios digitales",
    transporte: "Transporte",
    transport: "Transporte",
    payment: "Pago",
    other: "Otros"
  };

  return translations[normalizedCategory] ?? category;
}

function buildSpreadsheetRow({
  timestamp,
  source,
  description,
  amount,
  currency,
  movementType,
  paymentMethod,
  category
}) {
  return [
    formatDateTime(timestamp),
    translateSource(source),
    description,
    amount,
    currency,
    translateMovementType(movementType),
    translatePaymentMethod(paymentMethod, description),
    translateCategory(category)
  ];
}

export function buildSingleMovementRow(movement, metadata) {
  return buildSpreadsheetRow({
    timestamp: new Date().toISOString(),
    source: metadata.source,
    description: movement.description,
    amount: signedAmount(movement.amount, movement.movementType),
    currency: movement.currency,
    movementType: movement.movementType,
    paymentMethod: movement.paymentMethod,
    category: movement.category
  });
}

export function buildPdfRows(statement, metadata) {
  const capturedAt = new Date().toISOString();

  return statement.transactions.map((transaction) =>
    buildSpreadsheetRow({
      timestamp: capturedAt,
      source: "telegram_pdf",
      description: transaction.description,
      amount: signedAmount(transaction.amount, transaction.movementType),
      currency: transaction.currency || statement.currency,
      movementType: transaction.movementType,
      paymentMethod: transaction.paymentMethod,
      category: transaction.category
    })
  );
}

export function summarizeRows(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row[3] || 0), 0);
  return {
    count: rows.length,
    total
  };
}

export function getSpreadsheetHeaders() {
  return [...SHEET_HEADERS];
}
