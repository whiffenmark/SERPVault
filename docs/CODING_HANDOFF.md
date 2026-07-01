# SERPVault - Coding Handoff Brief

## Context & Repository State
- **Current Branch**: `feature/project-site-selector`
- **Latest Pushed Commit**: `d8582bb Add full data export bundle`
- **Final Session Batch**:
  - [ ] `app/settings/page.tsx`
  - [ ] `app/upload/page.tsx`
  - [ ] `docs/CODING_HANDOFF.md`
  - [ ] `docs/PRODUCTION_BACKEND_PLAN.md`
  - [ ] `lib/db.ts`
  - [ ] `lib/upload-audit.ts`
  - [ ] `supabase/migrations/20260701000004_upload_audit_logs.sql`
  - [ ] `supabase/schema.sql`
  - [ ] `test/privacy-audit.test.ts`

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
#### Auto Snapshot (HEAD: d8582bb)
- **Changed Files**:
  - `app/settings/page.tsx`
  - `app/upload/page.tsx`
  - `docs/CODING_HANDOFF.md`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
  - `lib/db.ts`
  - `lib/upload-audit.ts`
  - `supabase/migrations/20260701000004_upload_audit_logs.sql`
  - `supabase/schema.sql`
  - `test/privacy-audit.test.ts`
- **Validation Reminders**:
  - Run `npm run build` to verify types and Next.js compilation.
  - Run `git diff --check` to check for stray spaces and conflict markers.
<!-- AUTO_SNAPSHOT_END -->

### [2026-07-01] - Privacy and Governance Items (Phase 6)
- **Files Touched**:
  - `supabase/migrations/20260701000004_upload_audit_logs.sql`
  - `supabase/schema.sql`
  - `lib/upload-audit.ts`
  - `lib/db.ts`
  - `app/upload/page.tsx`
  - `app/settings/page.tsx`
  - `test/privacy-audit.test.ts`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
- **Validation**: `npm test`, `npm run build`, and `git diff --check`
- **Notes**: Completed Phase 6 Privacy & Governance items. Created Supabase migration defining the `upload_audit_logs` table, its RLS policies, indexing, and the `delete_user_data()` RPC function. Added a pure database helper module `lib/upload-audit.ts` for typed audit log persistence and retrieval. Integrated audit logs into `commitToStore` and `handleReimport` to automatically track dedupe metrics and event types. Added a Settings danger-zone action for signed-in users with a double confirmation guard to call `deleteCloudUserData` which cleans both cloud Supabase data and matching local storage caches and workflows. Created unit tests in `test/privacy-audit.test.ts` covering audit logs construction and ensuring deletion table order remains dependency-safe.

### [2026-07-01] - Data Export Tools (Phase 6)
- **Files Touched**:
  - `lib/all-data-export.ts`
  - `test/all-data-export.test.ts`
  - `app/settings/page.tsx`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
- **Validation**: `npm test`, `npm run build`, and `git diff --check`
- **Notes**: Built a production-grade one-click all-data export from the Settings page. Added a pure helper module `lib/all-data-export.ts` to serialize 10 core database tables into CSV formatted data with correct escaping and stable headers, alongside JSON files for workflows, action plan metadata, and export history. Created a lightweight, zero-dependency, Store-mode ZIP compiler. Wired the new action as an async button in the Settings page Backup & Restore panel with active loading/disabled state and flash notices. Added Node tests in `test/all-data-export.test.ts` verifying formatting, manifest row counts, and ZIP binary headers.

### [2026-07-01] - Project-Scoped Imports & Domain Scoping Rules (Phase 4)
- **Files Touched**:
  - `lib/import-scope.ts`
  - `test/import-scope.test.ts`
  - `app/upload/page.tsx`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
  - `docs/CODING_HANDOFF.md`
- **Validation**: `npm test`, `npm run build`, and `git diff --check`
- **Notes**: Developed pure import-scoping helper to normalize domains, validate selected project IDs, and auto-detect explicit first-party project domains. Integrated helper into the upload/re-import pipeline, preventing stale project ID writes and auto-assigning matching project domains with a visual success notice. Added a clear ASCII warning/error box for `organic_positions` reports when no valid project is resolved. Added comprehensive node tests covering helper behaviors.

### [2026-07-01] - Opportunity Queues Server-Side with Local Fallback (Phase 3)
- **Files Touched**:
  - `supabase/migrations/20260701000002_opportunity_workflow.sql`
  - `supabase/schema.sql`
  - `lib/opportunity-workflow.ts`
  - `app/page.tsx`
  - `app/content/page.tsx`
  - `app/health/page.tsx`
  - `app/action-plan/page.tsx`
  - `app/competitive-intelligence/page.tsx`
  - `app/export/page.tsx`
  - `test/opportunity-workflow.test.ts`
- **Validation**: `npm test`, `npm run build`, and `git diff --check`
- **Notes**: Added a new Supabase migration creating `public.opportunity_workflow_items` with RLS policies and indexes. Extended `lib/opportunity-workflow.ts` to keep local storage sync behavior but added client-safe async cloud helpers (`loadOpportunityWorkflowMap`, `saveOpportunityWorkflowMapToCloud`, `saveOpportunityWorkflowStatusToCloud`, `getMergedOpportunityWorkflowMap`). Updated main dashboard and workspace pages to load merged workflow maps asynchronously on mount. Added focused Node test suite for status validation, local fallback, and cloud integration.

### [2026-07-01] - Selected Project Persistence in Supabase (Phase 3)
- **Files Touched**:
  - `supabase/migrations/20260701000001_user_settings.sql`
  - `supabase/schema.sql`
  - `lib/supabase/user-settings.ts`
  - `components/ProjectSiteSelector.tsx`
  - `test/user-settings.test.ts`
  - `docs/CODING_HANDOFF.md`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
- **Validation**: `npm test`, `npm run build`, and `git diff --check`
- **Notes**: Developed `user_settings` table migration and schema definition. Created `lib/supabase/user-settings.ts` to manage setting storage and retrieval with graceful client-safe fallback for local mode. Connected `ProjectSiteSelector` component to sync selected project state to cloud and hydrate on mount and auth transitions. Added unit tests for helper fallback behaviors.

### [2026-07-01] - Tighten Selected Project Persistence
<!-- AUTO_SNAPSHOT_START -->
#### Auto Snapshot (HEAD: 7851cca)
- **Changed Files**:
  - `app/upload/page.tsx`
  - `components/ProjectSiteSelector.tsx`
  - `docs/CODING_HANDOFF.md`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
  - `lib/supabase/client.ts`
  - `lib/supabase/user-settings.ts`
  - `supabase/migrations/20260701000001_user_settings.sql`
  - `supabase/schema.sql`
  - `test/selected-project-settings.test.ts`
  - `test/user-settings.test.ts`
- **Validation Reminders**:
  - Run `npm run build` to verify types and Next.js compilation.
  - Run `git diff --check` to check for stray spaces and conflict markers.
<!-- AUTO_SNAPSHOT_END -->
- **Files Touched**:
  - `lib/supabase/client.ts`
  - `lib/supabase/user-settings.ts`
  - `components/ProjectSiteSelector.tsx`
  - `app/upload/page.tsx`
  - `test/selected-project-settings.test.ts`
- **Validation**: `npm test`, `npm run build`, and `git diff --check`
- **Notes**: Tightened project persistence batch: typed `getUserSetting` to avoid `any` in public return type, defined `SELECTED_PROJECT_SETTING_KEY`, and added `saveSelectedProjectSetting`/`getSelectedProjectSetting` wrappers (validating string|null values and treating invalid values as absent). Updated `ProjectSiteSelector` component to call wrappers instead of raw helpers. Updated `app/upload/page.tsx` with a clean local async helper to persist cloud selected project setting asynchronously when signed in. Added comprehensive tests in `test/selected-project-settings.test.ts` using client testing hook `__setSupabaseClientForTesting`.
### [2026-07-01] - Project Conflict Resolution for Local-to-Cloud Migration
<!-- AUTO_SNAPSHOT_START -->
#### Auto Snapshot (HEAD: 670da52)
- **Changed Files**:
  - `app/settings/page.tsx`
  - `docs/CODING_HANDOFF.md`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
  - `lib/db.ts`
  - `lib/project-conflicts.ts`
  - `test/project-conflicts.test.ts`
- **Validation Reminders**:
  - Run `npm run build` to verify types and Next.js compilation.
  - Run `git diff --check` to check for stray spaces and conflict markers.
<!-- AUTO_SNAPSHOT_END -->
- **Files Touched**:
  - `lib/project-conflicts.ts`
  - `test/project-conflicts.test.ts`
  - `lib/db.ts`
  - `app/settings/page.tsx`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
  - `docs/CODING_HANDOFF.md`
- **Validation**: `npm test`, `npm run build` and `git diff --check`
- **Notes**: Implemented pure project conflicts plan helper to normalize domains/names and resolve matches. Updated the sync pipeline in `lib/db.ts` to skip duplicate project creations and rewrite `project_id` references in competitors and uploads. Enhanced the Settings page UI to display detailed project merge descriptions.

### [2026-07-01] - Production Auth & RLS Foundation
- **Files Touched**:
  - `supabase/migrations/20260701000000_auth_rls_foundation.sql`
  - `supabase/schema.sql`
  - `lib/supabase/auth.ts`
  - `lib/db.ts`
  - `app/settings/page.tsx`
  - `test/auth.test.ts`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
- **Validation**: `npm test` successfully passed all 38 unit tests (including 7 new auth helper tests).
- **Notes**: Developed Supabase migration for user profiles, user isolation RLS policies, table structures, and database indexing. Implemented client-safe auth helper layer and integrated Auth/Sync UI in the Settings page.

### [2026-07-01] - Guarded Local-to-Cloud Backfill Summary & UI
- **Files Touched**:
  - `lib/migration-summary.ts`
  - `test/migration-summary.test.ts`
  - `app/settings/page.tsx`
  - `docs/CODING_HANDOFF.md`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
- **Validation**: `npm test` passed 42 unit tests (including 4 new focused node tests for the summary helper); `npm run build` succeeds successfully.
- **Notes**: Added a pure helper to calculate local-to-cloud data migration summaries. Added a preflight summary section to the Settings page showing counts, size, warnings, and local CSV mode notice. Implemented confirmation check logic, progress/result visual feedback, and graceful handling of zero-row migrations.

### [2026-07-01] - Server-Side Content Brief Workflow State with localStorage Fallback (Phase 3)
- **Files Touched**:
  - `supabase/migrations/20260701000003_content_brief_workflow.sql`
  - `supabase/schema.sql`
  - `lib/content-brief-workflow.ts`
  - `app/content-briefs/page.tsx`
  - `app/export/page.tsx`
  - `test/content-brief-workflow.test.ts`
  - `docs/CODING_HANDOFF.md`
  - `docs/PRODUCTION_BACKEND_PLAN.md`
- **Validation**: `npm test` passed all 82 unit tests (including 8 new focused node tests for content brief workflow); `npm run build` completed successfully.
- **Notes**: Created Supabase migration to create `public.content_brief_workflows` with check constraints, indexes, and user-scoped RLS policies. Updated `supabase/schema.sql`. Extended `lib/content-brief-workflow.ts` with sanitization, local fallback, cloud merging based on `updatedAt` timestamps, and async cloud helpers. Updated `app/content-briefs/page.tsx` to load merged workflow map and update workflow elements asynchronously. Updated `app/export/page.tsx` to load merged workflow map for exporting. Added Node tests in `test/content-brief-workflow.test.ts`.
