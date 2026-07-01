# Production Persistence & Auth Planning Document

This document outlines the phased migration plan for transitioning SERPVault from client-side `localStorage` data persistence to a secure, multi-tenant production backend using Supabase (PostgreSQL, Auth, and Row-Level Security).

---

## Executive Summary & Data Safety Rules

> [!IMPORTANT]
> **Core Data Integrity Rule**:
> Competitor domains, referring domains, and research domains discovered during keyword gap analysis or backlink analysis are raw data inputs and **must never** automatically trigger the creation of project domains. Project domains represent first-party properties and must only be registered through explicit user creation.

---

## Next Steps
1. **Apply Migration**: Apply the timestamped SQL migration `20260701000000_auth_rls_foundation.sql` on the production database.
2. **Backfill UI**: Create a production sync/backfill UI wizard in the settings page to assist users in migrating their local-first legacy data to the cloud.
3. **Enforce RLS**: Verify and enforce RLS constraints fully after the private beta phase completes.

---

## Phase 1: Authentication & User-Owned Data (Foundation Completed)

### Objectives
* Establish secure user identities.
* Assign all data records to a specific user.

### Action Items
- [x] **Configure Supabase Auth Client Helpers**: Added `lib/supabase/auth.ts` with client-safe `getCurrentUserId`, sign in/up/out functions.
- [x] **Define Profiles Schema**: Added `profiles` table to migration SQL.
- [x] **Migrate Schemas**: Created migration SQL to append `user_id` uuid column to projects, competitors, uploads, keywords, keyword_gaps, competitor_pages, backlinks, referring_domains, anchor_texts, dedupe_reports.
- [x] **Compact Auth UI**: Added Auth / Sync panel in app/settings/page.tsx.

---

## Phase 2: Schema Hardening & Row-Level Security (RLS) (Foundation Completed)

### Objectives
* Enforce complete isolation between tenants.
* Optimize database access paths.

### Action Items
- [x] **Enable RLS Globally**: Configured `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` inside the SQL migration file.
- [x] **Define Access Policies**: Defined row-level policies verifying `auth.uid() = user_id` for all tables.
- [x] **Index Configuration**: Added `user_id` and foreign key path indexes.


---

## Phase 3: Server-Side State & Workflow Migration

### Objectives
* Transition active user state and progress-tracking workflows out of `localStorage` to the database.

### Action Items
- [ ] **Selected Project Persistence**: Store the active project selection in a `user_settings` table (key-value or JSON column) linked to the user profile instead of using `serpvault_selected_project_id` in `localStorage`.
- [ ] **Opportunity Queues Server-Side**: Move opportunity queue status and scoring metadata to database tables.
- [ ] **Content Brief Workflow State**: Define tables for `content_brief_workflows` storing brief phase, outline, and target keywords, allowing users to collaborate on briefs across devices.

---

## Phase 4: Project-Scoped Imports & Scoping Rules

### Objectives
* Ensure imported data is securely scoped to projects without creating side-effects.

### Action Items
- [ ] **Scoped Upload Pipeline**: Enforce that file uploads map to a valid `project_id` associated with the current user.
- [ ] **Enforce Domain Restrictions**:
  * During mapping (`mapKeyword`, `mapKeywordGap`, etc.), do not auto-create project domains for competitor rows.
  * Flag incoming rows that match first-party domains to assign them correctly to the project's primary profile.

---

## Phase 5: Client Migration & Data Backfill Strategy

### Objectives
* Migrate existing user data from browser local storage to the new backend seamlessly.

### Action Items
- [x] **Build Migration Utility**: Created a pure helper (`lib/migration-summary.ts`) and a guarded local-to-cloud backfill wizard in the Settings UI with preflight summary calculations, warnings, confirmation checkbox guards, progress states, and zero-row checks.
- [x] **Conflict Resolution**: Implemented project conflict resolution helper (`lib/project-conflicts.ts`) to normalize domains/names and build a conflict plan matching exact domain/location/niche first, then fallback to normalized name, skipping duplicates and remapping references.

---

## Phase 6: Audit, Export, and Privacy

### Objectives
* Maintain regulatory compliance (GDPR/CCPA) and data safety.

### Action Items
- [ ] **Data Export Tools**: Implement a single-click "Download All Data" tool in the Settings page compiling all user tables to a zip file of CSVs.
- [ ] **Account Deletion (Right to Be Forgotten)**: Implement a clean account deletion routine that purges all user data via Postgres cascade deletes.
- [ ] **Modification Audit Trail**: Track import timestamps, row counts, and dedupe rates in `upload_audit_logs`.

---

## Phase 7: Testing & Gradual Rollout

### Objectives
* Verify security policies and performance scales before public launch.

### Action Items
- [ ] **Local Integration Testing**: Run local Supabase CLI containers to execute unit and security tests against RLS policies.
- [ ] **Staging Verification**: Deploy to a staging environment and execute Playwright tests using dummy auth credentials.
- [ ] **Canary Rollout**: Open the backend database features to 5% of users (beta opt-in) while allowing the rest to continue using local storage.
