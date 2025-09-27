import { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../../middleware/tenantMiddleware';
import { getCurrentUser } from '../../middleware/authMiddleware';
import { createError } from '../../middleware/errorHandler';
import pino from 'pino';

const logger = pino();

/**
 * Permission checking middleware
 * Verifies if the authenticated user has the required permission
 * @param permission - The permission to check (e.g., 'create:invoice', 'read:document')
 */
export const can = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getCurrentUser(req);
      const prisma = getTenantPrisma(req);

      // Check if user has the required permission through their roles
      const hasPermission = await checkUserPermission(prisma, user.id, permission);

      if (!hasPermission) {
        logger.warn({
          userId: user.id,
          permission,
          path: req.path,
          method: req.method,
        }, 'Permission denied');

        return next(createError(`Permission denied: ${permission}`, 403));
      }

      logger.debug({
        userId: user.id,
        permission,
        path: req.path,
        method: req.method,
      }, 'Permission granted');

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has a specific permission
 * @param prisma - Tenant Prisma client
 * @param userId - User ID
 * @param permission - Permission to check
 * @returns True if user has permission
 */
export const checkUserPermission = async (
  prisma: any,
  userId: string,
  permission: string
): Promise<boolean> => {
  try {
    // Find user's roles
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
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
    });

    // Check if any role has the required permission
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        if (rolePermission.permission.name === permission) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      permission,
    }, 'Error checking user permission');

    return false;
  }
};

/**
 * Check if user has any of the specified permissions
 * @param permissions - Array of permissions to check
 */
export const canAny = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getCurrentUser(req);
      const prisma = getTenantPrisma(req);

      // Check if user has any of the required permissions
      for (const permission of permissions) {
        const hasPermission = await checkUserPermission(prisma, user.id, permission);
        if (hasPermission) {
          return next();
        }
      }

      logger.warn({
        userId: user.id,
        permissions,
        path: req.path,
        method: req.method,
      }, 'No required permissions found');

      return next(createError(`Permission denied: requires one of [${permissions.join(', ')}]`, 403));
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has all of the specified permissions
 * @param permissions - Array of permissions to check
 */
export const canAll = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getCurrentUser(req);
      const prisma = getTenantPrisma(req);

      // Check if user has all required permissions
      for (const permission of permissions) {
        const hasPermission = await checkUserPermission(prisma, user.id, permission);
        if (!hasPermission) {
          logger.warn({
            userId: user.id,
            permission,
            path: req.path,
            method: req.method,
          }, 'Missing required permission');

          return next(createError(`Permission denied: missing ${permission}`, 403));
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user belongs to a specific group
 * @param groupName - Name of the group to check
 */
export const belongsToGroup = (groupName: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getCurrentUser(req);
      const prisma = getTenantPrisma(req);

      const userGroup = await prisma.userGroup.findFirst({
        where: {
          userId: user.id,
          group: {
            name: groupName,
          },
        },
      });

      if (!userGroup) {
        logger.warn({
          userId: user.id,
          groupName,
          path: req.path,
          method: req.method,
        }, 'User not in required group');

        return next(createError(`Access denied: not member of group ${groupName}`, 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has a specific role
 * @param roleName - Name of the role to check
 */
export const hasRole = (roleName: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getCurrentUser(req);
      const prisma = getTenantPrisma(req);

      const userRole = await prisma.userRole.findFirst({
        where: {
          userId: user.id,
          role: {
            name: roleName,
          },
        },
      });

      if (!userRole) {
        logger.warn({
          userId: user.id,
          roleName,
          path: req.path,
          method: req.method,
        }, 'User does not have required role');

        return next(createError(`Access denied: role ${roleName} required`, 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Utility function to get user permissions
 * @param prisma - Tenant Prisma client
 * @param userId - User ID
 * @returns Array of permission names
 */
export const getUserPermissions = async (prisma: any, userId: string): Promise<string[]> => {
  try {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
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
    });

    const permissions = new Set<string>();

    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.name);
      }
    }

    return Array.from(permissions);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    }, 'Error getting user permissions');

    return [];
  }
};

/**
 * Utility function to get user roles
 * @param prisma - Tenant Prisma client
 * @param userId - User ID
 * @returns Array of role names
 */
export const getUserRoles = async (prisma: any, userId: string): Promise<string[]> => {
  try {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: true,
      },
    });

    return userRoles.map((userRole: any) => userRole.role.name);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    }, 'Error getting user roles');

    return [];
  }
};
