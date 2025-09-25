import pino from 'pino';
import { eventBus, EventNames } from '../event-bus';

const logger = pino();

// Notification types
export interface NotificationData {
  type: 'email' | 'sms' | 'push';
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
  templateId?: string;
  variables?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
}

export interface NotificationProvider {
  name: string;
  send(notification: NotificationData): Promise<NotificationResult>;
  validate(notification: NotificationData): boolean;
}

/**
 * Unified Notification Service
 * Handles sending notifications through various providers
 */
export class NotificationService {
  private providers: Map<string, NotificationProvider> = new Map();
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second

  /**
   * Register a notification provider
   * @param provider - The provider to register
   */
  registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.name, provider);
    logger.info({
      providerName: provider.name,
      totalProviders: this.providers.size,
    }, 'Notification provider registered');
  }

  /**
   * Unregister a notification provider
   * @param name - The name of the provider to unregister
   */
  unregisterProvider(name: string): void {
    if (this.providers.delete(name)) {
      logger.info({
        providerName: name,
        totalProviders: this.providers.size,
      }, 'Notification provider unregistered');
    }
  }

  /**
   * Send a notification
   * @param notification - The notification to send
   * @returns Promise with the result
   */
  async send(notification: NotificationData): Promise<NotificationResult> {
    const startTime = Date.now();

    try {
      // Validate notification data
      this.validateNotification(notification);

      // Get appropriate provider
      const provider = this.getProvider(notification.type);
      if (!provider) {
        throw new Error(`No provider available for type: ${notification.type}`);
      }

      // Validate with provider
      if (!provider.validate(notification)) {
        throw new Error(`Invalid notification data for provider: ${provider.name}`);
      }

      // Send notification with retry logic
      const result = await this.sendWithRetry(provider, notification);

      const duration = Date.now() - startTime;

      // Publish success event
      await eventBus.publish(EventNames.NOTIFICATION_SENT, {
        type: notification.type,
        recipient: notification.recipient,
        provider: provider.name,
        success: result.success,
        duration,
        messageId: result.messageId,
      });

      logger.info({
        type: notification.type,
        recipient: notification.recipient,
        provider: provider.name,
        success: result.success,
        duration,
        messageId: result.messageId,
      }, 'Notification sent');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Publish failure event
      await eventBus.publish(EventNames.NOTIFICATION_FAILED, {
        type: notification.type,
        recipient: notification.recipient,
        error: errorMessage,
        duration,
      });

      logger.error({
        type: notification.type,
        recipient: notification.recipient,
        error: errorMessage,
        duration,
      }, 'Notification failed');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send bulk notifications
   * @param notifications - Array of notifications to send
   * @returns Promise with array of results
   */
  async sendBulk(notifications: NotificationData[]): Promise<NotificationResult[]> {
    logger.info({
      count: notifications.length,
    }, 'Sending bulk notifications');

    const results = await Promise.allSettled(
      notifications.map(notification => this.send(notification))
    );

    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logger.error({
          index,
          error: result.reason,
        }, 'Bulk notification failed');

        return {
          success: false,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        };
      }
    });

    const successCount = processedResults.filter(r => r.success).length;
    const failureCount = processedResults.length - successCount;

    logger.info({
      total: notifications.length,
      success: successCount,
      failures: failureCount,
    }, 'Bulk notifications completed');

    return processedResults;
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
  getProviderByName(name: string): NotificationProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get provider statistics
   * @returns Object with provider statistics
   */
  getStats(): {
    totalProviders: number;
    providers: Array<{
      name: string;
      type: string;
    }>;
  } {
    return {
      totalProviders: this.providers.size,
      providers: Array.from(this.providers.values()).map(provider => ({
        name: provider.name,
        type: provider.constructor.name,
      })),
    };
  }

  /**
   * Send notification with retry logic
   * @param provider - The provider to use
   * @param notification - The notification to send
   * @returns Promise with the result
   */
  private async sendWithRetry(
    provider: NotificationProvider,
    notification: NotificationData
  ): Promise<NotificationResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await provider.send(notification);
        
        if (result.success) {
          return result;
        }

        // If provider returns unsuccessful result, treat as error
        lastError = new Error(result.error || 'Provider returned unsuccessful result');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        logger.debug({
          attempt,
          maxAttempts: this.retryAttempts,
          delay,
          provider: provider.name,
        }, 'Retrying notification');
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Max retry attempts exceeded',
      provider: provider.name,
    };
  }

  /**
   * Validate notification data
   * @param notification - The notification to validate
   */
  private validateNotification(notification: NotificationData): void {
    if (!notification.type) {
      throw new Error('Notification type is required');
    }

    if (!['email', 'sms', 'push'].includes(notification.type)) {
      throw new Error('Invalid notification type');
    }

    if (!notification.recipient) {
      throw new Error('Recipient is required');
    }

    if (!notification.body) {
      throw new Error('Notification body is required');
    }

    // Type-specific validation
    if (notification.type === 'email' && !notification.subject) {
      throw new Error('Email subject is required');
    }
  }

  /**
   * Get provider for notification type
   * @param type - Notification type
   * @returns Provider or undefined
   */
  private getProvider(type: string): NotificationProvider | undefined {
    // For now, return the first available provider for the type
    // In a real implementation, you might have multiple providers per type
    // and choose based on configuration, load balancing, etc.
    return Array.from(this.providers.values()).find(provider => 
      provider.name.toLowerCase().includes(type.toLowerCase())
    );
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
