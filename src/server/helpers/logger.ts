// src/server/helpers/logger.ts
import * as util from 'util';

const logger = {
  log: (text: string, data?: unknown) => {
    console.log(`${text}\n`, util.inspect(data, false, null, true));
  },
  error: (text: string, data?: unknown) => {
    console.error(`${text}\n`, util.inspect(data, false, null, true));
  },
  info: (text: string, data?: unknown) => {
    console.info(`${text}\n`, util.inspect(data, false, null, true));
  },
  debug: (text: string, data?: unknown, forceDevFlag: boolean = process.env.NODE_ENV === 'development') => {
    if (forceDevFlag) {
      console.debug(`${text}\n`, util.inspect(data, false, null, true));
    }
  },
  warn: (text: string, data?: unknown) => {
    console.warn(`${text}\n`, util.inspect(data, false, null, true));
  },
};

export default logger;
