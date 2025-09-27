import { Request, Response, NextFunction } from 'express';
import { getMainClient } from '../shared/database/mainClient';
import { getTenantClient } from '../shared/database/tenantClient';
import { decrypt } from '../shared/utils/encryption';
import { extractDomainFromHost, normalizeDomain } from '../shared/utils/domainUtils';
import { createError } from './errorHandler';
import pino from 'pino';

const logger = pino();


// Extend Express Request interface to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        slug: string;
        dbConnectionString: string;
        s3Bucket: string;
        s3Endpoint: string;
        s3AccessKey: string;
        s3SecretKey: string;
        llmProvider: string;
        llmApiKey?: string;
      };
      prisma?: any; // Tenant-specific Prisma client
      s3?: any; // Tenant-specific S3 client
    }
  }
}


/**
 * Get project ID by domain
 * @param domain - The domain to look up
 * @returns Project ID or null if not found
 */
async function getProjectIdByDomain(domain: string): Promise<string | null> {
  try {
    const mainClient = getMainClient();

    const project = await mainClient.project.findFirst({
      where: { domain } as any,
      select: { id: true },
    });

    if (project) {
      logger.debug({
        domain,
        projectId: project.id,
      }, 'Project found by domain');

      return project.id;
    }

    return null;
  } catch (error) {
    logger.error({
      domain,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Failed to get project by domain');

    return null;
  }
}

/**
 * Middleware to identify and load tenant context
 * Looks for X-Project-ID header or domain-based identification
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let projectId = req.headers['x-project-id'] as string;
    // If no project ID in header, try to get it from domain
    if (!projectId) {
      const host = req.get('host'); //referal host not this host
      if (host) {
        // Extract and normalize domain from host
        const domain = extractDomainFromHost(host);
        const normalizedDomain = normalizeDomain(domain);
        const foundProjectId = await getProjectIdByDomain(normalizedDomain);
        if (foundProjectId) {
          projectId = foundProjectId;
        }
      }
    }
    
    if (!projectId) {
      // For some routes, tenant context might not be required
      // Let the route handler decide if it needs tenant context
      return next();
    }

    // Get main database client
    const mainClient = getMainClient();
    
    // Fetch project/tenant details from main database
    const project = await mainClient.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw createError('Project not found', 404);
    }

    if (!project.isActive) {
      throw createError('Project is inactive', 403);
    }

    // Decrypt sensitive data
    const decryptedDbConnectionString = decrypt(project.dbConnectionString);
    const decryptedS3AccessKey = decrypt(project.s3AccessKey);
    const decryptedS3SecretKey = decrypt(project.s3SecretKey);
    const decryptedLlmApiKey = project.llmApiKey ? decrypt(project.llmApiKey) : undefined;

    // Attach tenant context to request
    req.tenant = {
      id: project.id,
      name: project.name,
      slug: project.slug,
      dbConnectionString: decryptedDbConnectionString,
      s3Bucket: project.s3Bucket,
      s3Endpoint: project.s3Endpoint,
      s3AccessKey: decryptedS3AccessKey,
      s3SecretKey: decryptedS3SecretKey,
      llmProvider: project.llmProvider,
      llmApiKey: decryptedLlmApiKey,
    };

    // Create tenant-specific Prisma client
    req.prisma = getTenantClient(decryptedDbConnectionString);

    // Create tenant-specific S3 client
    req.s3 = createS3Client({
      endpoint: project.s3Endpoint,
      accessKeyId: decryptedS3AccessKey,
      secretAccessKey: decryptedS3SecretKey,
      bucket: project.s3Bucket,
    });

    logger.info({
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
    }, 'Tenant context loaded');

    next();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: req.headers['x-project-id'],
    }, 'Failed to load tenant context');
    
    next(error);
  }
};

/**
 * Middleware to require tenant context
 * Use this for routes that absolutely need tenant context
 */
export const requireTenant = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.tenant) {
    return next(createError('Tenant context required', 400));
  }
  next();
};

/**
 * Create S3 client for tenant
 */
function createS3Client(config: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): any {
  // This is a placeholder - in a real implementation, you'd use AWS SDK
  // For now, we'll return a mock object
  return {
    config: {
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucket: config.bucket,
    },
    // Mock methods - replace with actual AWS SDK methods
    upload: async (params: any) => {
      logger.info({ params }, 'Mock S3 upload');
      // Use the configured endpoint for the S3 URL
      // return { Location: `https://${config.bucket}.s3.amazonaws.com/${params.Key}` };
      return { Location: `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${params.Key}` };
    },
    getObject: async (params: any) => {
      logger.info({ params }, 'Mock S3 getObject');
      return { Body: 'mock-file-content' };
    },
    deleteObject: async (params: any) => {
      logger.info({ params }, 'Mock S3 deleteObject');
      return {};
    },
  };
}

/**
 * Utility function to get tenant context from request
 */
export const getTenantContext = (req: Request) => {
  if (!req.tenant) {
    throw createError('No tenant context available', 400);
  }
  return req.tenant;
};

/**
 * Utility function to get tenant Prisma client from request
 */
export const getTenantPrisma = (req: Request) => {
  if (!req.prisma) {
    throw createError('No tenant Prisma client available', 400);
  }
  return req.prisma;
};

/**
 * Utility function to get tenant S3 client from request
 */
export const getTenantS3 = (req: Request) => {
  if (!req.s3) {
    throw createError('No tenant S3 client available', 400);
  }
  return req.s3;
};
