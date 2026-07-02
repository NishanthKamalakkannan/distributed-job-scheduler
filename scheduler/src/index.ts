import { SchedulerService } from './SchedulerService';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const scheduler = new SchedulerService();
scheduler.start();

process.on('SIGINT', () => {
  scheduler.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  scheduler.shutdown();
  process.exit(0);
});
