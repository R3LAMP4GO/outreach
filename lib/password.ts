import { hash, compare } from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword);
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain an uppercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain a number");
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain a special character");
  }

  return { valid: errors.length === 0, errors };
}
