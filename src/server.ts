import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import pino from 'pino';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './shared/routes/health';
import { authRoutes } from './core/auth/authRoutes';
import { iamRoutes } from './core/iam/iamRoutes';
import { tenantRoutes } from './core/tenants/tenantRoutes';
import { notificationRoutes } from './core/notifications/notificationRoutes';
import { billingRoutes } from './core/billing/billingRoutes';
import { aiRoutes } from './core/ai/aiRoutes';
import { config } from './config/config';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  }, 'Incoming request');
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRoutes);
app.use('/iam', iamRoutes);
app.use('/tenants', tenantRoutes);
app.use('/notifications', notificationRoutes);
app.use('/billing', billingRoutes);
app.use('/ai', aiRoutes);

// 404 handler
app.all('/{*splat}', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`🚀 Nexus ERP server running on port ${PORT}`);
  logger.info(`📊 Health check available at http://localhost:${PORT}/health`);
});

export default app;