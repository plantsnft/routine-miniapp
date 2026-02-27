/**
 * Credentials Vault - AES-256-GCM encryption for ClubGG credentials
 * 
 * Server-side only. Never expose encryption key to client.
 * 
 * Uses AES-256-GCM for authenticated encryption:
 * - Encrypts username and password together as JSON
 * - Stores ciphertext and IV separately (both base64 encoded)
 * - Version field for future cipher migration
 * 
 * Environment: POKER_CREDS_ENCRYPTION_KEY (32-byte key, base64 encoded)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM (recommended)
const AUTH_TAG_LENGTH = 16; // 128 bits for GCM

/**
 * Get encryption key from environment
 * 
 * @returns Buffer containing 32-byte key
 * @throws Error if key is missing or invalid
 */
function getEncryptionKey(): Buffer {
  const keyB64 = process.env.POKER_CREDS_ENCRYPTION_KEY;
  
  if (!keyB64) {
    throw new Error(
      'POKER_CREDS_ENCRYPTION_KEY environment variable is required. ' +
      'It must be a 32-byte key encoded as base64.'
    );
  }

  try {
    const key = Buffer.from(keyB64, 'base64');
    
    if (key.length !== 32) {
      throw new Error(
        `POKER_CREDS_ENCRYPTION_KEY must be 32 bytes (256 bits). Got ${key.length} bytes. ` +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
      );
    }
    
    return key;
  } catch (error: any) {
    throw new Error(
      `Invalid POKER_CREDS_ENCRYPTION_KEY format (must be base64): ${error.message}`
    );
  }
}

export interface Credentials {
  username: string;
  password: string;
}

export interface EncryptedCreds {
  ciphertextB64: string;
  ivB64: string;
  version: number;
}

/**
 * Encrypt credentials using AES-256-GCM
 * 
 * @param creds - Credentials to encrypt (password is required, username is optional)
 * @returns Encrypted credentials with ciphertext, IV, and version
 */
export function encryptCreds(creds: { username?: string; password: string }): EncryptedCreds {
  if (!creds.password) {
    throw new Error('Password is required');
  }

  const key = getEncryptionKey();
  
  // Generate random IV for each encryption
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  // Encrypt JSON string of credentials (username can be empty string if not provided)
  const plaintext = JSON.stringify({ 
    username: creds.username || '', 
    password: creds.password 
  });
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine ciphertext and auth tag
  const encryptedData = Buffer.concat([ciphertext, authTag]);
  
  return {
    ciphertextB64: encryptedData.toString('base64'),
    ivB64: iv.toString('base64'),
    version: 1,
  };
}

/**
 * Decrypt credentials using AES-256-GCM
 * 
 * @param encrypted - Encrypted credentials with ciphertext, IV, and version
 * @returns Decrypted credentials
 * @throws Error if decryption fails
 */
export function decryptCreds(encrypted: EncryptedCreds): Credentials {
  if (!encrypted.ciphertextB64 || !encrypted.ivB64) {
    throw new Error('Ciphertext and IV are required for decryption');
  }

  // Version check (for future migration support)
  if (encrypted.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encrypted.version}`);
  }

  const key = getEncryptionKey();
  
  try {
    // Decode IV and ciphertext
    const iv = Buffer.from(encrypted.ivB64, 'base64');
    const encryptedData = Buffer.from(encrypted.ciphertextB64, 'base64');
    
    // Extract auth tag (last 16 bytes)
    const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LENGTH);
    const ciphertext = encryptedData.subarray(0, encryptedData.length - AUTH_TAG_LENGTH);
    
    // Create decipher
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let plaintext = decipher.update(ciphertext, undefined, 'utf8');
    plaintext += decipher.final('utf8');
    
    // Parse JSON
    const creds = JSON.parse(plaintext) as Credentials;
    
    // Password is required, but username can be empty string (password-only encryption)
    if (!creds.password) {
      throw new Error('Decrypted credentials missing password');
    }
    
    // Ensure username is at least an empty string (never undefined)
    return {
      username: creds.username || '',
      password: creds.password,
    };
  } catch (error: any) {
    throw new Error(`Failed to decrypt credentials: ${error.message}`);
  }
}

