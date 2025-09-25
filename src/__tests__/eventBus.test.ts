import { eventBus, EventNames } from '../core/event-bus';

describe('Event Bus', () => {
  beforeEach(() => {
    // Clear event history before each test
    eventBus.clearHistory();
  });

  describe('Event Publishing and Subscription', () => {
    it('should publish and receive events', async () => {
      const mockHandler = jest.fn();
      
      // Subscribe to an event
      eventBus.subscribe(EventNames.USER_REGISTERED, mockHandler);
      
      // Publish an event
      const eventData = { userId: '123', email: 'test@example.com' };
      await eventBus.publish(EventNames.USER_REGISTERED, eventData);
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockHandler).toHaveBeenCalledWith(eventData);
    });

    it('should handle multiple subscribers', async () => {
      const mockHandler1 = jest.fn();
      const mockHandler2 = jest.fn();
      
      // Subscribe multiple handlers
      eventBus.subscribe(EventNames.USER_LOGIN, mockHandler1);
      eventBus.subscribe(EventNames.USER_LOGIN, mockHandler2);
      
      // Publish an event
      const eventData = { userId: '123', email: 'test@example.com' };
      await eventBus.publish(EventNames.USER_LOGIN, eventData);
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockHandler1).toHaveBeenCalledWith(eventData);
      expect(mockHandler2).toHaveBeenCalledWith(eventData);
    });

    it('should handle subscriber errors gracefully', async () => {
      const mockHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      
      // Subscribe to an event
      eventBus.subscribe(EventNames.USER_LOGOUT, mockHandler);
      
      // Publish an event (should not throw)
      const eventData = { userId: '123' };
      await expect(eventBus.publish(EventNames.USER_LOGOUT, eventData)).resolves.not.toThrow();
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockHandler).toHaveBeenCalledWith(eventData);
    });
  });

  describe('Event History', () => {
    it('should track event history', async () => {
      const eventData = { test: 'data' };
      
      // Publish an event
      await eventBus.publish(EventNames.SYSTEM_STARTUP, eventData);
      
      // Get event history
      const history = eventBus.getEventHistory();
      
      expect(history).toHaveLength(1);
      expect(history[0]).toHaveProperty('name', EventNames.SYSTEM_STARTUP);
      expect(history[0]).toHaveProperty('payload', eventData);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('id');
    });

    it('should limit event history size', async () => {
      // Publish many events
      for (let i = 0; i < 5; i++) {
        await eventBus.publish(EventNames.SYSTEM_STARTUP, { index: i });
      }
      
      const history = eventBus.getEventHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Event Management', () => {
    it('should unsubscribe from events', () => {
      const mockHandler = jest.fn();
      
      // Subscribe and then unsubscribe
      eventBus.subscribe(EventNames.USER_REGISTERED, mockHandler);
      eventBus.unsubscribe(EventNames.USER_REGISTERED, mockHandler);
      
      // Publish event
      eventBus.publish(EventNames.USER_REGISTERED, { test: 'data' });
      
      // Handler should not be called
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should get event names', () => {
      const mockHandler = jest.fn();
      
      // Subscribe to some events
      eventBus.subscribe(EventNames.USER_REGISTERED, mockHandler);
      eventBus.subscribe(EventNames.USER_LOGIN, mockHandler);
      
      const eventNames = eventBus.getEventNames();
      
      expect(eventNames).toContain(EventNames.USER_REGISTERED);
      expect(eventNames).toContain(EventNames.USER_LOGIN);
    });

    it('should get handler count', () => {
      const mockHandler1 = jest.fn();
      const mockHandler2 = jest.fn();
      
      // Subscribe multiple handlers to same event
      eventBus.subscribe(EventNames.USER_REGISTERED, mockHandler1);
      eventBus.subscribe(EventNames.USER_REGISTERED, mockHandler2);
      
      const count = eventBus.getHandlerCount(EventNames.USER_REGISTERED);
      expect(count).toBe(2);
    });
  });
});
