# BuildPro CRM agent API

BuildPro's own agents (Chad, Muse) use this API instead of HubSpot. It covers what the agents did in HubSpot:
find a person by email, create candidates, companies and contacts, add notes and tasks, update records, and read
deals.

## Access

- Base URL: `<APP_BASE_URL>/api/agent/v1`, for example `https://crm.buildprorecruiters.com/api/agent/v1`.
- Header on every request: `Authorization: Bearer bpcrm_...`. Lee creates one key per agent on the CRM's
  **API keys** page (`/settings/api-keys`). The key is shown once; only its hash is stored. Revoking a key stops
  that agent immediately.
- Bodies are JSON. Responses are JSON. Errors are `{ "error": "...", "fields": { "field": "problem" } }` with
  status 400 (bad request), 401 (bad key), 404 (not found), 422 (failed validation) or 500.
- Every write is recorded in the CRM's audit log as `agent:<key name>`, so Lee sees what each agent changed.
- There are no delete endpoints. Agents cannot delete records; Lee does that in the CRM.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Check the key works. Returns `{ ok, agent }`. |
| `GET /people?email=` | Find candidates and company contacts with that email. Replaces HubSpot contact search. |
| `GET /candidates?q=&status=&limit=` | Search candidates (name, email, phone, title). |
| `POST /candidates` | Create a candidate. If one with the same email exists, returns it with `created: false`. |
| `GET /candidates/{id}` | A candidate with recent notes, tasks and file names. |
| `PATCH /candidates/{id}` | Update only the fields sent. |
| `GET /companies?q=&status=&limit=` | Search companies. |
| `POST /companies` | Create a company. Same name returns the existing one with `created: false`. |
| `GET /companies/{id}` | A company with contacts, deals and recent notes. |
| `PATCH /companies/{id}` | Update only the fields sent. |
| `POST /contacts` | Add a contact to `company_id`, or to `company_name` (created if new). |
| `POST /notes` | Add a note. Body: `body` plus one or more of `candidate_id`, `company_id`, `contact_id`, `deal_id`. |
| `POST /tasks` | Add a task: `title`, optional `details`, `due_date` (YYYY-MM-DD), `priority` (low, normal, high), and links as for notes. |
| `GET /deals?stage=&company_id=&limit=` | List deals. |
| `GET /deals/{id}` | One deal. |
| `PATCH /deals/{id}` | Update a deal, including `stage`. |

### Fields

- **Candidate:** `full_name` (required), `status` (new, screening, active, submitted, interviewing, offer, placed,
  not a fit, do not contact), `email`, `phone`, `city`, `state`, `current_title`, `current_employer`,
  `desired_title`, `desired_salary`, `linkedin_url`, `source`, `background`.
- **Company:** `name` (required), `status` (prospect, active client, past client, inactive), `industry`, `phone`,
  `website`, `hq_city`, `hq_state`, `source`, `notes`.
- **Contact:** `name` (required), `title`, `email`, `phone`, `role_note`.
- **Deal:** `name`, `company_id`, `contact_id`, `stage` (new lead, contacted, discovery meeting, proposal sent,
  agreement sent, won, lost), `position_title`, `positions_count`, `estimated_value`, `fee_percent`,
  `expected_close_date`, `lost_reason`.

## HubSpot to CRM mapping for Chad

| Chad's HubSpot call | CRM call |
| --- | --- |
| `hubspot.find_contact(email)` | `GET /people?email=` |
| `hubspot.create_contact(...)` for a candidate | `POST /candidates` |
| `hubspot.create_contact(...)` for a client contact | `POST /contacts` with `company_name` |
| `hubspot.add_note(contact_id, body)` | `POST /notes` with `candidate_id` or `contact_id` |
| `PATCH /crm/v3/objects/{obj}/{id}` | `PATCH /candidates/{id}`, `/companies/{id}` or `/deals/{id}` |
| contacts or deals search | `GET /candidates`, `GET /companies`, `GET /deals` |
| `DELETE /crm/v3/objects/...` | Not available to agents. Ask Lee. |

## Example

```bash
curl -s -H "Authorization: Bearer $CRM_API_KEY" "$CRM_API_URL/people?email=jordan@example.com"
curl -s -X POST -H "Authorization: Bearer $CRM_API_KEY" -H "Content-Type: application/json" \
  -d '{"candidate_id":"<id>","body":"Chad intake: resume received by email."}' "$CRM_API_URL/notes"
```
