import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { errorHandler } from './middlewares/errorHandler';

// Import routers
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { queuesRouter } from './routes/queues';
import { jobsRouter } from './routes/jobs';
import { deadLetterRouter } from './routes/dead-letter';
import { workersRouter } from './routes/workers';

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  pinoHttp({
    logger,
    autoLogging: false, // You can enable this for full request logging
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/projects', projectsRouter);
app.use('/queues', queuesRouter);
app.use('/jobs', jobsRouter);
app.use('/dead-letter-jobs', deadLetterRouter);
app.use('/workers', workersRouter);

app.use(errorHandler);

export { app };
