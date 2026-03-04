import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';

import { parseOrThrow, toValidationIssueSummaries } from './validation.js';

describe('validation utilities', () => {
  it('parseOrThrow returns parsed value on success', () => {
    const Schema = z.object({ n: z.number().int().min(1) });
    const out = parseOrThrow(Schema, { n: 2 });
    expect(out).toEqual({ n: 2 });
  });

  it('toValidationIssueSummaries produces safe, value-free issue details', () => {
    const Schema = z.object({
      name: z.string().min(3),
      age: z.number().int().min(18),
    });

    try {
      parseOrThrow(Schema, { name: 'x', age: 1 });
      throw new Error('expected parseOrThrow to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      if (!(e instanceof ZodError)) throw e;
      const summaries = toValidationIssueSummaries(e);
      expect(summaries.length).toBeGreaterThan(0);
      expect(
        summaries.every((s) => typeof s.path === 'string' && typeof s.message === 'string'),
      ).toBe(true);

      // No values should be included.
      const joined = JSON.stringify(summaries);
      expect(joined).not.toContain('"x"');
    }
  });
});
