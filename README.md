# BuildPro CRM

Private recruiting CRM for BuildPro Recruiters, LLC. Owner: Lee Chandler.

**This is Milestone 1 only:** owner login, company and contact records, document storage, and the client
signing flow. A client signs the Client Representation Agreement and completes the Client Search Information
Form online. The fully executed PDF is filed back to the company record, with a complete audit trail.

Milestones 2 to 5 (CRM pipeline, recruiting pipeline, email and automations, reporting) are not built.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS 4
- Supabase: Auth (email and password), Postgres with row level security, a private Storage bucket
- `@supabase/ssr` for owner sessions, `pdf-lib` for PDF generation
- Hosting target: Vercel

Next.js 16 uses `src/proxy.ts` for the request gate (it replaces `middleware.ts`).

## Setup

### 1. Supabase project

Project ref `lnozoziidyljwdarzvgp`. The project starts empty, and the migration in this repo creates everything.

1. **Apply the migration.** In the Supabase dashboard, open SQL Editor, paste the contents of
   [`supabase/migrations/0001_milestone1_foundation.sql`](supabase/migrations/0001_milestone1_foundation.sql), and
   run it. With the Supabase CLI instead: link the project, then `supabase db push`.
2. **Turn off public sign-ups.** Authentication > Sign In / Providers > Email: disable "Allow new users to sign up".
   The database is already safe without this (a signed-in user with no owner profile can read nothing), but this
   removes the option entirely.
3. **Create Lee's login.** Authentication > Users > Add user. Email `lchandler@buildprorecruiters.com`, a strong
   password, auto-confirm on. The migration's trigger creates his owner profile when this user is created. If the
   user already existed when the migration ran, the migration links it.
4. **Get the keys.** Project Settings > API. Copy the project URL, the publishable key, and the service role key.
   The service role key is a secret. Never put it in a `NEXT_PUBLIC_` variable or in a commit.

### 2. Environment variables

| Name | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | server | Project URL, `https://lnozoziidyljwdarzvgp.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | server | Publishable key. Owner sessions run under RLS with it |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bypasses RLS. Used only for storage and the client signing pages |
| `APP_BASE_URL` | server | Public origin of the app. Signing links are built from it, e.g. `https://crm.example.com` |

All four are read on the server only, and none is exposed to the browser. For local work, copy `.env.example` to
`.env.local` and fill it in. `.env*` files are gitignored, except `.env.example`.

### 3. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

Checks:

```bash
npm run typecheck
npm test                     # database rules, PDF content, and signing rules
npm run build
```

`npm test` runs the migration file against an in-process Postgres (PGlite), with stand-ins for Supabase's `auth`
and `storage` schemas. It does not contact Supabase. The live end-to-end run is described under
[Acceptance testing](#acceptance-testing-against-live-supabase).

### 4. Deploy to Vercel

1. Push this repository to GitHub, then import it in Vercel. Framework preset: Next.js.
2. Project Settings > Environment Variables: add the four variables for Production (and Preview if preview
   deployments should work). Set `APP_BASE_URL` to the production origin, with no trailing slash.
3. Deploy. Vercel runs `npm run build`.
4. Open the production URL, sign in as Lee, and check that a company page loads.

No Supabase redirect URLs are needed. Sign-in is email and password, and the client signing links are ordinary
application URLs.

## How the signing flow works

### Owner side

1. On a company page, Lee picks a contact and clicks **Create signing packet and link**.
2. The server generates a random 32-byte token (`crypto.randomBytes(32)`, base64url, 43 characters) and stores only
   its SHA-256 hash in `signature_requests.token_hash`. The raw token appears once, in the link
   `APP_BASE_URL/sign/<token>`, plus ready-to-paste email text. Lee copies them and sends the email from his own
   mailbox. The app sends no email.
3. The link expires 14 days after creation. Lee can revoke an open request at any time.
4. After the client signs, the request shows **Client signed** and a **Countersign and finalize** button. One
   click generates the executed PDF, stores it, and marks the request **Fully executed**.
5. The company page refreshes every 20 seconds while a request is open, and each request has its audit trail.

### Client side (`/sign/<token>`)

No login. Every request re-validates the token on the server.

- Revoked and expired links get the same polite closed message, and each use is audited. Unknown tokens get the
  same message but cannot be attributed to a request, so they are not logged.
- **Step 1** shows the full agreement, verbatim from `src/lib/agreement.ts`.
- **Step 2** is the Client Search Information Form: 28 required fields, with the exact labels in
  `src/lib/intake-form.ts`. The browser validates, and the server validates again when the form is saved.
- **Step 3** collects the signer's printed name, title and email, a drawn or typed signature, and an explicit
  consent checkbox. On submit, the server validates everything, generates the **client-signed PDF**, stores it,
  and marks the request **Client signed**.
- After signing, the page confirms receipt. Once Lee countersigns, the same link shows **Download executed copy**.

### What the PDFs contain

Both copies have the agreement text, the completed form answers, the signature blocks, and a signature
certificate page. The certificate lists the request ID, signer name, title and email, the signing time in Central
Time, IP address and user agent, the consent statement, the countersignature (once applied), SHA-256 fingerprints
of the agreement template and of the signed content, and, on the executed copy, the SHA-256 of the client-signed
copy.

- **Client-signed copy**: BuildPro's block reads "Pending countersignature".
- **Executed copy**: generated at countersignature from the stored answers, signer details and drawn signature. Its
  signing time is the original client signing time. Lee's countersignature and its time are added.

### Integrity and storage

- The `documents` bucket is private, with no storage policies. Only the server, using the service role, reads or
  writes it.
- Each stored file's SHA-256 is recorded in `documents.sha256`. A download re-hashes the stored bytes and refuses
  to serve a file that does not match. Otherwise the app issues a 60-second signed URL.
- Owner downloads go through `/documents/[id]`. Client downloads go through `/sign/[token]/executed`.

### Audit log

`audit_log` is append-only. A trigger rejects UPDATE, DELETE and TRUNCATE, even for the database owner. Actions
written: `company_created`, `company_updated`, `contact_created`, `contact_updated`, `link_created`,
`page_viewed`, `link_access_denied`, `link_expired`, `link_revoked`, `form_submitted`, `client_signed`,
`pdf_generated`, `countersigned`, `document_downloaded`, `executed_copy_downloaded`.

## Data model (migration 0001)

| Table | Purpose |
| --- | --- |
| `profiles` | Owner record, linked to Supabase Auth. Lee is the only row |
| `companies` | Client companies |
| `contacts` | People at a company |
| `documents` | Metadata for every stored file: kind, name, storage path, SHA-256, size, linked request |
| `signature_requests` | One signing packet per row: token hash, status, expiry, form answers, signer details, PDF links |
| `audit_log` | Append-only history |

Row level security is on for every table. Owner policies call `public.is_owner()`, which looks for a `profiles` row
matching `auth.uid()`. The anonymous role has no privileges at all.

Additions beyond the brief, all additive: `signature_requests.form_answers` (the answers need a home), the signer,
signature and countersignature columns, `documents.signature_request_id` and `documents.size_bytes`, and
`audit_log.created_at` (with no `updated_at`, because audit rows never change).

## Extending in later milestones

- Add new migrations (`0002_...sql` and so on). Do not edit `0001` once it has been applied anywhere.
- To change the agreement or the form, add a new `TEMPLATE_VERSION` or `INTAKE_FORM_VERSION`. Each request records
  the versions it was signed against, so old packets keep their wording.
- Candidates, jobs, deals and placements will reference `companies` and `contacts`. The foreign keys and RLS
  policies here are written to be reused.

## Acceptance testing against live Supabase

The automated checks cover the database rules, the PDF content, and the signing rules. The end-to-end run needs a
live Supabase project with the migration applied and a real browser. Use a dummy company and contact, such as
"Dummy Test Company" and "Test Contact", and delete them afterwards or leave them clearly marked as test data.

1. Signed out, open `/companies`, `/companies/<any id>` and `/documents/<any id>`. Each must redirect to sign-in.
2. Sign in as Lee. Create the dummy company and contact.
3. Create a signing packet for the dummy contact. Copy the link.
4. Open the link in a private window. Confirm the header and read the agreement. Submit the form with blanks (it
   must refuse), then complete it.
5. Sign with a drawn signature. Confirm the thank-you message.
6. In Lee's session, confirm the request shows **Client signed**, then countersign it. It must show
   **Fully executed**.
7. Download the executed PDF from the company page. Check the agreement text, the form answers, both signatures,
   and the Central Time on the certificate. Hash the file (`certutil -hashfile <file> SHA256` on Windows) and
   compare it with the SHA-256 shown in the documents table.
8. Check the audit trail on the company page. In order, it must show: link created, page viewed, form submitted,
   client signed, PDF generated, countersigned, PDF generated, document downloaded.
9. Create a second packet and revoke it. Open its link: it must show the closed message and an audit entry
   `link_access_denied`.
10. For expiry, set a request's `expires_at` to a past time in the table editor, then open its link. It must show
    the closed message and an audit entry `link_expired`.

Record the results. Anything that fails is a bug to fix before Milestone 2.

## Known limits

- Sign-in is email and password. There is no magic link, no MFA, and no rate limiting on sign-in or on the client
  signing pages. Add these before wider use.
- The app sends no email. Lee sends the link and the email text himself.
- The owner's countersignature is the typed name "/s/ Lee Chandler", set in the PDF by the server at countersigning.
  It is not a drawn signature.
- A signing link stays usable until its request is signed, revoked, or expired. After signing, it only serves the
  executed copy download.
- The client's email address (the form's contact email, and the signer's email on the certificate) appears in the
  PDF by design. No BuildPro email address appears in the PDFs or on the signing pages.
- There is no delete for companies or contacts. Foreign keys are `on delete restrict`, so signed records cannot be
  orphaned.
