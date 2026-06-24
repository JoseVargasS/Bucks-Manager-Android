import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensions = new Set([".cjs", ".js", ".json", ".md", ".mjs", ".ps1", ".ts", ".tsx", ".yaml", ".yml"]);
const ignored = new Set([".agents", ".codex", ".git", ".expo", "android", "dist", "ios", "node_modules", "web-build"]);
const errors = [];

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await checkDirectory(path);
      continue;
    }
    if (!extensions.has(extname(entry.name)) && entry.name !== "pre-commit") continue;
    const contents = await readFile(path, "utf8");
    const file = relative(root, path);
    contents.split(/\r?\n/).forEach((line, index) => {
      if (/[ \t]+$/.test(line)) errors.push(`${file}:${index + 1}: trailing whitespace`);
    });
    if (contents && !contents.endsWith("\n")) errors.push(`${file}: missing final newline`);
  }
}

await checkDirectory(root);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
