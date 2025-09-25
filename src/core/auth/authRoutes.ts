import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { JWTService } from './jwtService';
import { getMainClient } from '../../shared/database/mainClient';
import { hashPassword, verifyPassword } from '../../shared/utils/encryption';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticateToken } from '../../middleware/authMiddleware';
import { eventBus, EventNames } from '../event-bus';
import pino from 'pino';

const logger = pino();
const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * POST /auth/register
 * Register a new user
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = registerSchema.parse(req.body);
  const { email, password, firstName, lastName } = validatedData;

  const mainClient = getMainClient();

  // Check if user already exists
  const existingUser = await mainClient.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists',
    });
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await mainClient.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
    },
  });

  // Generate tokens
  const accessToken = JWTService.generateAccessToken({
    userId: user.id,
    email: user.email,
  });

  const refreshTokenId = `rt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const refreshToken = JWTService.generateRefreshToken(user.id, refreshTokenId);

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
  await JWTService.storeRefreshToken(user.id, refreshTokenId, expiresAt);

  // Publish event
  await eventBus.publish(EventNames.USER_REGISTERED, {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });

  logger.info({
    userId: user.id,
    email: user.email,
  }, 'User registered successfully');

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: '15m',
      },
    },
  });
}));

/**
 * POST /auth/login
 * Authenticate user and return tokens
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = loginSchema.parse(req.body);
  const { email, password } = validatedData;

  const mainClient = getMainClient();

  // Find user
  const user = await mainClient.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is inactive',
    });
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  // Generate tokens
  const accessToken = JWTService.generateAccessToken({
    userId: user.id,
    email: user.email,
  });

  const refreshTokenId = `rt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const refreshToken = JWTService.generateRefreshToken(user.id, refreshTokenId);

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
  await JWTService.storeRefreshToken(user.id, refreshTokenId, expiresAt);

  // Publish event
  await eventBus.publish(EventNames.USER_LOGIN, {
    userId: user.id,
    email: user.email,
    loginTime: new Date(),
  });

  logger.info({
    userId: user.id,
    email: user.email,
  }, 'User logged in successfully');

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: '15m',
      },
    },
  });
}));

/**
 * POST /auth/refresh-token
 * Get new access token using refresh token
 */
router.post('/refresh-token', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = refreshTokenSchema.parse(req.body);
  const { refreshToken } = validatedData;

  // Verify refresh token
  const payload = JWTService.verifyRefreshToken(refreshToken);

  // Validate refresh token in database
  const storedToken = await JWTService.validateRefreshToken(payload.tokenId);
  if (!storedToken) {
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
    });
  }

  // Generate new access token
  const newAccessToken = JWTService.generateAccessToken({
    userId: storedToken.user.id,
    email: storedToken.user.email,
  });

  logger.info({
    userId: storedToken.user.id,
    email: storedToken.user.email,
  }, 'Access token refreshed');

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      accessToken: newAccessToken,
      expiresIn: '15m',
    },
  });
}));

/**
 * POST /auth/logout
 * Logout user and revoke refresh token
 */
router.post('/logout', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;

  if (refreshToken) {
    try {
      const payload = JWTService.verifyRefreshToken(refreshToken);
      await JWTService.revokeRefreshToken(payload.tokenId);
    } catch (error) {
      // Ignore invalid refresh token errors during logout
      logger.debug('Invalid refresh token during logout');
    }
  }

  // Publish event
  await eventBus.publish(EventNames.USER_LOGOUT, {
    userId: req.user!.id,
    email: req.user!.email,
    logoutTime: new Date(),
  });

  logger.info({
    userId: req.user!.id,
    email: req.user!.email,
  }, 'User logged out');

  res.json({
    success: true,
    message: 'Logout successful',
  });
}));

/**
 * GET /auth/me
 * Get current user information
 */
router.get('/me', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const mainClient = getMainClient();

  const user = await mainClient.user.findUnique({
    where: { id: req.user!.id },
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

  if (!user) {
    return res.status(404).json({
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
 * POST /auth/revoke-all-tokens
 * Revoke all refresh tokens for the current user
 */
router.post('/revoke-all-tokens', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  await JWTService.revokeAllUserRefreshTokens(req.user!.id);

  logger.info({
    userId: req.user!.id,
    email: req.user!.email,
  }, 'All refresh tokens revoked');

  res.json({
    success: true,
    message: 'All tokens revoked successfully',
  });
}));

export { router as authRoutes };
