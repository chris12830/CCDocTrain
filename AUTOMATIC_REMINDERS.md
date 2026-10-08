# Child Care DocTrain automatic reminders

The daily check runs at 09:00 America/Toronto through the linked Sites schedule.
The updater is `POST /api/reminders/run`; `GET /api/reminders/run` reads the saved
per-business enabled setting, interval, and last successful check timestamp.
It writes in-app reminders, without sending email or SMS or republishing source.

Use `get_site` for this linked Site to obtain current supported service access.
Send its `siwc_bypass_bearer_token` only to its returned `current_live_url` as
`OAI-Sites-Authorization: Bearer <token>`. Keep the value in memory, never in
source, files, command arguments, prompts, or output. This app depends on Sites'
private access boundary for service requests with no visitor identity. Preserve
private access. Visitor calls require an owner and remain business-scoped.

POST the updater, then GET the readback. A fresh timestamp proves the persisted
update; a scheduled task being saved alone does not prove an update ran.
Rechecks and retries are safe: delivery keys and the business-local repeat
interval prevent duplicate reminders and inflated training reminder counts.
Runs skip paused businesses, future assignments, inactive staff, archived or
hidden media, and completed requirements. They preserve all acknowledgements.

Role requirements may repeat every 1–120 calendar months, with no repeat as the
default for existing plans. Document/media training schedules only the next
review after the last acknowledgement, preserving each completed record. Each
repeat gets a separate assignment and reminder identity. Open overdue reviews
stay open until acknowledged instead of accumulating missed cycles. Disabling
the repeat withdraws its open repeat assignments without deleting history.
New document revisions still require review of the newly released revision.
Certification repeats use the certificate issue date and become due at the
repeat date or certificate expiry, whichever is earlier. A staff-uploaded
photo with a sufficiently recent issue date is required to close the repeat.
The daily writer already synchronizes these role schedules; do not replace or
duplicate the existing automation or change its reminder intervals.

Certification close-out requires an image uploaded by the assigned staff member,
valid issue/expiry dates, and confirmation of the details. Owner metadata alone
does not close it. Scheduled recertification requires an issue date on or after
its start. Uploaded pictures remain private to that staff member and the owner.
Owner overdue summaries name the staff members and outstanding requirements.

Do not create records or uploads merely to test production. Exercise the existing
reminder workload and read back its timestamp; use isolated D1/R2 fixtures for
staff uploads and permission tests.
