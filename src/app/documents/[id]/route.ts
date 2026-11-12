import { NextResponse, type NextRequest } from "next/server";
import { getOwnerContext } from "@/lib/owner";
import { getRequestContext } from "@/lib/request-context";
import { writeAudit } from "@/lib/audit";
import { IntegrityError, signedUrlAfterIntegrityCheck } from "@/lib/documents/storage";
import { isUuid } from "@/lib/records";

// Owner download. Access is checked twice: the owner session, and RLS on the
// documents table through the owner's own client. The file is served through
// a 60-second signed URL, and only after its bytes match the stored SHA-256.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getOwnerContext();
  if (!owner) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });

  const { data: doc } = await owner.supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  try {
    const url = await signedUrlAfterIntegrityCheck(doc);
    const ctx = await getRequestContext();
    await writeAudit(owner.supabase, {
      actor: owner.actor,
      action: "document_downloaded",
      companyId: doc.company_id,
      signatureRequestId: doc.signature_request_id,
      detail: { document_id: doc.id, sha256: doc.sha256 },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
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
