import { z } from "zod";

export const movementTypeSchema = z.enum(["expense", "income", "transfer", "unknown"]);
export const paymentMethodSchema = z.enum(["cash", "card", "transfer", "debit", "credit", "unknown"]);

export const singleMovementSchema = z.object({
  description: z.string(),
  merchant: z.string().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().default("MXN"),
  movementType: movementTypeSchema,
  paymentMethod: paymentMethodSchema,
  transactionDate: z.string().nullable(),
  accountName: z.string().nullable(),
  category: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable()
});

export const bankStatementTransactionSchema = z.object({
  transactionDate: z.string().nullable(),
  postedDate: z.string().nullable(),
  description: z.string(),
  merchant: z.string().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().default("MXN"),
  movementType: movementTypeSchema,
  paymentMethod: paymentMethodSchema.default("unknown"),
  accountName: z.string().nullable(),
  category: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable()
});

export const bankStatementSchema = z.object({
  statementName: z.string().nullable(),
  statementPeriodStart: z.string().nullable(),
  statementPeriodEnd: z.string().nullable(),
  accountName: z.string().nullable(),
  currency: z.string().default("MXN"),
  transactions: z.array(bankStatementTransactionSchema)
});
