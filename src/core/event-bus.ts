import pino from 'pino';

const logger = pino();

// Event types
export interface EventPayload {
  [key: string]: any;
}

export interface EventHandler {
  (payload: EventPayload): Promise<void> | void;
}

export interface Event {
  name: string;
  payload: EventPayload;
  timestamp: Date;
  id: string;
}

/**
 * Simple in-memory event bus for inter-module communication
 * In production, this could be replaced with Redis, RabbitMQ, or similar
 */
class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventHistory: Event[] = [];
  private maxHistorySize = 1000;

  /**
   * Subscribe to an event
   * @param eventName - The name of the event to subscribe to
   * @param handler - The function to call when the event is published
   */
  subscribe(eventName: string, handler: EventHandler): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    
    this.handlers.get(eventName)!.push(handler);
    
    logger.info({
      eventName,
      handlerCount: this.handlers.get(eventName)!.length,
    }, 'Event subscription added');
  }

  /**
   * Unsubscribe from an event
   * @param eventName - The name of the event to unsubscribe from
   * @param handler - The handler to remove
   */
  unsubscribe(eventName: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        logger.info({
          eventName,
          remainingHandlers: handlers.length,
        }, 'Event subscription removed');
      }
    }
  }

  /**
   * Publish an event to all subscribers
   * @param eventName - The name of the event to publish
   * @param payload - The data to send with the event
   */
  async publish(eventName: string, payload: EventPayload): Promise<void> {
    const event: Event = {
      name: eventName,
      payload,
      timestamp: new Date(),
      id: this.generateEventId(),
    };

    // Add to history
    this.addToHistory(event);

    // Get handlers for this event
    const handlers = this.handlers.get(eventName) || [];
    
    logger.info({
      eventName,
      handlerCount: handlers.length,
      eventId: event.id,
    }, 'Publishing event');

    // Execute all handlers
    const promises = handlers.map(async (handler, index) => {
      try {
        await handler(payload);
        logger.debug({
          eventName,
          eventId: event.id,
          handlerIndex: index,
        }, 'Event handler executed successfully');
      } catch (error) {
        logger.error({
          eventName,
          eventId: event.id,
          handlerIndex: index,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Event handler failed');
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Get all registered event names
   */
  getEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get the number of handlers for a specific event
   */
  getHandlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.length || 0;
  }

  /**
   * Get recent event history
   */
  getEventHistory(limit: number = 50): Event[] {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    logger.info('Event history cleared');
  }

  /**
   * Add event to history with size management
   */
  private addToHistory(event: Event): void {
    this.eventHistory.push(event);
    
    // Keep history size manageable
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Export common event names for type safety
export const EventNames = {
  // User events
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  
  // Project/Tenant events
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',
  
  // Search events
  SEARCH_REQUESTED: 'search.requested',
  SEARCH_COMPLETED: 'search.completed',
  
  // Notification events
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
  
  // Billing events
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  PAYMENT_PROCESSED: 'payment.processed',
  
  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
} as const;
