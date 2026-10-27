import { randomUUID } from 'node:crypto';
import { maskMobile, maskMobilesInText } from '@goldloan/shared';
import { pino, type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from './config';

// Never log raw mobile numbers (CLAUDE.md §9.5):
// 1. structured mobileNumber fields are masked via redact;
// 2. every finished log line goes through maskMobilesInText, which also covers
//    error messages, stacks, URLs and chat text.
const MOBILE_PATHS = ['mobileNumber', '*.mobileNumber', '*.*.mobileNumber'];

interface LoggerOptions {
  level?: string;
  destination?: { write(line: string): unknown };
}

export function createLogger({ level = config.logLevel, destination = process.stdout }: LoggerOptions = {}): Logger {
  return pino(
    {
      level,
      redact: {
        paths: MOBILE_PATHS,
        censor: (value) => (typeof value === 'string' ? maskMobile(value) : '[Redacted]'),
      },
    },
    { write: (line: string) => destination.write(maskMobilesInText(line)) },
  );
}

export const logger = createLogger();

const REQUEST_ID = /^[\w-]{1,64}$/;

export function createHttpLogger(baseLogger: Logger) {
  return pinoHttp({
    logger: baseLogger,
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Only what we need: no headers (cookies, auth) and no bodies.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}
