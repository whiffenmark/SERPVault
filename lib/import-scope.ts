import type { ProjectRecord } from './types';

/**
 * Normalizes domains by converting to lowercase, removing protocols,
 * removing www prefix, trailing paths/slashes, and ports.
 */
export function normalizeDomain(domain: string): string {
  if (!domain) return '';
  let cleaned = domain.trim().toLowerCase();
  cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split(':')[0];
  return cleaned;
}

/**
 * Detects explicit project domain field values in a row.
 * Strict rules: Only matches explicit project/client/owned-site fields.
 * Never checks generic/competitor SEO domains, URLs, or referring domains.
 */
export function detectExplicitProjectDomain(row: any): string | undefined {
  const keys = [
    'project_domain',
    'project domain',
    'project site',
    'project site domain',
    'client_domain',
    'client domain',
    'client website',
    'client site',
    'site_domain',
    'site domain',
    'yourDomain',
    'your domain',
    'your website',
    'your site',
    'target project',
    'target project domain',
  ];

  const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s_-]+/g, '');
  const normalizedSearchKeys = keys.map(normalizeKey);

  const sourceObjects = [row.raw || {}, row];

  for (const obj of sourceObjects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const rawKey of Object.keys(obj)) {
      if (normalizedSearchKeys.includes(normalizeKey(rawKey))) {
        const val = obj[rawKey];
        if (val !== undefined && val !== null) {
          const trimmed = val.toString().trim();
          if (trimmed && trimmed !== '-') {
            return trimmed;
          }
        }
      }
    }
  }

  return undefined;
}

export interface ImportScopeResult {
  assignmentStatus: 'assigned' | 'unassigned' | 'error';
  warnings: string[];
  matchedProjectId?: string;
  effectiveProjectId?: string;
  hardError?: string;
}

/**
 * Resolves the effective project assignment for a CSV import.
 * Ensures stale project IDs are flagged and not written, and auto-assigns
 * matching projects based on explicit project domains when no project is selected.
 */
export function resolveImportScope(
  rows: any[],
  reportType: string,
  selectedProjectId: string | null | undefined,
  projects: ProjectRecord[]
): ImportScopeResult {
  const warnings: string[] = [];
  let effectiveProjectId: string | undefined = undefined;
  let matchedProjectId: string | undefined = undefined;

  // 1. Validate selectedProjectId
  let selectedProjectValid = false;
  if (selectedProjectId) {
    const matchedProj = projects.find((p) => p.id === selectedProjectId);
    if (matchedProj) {
      selectedProjectValid = true;
      effectiveProjectId = selectedProjectId;
    } else {
      warnings.push(`Selected project ID "${selectedProjectId}" is stale or invalid.`);
    }
  }

  // 2. Scan rows for explicit first-party project domain
  const explicitDomains = new Set<string>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const rawDomain = detectExplicitProjectDomain(row);
      if (rawDomain) {
        const norm = normalizeDomain(rawDomain);
        if (norm) {
          explicitDomains.add(norm);
        }
      }
    }
  }

  // Find if any of the detected domains match an existing project
  if (explicitDomains.size > 0) {
    for (const normDomain of explicitDomains) {
      const matchedProj = projects.find(
        (p) => normalizeDomain(p.domain) === normDomain
      );
      if (matchedProj) {
        matchedProjectId = matchedProj.id;
        break; // Match first available project
      }
    }
  }

  // 3. Resolve project assignment if no valid project is selected
  if (!selectedProjectValid) {
    if (matchedProjectId) {
      effectiveProjectId = matchedProjectId;
      const matchedProj = projects.find((p) => p.id === matchedProjectId);
      warnings.push(
        `Auto-assigned to project "${matchedProj?.name || matchedProjectId}" based on explicit project domain match.`
      );
    }
  }

  // 4. Hard error condition
  let hardError: string | undefined = undefined;
  if (reportType === 'organic_positions') {
    if (!effectiveProjectId) {
      hardError = `[ERROR] Project selection is required to store Organic Positions reports. Please select or create a project.`;
    }
  }

  // 5. Determine assignment status
  let assignmentStatus: 'assigned' | 'unassigned' | 'error' = 'unassigned';
  if (hardError) {
    assignmentStatus = 'error';
  } else if (effectiveProjectId) {
    assignmentStatus = 'assigned';
  }

  return {
    assignmentStatus,
    warnings,
    matchedProjectId,
    effectiveProjectId,
    hardError,
  };
}
