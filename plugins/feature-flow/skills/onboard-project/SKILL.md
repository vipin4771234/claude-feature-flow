---
name: onboard-project
description: Prepare a repository for /build-feature - detect its commands and structure, write the Automation profile section in CLAUDE.md, and report what is missing (tests, CI, tracker access). Use only when the user runs /onboard-project.
argument-hint: [tracker project key]
disable-model-invocation: true
---

# /onboard-project: make a repository ready for /build-feature

Set up the current repository so `/feature-flow:build-feature` can run on it. Do
not change application code. Work on a branch and open a pull request for the
files you add.

## 1. Detect

Read the README, manifests (`package.json`, `pom.xml`, `pyproject.toml`,
`go.mod`, `*.csproj`, ...), CI config and existing `CLAUDE.md`. Work out:

- language, frameworks and folder conventions for a feature;
- install, run, test, typecheck/lint, build and format commands;
- the local URL to check the app by hand, and services it needs (databases,
  queues) with how to start them;
- the git remote, default branch and existing branch naming;
- whether CI runs on pull requests.

Run the test command once to confirm it works. Record any workaround needed.

**Every machine, every OS.** The profile is shared by everyone who clones the
repository, on Windows, macOS or Linux. Prefer commands that run the same in
PowerShell, cmd and bash: package-manager scripts (`npm run ...`, `mvn ...`,
`dotnet ...`) and `node`/`python` scripts. Do not put shell-only syntax in a
profile command (`VAR=value cmd`, `$(...)`, `which`, `&&` chains that cmd.exe
handles differently, `brew`, `/usr/...` paths). If a workaround is only needed on
some machines, keep the normal command and list the workaround under
`Known workarounds` with its bash and PowerShell forms.

## 2. Confirm tracker access

Ask the user for the tracker site and project key (use the argument if given:
$ARGUMENTS). Read one ticket with the tracker connector to confirm access.

## 3. Write the profile

Add or update this section in `CLAUDE.md`, keeping everything else in the file:

```markdown
## Automation profile

- Tracker: Jira, site <site>.atlassian.net, project <KEY>
- Repository: <host>/<owner>/<repo>, base branch <main>
- Branches: feature/<KEY>-<n>-<slug>, fix/<KEY>-<n>-<slug>, docs/<slug>
- Install: <command>
- Run: <command> (check at <URL>); needs: <services and how to start them>
- Test: <command>
- Typecheck/lint: <command>
- Build: <command>
- Format check: <command>
- Diagrams: <folder, e.g. docs/diagrams/ (Archify)>, or "none"
- Diagrams build: `node scripts/build-diagrams.mjs [name ...]`
- Run logs: <folder, e.g. docs/runs/>
- Design approval: required
- Known workarounds: <list, or "none">
```

Also add the standing rules if `CLAUDE.md` has none: never push to the base
branch; ticket key in commit titles; test every acceptance criterion; diagrams in
the same PR; never merge without a person.

## 4. Baseline diagrams

Unless the user chooses `Diagrams: none`, create the three diagrams that
`/feature-flow:build-feature` keeps up to date, using the **archify** plugin and
the "Diagrams with Archify" rules in the build-feature skill (local only, update
check off, no receipts committed):

| Diagram          | Type               | Shows                                                                                                                           |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `architecture`   | architecture       | Main components, routes and data stores, each citing source lines                                                               |
| `feature-status` | architecture, grid | Every feature as a card: built (green), pending with a ticket (amber), pending without a ticket (red), with a legend row on top |
| `feature-map`    | architecture, grid | One row per feature with its UI, API and data columns, coloured the same way                                                    |

Build features from what the code really has (routes, pages, models), matched
to the tracker's open and done tickets. Mark anything inferred as "proposed".
Copy [`templates/build-diagrams.mjs`](templates/build-diagrams.mjs) to
`scripts/build-diagrams.mjs` in the repository (unless the project already has a
diagram build command). It finds the installed archify plugin on any OS, turns
off the update check and clears old receipts, so nobody needs a shell-specific
command or a machine-specific path.

Pin each to the current base-branch commit, rebuild with
`node scripts/build-diagrams.mjs`, look at each one, and add them with their
`.json` sources and a short `README.md` (how to rebuild: the same command) to the
diagrams folder. Add the receipt patterns to `.gitignore`.

If the archify plugin is not installed, skip this step and list it as missing.

Archify makes extra "explainer" pages by default. Ask the user whether to add
`[archify explainer: on-demand] Make Archify explainer pages only when I ask for one.`
to their own `~/.claude/CLAUDE.md`. It is a personal setting, so only add it with
their OK.

## 5. Make the plugins easy to get on other machines

Add (or merge into) `.claude/settings.json` in the repository, so anyone who
clones it and trusts the folder is offered the team plugins. Ask the user for the
marketplace's Git repository if you do not know it:

```json
{
  "extraKnownMarketplaces": {
    "team-feature-flow": {
      "source": { "source": "github", "repo": "<owner>/<marketplace-repo>" }
    }
  },
  "enabledPlugins": {
    "feature-flow@team-feature-flow": true,
    "archify@team-feature-flow": true
  }
}
```

Keep personal settings out of this file (`.claude/settings.local.json` is for
those and must stay git-ignored).

## 6. Report readiness

Show a checklist with what is ready and what is missing:

- [ ] Tests run locally with one command
- [ ] CI runs tests on pull requests
- [ ] Base branch is protected
- [ ] Tracker connector can read and comment on tickets
- [ ] Git host CLI is signed in with push access to branches
- [ ] Local services start with documented commands
- [ ] archify plugin installed; baseline diagrams created (or `Diagrams: none`)
- [ ] Profile commands work in PowerShell and bash; `.claude/settings.json` offers the plugins

Recommend fixing missing tests and CI before the first `/feature-flow:build-feature`
run. Commit the profile and the diagrams on one branch and open a pull request.
