import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { getMainClient } from '../../shared/database/mainClient';
import { encrypt } from '../../shared/utils/encryption';
import { normalizeDomain, isValidDomain } from '../../shared/utils/domainUtils';
import { eventBus, EventNames } from '../event-bus';
import pino from 'pino';

const logger = pino();
const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  slug: z.string().min(1, 'Project slug is required').regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  domain: z.string().min(1, 'Domain is required').refine(isValidDomain, 'Invalid domain format').optional(),
  dbConnectionString: z.string().min(1, 'Database connection string is required'),
  s3Bucket: z.string().min(1, 'S3 bucket name is required'),
  s3Endpoint: z.string().url('Invalid S3 endpoint URL'),
  s3AccessKey: z.string().min(1, 'S3 access key is required'),
  s3SecretKey: z.string().min(1, 'S3 secret key is required'),
  llmProvider: z.enum(['NEXUS', 'OPENAI', 'ANTHROPIC', 'CUSTOM']).default('NEXUS'),
  llmApiKey: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').optional(),
  domain: z.string().min(1, 'Domain is required').refine(isValidDomain, 'Invalid domain format').optional(),
  dbConnectionString: z.string().min(1, 'Database connection string is required').optional(),
  s3Bucket: z.string().min(1, 'S3 bucket name is required').optional(),
  s3Endpoint: z.string().url('Invalid S3 endpoint URL').optional(),
  s3AccessKey: z.string().min(1, 'S3 access key is required').optional(),
  s3SecretKey: z.string().min(1, 'S3 secret key is required').optional(),
  llmProvider: z.enum(['NEXUS', 'OPENAI', 'ANTHROPIC', 'CUSTOM']).optional(),
  llmApiKey: z.string().optional(),
  isActive: z.boolean().optional(),
});

const addUserToProjectSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

/**
 * GET /tenants
 * Get all projects/tenants (admin only)
 */
router.get('/', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const mainClient = getMainClient();
  const { page = 1, limit = 10, search } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = search ? {
    OR: [
      { name: { contains: search as string, mode: 'insensitive' as const } },
      { slug: { contains: search as string, mode: 'insensitive' as const } },
      { domain: { contains: search as string, mode: 'insensitive' as const } },
    ],
  } : {};

  const [projects, total] = await Promise.all([
    mainClient.project.findMany({
      where,
      skip,
      take,
      include: {
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
      orderBy: { createdAt: 'desc' },
    }),
    mainClient.project.count({ where }),
  ]);

  // Remove sensitive data from response
  const safeProjects = projects.map(project => ({
    ...project,
    dbConnectionString: '[ENCRYPTED]',
    s3AccessKey: '[ENCRYPTED]',
    s3SecretKey: '[ENCRYPTED]',
    llmApiKey: project.llmApiKey ? '[ENCRYPTED]' : null,
  }));

  res.json({
    success: true,
    data: {
      projects: safeProjects,
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
 * POST /tenants
 * Create a new project/tenant
 */
router.post('/', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createProjectSchema.parse(req.body);
  const {
    name,
    slug,
    domain: rawDomain,
    dbConnectionString,
    s3Bucket,
    s3Endpoint,
    s3AccessKey,
    s3SecretKey,
    llmProvider,
    llmApiKey,
  } = validatedData;

  // Normalize domain if provided
  const domain = rawDomain ? normalizeDomain(rawDomain) : undefined;

  const mainClient = getMainClient();

  // Check if project with this slug or domain already exists
  const whereConditions: any[] = [{ slug }];
  if (domain) {
    whereConditions.push({ domain });
  }

  const existingProject = await mainClient.project.findFirst({
    where: {
      OR: whereConditions,
    },
  });

  if (existingProject) {
    res.status(400).json({
      success: false,
      message: existingProject.slug === slug
        ? 'Project with this slug already exists'
        : 'Project with this domain already exists',
    });

    return;
  }

  // Encrypt sensitive data
  const encryptedDbConnectionString = encrypt(dbConnectionString);
  const encryptedS3AccessKey = encrypt(s3AccessKey);
  const encryptedS3SecretKey = encrypt(s3SecretKey);
  const encryptedLlmApiKey = llmApiKey ? encrypt(llmApiKey) : null;

  // Create project
  const projectData: any = {
    name,
    slug,
    dbConnectionString: encryptedDbConnectionString,
    s3Bucket,
    s3Endpoint,
    s3AccessKey: encryptedS3AccessKey,
    s3SecretKey: encryptedS3SecretKey,
    llmProvider,
    llmApiKey: encryptedLlmApiKey,
  };

  if (domain) {
    projectData.domain = domain;
  }

  const project = await mainClient.project.create({
    data: projectData,
  });

  // Add creator as admin
  await mainClient.userProject.create({
    data: {
      userId: req.user!.id,
      projectId: project.id,
      role: 'admin',
    },
  });

  // Publish event
  await eventBus.publish(EventNames.PROJECT_CREATED, {
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    createdBy: req.user!.id,
  });

  logger.info({
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    createdBy: req.user!.id,
  }, 'Project created');

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: {
      project: {
        ...project,
        dbConnectionString: '[ENCRYPTED]',
        s3AccessKey: '[ENCRYPTED]',
        s3SecretKey: '[ENCRYPTED]',
        llmApiKey: project.llmApiKey ? '[ENCRYPTED]' : null,
      },
    },
  });

  //intialize tenant here ?

}));

/**
 * GET /tenants/:id
 * Get project by ID
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const mainClient = getMainClient();
  const { id } = req.params;

  const project = await mainClient.project.findUnique({
    where: { id },
    include: {
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
  });

  if (!project) {
     res.status(404).json({
      success: false,
      message: 'Project not found',
    });

    return;
  }

  // Check if user has access to this project
  const userProject = await mainClient.userProject.findFirst({
    where: {
      userId: req.user!.id,
      projectId: id,
    },
  });

  if (!userProject) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this project',
    });

    return;
  }

  // Remove sensitive data from response
  const safeProject = {
    ...project,
    dbConnectionString: '[ENCRYPTED]',
    s3AccessKey: '[ENCRYPTED]',
    s3SecretKey: '[ENCRYPTED]',
    llmApiKey: project.llmApiKey ? '[ENCRYPTED]' : null,
  };

  res.json({
    success: true,
    data: { project: safeProject },
  });
}));

/**
 * PUT /tenants/:id
 * Update project
 */
router.put('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const validatedData = updateProjectSchema.parse(req.body);
  const { id } = req.params;

  const mainClient = getMainClient();

  // Check if project exists
  const existingProject = await mainClient.project.findUnique({
    where: { id },
  });

  if (!existingProject) {
    res.status(404).json({
      success: false,
      message: 'Project not found',
    });

    return ;
  }

  // Check if user is admin of this project
  const userProject = await mainClient.userProject.findFirst({
    where: {
      userId: req.user!.id,
      projectId: id,
      role: 'admin',
    },
  });

  if (!userProject) {
    res.status(403).json({
      success: false,
      message: 'Admin access required to update project',
    });

    return;
  }

  // Prepare update data
  const updateData: any = { ...validatedData };

  // Encrypt sensitive data if provided
  if (validatedData.dbConnectionString) {
    updateData.dbConnectionString = encrypt(validatedData.dbConnectionString);
  }
  if (validatedData.s3AccessKey) {
    updateData.s3AccessKey = encrypt(validatedData.s3AccessKey);
  }
  if (validatedData.s3SecretKey) {
    updateData.s3SecretKey = encrypt(validatedData.s3SecretKey);
  }
  if (validatedData.llmApiKey !== undefined) {
    updateData.llmApiKey = validatedData.llmApiKey ? encrypt(validatedData.llmApiKey) : null;
  }

  // Update project
  const project = await mainClient.project.update({
    where: { id },
    data: updateData,
  });

  // Publish event
  await eventBus.publish(EventNames.PROJECT_UPDATED, {
    projectId: project.id,
    projectName: project.name,
    updatedBy: req.user!.id,
  });

  logger.info({
    projectId: project.id,
    projectName: project.name,
    updatedBy: req.user!.id,
  }, 'Project updated');

  res.json({
    success: true,
    message: 'Project updated successfully',
    data: {
      project: {
        ...project,
        dbConnectionString: '[ENCRYPTED]',
        s3AccessKey: '[ENCRYPTED]',
        s3SecretKey: '[ENCRYPTED]',
        llmApiKey: project.llmApiKey ? '[ENCRYPTED]' : null,
      },
    },
  });
}));

/**
 * DELETE /tenants/:id
 * Delete project
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const mainClient = getMainClient();
  const { id } = req.params;

  // Check if project exists
  const existingProject = await mainClient.project.findUnique({
    where: { id },
  });

  if (!existingProject) {
     res.status(404).json({
      success: false,
      message: 'Project not found',
    });

    return;
  }

  // Check if user is admin of this project
  const userProject = await mainClient.userProject.findFirst({
    where: {
      userId: req.user!.id,
      projectId: id,
      role: 'admin',
    },
  });

  if (!userProject) {
     res.status(403).json({
      success: false,
      message: 'Admin access required to delete project',
    });

    return;
  }

  // Delete project (cascade will handle related records)
  await mainClient.project.delete({
    where: { id },
  });

  // Publish event
  await eventBus.publish(EventNames.PROJECT_DELETED, {
    projectId: id,
    projectName: existingProject.name,
    deletedBy: req.user!.id,
  });

  logger.info({
    projectId: id,
    projectName: existingProject.name,
    deletedBy: req.user!.id,
  }, 'Project deleted');

  res.json({
    success: true,
    message: 'Project deleted successfully',
  });
}));

/**
 * POST /tenants/:id/users
 * Add user to project
 */
router.post('/:id/users', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const validatedData = addUserToProjectSchema.parse(req.body);
  const { id: projectId } = req.params;
  const { userId, role } = validatedData;

  const mainClient = getMainClient();

  // Check if project exists
  const project = await mainClient.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
     res.status(404).json({
      success: false,
      message: 'Project not found',
    });

    return;
  }

  // Check if user is admin of this project
  const userProject = await mainClient.userProject.findFirst({
    where: {
      userId: req.user!.id,
      projectId,
      role: 'admin',
    },
  });

  if (!userProject) {
    res.status(403).json({
      success: false,
      message: 'Admin access required to add users to project',
    });

    return;
  }

  // Check if user exists
  const user = await mainClient.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });

    return;
  }

  // Check if user is already in project
  const existingUserProject = await mainClient.userProject.findFirst({
    where: {
      userId,
      projectId,
    },
  });

  if (existingUserProject) {
    res.status(400).json({
      success: false,
      message: 'User is already a member of this project',
    });

    return;
  }

  // Add user to project
  const newUserProject = await mainClient.userProject.create({
    data: {
      userId,
      projectId,
      role,
    },
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
  });

  logger.info({
    projectId,
    userId,
    role,
    addedBy: req.user!.id,
  }, 'User added to project');

  res.status(201).json({
    success: true,
    message: 'User added to project successfully',
    data: { userProject: newUserProject },
  });
}));

/**
 * GET /tenants/:id/users
 * Get project users
 */
router.get('/:id/users', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const mainClient = getMainClient();
  const { id: projectId } = req.params;

  // Check if user has access to this project
  const userProject = await mainClient.userProject.findFirst({
    where: {
      userId: req.user!.id,
      projectId,
    },
  });

  if (!userProject) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this project',
    });

    return;
  }

  const projectUsers = await mainClient.userProject.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  res.json({
    success: true,
    data: { users: projectUsers },
  });
}));

export { router as tenantRoutes };
