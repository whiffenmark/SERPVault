'use client';

import { useEffect, useState } from 'react';
import { getSelectedProjectId, setSelectedProjectId } from '@/lib/storage';
import { saveProject, deleteProject, getProjects } from '@/lib/db';
import type { ProjectRecord } from '@/lib/types';
import { nanoid } from '@/lib/nanoid';

export default function ProjectSiteSelector() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form fields for new project
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('');
  const [competitorsText, setCompetitorsText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshProjects = async () => {
    const projs = await getProjects();
    setProjects(projs);
  };

  useEffect(() => {
    async function load() {
      await refreshProjects();
      setSelectedId(getSelectedProjectId());
    }
    load();
  }, []);

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    setSelectedId(id);
    window.location.reload();
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

      await refreshProjects();
      handleSelectProject(projectId);
      setShowModal(false);
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (projectId: string, name: string) => {
    if (confirm(`Are you sure you want to delete the project "${name}"? Owned uploads will be disassociated.`)) {
      await deleteProject(projectId);
      await refreshProjects();
      if (selectedId === projectId) {
        handleSelectProject(null);
      }
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedId);

  return (
    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontSize: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PROJECT / SITE</span>
        {selectedId && (
          <button
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
          onClick={() => setShowModal(false)}
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
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--muted)' }}
              >
                &times;
              </button>
            </div>

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
                        onClick={() => handleDeleteProject(p.id, p.name)}
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
                  onClick={() => setShowModal(false)}
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
          </div>
        </div>
      )}
    </div>
  );
}
