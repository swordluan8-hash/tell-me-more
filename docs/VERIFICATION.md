# Verification — 2026-09-22

## Passed

- `npm run lint`: no lint errors.
- `npm run typecheck`: web, shared packages, tests, scripts and Studio type-check.
- `npm test`: 13 constitutional/domain tests pass.
- `npm run build`: Next.js 16.3.5 optimized production build succeeds.
- Playwright desktop: T0 → artifact → verbatim narration → eight-field completion
  (including forgotten) → explicit confirmation → sealed Sanity event → multiple
  historical comparisons and source components. PATCH/DELETE return 405.
- Playwright mobile: 390px viewport, navigation usable, no horizontal overflow.
- Playwright image metadata: original byte SHA-256 matches, metadata is sealed,
  user-held file path preserved, no claim of uploaded image bytes or image inference.
- `sanity schema list`: `_.schemas.default` deployed to `3tdecpiq/production`;
  server creation time `2026-09-22T01:36:49Z`.
- Initial seed write/readback: 12 documents, three sealed synthetic historical events.
- Subsequent browser-created synthetic events were read back from Sanity.
- Final local API readback: HTTP 200, `sanity-groq`, 25 documents and five sealed
  events (three fixtures plus two browser-test events).
- Exact local token scan: no token found in 41 tracked files or 11 browser bundles.

## Not claimed as complete

- Context organization endpoint/token are not configured. Verified retrieval mode
  is `sanity-groq`, not `context`. Path One Context acceptance remains blocked.
- Image bytes remain user-held; the demo archives metadata and a byte hash only.
- Personal data uses local storage while the provisioned dataset is public.
- No submission video or public deployment has been created.

## External handoff

The unclaimed Sanity project expires at **2026-09-25 01:10 UTC**. The next manual
step is to open the private `sanity/claim-project.html` and claim the project into
the user's organization. Context then requires the organization enablement,
dataset-source MCP endpoint, and organization Context Viewer grant described in
README. These cannot be substituted with the provisional project write token.

The local app listens at **http://127.0.0.1:3000**. Restart with `npm run dev`.
