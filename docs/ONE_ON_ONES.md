# One-on-ones and leadership summaries

The One-on-ones tab captures work-life balance, support, feeling (the tenant's
configurable 1–5 scale), escalations, discussion, improvement feedback and
career tasks and advice. An employee and their direct reporting lead can create
and edit the discussion. A generated summary is shown in the portal to the
lead and the people above that lead in the current reporting hierarchy. Edits
to the source discussion invalidate the old summary until it is regenerated.
A career task can be created as a normal activity. To avoid orphaning this
history, employees with people-workflow records cannot be deleted; mark them
inactive instead. Departments and entities with this history are retained too.

## Configure the AI provider

AI summaries require the shared workspace and a signed-in session. Configure
`OPENAI_API_KEY` as a **server-side secret** on the deployment, optionally set
`ONE_ON_ONE_AI_MODEL` (default `gpt-4o-mini`), and redeploy. Never put a key in
browser code or a `VITE_` environment variable. A participant must explicitly
request the summary and confirm the data transfer. The selected discussion
fields and numeric feeling are sent to OpenAI; employee IDs, names and emails
are not automatically sent. People may include identifying information in the
notes themselves. Apply the organisation's privacy, consent, retention,
provider and cost policies before enabling this feature. The response is an AI
draft and should be reviewed by participants; the provider can make mistakes.

If the provider is not configured, unavailable or fails, the screen reports an
error and does **not** invent or share an AI summary. Drafts can still be saved.
The demo/static mode cannot call the authenticated summary endpoint.

## Pilot security limitation

The existing pilot has a single shared workspace password, a switchable persona,
and full-snapshot reads and writes. The portal filters displayed stand-ups,
escalations and one-on-ones by reporting line, and shows discussion notes only
to participants, but these are **not security or confidentiality boundaries**:
anyone with the workspace password can inspect the full shared snapshot or
switch profiles. Demo data is also stored in the browser. Do not use this pilot
for confidential personnel or health information until individual identities,
server-side record-level authorisation, appropriate encryption and retention
controls have been implemented. The 4 MiB (4,194,304 bytes) snapshot limit is another pilot-scale
constraint; migrate to record-level storage for substantial ongoing use.
