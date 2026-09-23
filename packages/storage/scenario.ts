import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { rootDir, serverConfig } from "./config";
import type { ScenarioContext } from "../domain/temporal";

const config = z.object({
  enabled: z.literal(true),
  scope: z.literal("local-personal-test"),
  id: z.string().min(1),
  asOfDate: z.iso.date(),
  timeZone: z.string().refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; }
    catch { return false; }
  }),
  t0PlaneId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
}).strict();

// Admin-owned local test fixture. No date-picker or request payload can activate it.
// A production/Sanity deployment and the synthetic demo never read this context.
export function readScenario(personal: boolean): ScenarioContext | null {
  if (!personal || serverConfig().storage !== "local-demo") return null;
  const file = path.join(rootDir(), ".data", "local-test-scenario.json");
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (raw.enabled === false) return null;
  const value = config.parse(raw);
  return { id: value.id, asOfDate: value.asOfDate, timeZone: value.timeZone,
    t0PlaneId: value.t0PlaneId, recordIds: value.recordIds };
}
