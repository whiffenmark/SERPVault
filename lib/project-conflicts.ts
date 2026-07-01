import type { ProjectRecord } from './types';

export interface ProjectConflictPlan {
  projectsToCreate: ProjectRecord[];
  projectIdMap: Record<string, string>;
  summaries: string[];
  warnings: string[];
}

/**
 * Normalizes a domain by:
 * - Trimming whitespace
 * - Converting to lowercase
 * - Removing protocol prefixes (http://, https://)
 * - Removing www. prefix
 * - Removing any trailing slash or path suffix
 */
export function normalizeDomain(domain: string): string {
  if (!domain) return '';
  let d = domain.trim().toLowerCase();
  d = d.replace(/^(https?:\/\/)?(www\.)?/, '');
  d = d.replace(/\/.*$/, '');
  return d;
}

/**
 * Normalizes a project name by trimming and collapsing multiple spaces to a single space.
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeLocation(loc?: string | null): string {
  if (!loc) return '';
  return loc.trim().toLowerCase();
}

export function normalizeNiche(niche?: string | null): string {
  if (!niche) return '';
  return niche.trim().toLowerCase();
}

/**
 * Pure function to build a conflict resolution plan between local projects and existing remote/cloud projects.
 *
 * Matching rules:
 * 1. Exact domain, location, and niche match (case-insensitive, normalized) first.
 * 2. Normalized name match (case-insensitive, collapsed spaces) second.
 * 3. Local duplicate checking ensures we don't attempt to create multiple local projects
 *    that match each other or match the same remote project.
 */
export function buildProjectConflictPlan(
  localProjects: ProjectRecord[],
  remoteProjects: ProjectRecord[]
): ProjectConflictPlan {
  const projectIdMap: Record<string, string> = {};
  const projectsToCreate: ProjectRecord[] = [];
  const summaries: string[] = [];
  const warnings: string[] = [];

  // Pre-normalize remote projects for quick lookup
  const normRemote = remoteProjects.map(r => ({
    original: r,
    normDomain: normalizeDomain(r.domain),
    normName: normalizeName(r.name),
    normLocation: normalizeLocation(r.location),
    normNiche: normalizeNiche(r.niche),
  }));

  // Pre-normalize local projects
  const normLocal = localProjects.map(l => ({
    original: l,
    normDomain: normalizeDomain(l.domain),
    normName: normalizeName(l.name),
    normLocation: normalizeLocation(l.location),
    normNiche: normalizeNiche(l.niche),
    resolved: false,
  }));

  const matchedRemoteIds = new Set<string>();

  // Pass 1: Exact domain/location/niche match against remote projects
  for (const local of normLocal) {
    const match = normRemote.find(
      r =>
        local.normDomain === r.normDomain &&
        local.normLocation === r.normLocation &&
        local.normNiche === r.normNiche
    );

    if (match) {
      const rp = match.original;
      projectIdMap[local.original.id] = rp.id;
      local.resolved = true;

      if (matchedRemoteIds.has(rp.id)) {
        warnings.push(
          `Local project "${local.original.name}" (${local.original.domain}) is a duplicate of another local project merging into existing cloud project "${rp.name}".`
        );
      } else {
        matchedRemoteIds.add(rp.id);
        summaries.push(
          `Merged local project "${local.original.name}" (${local.original.domain}) with existing cloud project "${rp.name}" (domain/location/niche match).`
        );
      }
    }
  }

  // Pass 2: Normalized name match against remote projects
  for (const local of normLocal) {
    if (local.resolved) continue;

    const match = normRemote.find(r => local.normName === r.normName);

    if (match) {
      const rp = match.original;
      projectIdMap[local.original.id] = rp.id;
      local.resolved = true;

      if (matchedRemoteIds.has(rp.id)) {
        warnings.push(
          `Local project "${local.original.name}" (${local.original.domain}) is a duplicate of another local project merging into existing cloud project "${rp.name}".`
        );
      } else {
        matchedRemoteIds.add(rp.id);
        summaries.push(
          `Merged local project "${local.original.name}" (${local.original.domain}) with existing cloud project "${rp.name}" (normalized name match).`
        );
      }
    }
  }

  // Pass 3: Check duplicates among remaining local projects and create unique ones
  // We keep track of unique projects being created in this migration pass
  const acceptedLocals: Array<{
    original: ProjectRecord;
    normDomain: string;
    normName: string;
    normLocation: string;
    normNiche: string;
  }> = [];

  for (const local of normLocal) {
    if (local.resolved) continue;

    // Check if it matches an already accepted local project by domain/location/niche
    const domainMatch = acceptedLocals.find(
      al =>
        local.normDomain === al.normDomain &&
        local.normLocation === al.normLocation &&
        local.normNiche === al.normNiche
    );

    if (domainMatch) {
      projectIdMap[local.original.id] = domainMatch.original.id;
      local.resolved = true;
      warnings.push(
        `Local project "${local.original.name}" (${local.original.domain}) is a duplicate of local project "${domainMatch.original.name}" (same domain/location/niche).`
      );
      continue;
    }

    // Check if it matches an already accepted local project by normalized name
    const nameMatch = acceptedLocals.find(al => local.normName === al.normName);
    if (nameMatch) {
      projectIdMap[local.original.id] = nameMatch.original.id;
      local.resolved = true;
      warnings.push(
        `Local project "${local.original.name}" (${local.original.domain}) is a duplicate of local project "${nameMatch.original.name}" (same name).`
      );
      continue;
    }

    // Truly unique! Accept it
    projectIdMap[local.original.id] = local.original.id;
    projectsToCreate.push(local.original);
    acceptedLocals.push({
      original: local.original,
      normDomain: local.normDomain,
      normName: local.normName,
      normLocation: local.normLocation,
      normNiche: local.normNiche,
    });
    local.resolved = true;
  }

  return {
    projectsToCreate,
    projectIdMap,
    summaries,
    warnings,
  };
}
