// Encryption utilities for Sidecar
// Uses AES-256-GCM for content encryption
// Encryption key is stored in system keychain via Tauri

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

export interface EncryptionResult {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded initialization vector
  tag: string; // Base64 encoded auth tag
}

export interface DecryptionInput {
  ciphertext: string;
  iv: string;
  tag: string;
}

// ============================================================================
// Keychain Integration (via Tauri backend)
// ============================================================================

/**
 * Initialize encryption by ensuring a key exists in the system keychain.
 * Creates a new key if one doesn't exist.
 */
export async function initializeEncryption(): Promise<boolean> {
  try {
    return await invoke<boolean>('init_encryption_key');
  } catch (error) {
    console.error('Failed to initialize encryption:', error);
    throw new Error('Failed to initialize encryption. Please check your system keychain.');
  }
}

/**
 * Check if encryption is properly initialized
 */
export async function isEncryptionInitialized(): Promise<boolean> {
  try {
    return await invoke<boolean>('check_encryption_key');
  } catch {
    return false;
  }
}

/**
 * Rotate the encryption key. This will re-encrypt all stored data.
 * Use with caution - this is a destructive operation if interrupted.
 */
export async function rotateEncryptionKey(): Promise<boolean> {
  try {
    return await invoke<boolean>('rotate_encryption_key');
  } catch (error) {
    console.error('Failed to rotate encryption key:', error);
    throw new Error('Failed to rotate encryption key. Please try again.');
  }
}

// ============================================================================
// Encryption Operations (via Tauri backend)
// ============================================================================

/**
 * Encrypt sensitive content using AES-256-GCM
 * @param plaintext - The text to encrypt
 * @returns Encrypted data structure
 */
export async function encrypt(plaintext: string): Promise<EncryptionResult> {
  try {
    return await invoke<EncryptionResult>('encrypt_content', { plaintext });
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt content');
  }
}

/**
 * Decrypt content encrypted with AES-256-GCM
 * @param encryptedData - The encrypted data structure
 * @returns Decrypted plaintext
 */
export async function decrypt(encryptedData: DecryptionInput): Promise<string> {
  try {
    return await invoke<string>('decrypt_content', { encryptedData });
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt content');
  }
}

/**
 * Encrypt content and return as a single encoded string (for database storage)
 */
export async function encryptForStorage(plaintext: string): Promise<string> {
  const result = await encrypt(plaintext);
  // Combine into a single string: iv:tag:ciphertext
  return `${result.iv}:${result.tag}:${result.ciphertext}`;
}

/**
 * Decrypt content from storage format
 */
export async function decryptFromStorage(storedValue: string): Promise<string> {
  const parts = storedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [iv, tag, ciphertext] = parts;
  return decrypt({ iv, tag, ciphertext });
}

// ============================================================================
// SQLCipher Integration
// ============================================================================

/**
 * Get the database encryption key for SQLCipher
 * This retrieves the key from the system keychain
 */
export async function getDatabaseKey(): Promise<string> {
  try {
    return await invoke<string>('get_database_key');
  } catch (error) {
    console.error('Failed to get database key:', error);
    throw new Error('Failed to retrieve database encryption key');
  }
}

/**
 * Initialize the database with SQLCipher encryption
 */
export async function initializeEncryptedDatabase(): Promise<void> {
  try {
    await invoke('init_encrypted_database');
  } catch (error) {
    console.error('Failed to initialize encrypted database:', error);
    throw new Error('Failed to initialize encrypted database');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Securely generate a random ID
 */
export async function generateSecureId(): Promise<string> {
  try {
    return await invoke<string>('generate_secure_id');
  } catch {
    // Fallback to crypto API if Tauri command not available
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Hash content for comparison (e.g., deduplication)
 */
export async function hashContent(content: string): Promise<string> {
  try {
    return await invoke<string>('hash_content', { content });
  } catch {
    // Fallback to Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export default {
  initializeEncryption,
  isEncryptionInitialized,
  rotateEncryptionKey,
  encrypt,
  decrypt,
  encryptForStorage,
  decryptFromStorage,
  getDatabaseKey,
  initializeEncryptedDatabase,
  generateSecureId,
  hashContent,
};
