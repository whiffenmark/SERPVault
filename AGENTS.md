# Coding Agent Rules

Codex Desktop controls the workflow.

For coding implementation, Codex Desktop must run Antigravity 2.0 CLI using `agy`.

Codex Desktop should use `agy` for:
- building features
- fixing bugs
- editing files
- refactors
- test updates
- UI changes

Codex Desktop should directly handle:
- planning
- repo inspection
- reviewing diffs
- explaining changes
- deciding if the work passed

Default flow:
1. Codex inspects the repo.
2. Codex starts `agy`.
3. Codex gives `agy` the task.
4. `agy` edits the code.
5. Codex runs tests/checks.
6. Codex reviews `git diff`.
7. Codex reports results to the user.

Codex should not manually implement large code changes unless the user says:
"use Codex to code this."

Do not commit unless the user approves.
