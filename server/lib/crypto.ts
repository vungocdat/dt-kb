import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt (12 rounds). Used by the setup script
 * to populate KB_PASSWORD_HASH; not on the request hot path.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Constant-time-ish comparison of a plaintext password against a bcrypt hash.
 * Never compare credentials with string equality.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
