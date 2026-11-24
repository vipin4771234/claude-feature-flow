#!/usr/bin/env node
// Rebuild Archify diagrams on any OS (Windows, macOS, Linux).
//
//   node scripts/build-diagrams.mjs                 rebuild every diagram in docs/diagrams
//   node scripts/build-diagrams.mjs architecture    rebuild only the named ones
//   node scripts/build-diagrams.mjs --dir other/dir
//
// Finds the archify plugin installed by Claude Code (or ARCHIFY_BIN if set),
// turns off Archify's update check, deletes old receipts so a rebuild never
// fails with evidence-path-conflict, and runs `finalize` for each diagram.
// Copied from the feature-flow plugin (onboard-project/templates).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
let dir = "docs/diagrams";
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir") dir = args[++i];
  else names.push(args[i].replace(/\.json$/, ""));
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function findArchify() {
  if (process.env.ARCHIFY_BIN) return process.env.ARCHIFY_BIN;
  const claudeDir =
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const cache = path.join(claudeDir, "plugins", "cache");
  const found = [];
  if (fs.existsSync(cache)) {
    for (const marketplace of fs.readdirSync(cache)) {
      const pluginDir = path.join(cache, marketplace, "archify");
      if (!fs.existsSync(pluginDir)) continue;
      for (const version of fs.readdirSync(pluginDir)) {
        const bin = path.join(
          pluginDir,
          version,
          "skills",
          "archify",
          "bin",
          "archify.mjs",
        );
        if (fs.existsSync(bin)) found.push({ version, bin });
      }
    }
  }
  found.sort((a, b) => compareVersions(b.version, a.version));
  if (found.length) return found[0].bin;
  const personal = path.join(
    claudeDir,
    "skills",
    "archify",
    "bin",
    "archify.mjs",
  );
  return fs.existsSync(personal) ? personal : null;
}

const archify = findArchify();
if (!archify) {
  console.error(
    "Archify not found. Install it with:\n" +
      "  claude plugin install archify@team-feature-flow\n" +
      "or set ARCHIFY_BIN to the path of archify.mjs.",
  );
  process.exit(1);
}

const isDiagram = (file) => {
  try {
    return Boolean(
      JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).diagram_type,
    );
  } catch {
    return false;
  }
};
const selected = names.length
  ? names
  : fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && isDiagram(f))
      .map((f) => f.slice(0, -".json".length));

const receipt = /\.(finalize(-summary)?|delivery|browser-check)\.json$/;
let failed = 0;
for (const name of selected) {
  const source = path.join(dir, `${name}.json`);
  const ir = JSON.parse(fs.readFileSync(source, "utf8"));
  // Archify may write receipt names in lower case, so match case-insensitively.
  for (const file of fs.readdirSync(dir)) {
    if (
      receipt.test(file) &&
      file.toLowerCase().startsWith(`${name.toLowerCase()}.`)
    )
      fs.rmSync(path.join(dir, file));
  }
  console.log(`\n== ${name} (${ir.diagram_type})`);
  const result = spawnSync(
    process.execPath,
    [
      archify,
      "finalize",
      ir.diagram_type,
      source,
      path.join(dir, `${name}.html`),
      "--repo-root",
      ".",
      "--quality",
      "showcase",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: "1" },
    },
  );
  if (result.status !== 0) failed++;
}
console.log(
  `\n${selected.length - failed}/${selected.length} diagrams built` +
    (failed ? `, ${failed} failed` : ""),
);
process.exit(failed ? 1 : 0);
