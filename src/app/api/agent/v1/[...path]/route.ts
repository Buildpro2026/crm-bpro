import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/agent-api/keys";
import { routeAgentRequest } from "@/lib/agent-api/handlers";
import { createAdminClient } from "@/lib/supabase/admin";

// Agent API for BuildPro's own agents (Chad, Muse). Every request needs
// "Authorization: Bearer bpcrm_..." from the owner's API keys page. Requests
// run with the service role after the key is checked, and every write is
// recorded in the audit log as "agent:<key name>". See docs/AGENT_API.md.

export const dynamic = "force-dynamic";

async function handle(request: NextRequest, params: Promise<{ path: string[] }>): Promise<NextResponse> {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  let body: Record<string, unknown> = {};
  if (request.method === "POST" || request.method === "PATCH") {
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Send a JSON object body." }, { status: 400 });
    }
  }

  try {
    const { path } = await params;
    const result = await routeAgentRequest(request.method, path, {
      db: createAdminClient(),
      agent,
      query: request.nextUrl.searchParams,
      body,
    });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

type Params = { params: Promise<{ path: string[] }> };
export const GET = (r: NextRequest, { params }: Params) => handle(r, params);
export const POST = (r: NextRequest, { params }: Params) => handle(r, params);
export const PATCH = (r: NextRequest, { params }: Params) => handle(r, params);
