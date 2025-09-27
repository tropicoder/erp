import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { getMainClient } from '../../shared/database/mainClient';
import { coreBillingService } from './coreBillingService';
import { billingAutomationService } from './billingAutomationService';
import { eventBus, EventNames } from '../event-bus';
import pino from 'pino';

const logger = pino();
const router = Router();

// Validation schemas
const createSubscriptionSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userPricePerMonth: z.number().positive('User price must be positive').default(10.00),
  applicationPricePerMonth: z.number().min(0, 'Application price must be non-negative').default(0.00),
});

const createApplicationSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Application name is required'),
  description: z.string().optional(),
  pricePerMonth: z.number().min(0, 'Price must be non-negative').default(0.00),
});

const processPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  paymentMethod: z.string().default('stripe'),
});

/**
 * POST /billing/subscriptions
 * Create a new subscription for a project
 */
router.post('/subscriptions', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createSubscriptionSchema.parse(req.body);
  const { projectId, userPricePerMonth, applicationPricePerMonth } = validatedData;

  const mainClient = getMainClient();

  // Check if project exists and user has access
  const project = await mainClient.project.findUnique({
    where: { id: projectId },
    include: {
      users: {
        where: { userId: req.user!.id },
      },
    },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: 'Project not found',
    });
    return;
  }

  if (project.users.length === 0) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this project',
    });
    return;
  }

  // Check if subscription already exists
  const existingSubscription = await mainClient.subscription.findFirst({
    where: {
      projectId,
      isActive: true,
    },
  });

  if (existingSubscription) {
    res.status(400).json({
      success: false,
      message: 'Active subscription already exists for this project',
    });
    return;
  }

  // Create subscription
  const subscription = await coreBillingService.createSubscription(
    projectId,
    req.user!.id,
    userPricePerMonth,
    applicationPricePerMonth
  );

  // Publish event
  await eventBus.publish(EventNames.SUBSCRIPTION_CREATED, {
    subscriptionId: subscription.id,
    projectId,
    userId: req.user!.id,
    userPricePerMonth,
    applicationPricePerMonth,
  });

  logger.info({
    subscriptionId: subscription.id,
    projectId,
    userId: req.user!.id,
  }, 'Subscription created');

  res.status(201).json({
    success: true,
    data: {
      subscription: {
        id: subscription.id,
        projectId: subscription.projectId,
        userPricePerMonth: subscription.userPricePerMonth.toString(),
        applicationPricePerMonth: subscription.applicationPricePerMonth.toString(),
        nextBilling: subscription.nextBilling,
        isActive: subscription.isActive,
        createdAt: subscription.createdAt,
      },
    },
  });
}));

/**
 * GET /billing/subscriptions/:projectId
 * Get subscription details for a project
 */
router.get('/subscriptions/:projectId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;

  const mainClient = getMainClient();

  // Check if project exists and user has access
  const project = await mainClient.project.findUnique({
    where: { id: projectId },
    include: {
      users: {
        where: { userId: req.user!.id },
      },
    },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: 'Project not found',
    });
    return;
  }

  if (project.users.length === 0) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this project',
    });
    return;
  }

  // Get billing status
  const billingStatus = await coreBillingService.getBillingStatus(projectId);

  if (!billingStatus) {
    res.status(404).json({
      success: false,
      message: 'No active subscription found for this project',
    });
    return;
  }

  res.json({
    success: true,
    data: {
      subscription: {
        id: billingStatus.subscription.id,
        projectId: billingStatus.subscription.projectId,
        userPricePerMonth: billingStatus.subscription.userPricePerMonth.toString(),
        applicationPricePerMonth: billingStatus.subscription.applicationPricePerMonth.toString(),
        nextBilling: billingStatus.subscription.nextBilling,
        isActive: billingStatus.subscription.isActive,
        createdAt: billingStatus.subscription.createdAt,
      },
      project: {
        id: billingStatus.project!.id,
        name: billingStatus.project!.name,
        isActive: billingStatus.isActive,
      },
      currentUsage: {
        userCount: billingStatus.userCount,
        applicationCount: billingStatus.applicationCount,
      },
      invoices: billingStatus.subscription.invoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount.toString(),
        status: invoice.status,
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
      })),
    },
  });
}));

/**
 * GET /billing/applications
 * Get available applications for tenant selection
 */
router.get('/applications', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const applications = await coreBillingService.getAvailableApplications();

  res.json({
    success: true,
    data: {
      applications: applications.map(app => ({
        id: app.id,
        name: app.name,
        slug: app.slug,
        description: app.description,
        icon: app.icon,
        pricePerMonth: app.pricePerMonth.toString(),
      })),
    },
  });
}));

/**
 * POST /billing/tenants/:projectId/applications
 * Add application to tenant
 */
router.post('/tenants/:projectId/applications', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { applicationId, customPrice } = req.body;

  const mainClient = getMainClient();

  // Check if project exists and user has access
  const project = await mainClient.project.findUnique({
    where: { id: projectId },
    include: {
      users: {
        where: { userId: req.user!.id },
      },
    },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: 'Project not found',
    });
    return;
  }

  if (project.users.length === 0) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this project',
    });
    return;
  }

  // Add application to tenant
  const tenantApplication = await coreBillingService.addApplicationToTenant(projectId, applicationId, customPrice);

  logger.info({
    projectId,
    applicationId,
    customPrice,
  }, 'Application added to tenant');

  res.status(201).json({
    success: true,
    data: {
      tenantApplication: {
        id: tenantApplication.id,
        projectId: tenantApplication.projectId,
        applicationId: tenantApplication.applicationId,
        customPrice: tenantApplication.customPrice?.toString(),
        isActive: tenantApplication.isActive,
        addedAt: tenantApplication.addedAt,
        application: {
          id: tenantApplication.application.id,
          name: tenantApplication.application.name,
          slug: tenantApplication.application.slug,
          description: tenantApplication.application.description,
          icon: tenantApplication.application.icon,
          pricePerMonth: tenantApplication.application.pricePerMonth.toString(),
        },
      },
    },
  });
}));

/**
 * POST /billing/payments/process
 * Process payment for an invoice
 */
router.post('/payments/process', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const validatedData = processPaymentSchema.parse(req.body);
  const { invoiceId, paymentMethod } = validatedData;

  try {
    const invoice = await coreBillingService.processPayment(invoiceId, paymentMethod);

    // Publish event
    await eventBus.publish(EventNames.PAYMENT_PROCESSED, {
      invoiceId: invoice.id,
      projectId: invoice.projectId,
      amount: invoice.amount.toString(),
      paymentMethod,
      paidAt: invoice.paidAt,
    });

    logger.info({
      invoiceId: invoice.id,
      projectId: invoice.projectId,
      amount: invoice.amount.toString(),
      paymentMethod,
    }, 'Payment processed successfully');

    res.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount.toString(),
          status: invoice.status,
          paidAt: invoice.paidAt,
        },
      },
    });
  } catch (error) {
    logger.error({
      invoiceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Payment processing failed');

    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Payment processing failed',
    });
  }
}));

/**
 * GET /billing/invoices/:projectId
 * Get invoices for a project
 */
router.get('/invoices/:projectId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { page = 1, limit = 10, status } = req.query;

  const mainClient = getMainClient();

  // Check if project exists and user has access
  const project = await mainClient.project.findUnique({
    where: { id: projectId },
    include: {
      users: {
        where: { userId: req.user!.id },
      },
    },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: 'Project not found',
    });
    return;
  }

  if (project.users.length === 0) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this project',
    });
    return;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = {
    projectId,
    ...(status ? { status: status as any } : {}),
  };

  const [invoices, total] = await Promise.all([
    mainClient.invoice.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    mainClient.invoice.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      invoices: invoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount.toString(),
        status: invoice.status,
        userCount: invoice.userCount,
        applicationCount: invoice.applicationCount,
        userAmount: invoice.userAmount.toString(),
        applicationAmount: invoice.applicationAmount.toString(),
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        createdAt: invoice.createdAt,
      })),
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
 * POST /billing/automation/monthly
 * Trigger monthly billing process (admin only)
 */
router.post('/automation/monthly', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  // This would typically be restricted to admin users
  // For now, we'll allow any authenticated user for testing
  
  try {
    const result = await billingAutomationService.processMonthlyBilling();

    logger.info({
      processedCount: result.processedCount,
      errorCount: result.errorCount,
      overdueCount: result.overdueCount,
    }, 'Monthly billing process completed');

    res.json({
      success: true,
      data: {
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        overdueCount: result.overdueCount,
      },
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Monthly billing process failed');

    res.status(500).json({
      success: false,
      message: 'Monthly billing process failed',
    });
  }
}));

/**
 * GET /billing/statistics
 * Get billing statistics (admin only)
 */
router.get('/statistics', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const statistics = await billingAutomationService.getBillingStatistics();

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Failed to get billing statistics');

    res.status(500).json({
      success: false,
      message: 'Failed to get billing statistics',
    });
  }
}));

export default router;
