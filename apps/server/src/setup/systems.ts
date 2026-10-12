import type { SetupSecret } from '@aj/shared';
import type { Config } from '../config.ts';

export interface SecretSlot extends Omit<SetupSecret, 'isSet'> {
  apply(cfg: Config, value: string): void;
}

/** The predefined systems. Only the key or token can be added or replaced. */
export const SECRETS: SecretSlot[] = [
  {
    key: 'MONDAY_API_TOKEN',
    system: 'monday',
    label: 'monday API token',
    hint: 'Personal API token. Also used for the monday MCP.',
    apply: (cfg, v) => (cfg.monday.token = v),
  },
  {
    key: 'SPHERA_SESSION_COOKIE',
    system: 'sphera',
    label: 'Sphera session cookie',
    hint: 'Optional. Only needed to edit owner-only prompts.',
    apply: (cfg, v) => (cfg.sphera.sessionCookie = v),
  },
  {
    key: 'GITHUB_TOKEN',
    system: 'github',
    label: 'GitHub token',
    hint: 'Read-only. Attributes repo activity to Sphera turns.',
    apply: (cfg, v) => (cfg.sphera.githubToken = v),
  },
];

export const isSecretSet = (key: string) => Boolean(process.env[key]);
