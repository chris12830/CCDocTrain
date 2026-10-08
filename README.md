# Child Care DocTrain

Document Control and Staff Training application for childcaredoctrain.com, created from C. McKinnon's requirements.

## Working flows

- A separate persistent business workspace for each signed-in owner.
- Owner uploads of policies, procedures, and media, backed by private object storage. New uploads start as drafts.
- Both libraries explain the four approval steps and show an Awaiting approval count. Review draft opens the actual draft revision; View current opens the released copy. Owners can leave a draft unapproved, choose training requirements, and explicitly confirm release. The final screen identifies the approving owner and staff visibility; released revisions retain their approval name and timestamp.
- Immutable numbered revisions, owner release, latest-only staff access, and owner revision history.
- Staff assignments with start and due dates, in-app alerts, reminder counts, overdue tracking, and clarification requests.
- Separate reviewed and understood confirmations. Each acknowledgement records the exact revision, staff identity, and timestamp.
- New releases replace earlier pending assignments and preserve earlier completed acknowledgement records.
- The staff portal shows the last confirmed review and acknowledgement date/time, business timezone, and exact revision in My training, the document library, and the document viewer. Previous-revision acknowledgements remain visible while a new revision awaits review. The All history tab shows each assignment’s own acknowledgement. Opening a document alone is not shown as a completed review.
- Certification expiry tracking with configurable renewal lead times and renewal history. Staff must upload a certificate photo with valid issue/expiry dates to close certification training; owner-entered metadata alone cannot complete it.
- Staff invitation links, identity-based staff access, deactivation, and record retention.
- Downloads and print views, including document code, revision, release metadata, and a printed-copy control notice.
- Activity history and CSV export.
- Owner-only staff files with non-compliance write-ups and yearly appraisals.
- Editable report drafts, protected filed reports, performance ratings, improvement goals, and dated follow-up results.
- Confidential report print/PDF views and text downloads, retained after staff deactivation.
- Owner bulk messaging to selected staff or all active staff, with an immutable recipient list, safe send retries, sent-message history in staff files, and per-recipient read times.
- A private staff Messages inbox, unread badge and banner, and a refresh action. Staff can only read messages addressed to them; opening a message records its first read time and does not acknowledge document training.
- Training Needs by Role: owner-defined role plans for released documents/videos and required certifications, with Day 0 based on the first day of work and configurable start/due offsets.
- Staff role and first-day profiles, included in new staff invitations. Plans create assignments automatically and preserve completed acknowledgements and manual document schedules. Updated revisions use the later of the release date and first day of work.
- Manual certification/recertification course scheduling for selected staff on calendar dates. Staff-uploaded certificate photos issued on or after the course start satisfy scheduled courses. Role requirements track valid matching certification evidence.
- Required certification status, missing-certificate deadlines, expiry/renewal alerts, and owner/staff dashboard follow-ups. Requirement names match certificate records after case and whitespace normalization.

First access loads explicitly marked fictional documents and staff. Owner staff-preview actions are restricted to example staff and labelled as example acknowledgements. Real staff cannot be impersonated through the preview control.

## Operating notes

This is a private working prototype. Hosted sign-in uses ChatGPT identity. Staff invitations require site access to be shared separately, and the invited user must sign in with the invited email. Email is used to match the invitation; the signed-in user ID is the persistent identity after joining.

Staff messages and training notifications are in-app. Messages are available on staff sign-in or workspace refresh; newly added staff do not receive earlier all-staff broadcasts. Open reminders refresh once per business-local day when the workspace is accessed. Certification alerts are calculated against the business-local date. Role schedules are synchronized when the workspace is opened or changed. Existing staff need a first-day date and training role before a role plan applies. Certificate status is calculated on workspace access. An unattended Sites check runs daily at 9 a.m. America/Toronto and posts repeat in-app reminders until completion. See AUTOMATIC_REMINDERS.md. External email, SMS and push delivery are not connected. Production SaaS subscription billing, custom-domain connection, independent public authentication, and backup/retention operations are outside this first build.

Uploads are limited to 25 MB per file. PDF, text, image, MP4/WebM, and audio have browser views; Word and PowerPoint are downloaded for review in their original applications. PDF printing uses the PDF viewer's print control; the print cover identifies the revision. Previously downloaded or printed files cannot be recalled; the current online copy must be checked before use.

Browser WebMCP tools expose the visible overview and start an assigned training review. They never acknowledge training. A supported browser context was unavailable for WebMCP/UI validation during creation; their availability is feature-detected, and the app's ordinary UI does not depend on them.

## Architecture

Vinext/React on a Cloudflare-compatible Worker. D1 owns structured data and R2 owns uploaded bytes. All data queries and file downloads enforce business membership on the server. Staff cannot retrieve drafts, superseded documents, another staff member's certification, or perform owner mutations.

Schema lives in db/schema.ts; schema-only generated migrations live in drizzle/. Queries use prepared D1 statements and atomic batches for release, renewal, and acknowledgement changes. No schema is created at request time. No authoritative product records are stored in browser storage.

Use the Sites project workflow for build, source synchronization, and private publication. A clean GitHub clone uses the portable local execution profile. Type checking uses node node_modules/typescript/bin/tsc --noEmit. New migrations are generated with node node_modules/drizzle-kit/bin.cjs generate. Production migrations are applied by publishing.

## Verification

Compiled Worker integration checks cover authentication, persistence, cross-business isolation, staff privacy, owner-only mutations, acknowledgement confirmations, new-revision release, historical acknowledgement retention and staff-visible revision metadata, current-only real staff downloads, invitations, certification privacy/renewals, staff deactivation, uploaded bytes, print metadata, root rendering, personnel report persistence, draft concurrency checks, completed-report protection, annual appraisal validation, confidential report access, follow-up preservation, personnel print/download routes, selected/all-staff message delivery, unread/read persistence, replay protection, inactive-recipient exclusion, message privacy across staff and businesses, role/start-date schedules, automatic updated-revision assignments, completion retention, and certificate course/renewal requirements. Run the TypeScript check and rebuild after source changes. All generated migration statements were inspected before publication.

## Latest additions included

- Role training requirements support a searchable multi-select media dropdown and monthly, custom-month, twice-yearly, yearly, or every-two-year repeat schedules.
- Owners manage certification names/descriptions with stable identities for training and renewal history.
- Staff media access modes: View only, View and print, or Not viewable. Settings survive revisions; restricted items are checked on the server.
- Document/media deletion requires a reason and retains owner audit, revision and completed-training history while withdrawing open work.
- Regulation and Regional document categories.
- Automatic globally unique control numbers or business-defined custom numbers. Revisions retain their original number; deleted numbers stay reserved.
- Draft uploads record selected job-role requirements; owner approval activates training for current staff and future hires with separate review and understanding acknowledgements.
- Live Canada/USA Supplier Ads from CC SAS, automatic refresh, central eligibility/speed rules, and visible impression/click reporting. See docs/supplier-advertising.md.

## Developer setup

Use Node.js 22.13 or newer and the package manager version in package.json.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit --incremental false
pnpm dev
```

The portable development server uses port 5173. Local development identity is mocked by the development plugin; hosted authentication remains ChatGPT sign-in. The D1 database and R2 upload bucket require the configured bindings and schema migrations. Apply the SQL files in drizzle/ to the local D1 binding before using workspace data. Production migrations are applied through Sites publishing.

```bash
pnpm build
pnpm start
```

The uploaded source includes its existing .openai/hosting.json Site identity. Runtime values are configured in Sites separately. .env.example lists the CC SAS keys; use .dev.vars for local Cloudflare Worker values and keep real keys outside Git. Setting up a fresh hosting account also requires its own D1/R2 bindings and authentication configuration.

## Verification and reminders

Recent isolated Worker checks and production builds passed for the latest deployed snapshot. They include role releases, revision acknowledgements, certificate photos, deletion, control numbers, and the CC SAS server connection. Browser visual verification was unavailable.

```bash
node tests/document-release-roles.test.mjs
node tests/role-media.test.mjs
node tests/document-numbering.test.mjs
node tests/certification-names-deletion.test.mjs
```

The CC SAS integration test also needs the CC SAS source built alongside this project, or SAS_TEST_PROJECT_PATH set to that checkout:

```bash
node tests/supplier-sas.test.mjs
```

The existing daily reminder schedule belongs to the hosted Site and is not recreated by cloning this repository. Preserve it when updating the existing Site. Do not expose the reminder endpoint publicly: its unattended service path relies on the Site's private access boundary. This is the existing working prototype source; production SaaS billing, independent authentication and external notification providers still need their own implementation.
