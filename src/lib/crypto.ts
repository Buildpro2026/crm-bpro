import "server-only";
import { createHash, randomBytes } from "node:crypto";

// 32 random bytes is 256 bits of entropy. base64url makes it URL safe.
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

// Only this hash is stored. The raw token exists in memory and in the link
// Lee copies, and nowhere else.
export function hashAccessToken(token: string): string {
  return sha256Hex(token);
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomSuffix(): string {
  return randomBytes(6).toString("hex");
}
