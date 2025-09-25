import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { requireTenant } from '../../middleware/tenantMiddleware';
import { can } from '../iam/permissionMiddleware';
import { getTenantPrisma } from '../../middleware/tenantMiddleware';
import { billingService } from './billingService';
import { StripeProvider } from './providers/stripeProvider';
import { PayPalProvider } from './providers/paypalProvider';
import pino from 'pino';

const logger = pino();
const router = Router();

// Initialize payment providers
billingService.registerProvider(new StripeProvider());
billingService.registerProvider(new PayPalProvider());

// Validation schemas
const createSubscriptionSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  provider: z.enum(['stripe', 'paypal']).default('stripe'),
});

const updateSubscriptionSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  provider: z.enum(['stripe', 'paypal']).default('stripe'),
});

const processPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('USD'),
  provider: z.enum(['stripe', 'paypal']).default('stripe'),
});

const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('USD'),
  interval: z.enum(['monthly', 'yearly']),
  features: z.record(z.any()).optional(),
});

const updatePlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').optional(),
  description: z.string().optional(),
  price: z.number().positive('Price must be positive').optional(),
  currency: z.string().length(3, 'Currency must be 3 characters').optional(),
  interval: z.enum(['monthly', 'yearly']).optional(),
  features: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /billing/plans
 * Get all available plans
 */
router.get('/plans', authenticateToken, requireTenant, can('read:billing'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: 'asc' },
  });

  res.json({
    success: true,
    data: { plans },
  });
}));

/**
 * POST /billing/plans
 * Create a new plan
 */
router.post('/plans', authenticateToken, requireTenant, can('create:billing'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createPlanSchema.parse(req.body);
  const prisma = getTenantPrisma(req);

  // Check if plan with this name already exists
  const existingPlan = await prisma.plan.findFirst({
    where: { name: validatedData.name },
  });

  if (existingPlan) {
    return res.status(400).json({
      success: false,
      message: 'Plan with this name already exists',
    });
  }

  // Create plan
  const plan = await prisma.plan.create({
    data: validatedData,
  });

  logger.info({
    planId: plan.id,
    planName: plan.name,
    price: plan.price,
    createdBy: req.user!.id,
  }, 'Billing plan created');

  res.status(201).json({
    success: true,
    message: 'Plan created successfully',
    data: { plan },
  });
}));

/**
 * PUT /billing/plans/:id
 * Update a plan
 */
router.put('/plans/:id', authenticateToken, requireTenant, can('update:billing'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = updatePlanSchema.parse(req.body);
  const { id } = req.params;
  const prisma = getTenantPrisma(req);

  // Check if plan exists
  const existingPlan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!existingPlan) {
    return res.status(404).json({
      success: false,
      message: 'Plan not found',
    });
  }

  // Update plan
  const plan = await prisma.plan.update({
    where: { id },
    data: validatedData,
  });

  logger.info({
    planId: plan.id,
    planName: plan.name,
    updatedBy: req.user!.id,
  }, 'Billing plan updated');

  res.json({
    success: true,
    message: 'Plan updated successfully',
    data: { plan },
  });
}));

/**
 * GET /billing/subscription
 * Get current subscription
 */
router.get('/subscription', authenticateToken, requireTenant, can('read:billing'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);

  // Get current subscription
  const subscription = await prisma.subscription.findFirst({
    where: { status: 'active' },
    include: {
      plan: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: 'No active subscription found',
    });
  }

  res.json({
    success: true,
    data: { subscription },
  });
}));

/**
 * POST /billing/subscribe
 * Create a new subscription
 */
router.post('/subscribe', authenticateToken, requireTenant, can('create:billing'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createSubscriptionSchema.parse(req.body);
  const { planId, provider } = validatedData;
  const prisma = getTenantPrisma(req);

  // Check if plan exists
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'Plan not found',
    });
  }

  // Check if user already has an active subscription
  const existingSubscription = await prisma.subscription.findFirst({
    where: { status: 'active' },
  });

  if (existingSubscription) {
    return res.status(400).json({
      success: false,
      message: 'User already has an active subscription',
    });
  }

  // Create subscription through payment provider
  const result = await billingService.createSubscription(planId, req.user!.id, provider);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Failed to create subscription',
      error: result.error,
    });
  }

  // Create subscription record in database
  const subscription = await prisma.subscription.create({
    data: {
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      cancelAtPeriodEnd: false,
    },
    include: {
      plan: true,
    },
  });

  logger.info({
    subscriptionId: subscription.id,
    planId,
    provider,
    transactionId: result.transactionId,
    createdBy: req.user!.id,
  }, 'Subscription created');

  res.status(201).json({
    success: true,
    message: 'Subscription created successfully',
    data: {
      subscription,
      transactionId: result.transactionId,
    },
  });
}));

/**
 * PUT /billing/subscription/:id
 * Update subscription
 */
router.put('/subscription/:id', authenticateToken, requireTenant, can('update:billing'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = updateSubscriptionSchema.parse(req.body);
  const { id } = req.params;
  const { planId, provider } = validatedData;
  const prisma = getTenantPrisma(req);

  // Check if subscription exists
  const existingSubscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!existingSubscription) {
    return res.status(404).json({
      success: false,
      message: 'Subscription not found',
    });
  }

  // Check if new plan exists
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'Plan not found',
    });
  }

  // Update subscription through payment provider
  const result = await billingService.updateSubscription(id, planId, provider);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Failed to update subscription',
      error: result.error,
    });
  }

  // Update subscription record in database
  const subscription = await prisma.subscription.update({
    where: { id },
    data: { planId },
    include: {
      plan: true,
    },
  });

  logger.info({
    subscriptionId: subscription.id,
    planId,
    provider,
    transactionId: result.transactionId,
    updatedBy: req.user!.id,
  }, 'Subscription updated');

  res.json({
    success: true,
    message: 'Subscription updated successfully',
    data: {
      subscription,
      transactionId: result.transactionId,
    },
  });
}));

/**
 * DELETE /billing/subscription/:id
 * Cancel subscription
 */
router.delete('/subscription/:id', authenticateToken, requireTenant, can('update:billing'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { provider = 'stripe' } = req.body;
  const prisma = getTenantPrisma(req);

  // Check if subscription exists
  const existingSubscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!existingSubscription) {
    return res.status(404).json({
      success: false,
      message: 'Subscription not found',
    });
  }

  // Cancel subscription through payment provider
  const result = await billingService.cancelSubscription(id, provider);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: result.error,
    });
  }

  // Update subscription record in database
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
    },
  });

  logger.info({
    subscriptionId: subscription.id,
    provider,
    transactionId: result.transactionId,
    canceledBy: req.user!.id,
  }, 'Subscription canceled');

  res.json({
    success: true,
    message: 'Subscription canceled successfully',
    data: {
      subscription,
      transactionId: result.transactionId,
    },
  });
}));

/**
 * POST /billing/payment
 * Process a one-time payment
 */
router.post('/payment', authenticateToken, requireTenant, can('create:billing'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = processPaymentSchema.parse(req.body);
  const { amount, currency, provider } = validatedData;

  // Process payment through payment provider
  const result = await billingService.processPayment(amount, currency, req.user!.id, provider);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Payment processing failed',
      error: result.error,
    });
  }

  logger.info({
    amount,
    currency,
    provider,
    transactionId: result.transactionId,
    processedBy: req.user!.id,
  }, 'Payment processed');

  res.json({
    success: true,
    message: 'Payment processed successfully',
    data: {
      transactionId: result.transactionId,
      amount: result.amount,
      currency: result.currency,
    },
  });
}));

/**
 * GET /billing/usage
 * Get usage statistics
 */
router.get('/usage', authenticateToken, requireTenant, can('read:billing'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);

  // Get current subscription
  const subscription = await prisma.subscription.findFirst({
    where: { status: 'active' },
    include: {
      plan: true,
    },
  });

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: 'No active subscription found',
    });
  }

  // Get usage statistics (placeholder - in production, this would calculate actual usage)
  const usage = {
    currentPeriod: {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    },
    plan: {
      name: subscription.plan.name,
      price: subscription.plan.price,
      currency: subscription.plan.currency,
      interval: subscription.plan.interval,
    },
    // Placeholder usage metrics
    metrics: {
      apiCalls: 1250,
      storageUsed: '2.5 GB',
      users: 15,
      notifications: 89,
    },
  };

  res.json({
    success: true,
    data: { usage },
  });
}));

/**
 * GET /billing/providers
 * Get available payment providers
 */
router.get('/providers', authenticateToken, requireTenant, can('read:billing'), asyncHandler(async (req: Request, res: Response) => {
  const stats = billingService.getStats();

  res.json({
    success: true,
    data: stats,
  });
}));

export { router as billingRoutes };
