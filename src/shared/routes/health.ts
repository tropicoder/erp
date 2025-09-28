import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
// import { tenantInitializationService } from '../../core/tenants/tenantInitializationService';
// import pino from 'pino'; ;

// const logger = pino();
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

// router.get('/test', asyncHandler(async (req: Request, res: Response) => {

//   try {
//     await tenantInitializationService.initializeTenant(
//       "cmg3lrk020003sb7dyqnabkkk",
//       "cmg3lpb3g0000sb7d62zwyn54",
//       "user@example.com"
//     );

//     logger.info({
//       projectId: "test",
//       creatorUserId: "user",
//     }, 'Tenant initialized with admin role and permissions');

//     res.status(200).json({
//       success: true,
//       message: "Tenant initialized with admin role and permissions",
//     });

//   } catch (error) {
//     logger.error({
//       projectId: "test",
//       creatorUserId: "user",
//       error: error instanceof Error ? error.message : 'Unknown error',
//     }, 'Failed to initialize tenant - project created but tenant setup failed');


//     res.status(200).json({
//       success: false,
//       message: error instanceof Error ? error.message :"Failed to initialize tenant - project created but tenant setup failed",
//     });
//   }
// }));


export { router as healthRouter };
