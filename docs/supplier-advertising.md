# CC SAS dashboard connection

The dashboard reads `/api/supplier-ads` on its own server. The server requests
the CC SAS live feed for app `doctrain`, placement `Dashboard ticker`, and the
signed-in viewer's audience. Staff preview requests retain the staff audience.
No business documents, personnel records, names or emails are sent to SAS.

Runtime configuration (Sites environment variables):

- `SAS_URL`: CC SAS origin.
- `SAS_APP_ID`: `doctrain`.
- `SAS_APP_KEY`: secret application connection key.
- `SAS_SITE_ACCESS_TOKEN`: optional secret when CC SAS is made private.

The browser refreshes every minute and on returning to the tab. Unavailable
feeds clear offers without interrupting the workspace. Canada/USA rows respect
SAS speed, payment, approval, schedule, package and audience rules. Fictitious
sample ads are excluded. Offers use fixed-width spaces; motion pauses on hover,
keyboard focus or the Pause button and respects reduced-motion preferences.

`/api/supplier-ads/events` forwards visible impressions and clicks to SAS. It
derives app, placement and audience on the server. SAS validates eligibility and
deduplicates event IDs. Counts describe observed displays/clicks, not verified
unique people or billing evidence.

`/api/supplier-ads/health` exposes only connection status, counts and the check
time for service verification. It never returns secrets or business records.

Manage campaigns in CC SAS. Select Child Care Doc & Train for the Dashboard
ticker, approve the supplier and campaign, and record active paid coverage.
Replacing its connection key in SAS requires updating `SAS_APP_KEY` in DocTrain
and deploying the saved version with the new environment configuration.
