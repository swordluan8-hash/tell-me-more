import { serverConfig } from "../packages/storage/config";
import { SanityRepository } from "../packages/storage/repository";
import { retrieve } from "../packages/storage/context";
import { currentFeatures } from "../packages/domain/similarity";
import { exampleDecision } from "../packages/domain/catalog";
const c = serverConfig();
try {
  const docs = await new SanityRepository().all();
  const retrieval = await retrieve(
    currentFeatures(exampleDecision, "verification"),
  );
  console.log(
    JSON.stringify(
      {
        projectId: c.projectId,
        dataset: c.dataset,
        documents: docs.length,
        events: docs.filter((d) => d._type === "historicalEvent").length,
        contextConfigured: !!(
          c.contextUrl &&
          (c.contextUrl.includes("/context/organizations/")
            ? c.organizationToken
            : c.token)
        ),
        retrievalMode: retrieval.mode,
        notice: retrieval.notice,
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Sanity verification failed. No credentials or response bodies logged.",
  );
  process.exitCode = 1;
}
