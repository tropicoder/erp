import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { requireTenant } from '../../middleware/tenantMiddleware';
import { can } from '../iam/permissionMiddleware';
import { getTenantPrisma } from '../../middleware/tenantMiddleware';
import { notificationService } from './notificationService';
import { EmailProvider } from './providers/emailProvider';
import { SMSProvider } from './providers/smsProvider';
import { PushProvider } from './providers/pushProvider';
import pino from 'pino';

const logger = pino();
const router = Router();

// Initialize providers
notificationService.registerProvider(new EmailProvider());
notificationService.registerProvider(new SMSProvider());
notificationService.registerProvider(new PushProvider());

// Validation schemas
const sendNotificationSchema = z.object({
  type: z.enum(['email', 'sms', 'push']),
  recipient: z.string().min(1, 'Recipient is required'),
  subject: z.string().optional(),
  body: z.string().min(1, 'Body is required'),
  metadata: z.record(z.any()).optional(),
  templateId: z.string().optional(),
  variables: z.record(z.any()).optional(),
});

const sendBulkNotificationSchema = z.object({
  notifications: z.array(sendNotificationSchema).min(1, 'At least one notification is required'),
});

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  type: z.enum(['email', 'sms', 'push']),
  subject: z.string().optional(),
  body: z.string().min(1, 'Template body is required'),
  variables: z.record(z.string()).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').optional(),
  type: z.enum(['email', 'sms', 'push']).optional(),
  subject: z.string().optional(),
  body: z.string().min(1, 'Template body is required').optional(),
  variables: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * POST /notifications/send
 * Send a single notification
 */
router.post('/send', authenticateToken, requireTenant, can('create:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = sendNotificationSchema.parse(req.body);
  const prisma = getTenantPrisma(req);

  // Send notification
  const result = await notificationService.send(validatedData);

  // Log notification in database
  const notification = await prisma.notification.create({
    data: {
      templateId: validatedData.templateId || 'direct',
      recipient: validatedData.recipient,
      type: validatedData.type,
      status: result.success ? 'SENT' : 'FAILED',
      sentAt: result.success ? new Date() : null,
      errorMessage: result.error || null,
      metadata: validatedData.metadata || {},
    },
  });

  logger.info({
    notificationId: notification.id,
    type: validatedData.type,
    recipient: validatedData.recipient,
    success: result.success,
    sentBy: req.user!.id,
  }, 'Notification sent');

  res.json({
    success: true,
    message: 'Notification sent successfully',
    data: {
      notification: {
        id: notification.id,
        type: notification.type,
        recipient: notification.recipient,
        status: notification.status,
        sentAt: notification.sentAt,
      },
      result,
    },
  });
}));

/**
 * POST /notifications/send-bulk
 * Send multiple notifications
 */
router.post('/send-bulk', authenticateToken, requireTenant, can('create:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = sendBulkNotificationSchema.parse(req.body);
  const prisma = getTenantPrisma(req);

  // Send bulk notifications
  const results = await notificationService.sendBulk(validatedData.notifications);

  // Log notifications in database
  const notifications = await Promise.all(
    results.map(async (result, index) => {
      const notificationData = validatedData.notifications[index];
      return prisma.notification.create({
        data: {
          templateId: notificationData.templateId || 'direct',
          recipient: notificationData.recipient,
          type: notificationData.type,
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          errorMessage: result.error || null,
          metadata: notificationData.metadata || {},
        },
      });
    })
  );

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  logger.info({
    total: results.length,
    success: successCount,
    failures: failureCount,
    sentBy: req.user!.id,
  }, 'Bulk notifications sent');

  res.json({
    success: true,
    message: 'Bulk notifications sent',
    data: {
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        recipient: n.recipient,
        status: n.status,
        sentAt: n.sentAt,
      })),
      summary: {
        total: results.length,
        success: successCount,
        failures: failureCount,
      },
      results,
    },
  });
}));

/**
 * GET /notifications/history
 * Get notification history
 */
router.get('/history', authenticateToken, requireTenant, can('read:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);
  const { page = 1, limit = 10, type, status, recipient } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (recipient) where.recipient = { contains: recipient as string, mode: 'insensitive' };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      notifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    },
  });
}));

/**
 * GET /notifications/templates
 * Get notification templates
 */
router.get('/templates', authenticateToken, requireTenant, can('read:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);
  const { type, isActive } = req.query;

  const where: any = {};
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const templates = await prisma.notificationTemplate.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: { templates },
  });
}));

/**
 * POST /notifications/templates
 * Create notification template
 */
router.post('/templates', authenticateToken, requireTenant, can('create:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createTemplateSchema.parse(req.body);
  const prisma = getTenantPrisma(req);

  // Check if template with this name already exists
  const existingTemplate = await prisma.notificationTemplate.findFirst({
    where: { name: validatedData.name },
  });

  if (existingTemplate) {
     res.status(400).json({
      success: false,
      message: 'Template with this name already exists',
    });
    return;
  }

  // Create template
  const template = await prisma.notificationTemplate.create({
    data: validatedData,
  });

  logger.info({
    templateId: template.id,
    templateName: template.name,
    type: template.type,
    createdBy: req.user!.id,
  }, 'Notification template created');

  res.status(201).json({
    success: true,
    message: 'Template created successfully',
    data: { template },
  });
}));

/**
 * PUT /notifications/templates/:id
 * Update notification template
 */
router.put('/templates/:id', authenticateToken, requireTenant, can('update:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = updateTemplateSchema.parse(req.body);
  const { id } = req.params;
  const prisma = getTenantPrisma(req);

  // Check if template exists
  const existingTemplate = await prisma.notificationTemplate.findUnique({
    where: { id },
  });

  if (!existingTemplate) {
     res.status(404).json({
      success: false,
      message: 'Template not found',
    });

    return;
  }

  // Update template
  const template = await prisma.notificationTemplate.update({
    where: { id },
    data: validatedData,
  });

  logger.info({
    templateId: template.id,
    templateName: template.name,
    updatedBy: req.user!.id,
  }, 'Notification template updated');

  res.json({
    success: true,
    message: 'Template updated successfully',
    data: { template },
  });
}));

/**
 * DELETE /notifications/templates/:id
 * Delete notification template
 */
router.delete('/templates/:id', authenticateToken, requireTenant, can('delete:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const prisma = getTenantPrisma(req);

  // Check if template exists
  const existingTemplate = await prisma.notificationTemplate.findUnique({
    where: { id },
  });

  if (!existingTemplate) {
     res.status(404).json({
      success: false,
      message: 'Template not found',
    });

    return;
  }

  // Delete template
  await prisma.notificationTemplate.delete({
    where: { id },
  });

  logger.info({
    templateId: id,
    templateName: existingTemplate.name,
    deletedBy: req.user!.id,
  }, 'Notification template deleted');

  res.json({
    success: true,
    message: 'Template deleted successfully',
  });
}));

/**
 * GET /notifications/providers
 * Get available notification providers
 */
router.get('/providers', authenticateToken, requireTenant, can('read:notifications'), asyncHandler(async (req: Request, res: Response) => {
  const stats = notificationService.getStats();

  res.json({
    success: true,
    data: stats,
  });
}));

export { router as notificationRoutes };
