// Core game model. Agents are players, locations are buildings on the board,
// a turn is one cycle run of an agent, and actions are what it did inside a turn.

export const PLATFORMS = ['sphera', 'monday', 'claude', 'cursor'] as const;
export type AgentPlatform = (typeof PLATFORMS)[number];

export type AgentStatus = 'running' | 'idle' | 'paused' | 'failed' | 'unknown';

export interface Capabilities {
  pause: boolean;
  resume: boolean;
  assignGoal: boolean;
  triggerTurn: boolean;
  /** Run Turn / Assign Goal target a specific job (monday). */
  perJob: boolean;
}

export interface AgentJob {
  id: string;
  name: string;
  enabled: boolean;
  /** Current instructions, so Assign Goal can start from them instead of a blank page. */
  instructions?: string;
}

export interface Agent {
  /** Globally unique: `${platform}:${nativeId}` */
  id: string;
  platform: AgentPlatform;
  nativeId: string;
  name: string;
  role?: string;
  avatarUrl?: string;
  status: AgentStatus;
  goal?: string;
  jobs?: AgentJob[];
  capabilities: Capabilities;
  goals: Meters;
  /** Where the agent lives in the source system, for deep links. */
  url?: string;
  /** Set when the adapter could not reach its source on the last sync. */
  syncError?: string;
}

export type LocationKind = 'repo' | 'board' | 'tool' | 'service' | 'brain';

export interface Location {
  /** `${kind}:${ref}` */
  id: string;
  kind: LocationKind;
  name: string;
  ref: string;
  url?: string;
  /** Ring slot index 0..BOARD_SLOTS-1, or null when the ring is full (shown in the annex). */
  slot: number | null;
}

export type ArtifactKind = 'pr' | 'commit' | 'item' | 'doc' | 'message' | 'other';

export interface Artifact {
  kind: ArtifactKind;
  title: string;
  url?: string;
}

export type ActionKind = 'read' | 'write' | 'create' | 'update' | 'comment' | 'run' | 'query' | 'message';

export interface AgentAction {
  id: string;
  turnId: string;
  locationId: string;
  kind: ActionKind;
  summary: string;
  startedAt: string;
  durationMs: number;
  /** USD, or platform credits converted by the adapter. */
  cost: number;
  success: boolean;
  /** Context reads served by the Team Brain during this action. */
  brainReads: number;
  artifacts: Artifact[];
  /** Not observed directly; derived from context such as the job's instructions. */
  inferred?: boolean;
}

export type TurnStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface Turn {
  /** `${agentId}:${sourceRunId}` */
  id: string;
  agentId: string;
  index: number;
  startedAt: string;
  endedAt?: string;
  status: TurnStatus;
  /** What started the turn: schedule, manual, api, ui, inferred... */
  trigger: string;
  jobName?: string;
  /** How the turn was reconstructed, shown to the user so they know how much to trust it. */
  source: 'native' | 'tool-events' | 'activity-log' | 'github' | 'mock';
  actions: AgentAction[];
}

export interface Meters {
  /** Total spend, USD. Wealth. */
  cost: number;
  /** % of turns that succeeded. Happiness. */
  success: number;
  /** Team-brain reads. Education. */
  knowledge: number;
  /** Artifacts shipped. Career. */
  output: number;
}

export interface BrainStatus {
  connected: boolean;
  url?: string;
  message: string;
}

export interface GameState {
  agents: Agent[];
  locations: Location[];
  turns: Turn[];
  brain: BrainStatus;
}

export type StreamEvent =
  | { type: 'agent'; agent: Agent }
  | { type: 'location'; location: Location }
  | { type: 'turn'; turn: Turn }
  | { type: 'brain'; brain: BrainStatus };

export const BOARD_SLOTS = 16;
export const BRAIN_LOCATION_ID = 'brain:team-brain';

export const agentId = (platform: AgentPlatform, nativeId: string) => `${platform}:${nativeId}`;
export const locationId = (kind: LocationKind, ref: string) => `${kind}:${ref}`;
