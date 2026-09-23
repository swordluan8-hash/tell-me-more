# 叙能 / Tell Me More

A single-user, evidence-first decision-history demo, governed by
[PRODUCT_SPEC_V2.md](PRODUCT_SPEC_V2.md). It records artifacts → verbatim recall →
confirmed sealed events → explainable historical comparisons. It never generates
a final decision, personality verdict, or growth score.

## Run

Node 22.12+ (verified with 26.8.1), npm. Next.js 16.3.5 / Sanity Studio 6.15.0.

```sh
npm ci
npm run dev                    # http://127.0.0.1:3000
npm run studio                 # http://localhost:3333
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e               # starts an isolated local-demo server and never writes production
```

Only localhost requests are accepted. This is not an authenticated public service.
The UI is Chinese; labels distinguish synthetic demo content and personal history.

## Demo walkthrough

1. Open the welcome page. Complete ten T0 questions and explicitly seal the baseline.
2. **02 历史入口**: choose “我有旧物 / 旧记录” or “我没有旧物”. For an object, enter text or select an image for metadata + SHA-256; without an object, seal a later-recall anchor first.
   In demo mode, explicitly attest that the artifact is synthetic before cloud upload.
3. Confirm the verbatim artifact readback. Narrate freely; then assign original
   sentences to the eight fields. Only the next missing field is requested.
   Unknown / forgotten / cannot judge / not applicable are complete answers.
4. Record the actual choice and the user's historical best decision. Review and
   confirm the archive. Its evidence, recall, and classification layers remain separate.
5. **赋能 → 填入演示问题 → 调用相似历史** returns multiple source events. Expand
   the components to see shared words, differences, weights, and provenance. Open
   a source event to inspect its original evidence and later recall.
6. **认知轨迹** compares reconstructed historical planes and T0 using sourced original
   statements. Differences are descriptive; neither time point is scored as better.
7. **06 补缺访谈** audits each decision node, asks only for missing fields, accepts explicit unknown states, and appends confirmed exact-quote supplements without rewriting sealed history.

The initial seed has 12 synthetic documents: 3 artifacts, 3 memories, 3 historical
events, 2 cognition planes, and 1 baseline. Empower sessions are created on use.
Demo questionnaire runs may append additional demonstration T0 snapshots.

Current verification: 53 deterministic/unit rule tests pass, 4 browser E2E flows pass, typecheck/lint/build pass, and the production dataset remains at exactly 12 canonical documents / 3 historical events after E2E. Browser tests use an isolated gitignored local archive.

## Sanity and Context

Provisioned project: **3tdecpiq**, dataset: **production**. The project is now
attached to the user's Sanity organization. Content Lake readback is live. A hosted
Studio is deployed at `https://tell-me-more-xu-neng.sanity.studio/`, and its schema
deployment has been verified.

Credentials live only in `sanity/.env.local` (see `.env.example`). Server code reads
that file; tokens are never shipped in frontend environment variables.

```sh
npm run seed                   # create missing fixture IDs only; never replace
npm run verify:sanity          # prints only safe project/retrieval status
npm run schema:deploy
```

**Sanity Context + Knowledge Base are verified.** Context is installed for the
organization, an organization-level Context Viewer token has been provisioned, and
the hosted Studio/schema prerequisite is deployed. The submission demo uses the
organization MCP endpoint backed by Knowledge Base `kbrqT3iILYmW`:

```dotenv
SANITY_CONTEXT_MCP_URL=https://api.sanity.io/v1/context/organizations/ok578v8vm/mcp/tell-me-more
SANITY_KNOWLEDGE_BASE_ID=kbrqT3iILYmW
```

The production MCP exposes `initial_context` and `knowledge_base_read`. Tokens
remain only in gitignored `sanity/.env.local`.

The Knowledge Base dataset source deliberately projects only decision-time structure:
event context, role, known information, visible options, constraints/resources,
technology limits, decision nodes, chosen action, historical-best statement and the
user's reason. Outcome, later evaluation, reflection and later-learned fields are not
ingested. Context retrieves candidate historical material; the application then
maps it back to sealed Content Lake records and performs its own deterministic
pre-decision similarity reranking. KB prose is not used as a final recommendation.
MCP failures still produce an explicit Content Lake fallback.

For submission freeze the Content Lake contains exactly the 12 canonical seed
documents and 3 sealed historical events. The clean Knowledge Base was rebuilt from
those 3 events and produced 5 entries with 0 issues. **Path One Knowledge Base-backed
Context acceptance is satisfied by live MCP retrieval.**

References verified on 2026-09-22:
[AI coding-agent quickstart](https://www.sanity.io/docs/getting-started/ai-coding-agents),
[provisioning](https://sanity.new),
[Context setup](https://www.sanity.io/docs/ai/sanity-context-quick-start),
[Context tool contract](https://www.sanity.io/docs/ai/sanity-context-mcp-tools).

## Local fallback and privacy

```sh
TMM_STORAGE=local-demo npm run dev
```

The local create-only archive is `.data/archive.json` (gitignored, mode 0600).
Personal mode always uses local storage while the cloud dataset is public. It
never mixes personal and synthetic events in retrieval. Do not set
`TMM_PRIVATE_DATASET=true` until the actual Sanity dataset is private. Local data
is not encrypted at rest. A separate audited user deletion/export workflow and
multi-user authentication are outside this slice.

## Similarity and archive guarantees

Weights: domain 20, role 15, goal 15, constraints/resources 15, options 15,
information 10, relationships 5, technology 5. Each component is exact normalized
word-set Jaccard overlap × its weight. Unknown dimensions contribute zero and
reduce coverage; scores are not normalized upward. Outcomes, later evaluations,
and later-learned information never enter matching or candidate queries.

The four current inputs directly index domain, urgency constraints, and options.
Other dimensions remain unknown unless explicitly labeled in the user's text:
`角色：…；目标：…；信息：…；关系：…；技术：…`.
This lexical method intentionally misses synonyms; it does not fabricate facts.

The repository exposes only `all` and `append`. Duplicate IDs fail; no patch,
replace, or delete path exists. API PATCH/DELETE return 405. Studio is read-only
with all mutation actions disabled. Sanity administrators or a stolen broad write
token can still modify documents outside this application; this is business-layer
immutability, not provider-enforced WORM storage.

## Structure and limitations

- `web/`: Next.js App Router, local-only API, responsive workflow UI.
- `sanity/`: standalone read-only Studio and six structured document schemas.
- `packages/domain/`: Zod contracts, interview protocol, deterministic comparisons.
- `packages/storage/`: create-only local/Sanity repositories and Context adapter.
- `packages/application/`: use-case orchestration; no generic chat endpoint.
- `tests/`: constitutional rules and desktop/mobile browser verification.

Image mode seals metadata and a file-content hash; original image bytes remain on
the user's device. No OCR, image understanding, audio or video processing. Drafts
remain in React memory until seal and are lost on refresh. The UI currently creates
one decision node per interview; the model and archive viewer support multiple.
Historical plane reconstruction is seeded and sourced, not automatically inferred.
The local JSON store serializes writes within one server process; it is not a
multi-process production database. No submission video has been made.
