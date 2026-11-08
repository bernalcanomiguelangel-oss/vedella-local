/**
 * Password hashing + policy helpers.
 *
 * We use bcryptjs: a pure-JavaScript bcrypt implementation. It installs from npm
 * with NO native build step and works offline, which matters because the app
 * must build and test without a guaranteed native-compile toolchain or external
 * network (see README "Password hashing"). Hashes are salted bcrypt digests.
 *
 * Hard security rules enforced here:
 *  - Passwords are stored ONLY as salted hashes (never plaintext).
 *  - Raw passwords are NEVER logged or returned.
 *  - No secrets are read in this module (keys come from env elsewhere).
 */
import bcrypt from "bcryptjs";

/** bcrypt work factor. 10 is a sane default for a dev/demo app. */
const SALT_ROUNDS = 10;

/** Minimum password length accepted by the policy. */
export const MIN_PASSWORD_LENGTH = 8;

/** Maximum password length (bcrypt truncates past 72 bytes; cap defensively). */
export const MAX_PASSWORD_LENGTH = 72;

export interface PasswordPolicyResult {
  ok: boolean;
  message?: string;
}

/**
 * Validate a candidate password against the policy. Returns { ok: false } with a
 * human message on failure. Keep the message generic (no echoing the value).
 */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "La contrasenya no pot estar buida." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD_LENGTH} caràcters.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `La contrasenya no pot superar els ${MAX_PASSWORD_LENGTH} caràcters.`,
    };
  }
  return { ok: true };
}

/** Hash a plaintext password into a salted bcrypt digest. Never logs the input. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored hash. Returns false (never
 * throws) when the hash is missing/empty so a passwordless account cannot be
 * logged into with any value.
 */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
