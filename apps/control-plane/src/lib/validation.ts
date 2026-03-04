import { SpanStatusCode, trace } from '@opentelemetry/api';
import { ZodError, type ZodType } from 'zod';

import { pickRunwayctrlAttributes } from '../otel/attributes.js';

const tracer = trace.getTracer('runwayctrl.control-plane');

export type ZodIssueSummary = {
  path: string;
  message: string;
};

const clamp = (s: string, maxLen: number): string => {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
};

export const toValidationIssueSummaries = (err: ZodError): ZodIssueSummary[] => {
  return err.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return {
      path: clamp(path, 128),
      message: clamp(issue.message, 256),
    };
  });
};

export const parseOrThrow = <T>(
  schema: ZodType<T>,
  input: unknown,
  opts?: {
    // Optional RunwayCtrl contract attributes (allowlisted) to attach to the validate span.
    spanAttributes?: Record<string, unknown>;
  },
): T => {
  return tracer.startActiveSpan(
    'runwayctrl.validate.request',
    { attributes: pickRunwayctrlAttributes(opts?.spanAttributes) },
    (span) => {
      try {
        const out = schema.parse(input);
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
      } catch (e) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (e instanceof Error) span.recordException(e);
        throw e;
      } finally {
        span.end();
      }
    },
  );
};
