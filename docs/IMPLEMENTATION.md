# Implementation contract

PRODUCT_SPEC_V2.md is the source of truth, read in full before implementation.

Single-user demo, with three independent layers: sealed original evidence,
verbatim user recall, and source-linked derived indexing. No generated advice.
Historical outcomes never enter candidate selection or similarity features.
Unknown, forgotten, cannot_judge and not_applicable are complete answers.

Architecture: Next.js App Router frontend/server boundary, standalone Sanity
Studio, shared validated domain contracts, create-only archive repository.
Draft interviews stay in the browser until explicit confirmation. Artifact
creation seals immediately. Later recall is a new document, never a patch.

Official references checked 2026-09-22:

- https://www.sanity.io/docs/getting-started/ai-coding-agents
- https://sanity.new
- https://www.sanity.io/docs/ai/sanity-context-quick-start
- https://www.sanity.io/docs/ai/sanity-context-configure-mcp
- https://www.sanity.io/docs/ai/sanity-context-mcp-tools

Context uses the organization endpoint and organization Context Viewer token.
Project write tokens cannot substitute for that grant. Context retrieval and
Content Lake fallback must be separately identified in every session result.
Only synthetic data may be sent to an unclaimed public demo dataset.
