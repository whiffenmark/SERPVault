import type { HealthIssue } from './data-health';
import type { OpportunityQueueItem } from './opportunity-queue';

/**
 * Returns a stable, scoped ID for a data health issue.
 * Prepend with "health:" and scope by project ID or 'global'.
 */
export function getHealthIssueStableId(issueId: string, projectId: string | null): string {
  const scope = projectId || 'global';
  return `health:${scope}:${issueId}`;
}

/**
 * Converts a HealthIssue into an action-plan-compatible OpportunityQueueItem.
 */
export function convertHealthIssueToQueueItem(
  issue: HealthIssue,
  projectId: string | null
): OpportunityQueueItem {
  const stableId = getHealthIssueStableId(issue.id, projectId);

  // Map severity to appropriate scoring & impact
  // severity: 'critical' | 'warning' | 'info'
  let score = 30;
  let impact = 1;
  if (issue.severity === 'critical') {
    score = 90;
    impact = 3;
  } else if (issue.severity === 'warning') {
    score = 60;
    impact = 2;
  } else if (issue.severity === 'info') {
    score = 30;
    impact = 1;
  }

  // Build a sensible path depending on scope
  const href = projectId ? `/health?project=${projectId}` : '/health';

  return {
    id: stableId,
    type: 'health',
    title: issue.title,
    detail: `Category: ${issue.category} | Severity: ${issue.severity}`,
    sourceLabel: 'Data Health Audit',
    recommendedAction: issue.description,
    score,
    impact,
    href,
  };
}
