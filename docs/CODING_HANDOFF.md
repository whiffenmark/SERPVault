# SERPVault - Coding Handoff Brief

## Context & Repository State
- **Current Branch**: `feature/project-site-selector`
- **Latest Pushed Commit**: `a6ea4e1 Automate coding handoff updates`
- **Final Session Batch**:
  - [ ] `app/globals.css`
  - [ ] `app/layout.tsx`
  - [ ] `components/Sidebar.tsx`
  - [ ] `docs/CODING_HANDOFF.md`
  - [ ] `package-lock.json`
  - [ ] `package.json`
  - [ ] `test/serpvault.test.ts`

## Major Completed Features
- [x] **Project/Site Selector**: Added robust site/project selector support.
- [x] **CSV Upload Without Project Requirement**: Allowed uploads to remain unassigned research data rather than forcing project association.
- [x] **Duplicate Keyword Removal**: Implemented duplicate checking and cleaning.
- [x] **Dark/Light Mode & Sidebar**: Resolved layout issues and sidebar state.
- [x] **Monthly Volume Labeling**: Corrected labels and formats for monthly search volumes.
- [x] **Dashboard / Opportunity Queue / Workflows**: Improved queue state handling and workflows.
- [x] **Content Brief Workflow**: Completed structure for building SEO briefs.
- [x] **Export Center**: Implemented workflow-aware exports.
- [x] **Action Plan Bulk Operations**: Bulk actions for keyword planner and strategy.
- [x] **Import Quality Audit**: Added warning states and data cleanliness checks.
- [x] **Settings Backup & Restore**: Enabled local settings JSON backups and restorations.
- [x] **Backlink Acquisition Workspace**: Added dashboard for planning backlink reachout.
- [x] **Competitor Top Pages Workspace**: Allowed tracking competitor keyword footprints.
- [x] **Type-Safety Hardening**: Cleared compiler errors and tightened TypeScript schemas.

## Data Model & Storage Architecture
- **Storage Hybrid**: Built on a localStorage/Supabase hybrid architecture handled through `lib/db.ts` and `lib/storage.ts`.
- **Tags Persistence**: Tags are persisted utilizing `updateStore` and `db.updateTag`.
- **Workflow State**: Workflow mapping and columns are backed by localStorage.
- **Project Scoping**: Checked using `getSelectedSite` and filtering rows via `filterRowsBySite`.
- **Research Scope**: CSV uploads might consist of unassigned research data and should NOT be forced into projects.

## Validation & Quality Checks
Before completing code batches, run:
- `npm run build` (Ensures Typecheck and Next.js compiler pass)
- `git diff --check` (Flags extraneous spaces and unresolved merge markers)

## Next Steps / Future Work
- [ ] **Verify Vercel Preview**: Check preview deployment once the local branch is pushed.
- [ ] **Automated Tests**: Write Jest/Cypress tests for keyword import, duplicate checking, and site selector scoping.
- [ ] **Auth / Multi-user**: Add full multi-user authentication persistence support.
- [ ] **Visual QA**: Fix and polish responsive styling layouts on mobile devices.
- [ ] **Competitor Projects Rules**: Ensure competitor domains from the Competitor Top Pages workspace are not forced to become project domains.

## Agent Guidelines / Coding Rules
- **Orchestration**: Codex Desktop orchestrates the workflow and delegates tool execution to `agy`.
- **Commits**: Never commit or push without explicit user approval.
- **Scope**: Avoid reverting or modifying unrelated files.
- **Handoff Updates**: This handoff file is automatically updated via `npm run handoff:update` (run via a pre-commit hook after installing with `npm run handoff:install-hook`).

## Change Log
*To update this file, append a dated entry here whenever you complete a meaningful batch of work. Include the commit hash, files touched, validation performed, and preview URL if available.*

### [2026-07-01]
<!-- AUTO_SNAPSHOT_START -->
#### Auto Snapshot (HEAD: a6ea4e1)
- **Changed Files**:
  - `app/globals.css`
  - `app/layout.tsx`
  - `components/Sidebar.tsx`
  - `docs/CODING_HANDOFF.md`
  - `package-lock.json`
  - `package.json`
  - `test/serpvault.test.ts`
- **Validation Reminders**:
  - Run `npm run build` to verify types and Next.js compilation.
  - Run `git diff --check` to check for stray spaces and conflict markers.
<!-- AUTO_SNAPSHOT_END -->
- **Commit**: Final handoff/type-hardening commit; see latest git log on feature/project-site-selector after push
- **Files Touched**:
  - `app/content/page.tsx`
  - `app/upload/page.tsx`
  - `app/keywords/page.tsx`
  - `app/settings/page.tsx`
  - `lib/export.ts`
  - `docs/CODING_HANDOFF.md`
- **Validation**: `npm run build` and `git diff --check`
- **Notes**: Completed initial type-hardening pass.
