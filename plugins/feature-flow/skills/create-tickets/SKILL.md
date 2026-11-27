---
name: create-tickets
description: Turn an approved feature-flow spec page in Confluence into one Jira epic and buildable stories (one repository per story, numbered acceptance criteria, dependencies), after showing the plan for approval. Use only when the user runs /create-tickets with a spec page.
argument-hint: <Confluence spec page link or ID>
disable-model-invocation: true
---

# /create-tickets: approved spec to Jira epic and stories

Create the Jira tickets for the spec at **$ARGUMENTS**, so each story can be built
with `/feature-flow:build-feature <KEY>`. Do not write code. Keep the user's task
list updated, one step per line.

## 0. Load the profile

Read `CLAUDE.md` and its `## Automation profile`: tracker site, project key,
**Related repos**. Stop and suggest `/feature-flow:onboard-project` if there is no
profile. The tickets go into the profile's project unless the user names another.

## 1. Read and check the spec

Read the page and its comments with the connector.

- It must be a feature-flow spec (label `feature-flow-spec`, or the spec
  template's sections). If not, stop and suggest `/feature-flow:write-spec`.
- **Status must be Approved.** If it is Draft or In review, stop and say so. Only
  continue if the user explicitly says to create tickets from an unapproved spec,
  and then say so in the epic description.
- Every **blocking** open question must have an answer. List any that do not, and
  stop.
- If the **Jira** cell already names an epic, or the project already has issues
  with the label `spec-<page id>`, this spec was ticketed before: show what
  exists and only add what is missing. Never create duplicates.

## 2. Plan the tickets

- **One epic** for the spec: summary = feature name, description = the spec's
  summary, a link to the page, the phases and the requirement IDs.
- **Stories** that each:
  - change **one repository** (feature work that spans two repositories becomes
    two stories, the API story first, linked with "blocks");
  - are small enough for one pull request;
  - deliver something testable on their own;
  - follow [`../build-feature/templates/ticket.md`](../build-feature/templates/ticket.md):
    summary, user story, requirements (endpoints, pages, fields, files), and
    **numbered, testable acceptance criteria** covering success, each validation
    error, not found, dependency down, and automated tests;
  - name the requirement IDs (`R3, R4`) and the phase they cover.
- Every requirement of the phases being ticketed appears in at least one story.
  Ticket **only the phases the user asks for** (default: the first phase); list
  later phases in the epic description instead.
- Work that needs a person outside the team (customer rules, partner tests,
  licences) becomes a separate **Task**, not hidden inside a story.
- Labels on every issue: `spec-<page id>`, and `repo-<repository name>` on
  stories.

## 3. Show the plan and wait

Show the user a table: key placeholder, type, summary, repository, requirements,
number of acceptance criteria, depends on. Include the full text of one story as
an example. Wait for approval or changes before creating anything.

## 4. Create

Check which issue types the project has (Epic, Story, Task, or the project's
equivalents) and use them. Then, in order:

1. Create the epic.
2. Create the stories and tasks with the epic as parent, in dependency order.
3. Add the "blocks" links between dependent stories.
4. Leave everything **unassigned** in the first status (To Do), unless the user
   says otherwise. Never change other people's tickets.

If a call fails half way, report what was created (with keys) and what was not;
do not retry blindly into duplicates.

## 5. Link back to the spec

After showing the user the change, update the spec page: put the epic key in the
**Jira** cell and add a **Tickets** section listing each key, summary, repository
and requirements. Add a change log row. Do not change the Status.

## 6. Hand over

Give the user the epic link and the build order, for example:

1. `WEDI-12` (API, repo `webedi-python`): `/feature-flow:build-feature WEDI-12` in that repository.
2. `WEDI-13` (UI, repo `webedi-frontend`): after WEDI-12 is merged.

## Always ask first

Creating issues; updating the spec page; ticketing more than the requested
phases; changing issues that already exist; assigning anyone.
