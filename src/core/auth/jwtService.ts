import jwt from 'jsonwebtoken';
import { config } from '../../config/config';
import { getMainClient } from '../../shared/database/mainClient';
import pino from 'pino';

const logger = pino();

export interface TokenPayload {
  userId: string;
  email: string;
  projectId?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT Service for token generation and validation
 */
export class JWTService {
  /**
   * Generate access token
   * @param payload - Token payload
   * @returns JWT access token
   */
  static generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    const tokenPayload: TokenPayload = {
      ...payload,
    };

    return jwt.sign(tokenPayload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
      issuer: 'nexus-erp',
      audience: 'nexus-api',
    });
  }

  /**
   * Generate refresh token
   * @param userId - User ID
   * @param tokenId - Refresh token ID
   * @returns JWT refresh token
   */
  static generateRefreshToken(userId: string, tokenId: string): string {
    const payload: RefreshTokenPayload = {
      userId,
      tokenId,
    };

    return jwt.sign(payload, config.jwtRefreshSecret, {
      expiresIn: config.jwtRefreshExpiresIn,
      issuer: 'nexus-erp',
      audience: 'nexus-api',
    });
  }

  /**
   * Verify access token
   * @param token - JWT access token
   * @returns Decoded token payload
   */
  static verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        issuer: 'nexus-erp',
        audience: 'nexus-api',
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Access token verification failed');
      
      throw new Error('Invalid access token');
    }
  }

  /**
   * Verify refresh token
   * @param token - JWT refresh token
   * @returns Decoded refresh token payload
   */
  static verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwtRefreshSecret, {
        issuer: 'nexus-erp',
        audience: 'nexus-api',
      }) as RefreshTokenPayload;

      return decoded;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Refresh token verification failed');
      
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param token - JWT token
   * @returns Decoded token payload
   */
  static decodeToken(token: string): any {
    return jwt.decode(token);
  }

  /**
   * Check if token is expired
   * @param token - JWT token
   * @returns True if token is expired
   */
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration time
   * @param token - JWT token
   * @returns Expiration timestamp or null
   */
  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return null;
      }
      
      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }

  /**
   * Store refresh token in database
   * @param userId - User ID
   * @param tokenId - Refresh token ID
   * @param expiresAt - Token expiration time
   * @returns Stored refresh token
   */
  static async storeRefreshToken(
    userId: string,
    tokenId: string,
    expiresAt: Date
  ): Promise<any> {
    const mainClient = getMainClient();
    
    return mainClient.refreshToken.create({
      data: {
        token: tokenId,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Validate refresh token against database
   * @param tokenId - Refresh token ID
   * @returns Refresh token record or null
   */
  static async validateRefreshToken(tokenId: string): Promise<any | null> {
    const mainClient = getMainClient();
    
    const refreshToken = await mainClient.refreshToken.findUnique({
      where: { token: tokenId },
      include: { user: true },
    });

    if (!refreshToken) {
      return null;
    }

    // Check if token is expired
    if (refreshToken.expiresAt < new Date()) {
      // Clean up expired token
      await mainClient.refreshToken.delete({
        where: { id: refreshToken.id },
      });
      return null;
    }

    return refreshToken;
  }

  /**
   * Revoke refresh token
   * @param tokenId - Refresh token ID
   */
  static async revokeRefreshToken(tokenId: string): Promise<void> {
    const mainClient = getMainClient();
    
    await mainClient.refreshToken.deleteMany({
      where: { token: tokenId },
    });
  }

  /**
   * Revoke all refresh tokens for a user
   * @param userId - User ID
   */
  static async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const mainClient = getMainClient();
    
    await mainClient.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * Clean up expired refresh tokens
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const mainClient = getMainClient();
    
    const result = await mainClient.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    logger.info({
      deletedCount: result.count,
    }, 'Cleaned up expired refresh tokens');

    return result.count;
  }
}
