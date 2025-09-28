import { getMainClient } from '../../shared/database/mainClient';
import { getTenantClient } from '../../shared/database/tenantClient';
import { decrypt } from '../../shared/utils/encryption';
import pino from 'pino';

const logger = pino();

export class TenantUserService {
  /**
   * Get user information combining main database user with tenant-specific data
   */
  async getUserWithTenantData(projectId: string, userId: string) {
    try {
      // Get main database client
      const mainClient = getMainClient();
      
      // Get project details to retrieve database connection string
      const project = await mainClient.project.findUnique({
        where: { id: projectId },
        select: { dbConnectionString: true },
      });

      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Get tenant client
      const decryptedConnectionString = decrypt(project.dbConnectionString);
      const tenantClient = getTenantClient(decryptedConnectionString);

      // Get user from main database
      const mainUser = await mainClient.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!mainUser) {
        throw new Error(`User with ID ${userId} not found in main database`);
      }

      // Get tenant-specific user data
      const tenantUser = await tenantClient.tenantUser.findUnique({
        where: { userId },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
          groups: {
            include: {
              group: true,
            },
          },
        },
      });

      if (!tenantUser) {
        throw new Error(`User ${userId} is not a member of project ${projectId}`);
      }

      // Combine the data
      return {
        // Main database user data
        id: mainUser.id,
        email: mainUser.email,
        firstName: mainUser.firstName,
        lastName: mainUser.lastName,
        avatar: mainUser.avatar,
        isActive: mainUser.isActive,
        createdAt: mainUser.createdAt,
        updatedAt: mainUser.updatedAt,
        
        // Tenant-specific data
        tenantUser: {
          id: tenantUser.id,
          isActive: tenantUser.isActive,
          joinedAt: tenantUser.joinedAt,
          updatedAt: tenantUser.updatedAt,
          roles: tenantUser.roles.map(ur => ({
            id: ur.role.id,
            name: ur.role.name,
            description: ur.role.description,
            permissions: ur.role.permissions.map(rp => ({
              id: rp.permission.id,
              name: rp.permission.name,
              description: rp.permission.description,
              resource: rp.permission.resource,
              action: rp.permission.action,
            })),
          })),
          groups: tenantUser.groups.map(ug => ({
            id: ug.group.id,
            name: ug.group.name,
            description: ug.group.description,
            isActive: ug.group.isActive,
          })),
        },
      };

    } catch (error) {
      logger.error({
        projectId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to get user with tenant data');

      throw error;
    }
  }

  /**
   * Add user to tenant (create TenantUser record)
   */
  async addUserToTenant(projectId: string, userId: string) {
    try {
      // Get main database client
      const mainClient = getMainClient();
      
      // Verify user exists in main database
      const mainUser = await mainClient.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });

      if (!mainUser) {
        throw new Error(`User with ID ${userId} not found in main database`);
      }

      // Get project details
      const project = await mainClient.project.findUnique({
        where: { id: projectId },
        select: { dbConnectionString: true },
      });

      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Get tenant client
      const decryptedConnectionString = decrypt(project.dbConnectionString);
      const tenantClient = getTenantClient(decryptedConnectionString);

      // Check if user is already in tenant
      const existingTenantUser = await tenantClient.tenantUser.findUnique({
        where: { userId },
      });

      if (existingTenantUser) {
        throw new Error(`User ${userId} is already a member of project ${projectId}`);
      }

      // Create tenant user record
      const tenantUser = await tenantClient.tenantUser.create({
        data: {
          userId,
          isActive: true,
        },
      });

      logger.info({
        projectId,
        userId,
        tenantUserId: tenantUser.id,
      }, 'User added to tenant');

      return tenantUser;

    } catch (error) {
      logger.error({
        projectId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to add user to tenant');

      throw error;
    }
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(projectId: string, userId: string) {
    try {
      // Get project details
      const mainClient = getMainClient();
      const project = await mainClient.project.findUnique({
        where: { id: projectId },
        select: { dbConnectionString: true },
      });

      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Get tenant client
      const decryptedConnectionString = decrypt(project.dbConnectionString);
      const tenantClient = getTenantClient(decryptedConnectionString);

      // Remove tenant user record
      await tenantClient.tenantUser.delete({
        where: { userId },
      });

      logger.info({
        projectId,
        userId,
      }, 'User removed from tenant');

    } catch (error) {
      logger.error({
        projectId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to remove user from tenant');

      throw error;
    }
  }
}

export const tenantUserService = new TenantUserService();
