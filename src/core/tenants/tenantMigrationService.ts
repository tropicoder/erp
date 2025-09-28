import { exec } from 'child_process';
import { promisify } from 'util';
import pino from 'pino';

const logger = pino();
const execAsync = promisify(exec);

export class TenantMigrationService {
  /**
   * Check if tenant database is migrated
   */
  async isTenantDatabaseMigrated(connectionString: string): Promise<boolean> {
    try {
      // Check if the tenant database has the new TenantUser table
      const { stdout } = await execAsync(`psql "${connectionString}" -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenant_users');"`);
      
      return stdout.includes('t'); // 't' means true in PostgreSQL
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to check tenant database migration status');
      return false;
    }
  }

  /**
   * Migrate tenant database to new schema
   */
  async migrateTenantDatabase(connectionString: string): Promise<void> {
    try {
      logger.info({ connectionString: connectionString.replace(/:[^:@]*@/, ':***@') }, 'Starting tenant database migration');

      // Run Prisma migrate for tenant schema
      const { stdout, stderr } = await execAsync(
        `npx prisma migrate deploy --schema=prisma/tenant-schema.prisma`,
        {
          env: {
            ...process.env,
            TENANT_DATABASE_URL: connectionString,
          },
        }
      );

      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Migration failed: ${stderr}`);
      }

      logger.info({ stdout }, 'Tenant database migration completed successfully');

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to migrate tenant database');
      throw error;
    }
  }

  /**
   * Migrate existing User data to TenantUser (if needed)
   */
  async migrateUserData(connectionString: string): Promise<void> {
    try {
      logger.info('Starting user data migration from User to TenantUser');

      // Check if users table exists
      const { stdout: usersTableExists } = await execAsync(
        `psql "${connectionString}" -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users');"`
      );

      if (!usersTableExists.includes('t')) {
        logger.info('No existing users table found, skipping user data migration');
        return;
      }

      // Migrate user data from users to tenant_users
      const { stdout, stderr } = await execAsync(`
        psql "${connectionString}" -c "
        INSERT INTO tenant_users (id, user_id, is_active, joined_at, updated_at)
        SELECT 
          id,
          id as user_id,
          is_active,
          created_at as joined_at,
          updated_at
        FROM users
        ON CONFLICT (user_id) DO NOTHING;
        "
      `);

      if (stderr && !stderr.includes('warning')) {
        throw new Error(`User data migration failed: ${stderr}`);
      }

      logger.info({ stdout }, 'User data migration completed successfully');

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to migrate user data');
      throw error;
    }
  }

  /**
   * Clean up old User table after migration
   */
  async cleanupOldUserTable(connectionString: string): Promise<void> {
    try {
      logger.info('Cleaning up old users table');

      // Drop the old users table
      const { stdout, stderr } = await execAsync(`
        psql "${connectionString}" -c "
        DROP TABLE IF EXISTS users CASCADE;
        "
      `);

      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Cleanup failed: ${stderr}`);
      }

      logger.info({ stdout }, 'Old users table cleaned up successfully');

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to cleanup old users table');
      throw error;
    }
  }
}

export const tenantMigrationService = new TenantMigrationService();