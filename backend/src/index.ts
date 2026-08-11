import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import challansRouter from './routes/challans';
import customersRouter from './routes/customers';
import productsRouter from './routes/products';

const app = express();

const PORT = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';

/* --- global middleware ------------------------------------------------ */

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? '*',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

/* --- routes ----------------------------------------------------------- */

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Public.
app.use('/auth', authRouter);

// Everything below requires a valid Bearer token; each router adds its own
// requireRole(...) guard on top.
app.use('/customers', authenticate, customersRouter);
app.use('/products', authenticate, productsRouter);
app.use('/challans', authenticate, challansRouter);

/* --- error handling (must stay last, in this order) -------------------- */

app.use(notFoundHandler);
app.use(errorHandler);

/* --- server ----------------------------------------------------------- */

const server = app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

export default app;
