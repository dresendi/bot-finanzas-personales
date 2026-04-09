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

function fallbackDate(dateValue) {
  if (dateValue) {
    return dateValue;
  }

  return new Date().toISOString().slice(0, 10);
}

export function buildSingleMovementRow(movement, metadata) {
  return [
    new Date().toISOString(),
    metadata.source,
    metadata.fileName,
    fallbackDate(movement.transactionDate),
    "",
    movement.description,
    movement.merchant ?? "",
    signedAmount(movement.amount, movement.movementType),
    movement.currency,
    movement.movementType,
    movement.paymentMethod,
    movement.accountName ?? "",
    movement.category ?? "",
    movement.confidence,
    metadata.rawText
  ];
}

export function buildPdfRows(statement, metadata) {
  return statement.transactions.map((transaction) => [
    new Date().toISOString(),
    "telegram_pdf",
    metadata.fileName,
    fallbackDate(transaction.transactionDate),
    transaction.postedDate ?? "",
    transaction.description,
    transaction.merchant ?? "",
    signedAmount(transaction.amount, transaction.movementType),
    transaction.currency || statement.currency,
    transaction.movementType,
    transaction.paymentMethod,
    transaction.accountName ?? statement.accountName ?? "",
    transaction.category ?? "",
    transaction.confidence,
    transaction.notes ?? statement.statementName ?? metadata.fileName
  ]);
}

export function summarizeRows(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row[7] || 0), 0);
  return {
    count: rows.length,
    total
  };
}
