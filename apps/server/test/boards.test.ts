import { describe, expect, it } from 'vitest';
import { boardIdCandidates } from '../src/adapters/monday/boards.ts';

describe('boardIdCandidates', () => {
  it('finds ids in backticks, prose and board links, once each', () => {
    const job = 'Board: `2000000001`, group `topics`.';
    const identity =
      'Log each post in the Posts board (ID 2000000002). See https://acme.monday.com/boards/2000000003/views/1 and `2000000001`.';
    expect(boardIdCandidates(job, identity, undefined)).toEqual(['2000000001', '2000000002', '2000000003']);
  });

  it('ignores short numbers, Slack channel ids, column ids and parts of longer tokens', () => {
    const text = 'Run at 04:00 on 2026-10-12 in C04F04DBN48. Column numeric_mm6qmas8, version 1.2000000004, id 12345678901234.';
    expect(boardIdCandidates(text)).toEqual([]);
  });
});
