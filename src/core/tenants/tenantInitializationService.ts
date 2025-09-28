import { getTenantClient } from '../../shared/database/tenantClient';
import { getMainClient } from '../../shared/database/mainClient';
import { decrypt } from '../../shared/utils/encryption';
import { eventBus, EventNames } from '../event-bus';
import { tenantMigrationService } from './tenantMigrationService';
import pino from 'pino';
import { PrismaClient as TenantPrismaClient } from '../../shared/generated/tenant-client/index'; 

const logger = pino();

export class TenantInitializationService {
  /**
   * Initialize a new tenant with default roles, permissions, and admin user
   */
  async initializeTenant(projectId: string, creatorUserId: string, creatorEmail: string): Promise<void> {
    try {
      logger.info({ projectId, creatorUserId }, 'Starting tenant initialization');

      // Get project details to retrieve database connection string
      const mainClient = getMainClient();
      const project = await mainClient.project.findUnique({
        where: { id: projectId },
        select: { dbConnectionString: true },
      });

      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Get tenant client with the project's database connection string
      // Decrypt the connection string if it's encrypted
      const decryptedConnectionString = decrypt(project.dbConnectionString);
      //logger.info({ decryptedConnectionString }, 'Decrypted connection string');
      const tenantClient: TenantPrismaClient = getTenantClient(decryptedConnectionString);

      if (!tenantClient) {
        throw new Error('Failed to create tenant client - connection string may be invalid');
      }

      logger.info({ projectId }, 'Tenant client created successfully');

      // 0. Migrate tenant database if needed
      logger.info({ projectId }, 'Checking tenant database migration status...');
      // const isMigrated = await tenantMigrationService.isTenantDatabaseMigrated(decryptedConnectionString);
      
      // if (!isMigrated) {
      //   logger.info({ projectId }, 'Running tenant database migration...');
      //   await tenantMigrationService.migrateTenantDatabase(decryptedConnectionString);
      //   logger.info({ projectId }, 'Tenant database migration completed');
      // } else {
      //   logger.info({ projectId }, 'Tenant database is already migrated');
      // }

      // 1. Create default permissions
      logger.info({ projectId }, 'Creating default permissions...');
      const permissions = await this.createDefaultPermissions(tenantClient);

      // 2. Create default roles
      logger.info({ projectId }, 'Creating default roles...');
      const roles = await this.createDefaultRoles(tenantClient, permissions);

      // 3. Create admin user in tenant database
      logger.info({ projectId, creatorUserId }, 'Creating admin user...');
      const adminUser = await this.createAdminUser(tenantClient, creatorUserId, creatorEmail);

      // 4. Assign admin role to creator
      logger.info({ projectId, creatorUserId }, 'Assigning admin role...');
      await this.assignAdminRole(tenantClient, adminUser.id, roles.admin.id);

      // 5. Create default groups
      logger.info({ projectId }, 'Creating default groups...');
      await this.createDefaultGroups(tenantClient);

      logger.info({ projectId, creatorUserId }, 'Tenant initialization completed successfully');

      // Publish event
      await eventBus.publish(EventNames.TENANT_INITIALIZED, {
        projectId,
        creatorUserId,
        adminUserId: adminUser.id,
        rolesCreated: Object.keys(roles).length,
        permissionsCreated: permissions.length,
      });

    } catch (error) {
      logger.error({
        projectId,
        creatorUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to initialize tenant');

      throw error;
    }
  }

  /**
   * Create default permissions for the tenant
   */
  private async createDefaultPermissions(tenantClient: TenantPrismaClient) {
    try {
      const defaultPermissions = [
      // User management
      { name: 'create:users', description: 'Create users', resource: 'users', action: 'create' },
      { name: 'read:users', description: 'Read users', resource: 'users', action: 'read' },
      { name: 'update:users', description: 'Update users', resource: 'users', action: 'update' },
      { name: 'delete:users', description: 'Delete users', resource: 'users', action: 'delete' },

      // Role management
      { name: 'create:roles', description: 'Create roles', resource: 'roles', action: 'create' },
      { name: 'read:roles', description: 'Read roles', resource: 'roles', action: 'read' },
      { name: 'update:roles', description: 'Update roles', resource: 'roles', action: 'update' },
      { name: 'delete:roles', description: 'Delete roles', resource: 'roles', action: 'delete' },

      // Permission management
      { name: 'create:permissions', description: 'Create permissions', resource: 'permissions', action: 'create' },
      { name: 'read:permissions', description: 'Read permissions', resource: 'permissions', action: 'read' },
      { name: 'update:permissions', description: 'Update permissions', resource: 'permissions', action: 'update' },
      { name: 'delete:permissions', description: 'Delete permissions', resource: 'permissions', action: 'delete' },

      // Group management
      { name: 'create:groups', description: 'Create groups', resource: 'groups', action: 'create' },
      { name: 'read:groups', description: 'Read groups', resource: 'groups', action: 'read' },
      { name: 'update:groups', description: 'Update groups', resource: 'groups', action: 'update' },
      { name: 'delete:groups', description: 'Delete groups', resource: 'groups', action: 'delete' },

      // Document management
      { name: 'create:documents', description: 'Create documents', resource: 'documents', action: 'create' },
      { name: 'read:documents', description: 'Read documents', resource: 'documents', action: 'read' },
      { name: 'update:documents', description: 'Update documents', resource: 'documents', action: 'update' },
      { name: 'delete:documents', description: 'Delete documents', resource: 'documents', action: 'delete' },

      // Invoice management
      { name: 'create:invoices', description: 'Create invoices', resource: 'invoices', action: 'create' },
      { name: 'read:invoices', description: 'Read invoices', resource: 'invoices', action: 'read' },
      { name: 'update:invoices', description: 'Update invoices', resource: 'invoices', action: 'update' },
      { name: 'delete:invoices', description: 'Delete invoices', resource: 'invoices', action: 'delete' },

      // Settings management
      { name: 'read:settings', description: 'Read settings', resource: 'settings', action: 'read' },
      { name: 'update:settings', description: 'Update settings', resource: 'settings', action: 'update' },
    ];

    const createdPermissions = [];
    for (const permission of defaultPermissions) {
      const created = await tenantClient.permission.create({
        data: permission,
      });
      createdPermissions.push(created);
    }

      logger.info({ count: createdPermissions.length }, 'Default permissions created');
      return createdPermissions;
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to create default permissions');
      throw new Error(`Failed to create default permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create default roles for the tenant
   */
  private async createDefaultRoles(tenantClient: TenantPrismaClient, permissions: any[]) {
    try {
      // Create admin role with all permissions
    const adminRole = await tenantClient.role.create({
      data: {
        name: 'admin',
        description: 'Administrator with full access',
        isActive: true,
      },
    });

    // Assign all permissions to admin role
    for (const permission of permissions) {
      await tenantClient.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      });
    }

    // Create member role with limited permissions
    const memberRole = await tenantClient.role.create({
      data: {
        name: 'member',
        description: 'Standard member with basic access',
        isActive: true,
      },
    });

    // Assign basic permissions to member role
    const memberPermissions = permissions.filter(p => 
      p.resource === 'documents' || 
      p.resource === 'invoices' || 
      (p.resource === 'users' && p.action === 'read')
    );

    for (const permission of memberPermissions) {
      await tenantClient.rolePermission.create({
        data: {
          roleId: memberRole.id,
          permissionId: permission.id,
        },
      });
    }

    // Create viewer role with read-only permissions
    const viewerRole = await tenantClient.role.create({
      data: {
        name: 'viewer',
        description: 'Read-only access',
        isActive: true,
      },
    });

    // Assign read permissions to viewer role
    const readPermissions = permissions.filter(p => p.action === 'read');
    for (const permission of readPermissions) {
      await tenantClient.rolePermission.create({
        data: {
          roleId: viewerRole.id,
          permissionId: permission.id,
        },
      });
    }

      logger.info({ adminRole: adminRole.id, memberRole: memberRole.id, viewerRole: viewerRole.id }, 'Default roles created');
      
      return {
        admin: adminRole,
        member: memberRole,
        viewer: viewerRole,
      };
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to create default roles');
      throw new Error(`Failed to create default roles: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create admin tenant user (reference to main database user)
   */
  private async createAdminUser(tenantClient: TenantPrismaClient, creatorUserId: string, creatorEmail: string) {
    try {
      const adminTenantUser = await tenantClient.tenantUser.create({
        data: {
          userId: creatorUserId, // Reference to main database user ID
          isActive: true,
        },
      });

      logger.info({ tenantUserId: adminTenantUser.id, mainUserId: creatorUserId, email: creatorEmail }, 'Admin tenant user created');
      return adminTenantUser;
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to create admin tenant user');
      throw new Error(`Failed to create admin tenant user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Assign admin role to the creator
   */
  private async assignAdminRole(tenantClient: TenantPrismaClient, tenantUserId: string, roleId: string) {
    try {
      await tenantClient.userRole.create({
        data: {
          tenantUserId,
          roleId,
        },
      });

      logger.info({ tenantUserId, roleId }, 'Admin role assigned to creator');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to assign admin role');
      throw new Error(`Failed to assign admin role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create default groups
   */
  private async createDefaultGroups(tenantClient: TenantPrismaClient) {
    try {
      const defaultGroups = [
      {
        name: 'Administrators',
        description: 'System administrators',
        isActive: true,
      },
      {
        name: 'Managers',
        description: 'Department managers',
        isActive: true,
      },
      {
        name: 'Employees',
        description: 'Regular employees',
        isActive: true,
      },
    ];

    const createdGroups = [];
    for (const group of defaultGroups) {
      const created = await tenantClient.group.create({
        data: group,
      });
      createdGroups.push(created);
    }

      logger.info({ count: createdGroups.length }, 'Default groups created');
      return createdGroups;
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to create default groups');
      throw new Error(`Failed to create default groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const tenantInitializationService = new TenantInitializationService();
