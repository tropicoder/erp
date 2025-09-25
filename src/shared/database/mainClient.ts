import { PrismaClient } from '@prisma/client';
import { config } from '../../config/config';

// Main database client for Nexus core (users, projects, etc.)
let mainClient: PrismaClient | null = null;

export const getMainClient = (): PrismaClient => {
  if (!mainClient) {
    mainClient = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: config.nodeEnv === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }
  return mainClient;
};

export const disconnectMainClient = async (): Promise<void> => {
  if (mainClient) {
    await mainClient.$disconnect();
    mainClient = null;
  }
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectMainClient();
});
