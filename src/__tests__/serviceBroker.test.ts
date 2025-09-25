import { serviceBroker, ServiceNames } from '../core/service-broker';

describe('Service Broker', () => {
  beforeEach(() => {
    // Clear call history before each test
    serviceBroker.clearCallHistory();
  });

  describe('Service Registration and Calling', () => {
    it('should register and call services', async () => {
      const mockService = jest.fn().mockResolvedValue('test result');
      
      // Register a service
      serviceBroker.register('test-service', mockService, {
        description: 'Test service',
        version: '1.0.0',
      });
      
      // Call the service
      const result = await serviceBroker.call('test-service', 'arg1', 'arg2');
      
      expect(result).toBe('test result');
      expect(mockService).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle service errors', async () => {
      const mockService = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Register a service that throws
      serviceBroker.register('error-service', mockService);
      
      // Call the service and expect it to throw
      await expect(serviceBroker.call('error-service')).rejects.toThrow('Service error');
    });

    it('should throw error for non-existent service', async () => {
      await expect(serviceBroker.call('non-existent-service')).rejects.toThrow(
        "Service 'non-existent-service' not found"
      );
    });
  });

  describe('Service Management', () => {
    it('should check if service exists', () => {
      const mockService = jest.fn();
      
      // Register a service
      serviceBroker.register('exists-service', mockService);
      
      expect(serviceBroker.hasService('exists-service')).toBe(true);
      expect(serviceBroker.hasService('non-existent-service')).toBe(false);
    });

    it('should get service names', () => {
      const mockService = jest.fn();
      
      // Register multiple services
      serviceBroker.register('service1', mockService);
      serviceBroker.register('service2', mockService);
      
      const serviceNames = serviceBroker.getServiceNames();
      
      expect(serviceNames).toContain('service1');
      expect(serviceBroker.getServiceNames()).toContain('service2');
    });

    it('should get service definition', () => {
      const mockService = jest.fn();
      const serviceDef = {
        description: 'Test service',
        version: '1.0.0',
        metadata: { category: 'test' },
      };
      
      // Register a service with metadata
      serviceBroker.register('metadata-service', mockService, serviceDef);
      
      const retrieved = serviceBroker.getService('metadata-service');
      
      expect(retrieved).toHaveProperty('name', 'metadata-service');
      expect(retrieved).toHaveProperty('description', serviceDef.description);
      expect(retrieved).toHaveProperty('version', serviceDef.version);
      expect(retrieved).toHaveProperty('metadata', serviceDef.metadata);
    });

    it('should unregister services', () => {
      const mockService = jest.fn();
      
      // Register and then unregister
      serviceBroker.register('unregister-service', mockService);
      expect(serviceBroker.hasService('unregister-service')).toBe(true);
      
      serviceBroker.unregister('unregister-service');
      expect(serviceBroker.hasService('unregister-service')).toBe(false);
    });
  });

  describe('Call History and Statistics', () => {
    it('should track call history', async () => {
      const mockService = jest.fn().mockResolvedValue('result');
      
      // Register a service
      serviceBroker.register('history-service', mockService);
      
      // Call the service
      await serviceBroker.call('history-service', 'test');
      
      // Get call history
      const history = serviceBroker.getCallHistory();
      
      expect(history).toHaveLength(1);
      expect(history[0]).toHaveProperty('serviceName', 'history-service');
      expect(history[0]).toHaveProperty('args', ['test']);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('id');
    });

    it('should get service statistics', () => {
      const mockService = jest.fn();
      
      // Register multiple services
      serviceBroker.register('stats-service1', mockService, { description: 'Service 1' });
      serviceBroker.register('stats-service2', mockService, { description: 'Service 2' });
      
      const stats = serviceBroker.getStats();
      
      expect(stats).toHaveProperty('totalServices', 2);
      expect(stats).toHaveProperty('totalCalls', 0);
      expect(stats).toHaveProperty('services');
      expect(stats.services).toHaveLength(2);
      expect(stats.services[0]).toHaveProperty('name');
      expect(stats.services[0]).toHaveProperty('version');
    });
  });
});
