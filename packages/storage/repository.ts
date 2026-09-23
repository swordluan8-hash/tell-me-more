import { createClient } from "@sanity/client";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { archiveDocument, type ArchiveDocument } from "../domain/model";
import { demoDocuments } from "../domain/seed";
import { rootDir, serverConfig } from "./config";
export interface ArchiveRepository {
  all(): Promise<ArchiveDocument[]>;
  append(documents: ArchiveDocument[]): Promise<void>;
}
export function rejectMutation(): never {
  throw new Error(
    "SEALED_HISTORY_IMMUTABLE: append a new linked record; update/delete are forbidden.",
  );
}
function validateBatch(docs: ArchiveDocument[]) {
  return docs.map((d) => archiveDocument.parse(d));
}
function keys(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((v, i) =>
      typeof v === "object" && v !== null
        ? { ...(keys(v) as object), _key: `k${i}` }
        : v,
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, keys(v)]),
    );
  return value;
}
export class LocalRepository implements ArchiveRepository {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private file = process.env.TMM_LOCAL_ARCHIVE_PATH
      ? path.resolve(rootDir(), process.env.TMM_LOCAL_ARCHIVE_PATH)
      : path.join(rootDir(), ".data", "archive.json"),
    private initial: ArchiveDocument[] = demoDocuments(),
  ) {}
  async all() {
    try {
      return validateBatch(JSON.parse(await readFile(this.file, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return structuredClone(this.initial);
      throw e;
    }
  }
  async append(documents: ArchiveDocument[]) {
    const valid = validateBatch(documents);
    const work = this.queue.then(async () => {
      const prior = await this.all();
      if (
        valid.some((d) => prior.some((p) => p._id === d._id)) ||
        new Set(valid.map((d) => d._id)).size !== valid.length
      )
        rejectMutation();
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.${crypto.randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify([...prior, ...valid]), {
        mode: 0o600,
      });
      await rename(tmp, this.file);
    });
    this.queue = work.catch(() => {});
    await work;
  }
}
export function sanityClient(write = false) {
  const c = serverConfig();
  if (!c.projectId) throw new Error("SANITY_NOT_CONFIGURED");
  if (write && !c.token) throw new Error("SANITY_WRITE_NOT_CONFIGURED");
  return createClient({
    projectId: c.projectId,
    dataset: c.dataset,
    token: c.token || undefined,
    apiVersion: "2026-09-01",
    useCdn: false,
    perspective: "published",
    timeout: 15000,
  });
}
export class SanityRepository implements ArchiveRepository {
  async all() {
    const docs = await sanityClient(false).fetch(
      '*[userId == "single-user" && status == "sealed" && !(_id in path("drafts.**"))]',
    );
    return validateBatch(docs);
  }
  async append(documents: ArchiveDocument[]) {
    const c = serverConfig();
    const docs = validateBatch(documents);
    if (!c.privateDataset && docs.some((d) => !d.demo))
      throw new Error(
        "PUBLIC_DEMO_DATASET: personal history is local-only until a private dataset is configured.",
      );
    let tx = sanityClient(true).transaction();
    for (const d of docs)
      tx = tx.create(
        keys(d) as { _id: string; _type: string; [key: string]: unknown },
      );
    await tx.commit();
  }
}
const local = new LocalRepository();
export function repository(personal = false): ArchiveRepository {
  const c = serverConfig();
  return c.storage === "local-demo" ||
    !c.projectId ||
    (personal && !c.privateDataset)
    ? local
    : new SanityRepository();
}
export function storageMode(personal = false) {
  const c = serverConfig();
  return c.storage === "local-demo" ||
    !c.projectId ||
    (personal && !c.privateDataset)
    ? ("local-demo" as const)
    : ("sanity-groq" as const);
}
