# BuildPro CRM

Private recruiting CRM for BuildPro Recruiters, LLC. Owner: Lee Chandler.

**Built so far: Milestones 1 and 2.**

- **Milestone 1:** owner login, company and contact records, document storage, and the client signing flow. A
  client signs the Client Representation Agreement and completes the Client Search Information Form online. The
  fully executed PDF is filed back to the company record, with a complete audit trail.
- **Milestone 2 (CRM core):** a dashboard, company status and search, a contacts directory, a deals pipeline board
  with drag-and-drop stages, and notes and tasks on companies and deals. See [Milestone 2](#milestone-2-crm-core).

- **Candidates and files (start of Milestone 3):** candidate records, Zoho-style file folders on every company and
  candidate, an auto-filled "About BuildPro Recruiters" PDF for clients, and an online Candidate Representation
  Agreement that pre-fills the candidate's details. See [Candidates and files](#candidates-and-files).

Still to build: jobs, submissions, interviews, offers and placements (rest of Milestone 3), email and automations
(Milestone 4), and reporting (Milestone 5).

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS 4
- Supabase: Auth (email and password), Postgres with row level security, a private Storage bucket
- `@supabase/ssr` for owner sessions, `pdf-lib` for PDF generation
- Hosting target: Vercel

Next.js 16 uses `src/proxy.ts` for the request gate (it replaces `middleware.ts`).

## Setup

### 1. Supabase project

Project ref `lnozoziidyljwdarzvgp`. The project starts empty, and the migration in this repo creates everything.

1. **Apply the migrations, in order.** In the Supabase dashboard, open SQL Editor, paste the contents of
   [`supabase/migrations/0001_milestone1_foundation.sql`](supabase/migrations/0001_milestone1_foundation.sql), and
   run it. Then do the same with
   [`supabase/migrations/0002_milestone2_crm_core.sql`](supabase/migrations/0002_milestone2_crm_core.sql), then
   [`supabase/migrations/0003_candidates_and_files.sql`](supabase/migrations/0003_candidates_and_files.sql), then
   [`supabase/migrations/0004_agent_api_keys.sql`](supabase/migrations/0004_agent_api_keys.sql). Run each
   file once only. With the Supabase CLI instead: link the project, then `supabase db push`.
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

## Milestone 2: CRM core

Migration `0002_milestone2_crm_core.sql` is additive. It adds:

| Table or column | Purpose |
| --- | --- |
| `companies.status` | `prospect` (default), `active client`, `past client`, `inactive` |
| `companies.phone`, `companies.source` | Main phone and lead source |
| `deals` | One business development opportunity per row: company, main contact, stage, position, openings, estimated fee, fee percentage, expected close date, lost reason. `closed_at` is set by a trigger when the stage becomes Won or Lost and cleared if the deal is reopened. |
| `notes` | Timeline entries on a company, optionally tied to a contact or deal |
| `tasks` | To-dos with a due date and priority, standalone or linked to a company, contact or deal. `completed_at` is set by a trigger. |

Deal stages, in order: New lead, Contacted, Discovery meeting, Proposal sent, Agreement sent, Won, Lost. They are
fixed by a check constraint and mirrored in [`src/lib/crm.ts`](src/lib/crm.ts). Changing them takes a new migration.

A trigger keeps links consistent: a contact or deal linked to a deal, note or task must belong to the same company,
and a task linked only to a deal or contact gets that company filled in. All three new tables are owner-only under
row level security. Creating deals, moving stages, adding or deleting notes and tasks, and completing tasks are
written to `audit_log`.

### Pages

- `/dashboard`: open pipeline value, deals won this month, tasks overdue and due today, pipeline by stage, recent
  activity. Sign-in now lands here.
- `/companies`: search by name, industry or city, and filter by status. A company page now shows its deals, open
  tasks, and notes, alongside the Milestone 1 signing packet.
- `/contacts`: every contact across companies, with search.
- `/deals`: the pipeline board. Drag a card between columns, or use the stage picker on the card. `/deals/<id>`
  shows the deal's facts, tasks, notes, and activity.
- `/tasks`: open tasks grouped into Overdue, Due today, Next 7 days, Later, and No due date, plus a Completed view.

### Milestone 2 acceptance checks

1. Apply `0002`. The companies list loads, and existing companies show the status Prospect.
2. Edit a company: set status Active client, a phone and a source. The list and company page show them.
3. From the company page, click New deal. Save it with a contact from that company.
4. On `/deals`, drag the card to Proposal sent. Refresh: it stays there. The deal page activity shows the move.
5. Move the deal to Won. The dashboard's "Won this month" includes it.
6. Add a note and a task (due today) on the deal. Both show on the deal and the company page, and the task shows
   on the dashboard and under Due today on `/tasks`.
7. Tick the task. It moves to the Completed view.
8. Try a deal whose main contact works at a different company. It must be refused.

## Candidates and files

Migration `0003_candidates_and_files.sql` is additive. It adds `candidates`, `candidate_agreements`, a `folder` and
`candidate_id` on `documents`, `candidate_id` on `notes`, `tasks` and `audit_log`, and widens `documents.kind` to
include `generated` and `signed agreement`. A file or note must belong to a company or a candidate.

- **Folders.** Company folders: Client packet, Agreements, Search forms, Job descriptions, Invoices, Correspondence,
  Other. Candidate folders: Resumes, Agreements, Applications, References, Offer letters, Correspondence, Other.
  Uploads accept PDF, Word, Excel, CSV, text, RTF and images up to 10 MB. The content type comes from the file
  extension, the name is cleaned, and each file's SHA-256 is checked on every download. Only hand-uploaded files
  can be deleted; signed and generated documents stay.
- **Auto-filled client document.** On a company page, "Auto-fill About BuildPro Recruiters PDF" writes the About
  page from BuildPro's template, prepared for that company, into the Client packet folder. The agreement and search
  form remain the online signing packet from Milestone 1, and file themselves into Agreements.
- **Candidate agreement.** On a candidate page, "Create candidate agreement link" makes a one-time 14-day link
  (`/sign/candidate/<token>`, only the hash is stored) and a message to send. The candidate sees their name, email,
  phone, city, title and LinkedIn already filled in, adds recent submissions, chooses whether texts are allowed,
  ticks consent, and types their name (it must match). On signing, the PDF (agreement text, details, signature
  certificate with IP and browser) is filed in the candidate's Agreements folder, the record is updated with what
  they confirmed, and a New or Screening candidate becomes Active. The candidate can download their copy from the
  same link. The agreement text is verbatim from BuildPro's candidate form, in `src/lib/candidate-agreement.ts`.

### Candidate acceptance checks

1. Apply `0003`. `/candidates` loads.
2. Add a candidate with a phone and city. Upload a resume into Resumes. Download it.
3. Create the agreement link, open it in a private window, and check the details are pre-filled.
4. Try to sign with a different typed name: it must refuse. Sign properly.
5. The candidate page shows Agreement signed, status Active, and the signed PDF in Agreements.
6. On a company page, auto-fill the About PDF and open it from Client packet.

## Agent API (replaces HubSpot for Chad and Muse)

Migration `0004_agent_api_keys.sql` adds `api_keys`. Lee creates one key per agent on **API keys**
(`/settings/api-keys`); only a hash is stored and the key is shown once. Agents call
`/api/agent/v1/...` with `Authorization: Bearer bpcrm_...`. Endpoints, fields, and the HubSpot-to-CRM mapping
for Chad are in [`docs/AGENT_API.md`](docs/AGENT_API.md). Agents cannot delete anything, and every write is in the
audit log as `agent:<key name>`. The CRM must be deployed (Vercel) before agents on Render can reach it.

The HubSpot records Lee approved (14 candidates with their notes, 39 prospect companies, and Cahill Builders with
Robert Cahill) were imported on 2026-11-12 with a one-time script; each imported record says so in its background
or notes.

## Extending in later milestones

- Add new migrations (`0005_...sql` and so on). Do not edit `0001` to `0004` once applied anywhere.
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
