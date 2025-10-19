// src/server/helpers/logger.ts
import * as util from 'util';

type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';

const getActiveLevels = (): Set<LogLevel> => {
  const envValue = process.env.LOGGER_LEVEL;

  if (!envValue) {
    return new Set(['info', 'warn', 'error']);
  }

  const levels = envValue.split(',').map((level) => level.trim().toLowerCase());
  return new Set(levels as LogLevel[]);
};

const activeLevels = getActiveLevels();

const shouldLog = (level: LogLevel): boolean => {
  return activeLevels.has(level);
};

const logger = {
  log: (text: string | Date, ...arg: unknown[]) => {
    if (shouldLog('log')) {
      console.log(`${text}\n`, util.inspect(arg, false, null, true));
    }
  },
  error: (text: string | Date, ...arg: unknown[]) => {
    if (shouldLog('error')) {
      console.error(`${text}\n`, util.inspect(arg, false, null, true));
    }
  },
  info: (text: string | Date, ...arg: unknown[]) => {
    if (shouldLog('info')) {
      console.info(`${text}\n`, util.inspect(arg, false, null, true));
    }
  },
  debug: (text: string | Date, ...arg: unknown[]) => {
    if (shouldLog('debug')) {
      console.debug(`${text}\n`, util.inspect(arg, false, null, true));
    }
  },
  warn: (text: string, ...arg: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(`${text}\n`, util.inspect(arg, false, null, true));
    }
  },
  levels: (() => [...activeLevels])(),
};

export default logger;
