import pino from 'pino';

const logger = pino();

// Service types
export interface ServiceFunction {
  (...args: any[]): Promise<any> | any;
}

export interface ServiceDefinition {
  name: string;
  function: ServiceFunction;
  description?: string;
  version?: string;
  metadata?: Record<string, any>;
}

export interface ServiceCall {
  serviceName: string;
  args: any[];
  timestamp: Date;
  id: string;
}

/**
 * Simple service registry for inter-module communication
 * Allows modules to register functions and call them securely
 */
class ServiceBroker {
  private services: Map<string, ServiceDefinition> = new Map();
  private callHistory: ServiceCall[] = [];
  private maxHistorySize = 1000;

  /**
   * Register a service function
   * @param name - The name of the service
   * @param serviceFunction - The function to register
   * @param options - Additional service metadata
   */
  register(
    name: string,
    serviceFunction: ServiceFunction,
    options: {
      description?: string;
      version?: string;
      metadata?: Record<string, any>;
    } = {}
  ): void {
    const serviceDefinition: ServiceDefinition = {
      name,
      function: serviceFunction,
      description: options.description,
      version: options.version || '1.0.0',
      metadata: options.metadata,
    };

    this.services.set(name, serviceDefinition);
    
    logger.info({
      serviceName: name,
      version: serviceDefinition.version,
      description: serviceDefinition.description,
    }, 'Service registered');
  }

  /**
   * Unregister a service
   * @param name - The name of the service to unregister
   */
  unregister(name: string): void {
    if (this.services.has(name)) {
      this.services.delete(name);
      logger.info({ serviceName: name }, 'Service unregistered');
    }
  }

  /**
   * Call a registered service
   * @param serviceName - The name of the service to call
   * @param args - Arguments to pass to the service function
   * @returns The result of the service function
   */
  async call(serviceName: string, ...args: any[]): Promise<any> {
    const service = this.services.get(serviceName);
    
    if (!service) {
      const error = new Error(`Service '${serviceName}' not found`);
      logger.error({
        serviceName,
        availableServices: Array.from(this.services.keys()),
      }, 'Service not found');
      throw error;
    }

    const callId = this.generateCallId();
    const serviceCall: ServiceCall = {
      serviceName,
      args,
      timestamp: new Date(),
      id: callId,
    };

    // Add to call history
    this.addToCallHistory(serviceCall);

    logger.info({
      serviceName,
      callId,
      argsCount: args.length,
    }, 'Service call initiated');

    try {
      const startTime = Date.now();
      const result = await service.function(...args);
      const duration = Date.now() - startTime;

      logger.info({
        serviceName,
        callId,
        duration,
        success: true,
      }, 'Service call completed');

      return result;
    } catch (error) {
      logger.error({
        serviceName,
        callId,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }, 'Service call failed');

      throw error;
    }
  }

  /**
   * Check if a service is registered
   * @param serviceName - The name of the service to check
   * @returns True if the service is registered
   */
  hasService(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  /**
   * Get all registered service names
   * @returns Array of service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get service definition
   * @param serviceName - The name of the service
   * @returns Service definition or undefined
   */
  getService(serviceName: string): ServiceDefinition | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Get all service definitions
   * @returns Array of service definitions
   */
  getAllServices(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * Get recent call history
   * @param limit - Maximum number of calls to return
   * @returns Array of recent service calls
   */
  getCallHistory(limit: number = 50): ServiceCall[] {
    return this.callHistory.slice(-limit);
  }

  /**
   * Clear call history
   */
  clearCallHistory(): void {
    this.callHistory = [];
    logger.info('Service call history cleared');
  }

  /**
   * Get service statistics
   * @returns Object with service statistics
   */
  getStats(): {
    totalServices: number;
    totalCalls: number;
    services: Array<{
      name: string;
      version: string;
      description?: string;
    }>;
  } {
    return {
      totalServices: this.services.size,
      totalCalls: this.callHistory.length,
      services: Array.from(this.services.values()).map(service => ({
        name: service.name,
        version: service.version || '1.0.0',
        description: service.description,
      })),
    };
  }

  /**
   * Add call to history with size management
   */
  private addToCallHistory(serviceCall: ServiceCall): void {
    this.callHistory.push(serviceCall);
    
    // Keep history size manageable
    if (this.callHistory.length > this.maxHistorySize) {
      this.callHistory = this.callHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const serviceBroker = new ServiceBroker();

// Export common service names for type safety
export const ServiceNames = {
  // Authentication services
  AUTH_VALIDATE_TOKEN: 'auth.validateToken',
  AUTH_GENERATE_TOKEN: 'auth.generateToken',
  AUTH_REFRESH_TOKEN: 'auth.refreshToken',
  
  // User services
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_FIND_BY_ID: 'user.findById',
  USER_FIND_BY_EMAIL: 'user.findByEmail',
  
  // Project/Tenant services
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PROJECT_FIND_BY_ID: 'project.findById',
  PROJECT_GET_TENANT_CLIENT: 'project.getTenantClient',
  
  // Notification services
  NOTIFICATION_SEND: 'notification.send',
  NOTIFICATION_SEND_BULK: 'notification.sendBulk',
  
  // Billing services
  BILLING_CREATE_SUBSCRIPTION: 'billing.createSubscription',
  BILLING_UPDATE_SUBSCRIPTION: 'billing.updateSubscription',
  BILLING_PROCESS_PAYMENT: 'billing.processPayment',
  
  // AI/LLM services
  LLM_GET_COMPLETION: 'llm.getCompletion',
  LLM_TRACK_USAGE: 'llm.trackUsage',
  
  // Search services
  SEARCH_EXECUTE: 'search.execute',
  SEARCH_INDEX: 'search.index',
} as const;
