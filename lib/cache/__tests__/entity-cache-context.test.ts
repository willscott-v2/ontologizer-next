import { describe, expect, it } from 'vitest';
import { hashEntity } from '../entity-cache';

describe('entity-cache context identity', () => {
  it('normalizes equivalent entity and topic spellings', () => {
    expect(hashEntity(' OpenAI ', ' AI   Platforms ')).toBe(
      hashEntity('openai', 'ai platforms'),
    );
  });

  it('does not reuse an entity match across unrelated page topics', () => {
    expect(hashEntity('Jordan', 'Basketball history')).not.toBe(
      hashEntity('Jordan', 'Middle East travel'),
    );
  });
});
