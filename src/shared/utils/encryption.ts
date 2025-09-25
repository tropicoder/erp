import crypto from 'crypto';
import { config } from '../../config/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM, this is always 16
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param text - The text to encrypt
 * @returns Encrypted text with IV, salt, and auth tag
 */
export const encrypt = (text: string): string => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from password and salt
  const key = crypto.pbkdf2Sync(config.encryptionKey, salt, 100000, 32, 'sha512');
  
  const cipher = crypto.createCipher(ALGORITHM, key);
  cipher.setAAD(salt);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Combine salt + iv + tag + encrypted data
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
};

/**
 * Decrypts sensitive data using AES-256-GCM
 * @param encryptedData - The encrypted data to decrypt
 * @returns Decrypted text
 */
export const decrypt = (encryptedData: string): string => {
  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }
  
  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];
  
  // Derive key from password and salt
  const key = crypto.pbkdf2Sync(config.encryptionKey, salt, 100000, 32, 'sha512');
  
  const decipher = crypto.createDecipher(ALGORITHM, key);
  decipher.setAAD(salt);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

/**
 * Hashes a password using bcrypt
 * @param password - The password to hash
 * @returns Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = await import('bcryptjs');
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Verifies a password against its hash
 * @param password - The password to verify
 * @param hash - The hash to compare against
 * @returns True if password matches
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
};
