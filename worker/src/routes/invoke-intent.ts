import { z } from "zod";

export const IntentActionSchema = z.object({
  kind: z.enum(["comment", "transition", "assign", "noop"]),
  issueId: z.string().optional(),
  issueIdentifier: z.string().optional(),
  body: z.string().optional(),
  stateName: z.string().optional(),
  assigneeId: z.string().optional(),
  reason: z.string().optional(),
});

export const OpenClawIntentSchema = z.object({
  actions: z.array(IntentActionSchema).min(1),
});

export type OpenClawIntent = z.infer<typeof OpenClawIntentSchema>;
