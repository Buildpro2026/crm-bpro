import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/request-context";
import { executedCopyForClient, recordExecutedDownload } from "@/lib/signing/service";
import { IntegrityError, signedUrlAfterIntegrityCheck } from "@/lib/documents/storage";

// The client's copy of the executed agreement. Available only after Lee has
// countersigned. Same link, same checks, same signed URL rules as owner
// downloads.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getRequestContext();
  const found = await executedCopyForClient(token, ctx);
  if (!found.ok) {
    return new NextResponse("This link is no longer active. Call 214-238-5145 for help.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const url = await signedUrlAfterIntegrityCheck(found.document);
    await recordExecutedDownload(found.document, ctx);
    const response = NextResponse.redirect(url, { status: 302 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    if (err instanceof IntegrityError) {
      console.error(err.message);
      return new NextResponse("This file failed its integrity check and was not served.", { status: 500 });
    }
    throw err;
  }
}
