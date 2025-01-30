import * as bunyan from "bunyan";
import { loggerName, logLevel } from "./variables";

export const logger = bunyan.createLogger({
  name: loggerName,
  /** serializers will come from loggingMiddleware */
  // serializers: bunyan.stdSerializers,
  streams: [
    {
      type: "stream",
      stream: process.stdout,
      level: <bunyan.LogLevel>logLevel,
    },
  ],
});
