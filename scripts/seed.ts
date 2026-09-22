import { demoDocuments } from "../packages/domain/seed";
import { SanityRepository } from "../packages/storage/repository";
const repo = new SanityRepository();
try {
  const current = await repo.all();
  const docs = demoDocuments().filter(
    (d) => !current.some((c) => c._id === d._id),
  );
  if (docs.length) await repo.append(docs);
  const verified = await repo.all();
  console.log(
    JSON.stringify(
      {
        created: docs.length,
        verifiedDocuments: verified.length,
        historicalEvents: verified
          .filter((d) => d._type === "historicalEvent")
          .map((d) => ({ id: d._id, demo: d.demo, status: d.status })),
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Seed failed. Check private sanity/.env.local credentials and network. No secrets logged.",
  );
  process.exitCode = 1;
}
