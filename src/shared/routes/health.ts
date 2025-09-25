import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

// Health check endpoint
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
    },
    cpu: {
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
    },
  };

  res.status(200).json({
    success: true,
    data: healthCheck,
  });
}));

export { router as healthRouter };
