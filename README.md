# feature-flow

A Claude Code plugin that takes one tracker ticket to a pull request ready for
review: design, branch, build, tests, manual check in the running app, diagrams,
pull request and ticket update. It is the reusable version of the process proven
on a proof-of-concept project (a Node.js + React task manager).

> Status: **draft 0.3.0**. Proven end to end on one Node.js + React project; not yet tested on a second project.

## What is in it

| Skill                        | Command                               | What it does                                                                                                                                          |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboard-project`            | `/feature-flow:onboard-project [KEY]` | Detects a repository's commands and structure, writes the **Automation profile** in its `CLAUDE.md`, and reports what is missing (tests, CI, access). |
| `build-feature`              | `/feature-flow:build-feature <KEY>`   | Runs the full flow for one ticket and stops at a pull request for a person to review. Never merges.                                                   |
| `archify` (plugin `archify`) | used by the two skills above          | Draws and checks the diagrams. A reviewed, pinned copy of [Archify](https://github.com/tt-a1i/archify) 3.3.0, commit `3ca198d`.                       |

Templates in `plugins/feature-flow/skills/build-feature/templates/`: ticket,
pull request body, ticket comment, run log. `onboard-project/templates/build-diagrams.mjs`
is copied into each project to rebuild diagrams on any OS and to write
`flowdiagram.html`, one self-contained page with a menu of every diagram.

Both feature-flow skills only run when a person types the command (`disable-model-invocation`).

## Diagrams with Archify (local only)

`onboard-project` creates three baseline diagrams for a project (architecture,
feature status, feature map), and `build-feature` draws a design diagram for each
ticket and updates the baseline ones in the same pull request.

Archify runs **entirely on the developer's machine**: it builds standalone HTML,
checks cited source lines against the local Git repository and renders the page
in a local headless Chrome. Nothing is uploaded. The skills enforce:

- `ARCHIFY_UPDATE_CHECK_DISABLED=1` on every Archify command, so it makes no
  update check;
- never using Archify's PR features (`pr attach`), which upload images to the Git
  host, unless the user asks;
- never committing Archify receipt files, which contain local paths;
- no explainer pages unless asked.

What does leave the machine is not Archify: Claude reads source code to write a
diagram (the same as any Claude Code work), and the finished `.html` diagrams are
committed and pushed with the pull request on purpose.

The bundled Archify copy was reviewed (install scripts, network calls,
subprocesses) and verified byte-for-byte against upstream commit
`3ca198d867ce4b616332f846ff66e5c8e5e60f95`. To upgrade it, review the new version
the same way before replacing `plugins/archify/skills/archify/`. Archify is
Apache-2.0; its `LICENSE` and `NOTICE` are kept in `plugins/archify/`.

## How it splits generic and project-specific

- **Generic (this plugin):** the steps, the rules (never push to the base branch,
  ticket key in commits, test every acceptance criterion, diagrams in the same PR,
  never merge), and the templates.
- **Per project (`CLAUDE.md` in each repository):** an `## Automation profile`
  section with the tracker key, repository, branch naming and the
  install/run/test/typecheck/build/format commands. `onboard-project` writes it.

Example profile (a Node.js + React app with MongoDB):

```markdown
## Automation profile

- Tracker: Jira, site example.atlassian.net, project APP
- Repository: github.com/your-org/your-repo, base branch main
- Branches: feature/APP-<n>-<slug>, fix/APP-<n>-<slug>, docs/<slug>
- Install: `npm ci`
- Run: `npm run dev` (check at http://127.0.0.1:5173); needs: MongoDB and backend/.env
- Test: `npm test`
- Typecheck/lint: `npm run typecheck`
- Build: `npm run build`
- Format check: `npx prettier --check docs frontend backend CLAUDE.md README.md`
- Diagrams: docs/diagrams/ (Archify)
- Diagrams build: `node scripts/build-diagrams.mjs [name ...]`
- Run logs: docs/runs/
- Design approval: required
- Known workarounds: if the test MongoDB download fails, point MONGOMS_SYSTEM_BINARY at a local mongod
```

Profile commands must work in PowerShell, cmd and bash, because the same
`CLAUDE.md` is used on every machine. `onboard-project` checks this.

## Install (Windows, macOS, Linux)

The marketplace is the private GitHub repository
[`vipin4771234/claude-feature-flow`](https://github.com/vipin4771234/claude-feature-flow).

### 1. Prerequisites on the machine

| Tool                                                       | Why                                             | Windows                                                                | macOS                                | Linux                                    |
| ---------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| [Claude Code](https://docs.claude.com/en/docs/claude-code) | runs the skills                                 | installer or `npm i -g @anthropic-ai/claude-code`                      | same                                 | same                                     |
| Git                                                        | clone, branches                                 | [git-scm.com](https://git-scm.com)                                     | `xcode-select --install` or Homebrew | package manager                          |
| GitHub CLI `gh`                                            | sign-in, pull requests                          | `winget install GitHub.cli`                                            | `brew install gh`                    | [cli.github.com](https://cli.github.com) |
| Node.js 18+                                                | Archify (projects may need newer, e.g. Node 24) | [nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS.LTS` | Homebrew or nvm                      | nvm or package manager                   |
| Chrome, Chromium or Edge                                   | Archify's browser check                         | Edge is already there                                                  | Chrome                               | `chromium` / `google-chrome`             |

Then sign in to GitHub with an account that can read this repository and push
branches to the project:

```bash
gh auth login
```

```bash
gh auth setup-git
```

The second command lets `git` (and so Claude Code's plugin installer) use the
same sign-in for this private repository.

### 2. Add the marketplace and install the plugins

In a terminal (any shell):

```bash
claude plugin marketplace add vipin4771234/claude-feature-flow
```

```bash
claude plugin install feature-flow@team-feature-flow
```

```bash
claude plugin install archify@team-feature-flow
```

Or inside Claude Code: `/plugin marketplace add vipin4771234/claude-feature-flow`,
then `/plugin` to install. A project onboarded with `onboard-project` also lists
the marketplace in its `.claude/settings.json`, so Claude Code offers the plugins
when you open the cloned project and trust the folder.

To get updates later:

```bash
claude plugin marketplace update team-feature-flow
```

If you already installed Archify as a personal skill in `~/.claude/skills/archify`,
remove that copy so only the pinned version is used.

### 3. Connect the tracker

In Claude (claude.ai, Settings > Connectors) connect **Atlassian** with an account
that can read and comment on the project's Jira tickets. The connector belongs to
each person's Claude account, so every user connects their own.

### 4. Per project

Clone the project, install its own tools (runtime, database, `.env` files; these
are listed in its profile and README), then:

- an already onboarded project: run `/feature-flow:build-feature <KEY>-<n>`;
- a new project: run `/feature-flow:onboard-project <KEY>` first.

Optional, personal: add
`[archify explainer: on-demand] Make Archify explainer pages only when I ask for one.`
to `~/.claude/CLAUDE.md` (Windows: `%USERPROFILE%\.claude\CLAUDE.md`).

### Troubleshooting

| Problem                                                                  | Fix                                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Marketplace add fails with "repository not found" or asks for a password | `gh auth login` then `gh auth setup-git`; make sure your GitHub account can see the repository                                 |
| Archify "browser check" cannot find a browser                            | Set `ARCHIFY_CHROME` to the browser's full path. In a Linux container without a sandbox also set `ARCHIFY_CHROME_NO_SANDBOX=1` |
| `scripts/build-diagrams.mjs` says Archify not found                      | Install the archify plugin, or set `ARCHIFY_BIN` to `.../skills/archify/bin/archify.mjs`                                       |
| Setting a variable for one command                                       | bash: `VAR=1 command`; PowerShell: `$env:VAR='1'; command`; cmd: `set VAR=1 && command`                                        |

## Before using it on another project

- Check the project's owner allows sending its code to the Claude API, and use the
  organisation's API key.
- Use a bot account with branch-only push access and a protected base branch.
- Make sure the project has tests and CI; `onboard-project` reports gaps.

## Roadmap

1. ~~Prove it on a first project with `/feature-flow:build-feature`.~~ Done.
2. ~~Publish to a team Git repository.~~ Done (private GitHub repository).
3. Try it on a Windows and a Linux machine.
4. Pilot on a second project with a different stack.
5. Add it to the organisation's plugin catalog.
6. Headless runs triggered from Jira (label or assignment) with an API key and bot account.
