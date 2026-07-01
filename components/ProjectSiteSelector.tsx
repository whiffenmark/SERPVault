'use client';

import { useEffect, useState } from 'react';
import { getSelectedProjectId, setSelectedProjectId, subscribeProjectScopeChange } from '@/lib/storage';
import { saveProject, deleteProject, getProjects, getUploads, getCompetitors } from '@/lib/db';
import type { ProjectRecord, CompetitorRecord, UploadRecord } from '@/lib/types';
import { nanoid } from '@/lib/nanoid';
import { subscribeAuthState } from '@/lib/supabase/auth';
import { getSelectedProjectSetting, saveSelectedProjectSetting } from '@/lib/supabase/user-settings';

export default function ProjectSiteSelector() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form fields for new project
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('');
  const [competitorsText, setCompetitorsText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete project confirmation state
  const [projectToDelete, setProjectToDelete] = useState<ProjectRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshData = async () => {
    try {
      const [projs, ups, comps] = await Promise.all([
        getProjects(),
        getUploads(),
        getCompetitors(),
      ]);
      setProjects(projs);
      setUploads(ups);
      setCompetitors(comps);
      return projs;
    } catch (err) {
      console.error('Error refreshing data:', err);
      return [];
    }
  };

  useEffect(() => {
    let active = true;

    async function load(userId: string | null) {
      const loadedProjects = await refreshData();
      if (!active) return;

      const localId = getSelectedProjectId();

      if (userId) {
        // Hydrate from cloud if present
        const cloudSelectedId = await getSelectedProjectSetting();
        if (!active) return;

        if (cloudSelectedId !== undefined) {
          if (cloudSelectedId === null) {
            setSelectedProjectId(null);
            setSelectedId(null);
          } else {
            const exists = loadedProjects.some((p) => p.id === cloudSelectedId);
            if (exists) {
              setSelectedProjectId(cloudSelectedId);
              setSelectedId(cloudSelectedId);
            } else {
              // Cloud ID is invalid (e.g. project deleted but setting not updated yet)
              if (localId && loadedProjects.some((p) => p.id === localId)) {
                setSelectedProjectId(localId);
                setSelectedId(localId);
              } else {
                setSelectedProjectId(null);
                setSelectedId(null);
              }
            }
          }
        } else {
          // Setting not present in cloud: keep local selection if it maps to a current project, else null
          if (localId && loadedProjects.some((p) => p.id === localId)) {
            setSelectedProjectId(localId);
            setSelectedId(localId);
          } else {
            setSelectedProjectId(null);
            setSelectedId(null);
          }
        }
      } else {
        // Local-only user: keep local selection if it maps to a current project, else null
        if (localId && loadedProjects.some((p) => p.id === localId)) {
          setSelectedProjectId(localId);
          setSelectedId(localId);
        } else {
          setSelectedProjectId(null);
          setSelectedId(null);
        }
      }
    }

    const unsubscribeProject = subscribeProjectScopeChange((projectId) => {
      setSelectedId(projectId);
    });

    const unsubscribeAuth = subscribeAuthState((session) => {
      if (session?.user?.id) {
        load(session.user.id);
      } else {
        load(null);
      }
    });

    if (!unsubscribeAuth) {
      load(null);
    }

    return () => {
      active = false;
      unsubscribeProject();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    setSelectedId(id);
    saveSelectedProjectSetting(id);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;

    setIsSubmitting(true);
    try {
      const projectId = 'proj_' + nanoid();

      // Clean domain name to hostname
      let cleanedDomain = domain.trim().toLowerCase();
      cleanedDomain = cleanedDomain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].split(':')[0];

      const newProject: ProjectRecord = {
        id: projectId,
        name: name.trim(),
        domain: cleanedDomain,
        location: location.trim() || undefined,
        niche: niche.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      // Split competitor domains by comma or newline
      const comps = competitorsText
        .split(/[\n,]+/)
        .map((c) => c.trim().toLowerCase())
        .map((c) => c.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].split(':')[0])
        .filter((c) => c.length > 0 && c.includes('.'));

      await saveProject(newProject, comps);

      // Reset form fields
      setName('');
      setDomain('');
      setLocation('');
      setNiche('');
      setCompetitorsText('');

      await refreshData();
      handleSelectProject(projectId);
      setShowModal(false);
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (project: ProjectRecord) => {
    setProjectToDelete(project);
    setStatusMessage(null);
  };

  const handleCancelDelete = () => {
    setProjectToDelete(null);
    setStatusMessage(null);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    setStatusMessage(null);
    try {
      const deletedId = projectToDelete.id;
      const deletedName = projectToDelete.name;
      await deleteProject(deletedId);
      await refreshData();

      setStatusMessage({
        type: 'success',
        text: `Project "${deletedName}" was successfully deleted.`,
      });

      setProjectToDelete(null);
      if (selectedId === deletedId) {
        handleSelectProject(null);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      setStatusMessage({
        type: 'error',
        text: `Failed to delete project "${projectToDelete.name}".`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setProjectToDelete(null);
    setStatusMessage(null);
  };

  const selectedProject = projects.find((p) => p.id === selectedId);

  // Compute impact for delete confirmation
  const associatedUploads = projectToDelete
    ? uploads.filter((u) => u.projectId === projectToDelete.id)
    : [];
  const projectCompetitors = projectToDelete
    ? competitors.filter((c) => c.projectId === projectToDelete.id)
    : [];
  const maxCompetitorsToShow = 3;
  const competitorDomainsToShow = projectCompetitors.slice(0, maxCompetitorsToShow);
  const remainingCount = projectCompetitors.length - maxCompetitorsToShow;

  return (
    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontSize: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PROJECT / SITE</span>
        {selectedId && (
          <button
            type="button"
            onClick={() => handleSelectProject(null)}
            style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      <select
        value={selectedId || ''}
        onChange={(e) => {
          const val = e.target.value;
          handleSelectProject(val || null);
        }}
        style={{
          width: '100%',
          fontSize: '0.72rem',
          padding: '0.35rem 0.5rem',
          border: '1px solid var(--card-border)',
          borderRadius: '4px',
          background: 'var(--background)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.domain})
          </option>
        ))}
      </select>

      {selectedProject && (
        <div style={{ marginTop: '0.25rem', fontSize: '0.65rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Selected: {selectedProject.name} ({selectedProject.domain})
          {(selectedProject.location || selectedProject.niche) && (
            <span> • {selectedProject.location || '-'} / {selectedProject.niche || '-'}</span>
          )}
        </div>
      )}

      <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            fontSize: '0.6rem',
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          Manage Projects
        </button>
      </div>

      {!selectedId && projects.length === 0 && (
        <div
          style={{
            marginTop: '0.5rem',
            fontSize: '0.65rem',
            color: 'var(--accent)',
            background: 'rgba(235, 94, 40, 0.05)',
            padding: '0.4rem 0.5rem',
            borderRadius: '4px',
            border: '1px dashed var(--accent)',
            lineHeight: '1.2'
          }}
        >
          No projects configured yet. Click "Manage Projects" to get started!
        </div>
      )}

      {/* Modal for managing and adding projects */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => {
            if (!isDeleting) {
              handleCloseModal();
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '1.5rem',
              width: 'min(500px, 95vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Manage Projects</div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleCloseModal}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: isDeleting ? 'not-allowed' : 'pointer', color: 'var(--muted)' }}
              >
                &times;
              </button>
            </div>

            {/* Success/Error status message area */}
            {statusMessage && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  backgroundColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${statusMessage.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
                  color: statusMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{statusMessage.text}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    lineHeight: 1,
                    padding: '0 0 0 0.5rem',
                  }}
                >
                  &times;
                </button>
              </div>
            )}

            {projectToDelete ? (
              /* Inline Delete Confirmation Panel */
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--danger)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Confirm Project Deletion
                </div>

                <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                  Are you sure you want to delete the project <strong>{projectToDelete.name}</strong>?
                </div>

                <div style={{ fontSize: '0.72rem', background: 'var(--background)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong>Owned Domain:</strong> <span style={{ fontFamily: 'monospace' }}>{projectToDelete.domain}</span>
                  </div>

                  {/* Uploads Impact */}
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong>Associated Uploads to Disassociate:</strong> {associatedUploads.length}
                    {associatedUploads.length > 0 && (
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.68rem', marginTop: '0.1rem' }}>
                        (These uploads will be unassigned, but their data will NOT be deleted)
                      </span>
                    )}
                  </div>

                  {/* Competitors Impact */}
                  <div>
                    <strong>Competitor Domains to Remove:</strong> {projectCompetitors.length}
                    {projectCompetitors.length > 0 && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', color: 'var(--muted)' }}>
                        <ul style={{ paddingLeft: '1rem', margin: '0.2rem 0', listStyleType: 'disc' }}>
                          {competitorDomainsToShow.map((c) => (
                            <li key={c.id} style={{ fontFamily: 'monospace' }}>{c.domain}</li>
                          ))}
                        </ul>
                        {remainingCount > 0 && (
                          <span style={{ fontStyle: 'italic', paddingLeft: '0.2rem' }}>
                            and {remainingCount} more...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: '1.4' }}>
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Warning:</span> Uploaded data is not deleted, uploads are only unassigned. Project competitor domains are removed. <strong>This action cannot be undone.</strong>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleConfirmDelete}
                    style={{
                      flex: 1,
                      fontSize: '0.75rem',
                      padding: '0.5rem',
                      background: 'var(--danger)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      opacity: isDeleting ? 0.7 : 1,
                    }}
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete Project'}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleCancelDelete}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.5rem 1rem',
                      background: 'transparent',
                      border: '1px solid var(--card-border)',
                      color: 'var(--foreground)',
                      borderRadius: '6px',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* List of current projects */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.5rem' }}>
                    EXISTING PROJECTS ({projects.length})
                  </div>
                  {projects.length === 0 ? (
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic', padding: '0.5rem 0', borderBottom: '1px dashed var(--card-border)' }}>
                      No projects created yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.4rem' }}>
                      {projects.map((p) => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', padding: '0.25rem 0.4rem', borderRadius: '4px', background: 'var(--background)' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                            <strong>{p.name}</strong> <span style={{ color: 'var(--muted)' }}>({p.domain})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(p)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ff4d4d',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              padding: '0.1rem 0.3rem',
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add new project form */}
                <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.25rem' }}>
                    CREATE NEW PROJECT
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>
                      Project Name <span style={{ color: 'var(--accent)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Corp Web"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.45rem 0.6rem',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        background: 'var(--background)',
                        color: 'var(--foreground)',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>
                      Owned Domain <span style={{ color: 'var(--accent)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. acme.com"
                      required
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.45rem 0.6rem',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        background: 'var(--background)',
                        color: 'var(--foreground)',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Location (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. US"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.45rem 0.6rem',
                          border: '1px solid var(--card-border)',
                          borderRadius: '6px',
                          background: 'var(--background)',
                          color: 'var(--foreground)',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Niche (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. SaaS"
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.45rem 0.6rem',
                          border: '1px solid var(--card-border)',
                          borderRadius: '6px',
                          background: 'var(--background)',
                          color: 'var(--foreground)',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>
                      Competitor Domains (Optional)
                    </label>
                    <textarea
                      placeholder="Enter domains, one per line or separated by commas (e.g. competitor1.com, competitor2.com)"
                      value={competitorsText}
                      onChange={(e) => setCompetitorsText(e.target.value)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.45rem 0.6rem',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        background: 'var(--background)',
                        color: 'var(--foreground)',
                        minHeight: '60px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ fontSize: '0.62rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--card-border)', marginTop: '0.2rem', lineHeight: '1.3' }}>
                      <strong>Important:</strong> Competitors are tracked separately. They will not appear in the selectable projects list and do not affect the project domain filters.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
                    <button
                      type="submit"
                      disabled={isSubmitting || !name.trim() || !domain.trim()}
                      style={{
                        flex: 1,
                        fontSize: '0.8rem',
                        padding: '0.5rem',
                        background: isSubmitting ? 'var(--card-border)' : 'var(--accent)',
                        color: isSubmitting ? 'var(--muted)' : '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {isSubmitting ? 'Creating...' : 'Create & Select Project'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.5rem',
                        background: 'transparent',
                        border: '1px solid var(--card-border)',
                        color: 'var(--foreground)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
