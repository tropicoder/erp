import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { requireTenant, tenantMiddleware } from '../../middleware/tenantMiddleware';
import { can } from './permissionMiddleware';
import { getTenantPrisma } from '../../middleware/tenantMiddleware';
import pino from 'pino';

const logger = pino();
const router = Router();

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  roleIds: z.array(z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
});

const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.string()).optional(),
});

const createPermissionSchema = z.object({
  name: z.string().min(1, 'Permission name is required'),
  description: z.string().optional(),
  resource: z.string().min(1, 'Resource is required'),
  action: z.string().min(1, 'Action is required'),
});

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  parentId: z.string().optional(),
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

/**
 * GET /users
 * Get all users in the tenant
 */
router.get('/users', authenticateToken, tenantMiddleware, requireTenant, can('read:users'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);
  const { page = 1, limit = 10, search } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = search ? {
    OR: [
      { firstName: { contains: search as string, mode: 'insensitive' } },
      { lastName: { contains: search as string, mode: 'insensitive' } },
      { email: { contains: search as string, mode: 'insensitive' } },
    ],
  } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        groups: {
          include: {
            group: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    },
  });
}));

/**
 * POST /users
 * Create a new user
 */
router.post('/users', authenticateToken, tenantMiddleware, requireTenant, can('create:users'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createUserSchema.parse(req.body);
  const { email, firstName, lastName, roleIds = [], groupIds = [] } = validatedData;

  const prisma = getTenantPrisma(req);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
     res.status(400).json({
      success: false,
      message: 'User with this email already exists',
    });
    return;
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      roles: {
        create: roleIds.map(roleId => ({
          roleId,
        })),
      },
      groups: {
        create: groupIds.map(groupId => ({
          groupId,
        })),
      },
    },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
      groups: {
        include: {
          group: true,
        },
      },
    },
  });

  logger.info({
    userId: user.id,
    email: user.email,
    createdBy: req.user!.id,
  }, 'User created');

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: { user },
  });
}));

/**
 * GET /users/:id
 * Get user by ID
 */
router.get('/users/:id', authenticateToken, tenantMiddleware, requireTenant, can('read:users'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
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

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  res.json({
    success: true,
    data: { user },
  });
}));

/**
 * PUT /users/:id
 * Update user
 */
router.put('/users/:id', authenticateToken, tenantMiddleware, requireTenant, can('update:users'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = updateUserSchema.parse(req.body);
  const { id } = req.params;
  const { roleIds, groupIds, ...updateData } = validatedData;

  const prisma = getTenantPrisma(req);

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Update user
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...updateData,
      ...(roleIds && {
        roles: {
          deleteMany: {},
          create: roleIds.map(roleId => ({ roleId })),
        },
      }),
      ...(groupIds && {
        groups: {
          deleteMany: {},
          create: groupIds.map(groupId => ({ groupId })),
        },
      }),
    },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
      groups: {
        include: {
          group: true,
        },
      },
    },
  });

  logger.info({
    userId: user.id,
    email: user.email,
    updatedBy: req.user!.id,
  }, 'User updated');

  res.json({
    success: true,
    message: 'User updated successfully',
    data: { user },
  });
}));

/**
 * DELETE /users/:id
 * Delete user
 */
router.delete('/users/:id', authenticateToken, tenantMiddleware, requireTenant, can('delete:users'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);
  const { id } = req.params;

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Delete user (cascade will handle related records)
  await prisma.user.delete({
    where: { id },
  });

  logger.info({
    userId: id,
    deletedBy: req.user!.id,
  }, 'User deleted');

  res.json({
    success: true,
    message: 'User deleted successfully',
  });
}));

// ============================================
// ROLE MANAGEMENT ROUTES
// ============================================

/**
 * GET /roles
 * Get all roles
 */
router.get('/roles', authenticateToken, tenantMiddleware, requireTenant, can('read:roles'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);

  const roles = await prisma.role.findMany({
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      users: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: { roles },
  });
}));

/**
 * POST /roles
 * Create a new role
 */
router.post('/roles', authenticateToken, tenantMiddleware, requireTenant, can('create:roles'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createRoleSchema.parse(req.body);
  const { name, description, permissionIds = [] } = validatedData;

  const prisma = getTenantPrisma(req);

  // Check if role already exists
  const existingRole = await prisma.role.findUnique({
    where: { name },
  });

  if (existingRole) {
    res.status(400).json({
      success: false,
      message: 'Role with this name already exists',
    });
    return;
  }

  // Create role
  const role = await prisma.role.create({
    data: {
      name,
      description,
      permissions: {
        create: permissionIds.map(permissionId => ({
          permissionId,
        })),
      },
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  logger.info({
    roleId: role.id,
    roleName: role.name,
    createdBy: req.user!.id,
  }, 'Role created');

  res.status(201).json({
    success: true,
    message: 'Role created successfully',
    data: { role },
  });
}));

// ============================================
// PERMISSION MANAGEMENT ROUTES
// ============================================

/**
 * GET /permissions
 * Get all permissions
 */
router.get('/permissions', authenticateToken, tenantMiddleware, requireTenant, can('read:permissions'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);

  const permissions = await prisma.permission.findMany({
    include: {
      roles: {
        include: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  });

  res.json({
    success: true,
    data: { permissions },
  });
}));

/**
 * POST /permissions
 * Create a new permission
 */
router.post('/permissions', authenticateToken, tenantMiddleware, requireTenant, can('create:permissions'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createPermissionSchema.parse(req.body);
  const { name, description, resource, action } = validatedData;

  const prisma = getTenantPrisma(req);

  // Check if permission already exists
  const existingPermission = await prisma.permission.findFirst({
    where: {
      resource,
      action,
    },
  });

  if (existingPermission) {
    res.status(400).json({
      success: false,
      message: 'Permission with this resource and action already exists',
    });
    return;
  }

  // Create permission
  const permission = await prisma.permission.create({
    data: {
      name,
      description,
      resource,
      action,
    },
  });

  logger.info({
    permissionId: permission.id,
    permissionName: permission.name,
    createdBy: req.user!.id,
  }, 'Permission created');

  res.status(201).json({
    success: true,
    message: 'Permission created successfully',
    data: { permission },
  });
}));

// ============================================
// GROUP MANAGEMENT ROUTES
// ============================================

/**
 * GET /groups
 * Get all groups
 */
router.get('/groups', authenticateToken, tenantMiddleware, requireTenant, can('read:groups'), asyncHandler(async (req: Request, res: Response) => {
  const prisma = getTenantPrisma(req);

  const groups = await prisma.group.findMany({
    include: {
      parent: true,
      children: true,
      users: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: { groups },
  });
}));

/**
 * POST /groups
 * Create a new group
 */
router.post('/groups', authenticateToken, tenantMiddleware, requireTenant, can('create:groups'), asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createGroupSchema.parse(req.body);
  const { name, description, parentId } = validatedData;

  const prisma = getTenantPrisma(req);

  // Check if group already exists
  const existingGroup = await prisma.group.findFirst({
    where: { name },
  });

  if (existingGroup) {
     res.status(400).json({
      success: false,
      message: 'Group with this name already exists',
    });
    return;
  }

  // Create group
  const group = await prisma.group.create({
    data: {
      name,
      description,
      parentId,
    },
    include: {
      parent: true,
      children: true,
    },
  });

  logger.info({
    groupId: group.id,
    groupName: group.name,
    createdBy: req.user!.id,
  }, 'Group created');

  res.status(201).json({
    success: true,
    message: 'Group created successfully',
    data: { group },
  });
}));

export { router as iamRoutes };
