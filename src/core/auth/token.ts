import { createHash, timingSafeEqual } from "node:crypto";

export class ForbiddenError extends Error {
  constructor(message = "forbidden: a valid approver token is required") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * True when `given` matches the configured approver token. Both sides are hashed first so the
 * comparison is constant-time and length-independent. No configured token = approvals are off.
 * Ceiling: one shared secret, no user accounts. Enough for a local demo; real deployments need auth.
 */
export function tokenOk(given: string | null | undefined, expected: string | null): boolean {
  if (!expected || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
