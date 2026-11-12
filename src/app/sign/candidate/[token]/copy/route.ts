import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/request-context";
import { signedCopyUrl } from "@/lib/candidates/agreement-service";

// The candidate's own signed copy, served through a 60-second signed URL after
// the token and the file's SHA-256 are checked.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = await signedCopyUrl(token, await getRequestContext());
  if (!url) return new NextResponse("This link is no longer active.", { status: 404 });
  const response = NextResponse.redirect(url, { status: 302 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
