import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FixtureSchema, fixtureFileName, type FixtureStore } from "./fixtures";

/** Server-only: fixtures on disk at <root>/<scenario>/<step>.json. */
export function createFileFixtureStore(root = path.join(process.cwd(), "fixtures")): FixtureStore {
  const safeScenario = (scenario: string) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(scenario)) throw new Error(`invalid scenario id: "${scenario}"`);
    return scenario;
  };
  const fileFor = (scenario: string, step: string) => path.join(root, safeScenario(scenario), fixtureFileName(step));

  return {
    async get(scenario, step) {
      let raw: string;
      try {
        raw = await readFile(fileFor(scenario, step), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
      return FixtureSchema.parse(JSON.parse(raw));
    },
    async put(fixture) {
      const parsed = FixtureSchema.parse(fixture);
      const file = fileFor(parsed.scenario, parsed.step);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    },
  };
}
