import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { requireTenant, tenantMiddleware } from '../../middleware/tenantMiddleware';
import { can } from '../iam/permissionMiddleware';
import { getTenantPrisma } from '../../middleware/tenantMiddleware';
import { llmService } from './llmService';
import { searchService } from './searchService';
import { OpenAIProvider } from './providers/openaiProvider';
import { AnthropicProvider } from './providers/anthropicProvider';
import pino from 'pino';

const logger = pino();
const router = Router();

// Initialize LLM providers
llmService.registerProvider(new OpenAIProvider());
llmService.registerProvider(new AnthropicProvider());

// Validation schemas
const completionSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  maxTokens: z.number().min(1).max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().optional(),
  systemMessage: z.string().optional(),
});

const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: z.record(z.any()).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const indexContentSchema = z.object({
  id: z.string().min(1, 'Content ID is required'),
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  type: z.string().min(1, 'Type is required'),
  metadata: z.record(z.any()).optional(),
});

/**
 * POST /ai/completion
 * Get LLM completion
 */
router.post('/completion', authenticateToken, tenantMiddleware, requireTenant, can('create:ai'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = completionSchema.parse(req.body);

  // Get completion from LLM service
  const response = await llmService.getCompletion(validatedData, req);

  if (!response.success) {
     res.status(400).json({
      success: false,
      message: 'LLM completion failed',
      error: response.error,
    });
    return;
  }

  logger.info({
    prompt: validatedData.prompt.substring(0, 100) + '...',
    model: response.model,
    tokensUsed: response.usage?.totalTokens,
    requestedBy: req.user!.id,
  }, 'LLM completion requested');

  res.json({
    success: true,
    data: {
      content: response.content,
      usage: response.usage,
      model: response.model,
    },
  });
}));

/**
 * POST /ai/search
 * Execute federated search
 */
router.post('/search', authenticateToken, tenantMiddleware, requireTenant, can('read:search'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = searchSchema.parse(req.body);

  // Execute search
  const response = await searchService.execute(validatedData, req);

  if (!response.success) {
     res.status(400).json({
      success: false,
      message: 'Search failed',
      error: response.error,
    });

    return;
  }

  logger.info({
    query: validatedData.query,
    resultCount: response.results.length,
    took: response.took,
    requestedBy: req.user!.id,
  }, 'Federated search executed');

  res.json({
    success: true,
    data: {
      results: response.results,
      total: response.total,
      query: response.query,
      took: response.took,
    },
  });
}));

/**
 * POST /ai/index
 * Index content for search
 */
router.post('/index', authenticateToken, tenantMiddleware, requireTenant, can('create:search'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = indexContentSchema.parse(req.body);

  // Index content
  const result = await searchService.indexContent(
    {
      id: validatedData.id,
      title: validatedData.title,
      content: validatedData.content,
      type: validatedData.type,
    },
    validatedData.metadata || {},
    req
  );

  if (!result.success) {
     res.status(400).json({
      success: false,
      message: 'Content indexing failed',
      error: result.error,
    });

    return;
  }

  logger.info({
    contentId: validatedData.id,
    title: validatedData.title,
    type: validatedData.type,
    indexedBy: req.user!.id,
  }, 'Content indexed for search');

  res.json({
    success: true,
    message: 'Content indexed successfully',
  });
}));

/**
 * GET /ai/usage
 * Get LLM usage statistics
 */
router.get('/usage', authenticateToken, tenantMiddleware, requireTenant, can('read:ai'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);
  const { days = 30 } = req.query;

  // Get usage statistics
  const stats = await llmService.getUsageStats(prisma, Number(days));

  res.json({
    success: true,
    data: {
      period: `${days} days`,
      ...stats,
    },
  });
}));

/**
 * GET /ai/providers
 * Get available LLM providers
 */
router.get('/providers', authenticateToken, tenantMiddleware, requireTenant, can('read:ai'), asyncHandler(async (req: Request, res: Response) => {
  const providers = llmService.getProviders();

  res.json({
    success: true,
    data: {
      providers,
      total: providers.length,
    },
  });
}));

/**
 * GET /ai/models
 * Get available models for each provider
 */
router.get('/models', authenticateToken, tenantMiddleware, requireTenant, can('read:ai'), asyncHandler(async (req: Request, res: Response) => {
  // Mock model data (in production, this would come from actual provider APIs)
  const models = {
    openai: [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient model for most tasks' },
      { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model for complex tasks' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Latest GPT-4 model with improved performance' },
    ],
    anthropic: [
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', description: 'Fast and lightweight model' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', description: 'Balanced performance and speed' },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', description: 'Most powerful model for complex tasks' },
    ],
  };

  res.json({
    success: true,
    data: { models },
  });
}));

/**
 * GET /ai/health
 * Check AI service health
 */
router.get('/health', authenticateToken, tenantMiddleware, requireTenant, can('read:ai'), asyncHandler(async (req: Request, res: Response) => {
  const providers = llmService.getProviders();
  const healthChecks = await Promise.allSettled(
    providers.map(async (providerName) => {
      const provider = llmService.getProvider(providerName);
      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }

      // Simple health check (in production, make actual API calls)
      return {
        provider: providerName,
        status: 'healthy',
        responseTime: Math.floor(Math.random() * 100) + 50,
      };
    })
  );

  const health = healthChecks.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        provider: providers[index],
        status: 'unhealthy',
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      };
    }
  });

  const allHealthy = health.every(h => h.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    data: {
      status: allHealthy ? 'healthy' : 'degraded',
      providers: health,
    },
  });
}));

export { router as aiRoutes };
