**Summary:** One sentence describing the change.

**Description:**

As a <type of user>, I want <goal> so that <reason>.

**Requirements:**

- Concrete pieces of work. Name endpoints, pages, fields and files where known.

**Acceptance criteria:**

1. Each criterion is testable and names the expected result (status code, message, what the user sees).
2. Bad input returns 400 with field errors shown under each field.
3. A missing item returns 404.
4. If a dependency (database, external service) is down, the API returns 503 and the user sees an error.
5. Automated tests cover the success and error cases; all existing tests, typecheck and build still pass.
