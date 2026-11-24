#!/usr/bin/env node
// Build every project diagram into ONE self-contained page, flowdiagram.html.
// Works the same on Windows, macOS and Linux. Copied from the feature-flow
// plugin (onboard-project/templates/build-diagrams.mjs).
//
//   node scripts/build-diagrams.mjs                     build docs/diagrams/flowdiagram.html
//   node scripts/build-diagrams.mjs --check             fail if flowdiagram.html is out of date
//   node scripts/build-diagrams.mjs --new-design KEY-12 start KEY-12-design.json from this branch's changes
//   options: --dir docs/diagrams  --page flowdiagram.html  --title "My app"  --base origin/main  --force
//
// Sources in the diagrams folder (all committed):
//   features.json        list of features; generates the "feature-status" and "feature-map" diagrams
//   <name>.json          any Archify diagram (architecture, one design per ticket, ...)
//
// Citations follow the code. In any `sources` list you may write
//   { "path": "src/a.ts", "symbol": "createTask" }        a function, class, const, method, describe(...)
//   { "path": "src/a.ts", "find": "app.get('/health'" }    the first line containing this text
//   { "path": "src/a.ts", "find": "id: 'edit'", "lines": 6 }
//   "src/a.ts#createTask"                                  short form of "symbol"
// and the build turns them into line ranges at the pinned commit. Set
// meta.repository.revision to "HEAD" (or leave it out) to pin to the current
// commit on every build; a 40-character SHA keeps a diagram as a fixed record.
//
// The separate Archify .html files and receipts are built in a cache folder
// outside the repository and are not kept in it.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

// ------------------------------------------------------------------ options --
const args = process.argv.slice(2);
const opt = {
  dir: "docs/diagrams",
  page: "flowdiagram.html",
  title: "",
  base: "",
  check: false,
  force: false,
  newDesign: "",
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dir") opt.dir = args[++i];
  else if (a === "--page") opt.page = args[++i];
  else if (a === "--title") opt.title = args[++i];
  else if (a === "--base") opt.base = args[++i];
  else if (a === "--check") opt.check = true;
  else if (a === "--force") opt.force = true;
  else if (a === "--new-design") opt.newDesign = args[++i];
  else if (a === "--page-only") {
    // Accepted for compatibility: the build now always uses its cache.
  } else {
    console.error(`Unknown option: ${a}`);
    process.exit(2);
  }
}

const git = (...gitArgs) =>
  execFileSync("git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/\s+$/, "");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fail = (message) => {
  console.error(`\nError: ${message}`);
  process.exit(1);
};

let head;
try {
  head = git("rev-parse", "HEAD");
} catch {
  fail("run this from inside a Git repository with at least one commit.");
}
const repoUrl = (() => {
  try {
    return git("remote", "get-url", "origin");
  } catch {
    return "";
  }
})();

// --------------------------------------------------------- new design file --
if (opt.newDesign) {
  newDesign(opt.newDesign);
  process.exit(0);
}

function defaultBase() {
  if (opt.base) return opt.base;
  try {
    return git("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  } catch {
    return "origin/main";
  }
}

function newDesign(key) {
  const file = path.join(opt.dir, `${key}-design.json`);
  if (fs.existsSync(file)) fail(`${file} already exists.`);
  const base = defaultBase();
  let changes = [];
  try {
    const mergeBase = git("merge-base", base, "HEAD");
    changes = git("diff", "--name-status", "--no-renames", mergeBase)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, file] = line.split("\t");
        return { status, file };
      })
      .filter(
        (c) =>
          c.status !== "D" &&
          !c.file.startsWith(opt.dir) &&
          !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(
            c.file,
          ),
      );
  } catch {
    console.warn(`Could not compare with ${base}; writing an empty design.`);
  }
  // One column per top-level folder, one box per changed file.
  const groups = new Map();
  for (const c of changes) {
    const top = c.file.includes("/") ? c.file.split("/")[0] : "(root)";
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push(c);
  }
  const components = [];
  const boundaries = [];
  let col = 0;
  for (const [top, files] of groups) {
    const ids = [];
    files.forEach((c, row) => {
      const id = c.file
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(-60)
        .replace(/^-/, "");
      ids.push(id);
      components.push({
        id,
        type: /test|spec/.test(c.file)
          ? "external"
          : /front|client|web|ui/.test(top)
            ? "frontend"
            : "backend",
        label: path.basename(c.file),
        sublabel: path.dirname(c.file),
        change: c.status === "A" ? "added" : "modified",
        explanation: "TODO: say what changes here and why.",
        sources: [{ path: c.file }],
        row,
        col,
        size: [200, 56],
      });
    });
    boundaries.push({ kind: "region", label: top, wraps: ids });
    col++;
  }
  if (!components.length) {
    components.push({
      id: "todo",
      type: "backend",
      label: "TODO",
      sublabel: "add the parts of the design",
      row: 0,
      col: 0,
      size: [200, 56],
    });
  }
  const ir = {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: `${key}: design`,
      locale: "en",
      quality_profile: "showcase",
      repository: { url: repoUrl, provider: "github", revision: "HEAD" },
    },
    layout: {
      mode: "grid",
      cols: Math.max(1, Math.min(col, 12)),
      cellW: 200,
      cellH: 70,
      gapX: 80,
      gapY: 40,
    },
    components,
    boundaries,
    connections: [],
    cards: [
      {
        dot: "cyan",
        title: "API contract",
        items: ["TODO: endpoints, status codes"],
      },
      {
        dot: "emerald",
        title: "Acceptance criteria",
        items: ["TODO: how each one is checked"],
      },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(ir, null, 2) + "\n");
  console.log(
    `Wrote ${file} with ${changes.length} changed files from ${base}. ` +
      "Fill in the TODOs, add connections, then pin it to a commit SHA once the PR is ready.",
  );
}

// ------------------------------------------------------ citation resolver --
const fileCache = new Map();
function fileAt(revision, file) {
  const key = `${revision}:${file}`;
  if (!fileCache.has(key)) {
    try {
      fileCache.set(key, git("show", key).split("\n"));
    } catch {
      fileCache.set(key, null);
    }
  }
  return fileCache.get(key);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function symbolPatterns(symbol) {
  const s = escapeRe(symbol);
  return [
    `^\\s*(export\\s+)?(default\\s+)?(async\\s+)?function\\*?\\s+${s}\\b`,
    `^\\s*(export\\s+)?(declare\\s+)?(const|let|var)\\s+${s}\\b`,
    `^\\s*(export\\s+)?(default\\s+)?(abstract\\s+)?class\\s+${s}\\b`,
    `^\\s*(export\\s+)?(interface|type|enum)\\s+${s}\\b`,
    `^\\s*(async\\s+)?def\\s+${s}\\b`,
    `^\\s*func\\s+(\\([^)]*\\)\\s*)?${s}\\b`,
    `^\\s*(describe|it|test|context)\\s*\\(\\s*['"\`]${s}['"\`]`,
    `^\\s*(public\\s+|private\\s+|protected\\s+|static\\s+|async\\s+|get\\s+|set\\s+)*${s}\\s*\\([^)]*\\)\\s*(:[^{]*)?\\{`,
    `^\\s*(public|private|protected|internal|static|async|override|virtual|readonly|\\s)*[\\w<>\\[\\],.?]+\\s+${s}\\s*\\(`,
  ].map((p) => new RegExp(p));
}

// Strip string literals and line comments so brackets inside them don't count.
const codeOnly = (line) =>
  line
    .replace(/\\./g, "")
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")
    .replace(/\/\/.*$/, "");

function blockEnd(lines, start, file) {
  const first = lines[start];
  // Python: an indented block after a line ending in ':'.
  if (/\.py$/.test(file) && /:\s*(#.*)?$/.test(first)) {
    const indent = first.match(/^\s*/)[0].length;
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      if (lines[i].match(/^\s*/)[0].length <= indent) break;
      end = i;
    }
    return end;
  }
  // JSX element: <Tag ... /> or <Tag ...>...</Tag>
  const jsx = first.trim().match(/^<([A-Za-z][\w.]*)/);
  if (jsx && !/\/>\s*$/.test(first) && !first.includes(`</${jsx[1]}>`)) {
    for (let i = start + 1; i < Math.min(lines.length, start + 400); i++) {
      const t = lines[i].trim();
      if (t.startsWith("/>") || t.includes(`</${jsx[1]}>`)) return i;
    }
    return start;
  }
  // Bracket-balanced statement or block.
  let depth = 0;
  for (let i = start; i < Math.min(lines.length, start + 2000); i++) {
    for (const ch of codeOnly(lines[i])) {
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
    }
    // Closed more than was opened: the statement ended on the line before.
    if (depth < 0) return Math.max(start, i - 1);
    if (depth > 0) continue;
    const t = lines[i].trim();
    const next = (lines.slice(i + 1).find((l) => l.trim()) || "").trim();
    const continues = /^(\?|:|\.[A-Za-z_]|&&|\|\||\+|=)/.test(next);
    const unfinished = /(=|\(|,|\?|:|&&|\|\||\+|=>)$/.test(t);
    if (!continues && !unfinished && (i > start || /[;,})\]]$/.test(t)))
      return i;
  }
  return start;
}

function resolveSource(source, revision, where) {
  let s = source;
  if (typeof s === "string") {
    const [p, symbol] = s.split("#");
    s = symbol ? { path: p, symbol } : { path: p };
  }
  if (!s || !s.path) fail(`${where}: a source needs a "path".`);
  const out = { path: s.path };
  if (s.label) out.label = String(s.label).slice(0, 48);
  if (s.line) {
    out.line = s.line;
    if (s.end_line) out.end_line = s.end_line;
    return out;
  }
  if (!s.symbol && !s.find) return out; // a whole file or folder
  const lines = fileAt(revision, s.path);
  if (!lines)
    fail(
      `${where}: ${s.path} does not exist at ${revision.slice(0, 7)} (commit it first).`,
    );
  let start = -1;
  if (s.symbol) {
    for (const re of symbolPatterns(s.symbol)) {
      start = lines.findIndex((l) => re.test(l));
      if (start >= 0) break;
    }
    if (start < 0)
      fail(
        `${where}: could not find "${s.symbol}" in ${s.path} at ${revision.slice(0, 7)}.`,
      );
  } else {
    start = lines.findIndex((l) => l.includes(s.find));
    if (start < 0)
      fail(
        `${where}: could not find the text ${JSON.stringify(s.find)} in ${s.path} at ${revision.slice(0, 7)}.`,
      );
  }
  const end = s.lines
    ? Math.min(lines.length - 1, start + s.lines - 1)
    : blockEnd(lines, start, s.path);
  out.line = start + 1;
  if (end > start) out.end_line = end + 1;
  if (!out.label && s.symbol) out.label = s.symbol.slice(0, 48);
  return out;
}

const autoPinned = new Set();
function pin(ir, name) {
  ir.meta = ir.meta || {};
  const repo = (ir.meta.repository = ir.meta.repository || {});
  if (!repo.url) repo.url = repoUrl;
  if (!repo.provider && /github\.com/.test(repo.url)) repo.provider = "github";
  if (!repo.revision || repo.revision === "HEAD") {
    // Pin to the latest commit that changed a cited file, so rebuilding on a
    // later commit that leaves those files alone gives the same page.
    const paths = [
      ...new Set(
        (ir.components || [])
          .flatMap((c) => c.sources || [])
          .map((s) => (typeof s === "string" ? s.split("#")[0] : s?.path))
          .filter(Boolean),
      ),
    ];
    let last = "";
    if (paths.length) {
      try {
        last = git("log", "-1", "--format=%H", "HEAD", "--", ...paths);
      } catch {
        last = "";
      }
    }
    repo.revision = last || head;
    autoPinned.add(name);
  }
  if (!/^[0-9a-f]{40}$/i.test(repo.revision))
    fail(
      `${name}: meta.repository.revision must be "HEAD" or a full commit SHA.`,
    );
  for (const c of ir.components || []) {
    if (c.sources)
      c.sources = c.sources.map((s) =>
        resolveSource(s, repo.revision, `${name} › ${c.id}`),
      );
  }
  return ir;
}

// ---------------------------------------------- features.json → 2 diagrams --
const STATUS = {
  built: { type: "backend", word: "BUILT" },
  ticket: { type: "cloud", word: "PENDING", emphasis: true },
  planned: { type: "frontend", word: "PLANNED" },
  none: { type: "security", word: "PENDING" },
};
const isDone = (status) =>
  /^(done|closed|resolved|released)$/i.test(status || "");

function featureState(f) {
  if (f.built || isDone(f.ticketStatus)) return "built";
  if (f.ticket) return "ticket";
  if (f.planned) return "planned";
  return "none";
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const limit = (list, max) =>
  list.length > max
    ? [...list.slice(0, max - 1), `and ${list.length - max + 1} more`]
    : list;

function featureDiagrams(spec, project) {
  const features = spec.features || [];
  const groups = spec.groups?.length
    ? spec.groups
    : [{ id: "features", label: "Features" }];
  const ids = new Set();
  for (const f of features) {
    if (!f.id || !f.name)
      fail(`features.json: every feature needs an id and a name.`);
    if (ids.has(f.id)) fail(`features.json: duplicate feature id "${f.id}".`);
    ids.add(f.id);
    f._state = featureState(f);
    f._group = f.group || groups[0].id;
    if (!groups.some((g) => g.id === f._group))
      fail(`features.json: "${f.id}" uses unknown group "${f._group}".`);
  }
  const repository = {
    url: repoUrl,
    ...(/github\.com/.test(repoUrl) ? { provider: "github" } : {}),
    revision: "HEAD",
  };
  const ticketText = (f) =>
    f.ticket
      ? `Jira ${f.ticket}${f.ticketStatus ? ` · ${f.ticketStatus}` : ""}`
      : "No Jira ticket";
  const count = (list, state) => list.filter((f) => f._state === state).length;
  const named = (list) =>
    list.map((f) => (f.ticket ? `${f.name} (${f.ticket})` : f.name));

  // feature-status: one column per group, one card per feature.
  const keys = [
    ["key-built", "backend", "Built", count(features, "built")],
    [
      "key-ticket",
      "cloud",
      "Pending, has Jira ticket",
      count(features, "ticket"),
    ],
    [
      "key-no-ticket",
      "security",
      "Pending, no Jira ticket",
      count(features, "none"),
    ],
    ...(count(features, "planned")
      ? [["key-planned", "frontend", "Planned", count(features, "planned")]]
      : []),
  ];
  const cols = Math.max(groups.length, keys.length, 3);
  const statusComponents = keys.map(([id, type, label, n], col) => ({
    id,
    type,
    label,
    sublabel: plural(n, "feature"),
    ...(id === "key-ticket" ? { emphasis: true } : {}),
    row: 0,
    col,
    size: [200, 52],
  }));
  const statusBoundaries = [
    { kind: "region", label: "Legend", wraps: keys.map(([id]) => id) },
  ];
  groups.forEach((g, col) => {
    const members = features.filter((f) => f._group === g.id);
    if (!members.length) return;
    members.forEach((f, i) => {
      const s = STATUS[f._state];
      statusComponents.push({
        id: f.id,
        type: s.type,
        label: f.name,
        sublabel: `${s.word} · ${ticketText(f)}`,
        ...(s.emphasis ? { emphasis: true } : {}),
        ...(f.summary ? { explanation: f.summary } : {}),
        ...(f.sources?.length ? { sources: f.sources.slice(0, 3) } : {}),
        row: i + 1,
        col,
        size: [200, 64],
      });
    });
    const builtCount = count(members, "built");
    const pending = members.length - builtCount;
    statusBoundaries.push({
      kind: "region",
      label: `${g.label}: ${builtCount} built${pending ? `, ${pending} pending` : ""}`,
      wraps: members.map((f) => f.id),
    });
  });
  const featureStatus = {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: `${project} features: built vs pending`,
      locale: "en",
      quality_profile: "showcase",
      repository: { ...repository },
      legend: { mode: "hidden" },
    },
    layout: { mode: "grid", cols, cellW: 220, cellH: 76, gapX: 70, gapY: 44 },
    components: statusComponents,
    boundaries: statusBoundaries,
    connections: [],
    cards: [
      {
        dot: "emerald",
        title: "Built (green)",
        items: limit(named(features.filter((f) => f._state === "built")), 8),
      },
      {
        dot: "amber",
        title: "Pending, has Jira ticket (amber)",
        items: features
          .filter((f) => f._state === "ticket")
          .map(
            (f) =>
              `${f.ticket} ${f.name}${f.ticketStatus ? `: ${f.ticketStatus}` : ""}`,
          ),
      },
      {
        dot: "cyan",
        title: "Planned (blue)",
        items: named(features.filter((f) => f._state === "planned")),
      },
      {
        dot: "rose",
        title: "Pending, no Jira ticket (red)",
        items: limit(named(features.filter((f) => f._state === "none")), 8),
      },
    ].filter((card) => card.items.length),
  };

  // feature-map: one row per feature with UI, API and data columns.
  const parts = [
    ["ui", spec.columns?.ui || "UI page"],
    ["api", spec.columns?.api || "API endpoint"],
    ["data", spec.columns?.data || "Data store"],
  ];
  const mapped = features.filter(
    (f) => groups.find((g) => g.id === f._group)?.map !== false,
  );
  const ticketsPending = mapped.filter((f) => f._state === "ticket");
  const plannedList = mapped.filter((f) => f._state === "planned");
  const mapComponents = [
    ["key-built", "backend", "Built", "exists in code"],
    [
      "key-ticket",
      "cloud",
      "Pending, has Jira ticket",
      ticketsPending.map((f) => f.ticket).join(", ") || "none right now",
    ],
    [
      "key-planned",
      "frontend",
      "Planned",
      plannedList.map((f) => f.name).join(", ") || "none right now",
    ],
    ["key-none", "security", "Pending, no Jira ticket", "needs a ticket"],
  ].map(([id, type, label, sublabel], col) => ({
    id,
    type,
    label,
    sublabel: sublabel.slice(0, 60),
    ...(id === "key-ticket" ? { emphasis: true } : {}),
    row: 0,
    col,
    size: [200, 50],
  }));
  const columns = [[], [], [], []];
  mapped.forEach((f, i) => {
    // Row 1 stays empty so the column frames don't overlap the legend.
    const row = i + 2;
    const featureCell = {
      id: `${f.id}-feature`,
      type: "external",
      label: f.name,
      sublabel: f.ticket
        ? `${f.ticket}${f.ticketStatus ? ` · ${f.ticketStatus}` : ""}`
        : "No Jira ticket",
      ...(f.summary ? { explanation: f.summary } : {}),
      row,
      col: 0,
      size: [200, 50],
    };
    mapComponents.push(featureCell);
    columns[0].push(featureCell.id);
    parts.forEach(([key], p) => {
      const part = typeof f[key] === "string" ? { label: f[key] } : f[key];
      if (!part) return;
      // A part can exist before its feature is finished (e.g. a shared table).
      const exists = part.built ?? f._state === "built";
      const state = exists ? "built" : f._state === "built" ? "none" : f._state;
      const s = STATUS[state];
      const cell = {
        id: `${f.id}-${key}`,
        type: s.type,
        label: part.label,
        ...(part.note ? { sublabel: part.note } : {}),
        ...(s.emphasis ? { emphasis: true } : {}),
        ...(part.sources?.length ? { sources: part.sources.slice(0, 3) } : {}),
        row,
        col: p + 1,
        size: [200, 50],
      };
      mapComponents.push(cell);
      columns[p + 1].push(cell.id);
    });
  });
  const featureMap = {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: `${project} feature map`,
      locale: "en",
      quality_profile: "showcase",
      repository: { ...repository },
      legend: { mode: "hidden" },
    },
    layout: {
      mode: "grid",
      cols: 4,
      cellW: 200,
      cellH: 50,
      gapX: 72,
      gapY: 18,
    },
    components: mapComponents,
    boundaries: [
      {
        kind: "region",
        label: "Legend",
        wraps: ["key-built", "key-ticket", "key-planned", "key-none"],
      },
      ...["Feature · Jira", ...parts.map(([, label]) => label)].map(
        (label, i) => ({ kind: "region", label, wraps: columns[i] }),
      ),
    ].filter((b) => b.wraps.length),
    connections: [],
    cards: [
      {
        dot: "emerald",
        title: "Built",
        items: limit(named(mapped.filter((f) => f._state === "built")), 8),
      },
      {
        dot: "amber",
        title: "Next with tickets",
        items: named(ticketsPending),
      },
      { dot: "cyan", title: "Planned", items: named(plannedList) },
      {
        dot: "rose",
        title: "No ticket yet",
        items: [
          ...limit(named(mapped.filter((f) => f._state === "none")), 6),
          ...(spec.mapNote ? [spec.mapNote] : []),
        ],
      },
    ].filter((card) => card.items.length),
  };
  return { "feature-status": featureStatus, "feature-map": featureMap };
}

// ------------------------------------------------------------ collect IRs --
if (!fs.existsSync(opt.dir)) fail(`${opt.dir} does not exist.`);
const featuresFile = path.join(opt.dir, "features.json");
const featureSpec = fs.existsSync(featuresFile) ? readJson(featuresFile) : null;
const project =
  opt.title ||
  featureSpec?.project ||
  (repoUrl.match(/([^/]+?)(\.git)?$/) || [])[1] ||
  path.basename(path.resolve("."));

const diagrams = new Map(); // name -> IR
for (const file of fs.readdirSync(opt.dir).sort()) {
  if (!file.endsWith(".json") || file === "features.json") continue;
  if (/\.(finalize(-summary)?|delivery|browser-check)\.json$/.test(file))
    continue;
  let ir;
  try {
    ir = readJson(path.join(opt.dir, file));
  } catch {
    continue;
  }
  if (ir && ir.diagram_type) diagrams.set(file.slice(0, -5), ir);
}
if (featureSpec) {
  for (const [name, ir] of Object.entries(
    featureDiagrams(featureSpec, project),
  )) {
    if (diagrams.has(name))
      fail(
        `${name}.json and features.json both define "${name}". Delete ${name}.json; features.json generates it.`,
      );
    diagrams.set(name, ir);
  }
}
if (!diagrams.size) fail(`no diagrams found in ${opt.dir}.`);

// Warn when cited files have uncommitted changes: the build reads the
// committed version.
const dirty = (() => {
  try {
    return new Set(
      git("status", "--porcelain")
        .split("\n")
        .filter(Boolean)
        .map((l) => l.slice(3).replace(/^"|"$/g, "")),
    );
  } catch {
    return new Set();
  }
})();

for (const [name, ir] of diagrams) {
  pin(ir, name);
  const touched = (ir.components || [])
    .flatMap((c) => c.sources || [])
    .map((s) => s.path)
    .filter((p) => dirty.has(p));
  if (touched.length && autoPinned.has(name))
    console.warn(
      `Warning: ${name} cites files with uncommitted changes (${[...new Set(touched)].join(", ")}). Commit them, then rebuild.`,
    );
}

// --------------------------------------------------------- Archify build --
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
if (!archify)
  fail(
    "Archify not found. Install it with\n  claude plugin install archify@team-feature-flow\nor set ARCHIFY_BIN to the path of archify.mjs.",
  );
const archifyId = crypto
  .createHash("sha1")
  .update(fs.readFileSync(archify))
  .update(archify)
  .digest("hex")
  .slice(0, 12);
const repoRoot = git("rev-parse", "--show-toplevel");
const cacheRoot = path.join(
  os.tmpdir(),
  "feature-flow-diagrams",
  crypto.createHash("sha1").update(repoRoot).digest("hex").slice(0, 12),
);
fs.mkdirSync(cacheRoot, { recursive: true });

const built = new Map(); // name -> html
let failed = 0;
for (const [name, ir] of diagrams) {
  const key = crypto
    .createHash("sha256")
    .update(archifyId + JSON.stringify(ir))
    .digest("hex")
    .slice(0, 16);
  const work = path.join(cacheRoot, `${name}-${key}`);
  const html = path.join(work, `${name}.html`);
  if (!opt.force && fs.existsSync(html)) {
    built.set(name, fs.readFileSync(html));
    console.log(`== ${name}: unchanged (cached)`);
    continue;
  }
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const source = path.join(work, `${name}.json`);
  // Archify wants meta.output relative to the folder it runs in.
  ir.meta.output = `${name}.html`;
  fs.writeFileSync(source, JSON.stringify(ir, null, 2));
  console.log(`== ${name}: building`);
  const result = spawnSync(
    process.execPath,
    [
      archify,
      "finalize",
      ir.diagram_type,
      `${name}.json`,
      `${name}.html`,
      "--repo-root",
      repoRoot,
      "--quality",
      "showcase",
    ],
    {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: "1" },
    },
  );
  if (result.status === 0 && fs.existsSync(html)) {
    built.set(name, fs.readFileSync(html));
  } else {
    failed++;
    console.error(
      `   ${name} failed:\n${(result.stdout || "") + (result.stderr || "")}`,
    );
    for (const file of fs.readdirSync(work)) {
      if (!/\.finalize\.json$/.test(file)) continue;
      const text = fs.readFileSync(path.join(work, file), "utf8");
      const messages = [...new Set(text.match(/"message":\s*"[^"]+"/g) || [])];
      for (const m of messages.slice(0, 5)) console.error(`   ${m}`);
    }
  }
}
if (failed)
  fail(`${failed} diagram(s) failed to build; ${opt.page} was not changed.`);

// ------------------------------------------------------------- the page ----
// One self-contained HTML file: a searchable menu on the left, the chosen
// diagram on the right. Each diagram is stored gzip-compressed and unpacked in
// the browser only when it is opened. No network access needed.
const TICKET = /\b([A-Z][A-Z0-9]+)-(\d+)\b/;
const PROJECT_ORDER = ["feature-status", "feature-map", "architecture"];
const site = featureSpec?.tracker?.site || "";
const tracker = site
  ? `https://${site.replace(/^https?:\/\//, "").replace(/\/$/, "")}/browse/`
  : "";

const entries = [...built.entries()].map(([name, html]) => {
  const ir = diagrams.get(name);
  const title = ir.meta?.title || name;
  const ticket = (name.match(TICKET) || title.match(TICKET) || [])[0] || "";
  return {
    id: name,
    title,
    ticket,
    ticketNumber: ticket ? Number(ticket.split("-").pop()) : 0,
    group: ticket ? "Designs" : "Project",
    revision: (ir.meta?.repository?.revision || "").slice(0, 7),
    data: zlib.gzipSync(html, { level: 9 }).toString("base64"),
  };
});
entries.sort((a, b) => {
  if (a.group !== b.group) return a.group === "Project" ? -1 : 1;
  if (a.group === "Designs") return b.ticketNumber - a.ticketNumber;
  const ia = PROJECT_ORDER.indexOf(a.id);
  const ib = PROJECT_ORDER.indexOf(b.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
});

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const menu = ["Project", "Designs"]
  .map((group) => {
    const items = entries.filter((e) => e.group === group);
    if (!items.length) return "";
    return (
      `<h2>${group}</h2><ul>` +
      items
        .map((e) => {
          const meta = [
            e.ticket && tracker
              ? `<a class="j" href="${escapeHtml(tracker + e.ticket)}" target="_blank" rel="noopener">${escapeHtml(e.ticket)} ↗</a>`
              : escapeHtml(e.ticket),
            e.revision && `pinned @${escapeHtml(e.revision)}`,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            `<li data-text="${escapeHtml((e.title + " " + e.ticket + " " + e.id).toLowerCase())}">` +
            `<a class="d" href="#${escapeHtml(e.id)}" data-id="${escapeHtml(e.id)}">${escapeHtml(e.title)}</a>` +
            `<span class="m">${meta}</span></li>`
          );
        })
        .join("") +
      `</ul>`
    );
  })
  .join("");

const payload = JSON.stringify(
  entries.map(({ id, title, data }) => ({ id, title, data })),
).replace(/</g, "\\u003c");

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(project)} diagrams</title>
<style>
  :root { color-scheme: dark light; --bg:#0f1115; --panel:#161a21; --line:#262c36; --text:#e6e9ef; --muted:#8a93a3; --accent:#3b82f6; }
  @media (prefers-color-scheme: light) { :root { --bg:#f6f7f9; --panel:#ffffff; --line:#e3e6eb; --text:#1b1f27; --muted:#667085; --accent:#2563eb; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; grid-template-columns: 270px 1fr; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  nav { background: var(--panel); border-right: 1px solid var(--line); overflow-y: auto; padding: 16px 10px; }
  nav h1 { font-size: 15px; margin: 0 8px 12px; }
  #search { width: calc(100% - 16px); margin: 0 8px 4px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; }
  nav h2 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 16px 8px 6px; }
  nav ul { list-style: none; margin: 0; padding: 0; }
  nav li { border-radius: 8px; padding: 7px 10px; }
  nav li:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  nav li.current { background: color-mix(in srgb, var(--accent) 22%, transparent); box-shadow: inset 3px 0 0 var(--accent); }
  nav a.d { display: block; color: inherit; text-decoration: none; }
  nav a:focus-visible, #search:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  nav .m { display: block; font-size: 12px; color: var(--muted); }
  nav a.j { color: var(--accent); text-decoration: none; }
  nav a.j:hover { text-decoration: underline; }
  #empty { margin: 10px 8px; color: var(--muted); font-size: 13px; }
  nav footer { margin: 20px 8px 0; font-size: 12px; color: var(--muted); }
  main { position: relative; min-width: 0; }
  iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--bg); }
  #status { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
  select { display: none; }
  @media (max-width: 760px) {
    body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    nav { border-right: 0; border-bottom: 1px solid var(--line); padding: 10px; }
    nav h2, nav ul, nav footer, #search, #empty { display: none; }
    nav h1 { margin: 0 0 8px; }
    select { display: block; width: 100%; padding: 8px; border-radius: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--line); font: inherit; }
  }
</style>
</head>
<body>
<nav aria-label="Diagrams">
  <h1>${escapeHtml(project)} diagrams</h1>
  <input id="search" type="search" placeholder="Search diagrams or tickets" aria-label="Search diagrams or tickets">
  <label><span hidden>Diagram</span><select id="picker">${entries
    .map(
      (e) =>
        `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)}</option>`,
    )
    .join("")}</select></label>
  ${menu}
  <p id="empty" hidden>No diagram matches.</p>
  <footer>${entries.length} diagrams, built with Archify. Rebuild: <code>node scripts/build-diagrams.mjs</code></footer>
</nav>
<main>
  <div id="status" role="status">Loading…</div>
  <iframe id="view" title="Diagram"></iframe>
</main>
<script id="diagram-data" type="application/json">${payload}</script>
<script>
(() => {
  const PROJECT = ${JSON.stringify(project).replace(/</g, "\\u003c")};
  const diagrams = JSON.parse(document.getElementById("diagram-data").textContent);
  const byId = new Map(diagrams.map((d) => [d.id, d]));
  const cache = new Map();
  const frame = document.getElementById("view");
  const status = document.getElementById("status");
  const picker = document.getElementById("picker");
  const search = document.getElementById("search");
  const items = [...document.querySelectorAll("nav li[data-text]")];

  async function unpack(d) {
    if (cache.has(d.id)) return cache.get(d.id);
    const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const html = await new Response(stream).text();
    cache.set(d.id, html);
    return html;
  }

  let showing = null;
  async function show(id) {
    const d = byId.get(id) || diagrams[0];
    if (!d || d.id === showing) return;
    showing = d.id;
    for (const li of items) {
      const link = li.querySelector("a.d");
      const current = link.dataset.id === d.id;
      li.classList.toggle("current", current);
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    picker.value = d.id;
    document.title = d.title + " · " + PROJECT + " diagrams";
    status.hidden = false;
    status.textContent = "Loading " + d.title + "…";
    try {
      const html = await unpack(d);
      if (showing !== d.id) return;
      frame.onload = () => { status.hidden = true; };
      frame.srcdoc = html;
      frame.title = d.title;
    } catch (error) {
      status.textContent = "This browser cannot open the diagram (" + error.message + "). Use a current Chrome, Edge, Firefox or Safari.";
    }
  }

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    for (const li of items) {
      const match = !q || li.dataset.text.includes(q);
      li.hidden = !match;
      if (match) visible++;
    }
    document.querySelectorAll("nav h2").forEach((h) => {
      h.hidden = ![...h.nextElementSibling.children].some((li) => !li.hidden);
    });
    document.getElementById("empty").hidden = visible > 0;
  });
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const first = items.find((li) => !li.hidden);
    if (first) location.hash = first.querySelector("a.d").dataset.id;
  });

  const fromHash = () => decodeURIComponent(location.hash.slice(1));
  window.addEventListener("hashchange", () => show(fromHash()));
  picker.addEventListener("change", () => { location.hash = picker.value; });
  show(fromHash());
})();
</script>
</body>
</html>
`;

const target = path.join(opt.dir, opt.page);
if (opt.check) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== page) {
    console.error(
      `\n${target} is out of date. Run: node scripts/build-diagrams.mjs`,
    );
    process.exit(1);
  }
  console.log(`\n${target} is up to date.`);
  process.exit(0);
}
fs.writeFileSync(target, page);
console.log(
  `\nWrote ${target}: ${entries.length} diagrams in one file (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB), pinned to ${head.slice(0, 7)}`,
);
