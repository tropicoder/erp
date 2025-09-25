import { PrismaClient as TenantPrismaClient } from '../generated/tenant-client';
import { config } from '../../config/config';

// Cache for tenant-specific Prisma clients
const tenantClients = new Map<string, TenantPrismaClient>();

export const getTenantClient = (connectionString: string): TenantPrismaClient => {
  // Check if client already exists in cache
  if (tenantClients.has(connectionString)) {
    return tenantClients.get(connectionString)!;
  }

  // Create new client for this tenant
  const client = new TenantPrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
    log: config.nodeEnv === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  // Cache the client
  tenantClients.set(connectionString, client);

  return client;
};

export const disconnectTenantClient = async (connectionString: string): Promise<void> => {
  const client = tenantClients.get(connectionString);
  if (client) {
    await client.$disconnect();
    tenantClients.delete(connectionString);
  }
};

export const disconnectAllTenantClients = async (): Promise<void> => {
  const disconnectPromises = Array.from(tenantClients.values()).map(client => 
    client.$disconnect()
  );
  await Promise.all(disconnectPromises);
  tenantClients.clear();
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectAllTenantClients();
});
