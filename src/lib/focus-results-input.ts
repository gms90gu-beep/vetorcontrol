import { z } from "zod";

export const focusResultInput = z.object({
  visitId: z.string().uuid(), status: z.enum(["positive", "negative", "inconclusive"]),
  positiveDepositIds: z.array(z.string().uuid()).max(100), reference: z.string().trim().min(2).max(200),
  analysisDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(2000),
  version: z.number().int().min(0), requestId: z.string().uuid(),
}).superRefine((data, ctx) => {
  if (data.status === "positive" && !data.positiveDepositIds.length) ctx.addIssue({ code: "custom", path: ["positiveDepositIds"], message: "Selecione os depósitos positivos" });
  if (data.status !== "positive" && data.positiveDepositIds.length) ctx.addIssue({ code: "custom", path: ["positiveDepositIds"], message: "Resultado não positivo não admite depósitos positivos" });
});
