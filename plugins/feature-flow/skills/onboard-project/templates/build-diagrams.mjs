#!/usr/bin/env node
// Rebuild Archify diagrams on any OS (Windows, macOS, Linux), then write one
// self-contained page with a menu of every diagram (flowdiagram.html).
//
//   node scripts/build-diagrams.mjs                 rebuild every diagram, then the menu page
//   node scripts/build-diagrams.mjs architecture    rebuild only the named ones, then the menu page
//   node scripts/build-diagrams.mjs --page-only     only rewrite the menu page from the built .html files
//   node scripts/build-diagrams.mjs --dir other/dir --page name.html --title "My app"
//
// Finds the archify plugin installed by Claude Code (or ARCHIFY_BIN if set),
// turns off Archify's update check, deletes old receipts so a rebuild never
// fails with evidence-path-conflict, and runs `finalize` for each diagram.
// Copied from the feature-flow plugin (onboard-project/templates).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
let dir = "docs/diagrams";
let pageName = "flowdiagram.html";
let pageOnly = false;
let titleOption = "";
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir") dir = args[++i];
  else if (args[i] === "--page") pageName = args[++i];
  else if (args[i] === "--page-only") pageOnly = true;
  else if (args[i] === "--title") titleOption = args[++i];
  else names.push(args[i].replace(/\.json$/, ""));
}

function readDiagram(name) {
  try {
    const ir = JSON.parse(
      fs.readFileSync(path.join(dir, `${name}.json`), "utf8"),
    );
    return ir && ir.diagram_type ? ir : null;
  } catch {
    return null;
  }
}

const allDiagrams = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .filter((name) => readDiagram(name))
  .sort();

// ---------------------------------------------------------------- build ----

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

let failed = 0;
if (!pageOnly) {
  const archify = findArchify();
  if (!archify) {
    console.error(
      "Archify not found. Install it with:\n" +
        "  claude plugin install archify@team-feature-flow\n" +
        "or set ARCHIFY_BIN to the path of archify.mjs.",
    );
    process.exit(1);
  }
  const selected = names.length ? names : allDiagrams;
  const receipt = /\.(finalize(-summary)?|delivery|browser-check)\.json$/;
  for (const name of selected) {
    const ir = readDiagram(name);
    if (!ir) {
      console.error(`\n== ${name}: no diagram source ${name}.json in ${dir}`);
      failed++;
      continue;
    }
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
        path.join(dir, `${name}.json`),
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
}

// ------------------------------------------------------------ menu page ----
// One self-contained HTML file: a menu on the left, the chosen diagram on the
// right. Each diagram is stored gzip-compressed and unpacked in the browser
// only when it is opened. No network access, works from a file or an email.

const TICKET = /\b([A-Z][A-Z0-9]+)-(\d+)\b/;
const PROJECT_ORDER = ["architecture", "feature-status", "feature-map"];

const entries = allDiagrams
  .filter((name) => fs.existsSync(path.join(dir, `${name}.html`)))
  .map((name) => {
    const ir = readDiagram(name);
    const title = ir.meta?.title || name;
    const ticket = (name.match(TICKET) || title.match(TICKET) || [])[0] || "";
    const html = fs.readFileSync(path.join(dir, `${name}.html`));
    return {
      id: name,
      title,
      ticket,
      ticketNumber: ticket ? Number(ticket.split("-").pop()) : 0,
      group: ticket ? "Designs" : "Project",
      type: ir.diagram_type,
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

const repoUrl =
  entries.map((e) => readDiagram(e.id).meta?.repository?.url).find(Boolean) ||
  "";
const project =
  titleOption ||
  (repoUrl.match(/([^/]+?)(\.git)?$/) || [])[1] ||
  path.basename(path.resolve("."));

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
        .map(
          (e) =>
            `<li><a href="#${escapeHtml(e.id)}" data-id="${escapeHtml(e.id)}">` +
            `<span class="t">${escapeHtml(e.title)}</span>` +
            `<span class="m">${escapeHtml(
              [e.ticket, e.revision && `pinned @${e.revision}`]
                .filter(Boolean)
                .join(" · "),
            )}</span></a></li>`,
        )
        .join("") +
      `</ul>`
    );
  })
  .join("");

// Keep the embedded data from closing the <script> element early.
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
  body { display: grid; grid-template-columns: 260px 1fr; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  nav { background: var(--panel); border-right: 1px solid var(--line); overflow-y: auto; padding: 16px 10px; }
  nav h1 { font-size: 15px; margin: 0 8px 14px; }
  nav h2 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 16px 8px 6px; }
  nav ul { list-style: none; margin: 0; padding: 0; }
  nav a { display: block; padding: 8px 10px; border-radius: 8px; color: inherit; text-decoration: none; }
  nav a:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  nav a[aria-current="page"] { background: color-mix(in srgb, var(--accent) 22%, transparent); box-shadow: inset 3px 0 0 var(--accent); }
  nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  nav .t { display: block; }
  nav .m { display: block; font-size: 12px; color: var(--muted); }
  nav footer { margin: 20px 8px 0; font-size: 12px; color: var(--muted); }
  main { position: relative; min-width: 0; }
  iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--bg); }
  #status { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
  select { display: none; }
  @media (max-width: 760px) {
    body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    nav { border-right: 0; border-bottom: 1px solid var(--line); padding: 10px; }
    nav h2, nav ul, nav footer { display: none; }
    nav h1 { margin: 0 0 8px; }
    select { display: block; width: 100%; padding: 8px; border-radius: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--line); font: inherit; }
  }
</style>
</head>
<body>
<nav aria-label="Diagrams">
  <h1>${escapeHtml(project)} diagrams</h1>
  <label><span hidden>Diagram</span><select id="picker">${entries
    .map(
      (e) =>
        `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)}</option>`,
    )
    .join("")}</select></label>
  ${menu}
  <footer>${entries.length} diagrams. Built with Archify; rebuild with <code>node scripts/build-diagrams.mjs</code>.</footer>
</nav>
<main>
  <div id="status" role="status">Loading…</div>
  <iframe id="view" title="Diagram"></iframe>
</main>
<script id="diagram-data" type="application/json">${payload}</script>
<script>
(() => {
  const diagrams = JSON.parse(document.getElementById("diagram-data").textContent);
  const PROJECT = ${JSON.stringify(project).replace(/</g, "\\u003c")};
  const byId = new Map(diagrams.map((d) => [d.id, d]));
  const cache = new Map();
  const frame = document.getElementById("view");
  const status = document.getElementById("status");
  const picker = document.getElementById("picker");
  const links = [...document.querySelectorAll("nav a[data-id]")];

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
    for (const a of links) {
      if (a.dataset.id === d.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    picker.value = d.id;
    document.title = d.title + " · " + PROJECT + " diagrams";
    status.hidden = false;
    status.textContent = "Loading " + d.title + "…";
    try {
      const html = await unpack(d);
      if (showing !== d.id) return;
      frame.srcdoc = html;
      frame.title = d.title;
      frame.onload = () => { status.hidden = true; };
    } catch (error) {
      status.textContent = "This browser cannot open the diagram (" + error.message + "). Use a current Chrome, Edge, Firefox or Safari.";
    }
  }

  const fromHash = () => decodeURIComponent(location.hash.slice(1));
  window.addEventListener("hashchange", () => show(fromHash()));
  picker.addEventListener("change", () => { location.hash = picker.value; });
  show(fromHash());
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, pageName), page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(
  `\nWrote ${path.join(dir, pageName)}: ${entries.length} diagrams in one file (${kb} KB)`,
);
process.exit(failed ? 1 : 0);
