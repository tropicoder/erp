import pino from 'pino';
import { config } from '../../config/config';
import { getTenantContext } from '../../middleware/tenantMiddleware';
import { getTenantPrisma } from '../../middleware/tenantMiddleware';

const logger = pino();

// LLM types
export interface LLMCompletionRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  systemMessage?: string;
}

export interface LLMCompletionResponse {
  success: boolean;
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  error?: string;
}

export interface LLMProvider {
  name: string;
  getCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  validateApiKey(apiKey: string): Promise<boolean>;
}

/**
 * LLM Service for tenant-aware AI completions
 * Supports both global (Nexus-provided) and tenant-specific LLM configurations
 */
export class LLMService {
  private providers: Map<string, LLMProvider> = new Map();

  /**
   * Register an LLM provider
   * @param provider - The provider to register
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
    logger.info({
      providerName: provider.name,
      totalProviders: this.providers.size,
    }, 'LLM provider registered');
  }

  /**
   * Get completion from LLM
   * @param request - The completion request
   * @param req - Express request object (for tenant context)
   * @returns Promise with the completion response
   */
  async getCompletion(
    request: LLMCompletionRequest,
    req: any
  ): Promise<LLMCompletionResponse> {
    try {
      const tenant = getTenantContext(req);
      const prisma = getTenantPrisma(req);

      // Determine which provider and API key to use
      const { provider, apiKey } = await this.getProviderConfig(tenant);

      // Get the provider
      const llmProvider = this.providers.get(provider);
      if (!llmProvider) {
        throw new Error(`LLM provider not found: ${provider}`);
      }

      // Validate API key if provided
      if (apiKey && !(await llmProvider.validateApiKey(apiKey))) {
        throw new Error('Invalid API key for LLM provider');
      }

      // Get completion
      const startTime = Date.now();
      const response = await llmProvider.getCompletion(request);
      const duration = Date.now() - startTime;

      // Track usage
      await this.trackUsage(prisma, {
        provider,
        endpoint: 'completion',
        tokensUsed: response.usage?.totalTokens || 0,
        cost: this.calculateCost(provider, response.usage?.totalTokens || 0),
        responseTime: duration,
        success: response.success,
        errorMessage: response.error,
      });

      logger.info({
        provider,
        model: response.model,
        tokensUsed: response.usage?.totalTokens,
        duration,
        success: response.success,
      }, 'LLM completion processed');

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        error: errorMessage,
        prompt: request.prompt.substring(0, 100) + '...',
      }, 'LLM completion failed');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get provider configuration for tenant
   * @param tenant - Tenant context
   * @returns Provider name and API key
   */
  private async getProviderConfig(tenant: any): Promise<{ provider: string; apiKey?: string }> {
    if (tenant.llmProvider === 'NEXUS') {
      // Use global Nexus-provided LLM
      return {
        provider: 'openai', // Default to OpenAI for Nexus
        apiKey: config.openaiApiKey,
      };
    } else if (tenant.llmProvider === 'OPENAI') {
      return {
        provider: 'openai',
        apiKey: tenant.llmApiKey,
      };
    } else if (tenant.llmProvider === 'ANTHROPIC') {
      return {
        provider: 'anthropic',
        apiKey: tenant.llmApiKey,
      };
    } else {
      // Default to Nexus provider
      return {
        provider: 'openai',
        apiKey: config.openaiApiKey,
      };
    }
  }

  /**
   * Track API usage in database
   * @param prisma - Tenant Prisma client
   * @param usage - Usage data
   */
  private async trackUsage(prisma: any, usage: {
    provider: string;
    endpoint: string;
    tokensUsed: number;
    cost?: number;
    responseTime: number;
    success: boolean;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await prisma.apiCallLog.create({
        data: {
          provider: usage.provider,
          endpoint: usage.endpoint,
          tokensUsed: usage.tokensUsed,
          cost: usage.cost,
          responseTime: usage.responseTime,
          success: usage.success,
          errorMessage: usage.errorMessage,
        },
      });
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to track LLM usage');
    }
  }

  /**
   * Calculate cost based on provider and tokens
   * @param provider - Provider name
   * @param tokens - Number of tokens
   * @returns Cost in USD
   */
  private calculateCost(provider: string, tokens: number): number {
    // Simplified cost calculation (in production, use actual pricing)
    const pricing: Record<string, number> = {
      openai: 0.00002, // $0.02 per 1K tokens
      anthropic: 0.00003, // $0.03 per 1K tokens
    };

    const pricePerToken = pricing[provider] || 0.00002;
    return (tokens / 1000) * pricePerToken;
  }

  /**
   * Get usage statistics for tenant
   * @param prisma - Tenant Prisma client
   * @param days - Number of days to look back
   * @returns Usage statistics
   */
  async getUsageStats(prisma: any, days: number = 30): Promise<{
    totalCalls: number;
    totalTokens: number;
    totalCost: number;
    averageResponseTime: number;
    successRate: number;
    providerBreakdown: Record<string, any>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await prisma.apiCallLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    });

    const stats = {
      totalCalls: logs.length,
      totalTokens: logs.reduce((sum, log) => sum + log.tokensUsed, 0),
      totalCost: logs.reduce((sum, log) => sum + (log.cost || 0), 0),
      averageResponseTime: logs.length > 0 ? logs.reduce((sum, log) => sum + log.responseTime, 0) / logs.length : 0,
      successRate: logs.length > 0 ? (logs.filter(log => log.success).length / logs.length) * 100 : 0,
      providerBreakdown: {} as Record<string, any>,
    };

    // Calculate provider breakdown
    const providerStats: Record<string, any> = {};
    logs.forEach(log => {
      if (!providerStats[log.provider]) {
        providerStats[log.provider] = {
          calls: 0,
          tokens: 0,
          cost: 0,
          successRate: 0,
        };
      }
      providerStats[log.provider].calls++;
      providerStats[log.provider].tokens += log.tokensUsed;
      providerStats[log.provider].cost += log.cost || 0;
    });

    // Calculate success rates per provider
    Object.keys(providerStats).forEach(provider => {
      const providerLogs = logs.filter(log => log.provider === provider);
      providerStats[provider].successRate = providerLogs.length > 0 
        ? (providerLogs.filter(log => log.success).length / providerLogs.length) * 100 
        : 0;
    });

    stats.providerBreakdown = providerStats;

    return stats;
  }

  /**
   * Get available providers
   * @returns Array of provider names
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider by name
   * @param name - Provider name
   * @returns Provider or undefined
   */
  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }
}

// Export singleton instance
export const llmService = new LLMService();
