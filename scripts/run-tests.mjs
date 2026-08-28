import { readdir } from "node:fs/promises";
import { spec } from "node:test/reporters";
import { run } from "node:test";
import path from "node:path";
import process from "node:process";

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error("Provide at least one test root.");
  process.exitCode = 1;
} else {
  const testFiles = (
    await Promise.all(roots.map((root) => findTests(path.resolve(process.cwd(), root))))
  )
    .flat()
    .sort();

  if (testFiles.length === 0) {
    console.error(`No test files found under: ${roots.join(", ")}`);
    process.exitCode = 1;
  } else {
    const tests = run({ files: testFiles });
    tests.on("test:fail", () => {
      process.exitCode = 1;
    });
    tests.compose(spec).pipe(process.stdout);
  }
}

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findTests(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".test.ts")
        ? [path.relative(process.cwd(), entryPath)]
        : [];
    }),
  );

  return files.flat();
}
