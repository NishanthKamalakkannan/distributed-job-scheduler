import { WorkerService } from './WorkerService';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const worker = new WorkerService();

worker.start().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});

process.on('SIGINT', async () => {
  await worker.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.shutdown();
  process.exit(0);
});
