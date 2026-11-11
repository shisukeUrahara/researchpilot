import { randomBytes } from "node:crypto";

/** Normalized error: one shape for every API failure, with a request id. */
export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, request_id: `req_${randomBytes(6).toString("hex")}` } }, { status });
}
