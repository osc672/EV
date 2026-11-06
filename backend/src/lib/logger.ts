import { isProd } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel = isProd ? 'info' : 'debug';

function write(level: LogLevel, message: string, meta?: LogMeta) {
  if (levelRank[level] < levelRank[minLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: LogMeta) => write('debug', msg, meta),
  info: (msg: string, meta?: LogMeta) => write('info', msg, meta),
  warn: (msg: string, meta?: LogMeta) => write('warn', msg, meta),
  error: (msg: string, meta?: LogMeta) => write('error', msg, meta),
};
