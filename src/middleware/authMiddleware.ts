import { Request, Response, NextFunction } from 'express';
import { JWTService, TokenPayload } from '../core/auth/jwtService';
import { getMainClient } from '../shared/database/mainClient';
import { createError } from './errorHandler';
import pino from 'pino';

const logger = pino();

// Extend Express Request interface to include user context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        isActive: boolean;
        projectId?: string;
      };
    }
  }
}

/**
 * Middleware to authenticate JWT tokens
 * Validates the Authorization header and loads user context
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw createError('Access token required', 401);
    }

    // Verify the token
    const payload: TokenPayload = JWTService.verifyAccessToken(token);

    // Get user from database
    const mainClient = getMainClient();
    const user = await mainClient.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw createError('User not found', 401);
    }

    if (!user.isActive) {
      throw createError('User account is inactive', 401);
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      isActive: user.isActive,
      projectId: payload.projectId,
    };

    logger.info({
      userId: user.id,
      email: user.email,
      projectId: payload.projectId,
    }, 'User authenticated');

    next();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
    }, 'Authentication failed');

    if (error instanceof Error && error.message === 'Invalid access token') {
      return next(createError('Invalid access token', 401));
    }

    next(error);
  }
};

/**
 * Optional authentication middleware
 * Similar to authenticateToken but doesn't fail if no token is provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // No token provided, continue without user context
    }

    // If token is provided, validate it
    const payload: TokenPayload = JWTService.verifyAccessToken(token);

    const mainClient = getMainClient();
    const user = await mainClient.user.findUnique({
      where: { id: payload.userId },
    });

    if (user && user.isActive) {
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        isActive: user.isActive,
        projectId: payload.projectId,
      };
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on token errors
    // Just continue without user context
    logger.debug({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Optional authentication failed, continuing without user context');
    
    next();
  }
};

/**
 * Middleware to require specific project access
 * Must be used after authenticateToken
 */
export const requireProjectAccess = (projectId: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }

    // Check if user has access to the specified project
    if (req.user.projectId !== projectId) {
      return next(createError('Access denied to this project', 403));
    }

    next();
  };
};

/**
 * Middleware to require admin role
 * Must be used after authenticateToken
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }

    // Check if user is admin in the current project
    if (!req.user.projectId) {
      return next(createError('Project context required', 400));
    }

    const mainClient = getMainClient();
    const userProject = await mainClient.userProject.findFirst({
      where: {
        userId: req.user.id,
        projectId: req.user.projectId,
        role: 'admin',
      },
    });

    if (!userProject) {
      return next(createError('Admin access required', 403));
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Utility function to get current user from request
 */
export const getCurrentUser = (req: Request) => {
  if (!req.user) {
    throw createError('No user context available', 401);
  }
  return req.user;
};

/**
 * Utility function to check if user is authenticated
 */
export const isAuthenticated = (req: Request): boolean => {
  return !!req.user;
};

/**
 * Utility function to get user ID from request
 */
export const getUserId = (req: Request): string => {
  if (!req.user) {
    throw createError('No user context available', 401);
  }
  return req.user.id;
};
