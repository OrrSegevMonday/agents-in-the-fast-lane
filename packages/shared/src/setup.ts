import { z } from 'zod';
import type { AgentPlatform, AgentStatus } from './domain.ts';

/** Secret slots are predefined server-side; only their presence is ever sent to the UI. */
export interface SetupSecret {
  key: string;
  system: 'monday' | 'sphera' | 'github';
  label: string;
  hint: string;
  isSet: boolean;
}

export interface SetupAgent {
  id: string;
  platform: AgentPlatform;
  name: string;
  url: string;
  enabled: boolean;
  status?: AgentStatus;
  syncError?: string;
}

export interface SetupState {
  /** No secrets and no agents yet: show the welcome flow. */
  firstRun: boolean;
  secrets: SetupSecret[];
  agents: SetupAgent[];
}

export const SaveSecretSchema = z.object({ value: z.string().min(1).max(4096) });
export const AddAgentSchema = z.object({ url: z.string().trim().url().max(2000) });
export const PatchAgentSchema = z.object({ enabled: z.boolean() });
