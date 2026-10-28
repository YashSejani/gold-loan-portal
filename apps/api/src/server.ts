import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
createApp().listen(config.port, (error?: Error) => {
  if (error) {
    logger.fatal({ err: error }, `API could not start on port ${config.port}`);
    process.exit(1);
  }
  logger.info(`API listening on http://localhost:${config.port}`);
});
