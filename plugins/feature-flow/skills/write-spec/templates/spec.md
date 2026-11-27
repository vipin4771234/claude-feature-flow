# <Feature name>

| Status    | Owner                     | Source               | Repositories           | Jira                                    |
| --------- | ------------------------- | -------------------- | ---------------------- | --------------------------------------- |
| **Draft** | <person who asked for it> | <input file or link> | <repo>, <related repo> | <epic key, filled in by create-tickets> |

> **Status values:** Draft → In review → **Approved**. A person changes the status.
> `/feature-flow:create-tickets` only runs on an **Approved** spec.

## 1. Summary

Two or three sentences: what we are building, for whom, and why now.

## 2. Problem and goals

- **Problem:** what users cannot do today, in their words.
- **Goals:** measurable outcomes (for example "a partner can be shown as compliant").
- **Non-goals:** what this spec deliberately leaves out.

## 3. Users and scenarios

| Who    | Scenario                     | Result they see                      |
| ------ | ---------------------------- | ------------------------------------ |
| <role> | <what they do, step by step> | <what the product shows or produces> |

## 4. What exists today

Facts from the code, each with its file. Mark each row as reused, changed or new.

| Area   | Today                    | Change               | Where    |
| ------ | ------------------------ | -------------------- | -------- |
| <area> | <what the code does now> | reuse / change / new | `<path>` |

## 5. Requirements

Numbered so tickets and reviewers can refer to them. Each one is testable.

| ID  | Requirement           | Phase | Source                    |
| --- | --------------------- | ----- | ------------------------- |
| R1  | <the system must ...> | 1     | <input document, section> |

## 6. Design

### 6.1 Data and rules

Fields, formats, validation rules, conversion rules, with examples
(input → output). Rules that must come from the customer are marked **TBD (Q<n>)**,
never guessed.

### 6.2 API

| Method and path | Request  | Response | Errors                    |
| --------------- | -------- | -------- | ------------------------- |
| `POST /...`     | <fields> | <fields> | 400 ..., 404 ..., 503 ... |

### 6.3 User interface

Pages, components and states (empty, loading, error, success).

### 6.4 Components and flow

Which parts of which repository change, and how data moves between them.

## 7. Phases

| Phase | Scope (requirements) | Repositories | Depends on |
| ----- | -------------------- | ------------ | ---------- |
| 1     | R1, R2               | <repo>       | —          |

## 8. Open questions

Every unknown the input document does not answer. Blocking questions must be
answered before the spec is approved.

| ID  | Question   | Blocking? | Owner            | Answer                 |
| --- | ---------- | --------- | ---------------- | ---------------------- |
| Q1  | <question> | yes / no  | <who can answer> | <empty until answered> |

## 9. Risks and dependencies

| Risk or dependency                          | Impact            | Mitigation |
| ------------------------------------------- | ----------------- | ---------- |
| <external standard, licence, partner, data> | <what goes wrong> | <plan>     |

## 10. Testing

How each requirement will be checked: automated tests (which repository), test
data needed, manual checks, partner or customer sign-off.

## 11. Change log

| Date   | Who                 | Change                   |
| ------ | ------------------- | ------------------------ |
| <date> | Claude (write-spec) | First draft from <input> |
