# Production Persistence & Auth Planning Document

This document outlines the phased migration plan for transitioning SERPVault from client-side `localStorage` data persistence to a secure, multi-tenant production backend using Supabase (PostgreSQL, Auth, and Row-Level Security).

---

## Executive Summary & Data Safety Rules

> [!IMPORTANT]
> **Core Data Integrity Rule**:
> Competitor domains, referring domains, and research domains discovered during keyword gap analysis or backlink analysis are raw data inputs and **must never** automatically trigger the creation of project domains. Project domains represent first-party properties and must only be registered through explicit user creation.

---

## Phase 1: Authentication & User-Owned Data

### Objectives
* Establish secure user identities.
* Assign all data records to a specific user.

### Action Items
- [ ] **Configure Supabase Auth**: Enable Email/Password authentication. Configure SMTP templates and password complexity policies.
- [ ] **Define Profiles Schema**: Create a `profiles` table to store metadata (e.g., display name, preferences) linked via a foreign key to `auth.users.id`.
- [ ] **Migrate Schemas**: Add `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` to all data tables:
  * `projects`
  * `uploads`
  * `keywords`
  * `keyword_gaps`
  * `competitor_pages`
  * `backlinks`
  * `referring_domains`
  * `anchor_texts`
  * `dedupe_reports`
  * `content_opportunities`
  * `backlink_opportunities`

---

## Phase 2: Schema Hardening & Row-Level Security (RLS)

### Objectives
* Enforce complete isolation between tenants.
* Optimize database access paths.

### Action Items
- [ ] **Enable RLS Globally**: Run `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` on every database table.
- [ ] **Define Access Policies**: Create policies verifying that the executing user matches the resource's `user_id`:
  ```sql
  CREATE POLICY "Users can only access their own projects" 
    ON projects 
    FOR ALL 
    USING (auth.uid() = user_id);
  ```
- [ ] **Foreign Key Cascade Policies**: Ensure child tables (e.g. `keywords`) use foreign keys pointing to parent tables (e.g. `uploads`) with `ON DELETE CASCADE`.
- [ ] **Index Configuration**: Apply indexes on all foreign keys and query filters:
  * Index on `(user_id)` on all tables.
  * Composite index on `(project_id, user_id)` where applicable.

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
- [ ] **Build Migration Utility**: Create a migration wizard in the UI that:
  1. Detects legacy `serpvault_store` in `localStorage` upon successful authentication.
  2. Parses client-side data (projects, uploads, keywords).
  3. Batches writes to the Supabase API inside a single transaction where possible.
  4. Clears `localStorage` only after a successful server-side receipt confirmation.
- [ ] **Conflict Resolution**: Define rules for handling duplicate project names or domains during import (e.g., merge or prompt user to rename).

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
