---
name: build-feature
description: Take one tracker ticket (Jira by default) through the full feature flow - design, branch, build, tests, manual check, diagrams, pull request, ticket update and run log - using the project's automation profile in CLAUDE.md. Use only when the user runs /build-feature with a ticket key.
argument-hint: <TICKET-KEY>
disable-model-invocation: true
---

# /build-feature: ticket to pull request

Build the feature described by ticket **$ARGUMENTS** and open a pull request for a
person to review. Work through the steps in order. Keep the user's task list
updated, one step per line.

## 0. Load the project profile

Read the project's `CLAUDE.md` and find the `## Automation profile` section. It
defines everything project-specific: tracker site and project key, repository and
base branch, branch naming, install/run/test/typecheck/build/format commands, the
local URL to check by hand, the diagrams folder and the run-logs folder.

- If there is no profile, stop and tell the user to run `/feature-flow:onboard-project`
  first. Do not guess commands.
- If the ticket key does not match the profile's project key, stop and ask.
- Also follow every other rule in `CLAUDE.md`. Project rules win over this skill.
- The machine may run Windows, macOS or Linux. Use the profile's commands as
  written; if one fails only because of the shell (for example bash syntax in
  PowerShell), run the equivalent for this shell and suggest fixing the profile.

## 1. Read and check the ticket

Fetch the ticket with the tracker connector. Check it has a summary, a user story,
requirements and **numbered, testable acceptance criteria** (see
[`templates/ticket.md`](templates/ticket.md)).

- If criteria are missing or vague, draft improved text, show it to the user and
  wait for approval before changing the ticket. Never rewrite someone else's ticket
  silently.
- If the ticket is assigned to someone else or other open tickets cover the same
  work, stop and ask: someone may already be building it.
- Move the ticket to In Progress (or the profile's equivalent status).

## 2. Design

Read the code the ticket touches. Present a short design: new parts, changed
parts, unchanged parts, API contract, data model, and how each acceptance
criterion will be checked. Unless the profile says `Diagrams: none`, draw it as a
design diagram `<diagrams folder>/<KEY>-design.json` (start it with the
`Diagrams build` command's `--new-design <KEY>` option, or write it by hand),
marking new parts `change: "added"` and changed parts `change: "modified"`, and
cite existing code by name (see "Diagrams with Archify" below). Build and show it
from `flowdiagram.html`. Wait for the user's OK on the design before writing code, unless
the profile says `Design approval: skip`.

## 3. Branch

Fetch, then branch from the latest remote base branch using the profile's
naming, for example `feature/<KEY>-<slug>`. Never commit to the base branch.

## 4. Build

- Follow the project's existing structure and patterns; reuse shared components.
- Add automated tests for every acceptance criterion that can be tested: success,
  each validation error, not found, permission and dependency-down cases.
- Keep the change to what the ticket asks. Note anything else you notice as a
  follow-up instead of doing it.

## 5. Verify

Run every command the profile lists (test, typecheck, build, format) and record
the actual numbers. Fix failures you caused. If a failure exists on the base
branch too, report it rather than hiding it.

Then start the app with the profile's run command and check each acceptance
criterion by hand in the running app, including a full reload where data must
persist. For each criterion record one of: automated test, checked by hand, both,
or **not checked** (say why). Never claim a check that did not run.

## 6. Update diagrams

Unless the profile says `Diagrams: none`, update every diagram the feature
affects, in this same branch (see "Diagrams with Archify" below):

- `features.json`: set the feature's `"built": true` (it turns green) and point
  its `sources` and its `ui`/`api`/`data` parts at the new code by name. Refresh
  `ticketStatus` for every feature that has a ticket from the tracker (one
  search for all their keys). The `feature-status` and `feature-map` diagrams and
  their counts are generated from this file; never edit them by hand.
- `architecture.json`: add the new components, routes and data stores.
- the design diagram from step 2: compare it with the real change
  (`git diff --name-status <base>...HEAD`), fix it, and pin its
  `meta.repository.revision` to the branch's last code commit (a full SHA) so it
  stays a record of this change.

Commit the code first, then run the `Diagrams build` command once: it pins the
other diagrams to the latest commit that touched the files they cite, turns
names into line ranges and writes `flowdiagram.html`. Commit the `.json` files
and `flowdiagram.html`, then open `flowdiagram.html` and look at each diagram in
its menu.
If a baseline diagram is missing, say so and suggest running
`/feature-flow:onboard-project` rather than inventing one from scratch.

## 7. Commit, push, open the pull request

- Commit titles start with the ticket key: `<KEY>: <what changed>`, bodies say why.
- Push the branch and open a PR against the base branch using
  [`templates/pr-body.md`](templates/pr-body.md), with the acceptance-criteria
  table and real test numbers.

## 8. Update the ticket

Comment on the ticket with [`templates/ticket-comment.md`](templates/ticket-comment.md):
PR link, branch, test results, and any criterion not checked.

## 9. Hand over

Stop here. **Never merge the pull request** and never move the ticket to Done
before a person merges it. Tell the user what is ready to review and what was not
verified.

## 10. After the merge (when the user says it is merged)

Move the ticket to Done and add the run log from
[`templates/run-log.md`](templates/run-log.md) to the profile's run-logs folder,
in a small docs PR. In the same PR set the feature's `ticketStatus` to `Done` in
`features.json` and run the `Diagrams build` command.

## Diagrams with Archify

Diagrams are made with the **archify** plugin from the same marketplace (a
reviewed, pinned copy of Archify 3.3.0). Load the `archify` skill and follow its
instructions for authoring; in addition:

- **Local only.** Archify renders and checks diagrams on this machine. Run every
  Archify command with the environment variable `ARCHIFY_UPDATE_CHECK_DISABLED=1`
  so it makes no update check (the profile's `Diagrams build` script sets it for
  you). Never use Archify's PR features (`pr attach` and similar), which upload
  images to the Git host, unless the user asks for that specific PR.
- **One page, few sources.** The diagrams folder holds `flowdiagram.html` (the
  only file people open), `features.json`, `architecture.json` and one
  `<KEY>-design.json` per ticket. The separate Archify `.html` files and receipts
  are built in a temporary cache and never committed. Build with the profile's
  `Diagrams build` command (`node scripts/build-diagrams.mjs`); `--check` fails
  if `flowdiagram.html` is out of date.
- **`features.json`** lists every feature: `id`, `name`, `group`, `ticket`,
  `ticketStatus` (copied from the tracker), `built`, `planned`, `summary`,
  `sources`, and `ui`/`api`/`data` parts (`label`, `note`, `built`, `sources`).
  A feature is green when `built` is true or its ticket is Done, amber when it
  has a ticket, blue when `planned`, red otherwise. See
  [`../onboard-project/templates/features.example.json`](../onboard-project/templates/features.example.json).
- **Cite code by name.** In `sources`, prefer
  `{ "path": "...", "symbol": "createTask" }` (functions, classes, consts,
  methods, `describe("...")` blocks) or `{ "path": "...", "find": "text" }`
  (first line containing it; add `"lines": n` for a fixed length). A path alone
  cites a whole file or folder. Line numbers still work but drift. At most 3
  sources per component; labels up to 48 characters.
- **Pinning.** `meta.repository.revision: "HEAD"` (the default) pins to the
  latest commit that changed the cited files, so commit code before building.
  A full SHA keeps a diagram as a fixed record (designs of merged tickets).
- **Drafts.** Archify's default `.archify/` working folder is scratch space. Copy
  finished diagrams into the diagrams folder; never share a `.archify/` path.
- **No explainer pages** unless the user asks for one.
- If the archify plugin is not installed, skip the diagram steps, say so in the PR
  under "Not done / follow-ups", and do not install anything yourself.

## Always ask first

Merging; changing another person's ticket or code they own; installing system
software or changing security settings; anything that sends data to a service the
profile does not name.
