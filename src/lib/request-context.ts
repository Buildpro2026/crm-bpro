import "server-only";
import { headers } from "next/headers";

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

// On Vercel, x-forwarded-for is set by the platform. The first entry is the
// original client address.
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip");
  return {
    ipAddress: ipAddress || null,
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}
