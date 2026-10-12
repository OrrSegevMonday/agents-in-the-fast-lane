import { z } from 'zod';

export const ControlRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({
    action: z.literal('triggerTurn'),
    jobId: z.string().min(1).max(200).optional(),
    message: z.string().max(4000).optional(),
  }),
  z.object({
    action: z.literal('assignGoal'),
    jobId: z.string().min(1).max(200).optional(),
    text: z.string().min(1).max(20000),
  }),
]);

export type ControlRequest = z.infer<typeof ControlRequestSchema>;

export interface ControlResponse {
  ok: boolean;
  message: string;
  runRef?: string;
}
