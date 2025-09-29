// src/server/helpers/logger.ts
import * as util from 'util';

const logger = {
  log: (text: string | Date, ...arg: any[]) => {
    console.log(`${text}\n`, util.inspect(arg, false, null, true));
  },
  error: (text: string | Date, ...arg: any[]) => {
    console.error(`${text}\n`, util.inspect(arg, false, null, true));
  },
  info: (text: string | Date, ...arg: any[]) => {
    console.info(`${text}\n`, util.inspect(arg, false, null, true));
  },
  debug: (text: string | Date, ...arg: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`${text}\n`, util.inspect(arg, false, null, true));
    }
  },
  warn: (text: string, ...arg: any[]) => {
    console.warn(`${text}\n`, util.inspect(arg, false, null, true));
  },
};

export default logger;
