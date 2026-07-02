import { app } from './app';
import { config } from './config';
import { logger } from './logger';

const server = app.listen(config.port, () => {
  logger.info(`API Server running on port ${config.port}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});
