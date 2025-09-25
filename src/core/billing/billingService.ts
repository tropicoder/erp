import pino from 'pino';
import { eventBus, EventNames } from '../event-bus';

const logger = pino();

// Billing types
export interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly';
  features: Record<string, any>;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  amount?: number;
  currency?: string;
}

export interface PaymentProvider {
  name: string;
  createSubscription(planId: string, customerId: string): Promise<PaymentResult>;
  updateSubscription(subscriptionId: string, planId: string): Promise<PaymentResult>;
  cancelSubscription(subscriptionId: string): Promise<PaymentResult>;
  processPayment(amount: number, currency: string, customerId: string): Promise<PaymentResult>;
  getSubscription(subscriptionId: string): Promise<Subscription | null>;
}

/**
 * Billing Service
 * Handles subscription management and payment processing
 */
export class BillingService {
  private providers: Map<string, PaymentProvider> = new Map();

  /**
   * Register a payment provider
   * @param provider - The provider to register
   */
  registerProvider(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
    logger.info({
      providerName: provider.name,
      totalProviders: this.providers.size,
    }, 'Payment provider registered');
  }

  /**
   * Create a subscription
   * @param planId - The plan ID
   * @param customerId - The customer ID
   * @param providerName - The payment provider to use
   * @returns Promise with the result
   */
  async createSubscription(
    planId: string,
    customerId: string,
    providerName: string = 'stripe'
  ): Promise<PaymentResult> {
    try {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Payment provider not found: ${providerName}`);
      }

      const result = await provider.createSubscription(planId, customerId);

      if (result.success) {
        // Publish event
        await eventBus.publish(EventNames.SUBSCRIPTION_CREATED, {
          planId,
          customerId,
          provider: providerName,
          transactionId: result.transactionId,
        });

        logger.info({
          planId,
          customerId,
          provider: providerName,
          transactionId: result.transactionId,
        }, 'Subscription created successfully');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        planId,
        customerId,
        provider: providerName,
        error: errorMessage,
      }, 'Failed to create subscription');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update a subscription
   * @param subscriptionId - The subscription ID
   * @param planId - The new plan ID
   * @param providerName - The payment provider to use
   * @returns Promise with the result
   */
  async updateSubscription(
    subscriptionId: string,
    planId: string,
    providerName: string = 'stripe'
  ): Promise<PaymentResult> {
    try {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Payment provider not found: ${providerName}`);
      }

      const result = await provider.updateSubscription(subscriptionId, planId);

      if (result.success) {
        // Publish event
        await eventBus.publish(EventNames.SUBSCRIPTION_UPDATED, {
          subscriptionId,
          planId,
          provider: providerName,
          transactionId: result.transactionId,
        });

        logger.info({
          subscriptionId,
          planId,
          provider: providerName,
          transactionId: result.transactionId,
        }, 'Subscription updated successfully');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        subscriptionId,
        planId,
        provider: providerName,
        error: errorMessage,
      }, 'Failed to update subscription');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Cancel a subscription
   * @param subscriptionId - The subscription ID
   * @param providerName - The payment provider to use
   * @returns Promise with the result
   */
  async cancelSubscription(
    subscriptionId: string,
    providerName: string = 'stripe'
  ): Promise<PaymentResult> {
    try {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Payment provider not found: ${providerName}`);
      }

      const result = await provider.cancelSubscription(subscriptionId);

      if (result.success) {
        logger.info({
          subscriptionId,
          provider: providerName,
          transactionId: result.transactionId,
        }, 'Subscription canceled successfully');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        subscriptionId,
        provider: providerName,
        error: errorMessage,
      }, 'Failed to cancel subscription');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Process a one-time payment
   * @param amount - The amount to charge
   * @param currency - The currency
   * @param customerId - The customer ID
   * @param providerName - The payment provider to use
   * @returns Promise with the result
   */
  async processPayment(
    amount: number,
    currency: string,
    customerId: string,
    providerName: string = 'stripe'
  ): Promise<PaymentResult> {
    try {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Payment provider not found: ${providerName}`);
      }

      const result = await provider.processPayment(amount, currency, customerId);

      if (result.success) {
        // Publish event
        await eventBus.publish(EventNames.PAYMENT_PROCESSED, {
          amount,
          currency,
          customerId,
          provider: providerName,
          transactionId: result.transactionId,
        });

        logger.info({
          amount,
          currency,
          customerId,
          provider: providerName,
          transactionId: result.transactionId,
        }, 'Payment processed successfully');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        amount,
        currency,
        customerId,
        provider: providerName,
        error: errorMessage,
      }, 'Failed to process payment');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get subscription details
   * @param subscriptionId - The subscription ID
   * @param providerName - The payment provider to use
   * @returns Promise with subscription details
   */
  async getSubscription(
    subscriptionId: string,
    providerName: string = 'stripe'
  ): Promise<Subscription | null> {
    try {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Payment provider not found: ${providerName}`);
      }

      return await provider.getSubscription(subscriptionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        subscriptionId,
        provider: providerName,
        error: errorMessage,
      }, 'Failed to get subscription');

      return null;
    }
  }

  /**
   * Get available payment providers
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
  getProvider(name: string): PaymentProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get billing service statistics
   * @returns Object with service statistics
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
}

// Export singleton instance
export const billingService = new BillingService();
