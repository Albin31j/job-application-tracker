import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "http://localhost:5000/api/applications";

const JOB_TYPES = ["Full-time", "Internship", "Contract"];

const STATUS_OPTIONS = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Rejected: [],
  Accepted: [],
  Declined: [],
};

const EMPTY_FORM = {
  companyName: "",
  jobRole: "",
  jobType: "Full-time",
  appliedDate: new Date().toLocaleDateString("en-CA"),
  expectedSalary: "",
  notes: "",
};

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSalary(value) {
  if (value === null || value === undefined || value === "") {
    return "Not specified";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getInitials(companyName = "") {
  return companyName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
}

function App() {
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    Applied: 0,
    Interview: 0,
    Offer: 0,
    Accepted: 0,
    Rejected: 0,
    Declined: 0,
    overdue: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = {};

      if (statusFilter !== "All") {
        params.status = statusFilter;
      }

      if (search.trim()) {
        params.search = search.trim();
      }

      const [applicationsResponse, statsResponse] = await Promise.all([
        axios.get(API_URL, { params }),
        axios.get(`${API_URL}/stats`),
      ]);

      setApplications(applicationsResponse.data.data || []);
      setStats(
        statsResponse.data.data || {
          total: 0,
          Applied: 0,
          Interview: 0,
          Offer: 0,
          Accepted: 0,
          Rejected: 0,
          Declined: 0,
          overdue: 0,
        }
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not connect to the backend. Make sure your server is running on port 5000."
      );
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchApplications();
    }, 250);

    return () => clearTimeout(timer);
  }, [fetchApplications]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function openAddForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
    setError("");
  }

  function openEditForm(application) {
    setEditingId(application._id);
    setForm({
      companyName: application.companyName || "",
      jobRole: application.jobRole || "",
      jobType: application.jobType || "Full-time",
      appliedDate: application.appliedDate
        ? new Date(application.appliedDate).toLocaleDateString("en-CA", {
            timeZone: "UTC",
          })
        : EMPTY_FORM.appliedDate,
      expectedSalary:
        application.expectedSalary === null ||
        application.expectedSalary === undefined
          ? ""
          : String(application.expectedSalary),
      notes: application.notes || "",
    });

    setShowForm(true);
    setError("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      companyName: form.companyName.trim(),
      jobRole: form.jobRole.trim(),
      jobType: form.jobType,
      appliedDate: form.appliedDate,
      expectedSalary:
        form.expectedSalary === "" ? null : Number(form.expectedSalary),
      notes: form.notes.trim(),
    };

    try {
      if (editingId) {
        await axios.put(`${API_URL}/${editingId}`, payload);
        setNotice("Application updated successfully.");
      } else {
        await axios.post(API_URL, payload);
        setNotice("Application added successfully.");
      }

      closeForm();
      await fetchApplications();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not save the application. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(application, newStatus) {
    const confirmed = window.confirm(
      `Change ${application.companyName} — ${application.jobRole} from ${application.status} to ${newStatus}?`
    );

    if (!confirmed) return;

    setError("");

    try {
      await axios.patch(`${API_URL}/${application._id}/status`, {
        status: newStatus,
      });

      setNotice(`Application status changed to ${newStatus}.`);
      await fetchApplications();
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not update the application status."
      );
    }
  }

  async function deleteApplication(application) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the application for ${application.companyName} — ${application.jobRole}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError("");

    try {
      await axios.delete(`${API_URL}/${application._id}`);
      setNotice("Application deleted successfully.");
      await fetchApplications();
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not delete the application."
      );
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
  }

  const statusCards = [
    { label: "Total applications", value: stats.total, icon: "▤", key: "All" },
    { label: "Applied", value: stats.Applied, icon: "◷", key: "Applied" },
    {
      label: "Interviews",
      value: stats.Interview,
      icon: "◉",
      key: "Interview",
    },
    { label: "Offers", value: stats.Offer, icon: "✦", key: "Offer" },
    {
      label: "Accepted",
      value: stats.Accepted,
      icon: "✓",
      key: "Accepted",
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark">J</span>
          <span>
            <strong>JobTrack</strong>
            <small>CAREER WORKSPACE</small>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <button
          className="nav-item active"
          onClick={() => {
            clearFilters();
          }}
        >
          <span className="nav-icon">▦</span>
          Dashboard
        </button>

        <button
          className="nav-item"
          onClick={() => {
            setStatusFilter("All");
            openAddForm();
          }}
        >
          <span className="nav-icon">＋</span>
          Add application
        </button>

        <div className="sidebar-label status-label">APPLICATION STATUS</div>

        {[
          "Applied",
          "Interview",
          "Offer",
          "Accepted",
          "Rejected",
          "Declined",
        ].map((status) => (
          <button
            className={`nav-item ${statusFilter === status ? "selected" : ""}`}
            key={status}
            onClick={() => setStatusFilter(status)}
          >
            <span className={`sidebar-dot dot-${status.toLowerCase()}`} />
            {status}
            <span className="nav-count">{stats[status] || 0}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="sidebar-help-icon">✳</div>
          <strong>Stay on track</strong>
          <p>Every application is a step toward your next opportunity.</p>
          <button className="sidebar-add" onClick={openAddForm}>
            + New application
          </button>
        </div>

        <div className="sidebar-footer">
          <span className="avatar">JT</span>
          <span>
            <strong>My workspace</strong>
            <small>Personal tracker</small>
          </span>
          <span className="footer-menu">•••</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Dashboard</strong>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <span /> Local workspace
            </span>
            <span className="top-avatar">JT</span>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">YOUR CAREER, ORGANIZED</div>
              <h1>Job application tracker<span>.</span></h1>
              <p className="page-subtitle">
                Keep every opportunity organized, from your first application to your next offer.
              </p>
            </div>

            <button className="primary-button" onClick={openAddForm}>
              <span>＋</span> Add application
            </button>
          </div>

          {notice && (
            <div className="notice success-notice">
              <span>✓</span> {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss message">
                ×
              </button>
            </div>
          )}

          {error && (
            <div className="notice error-notice">
              <span>!</span> {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}

          <section className="stats-grid">
            {statusCards.map((card, index) => (
              <button
                className={`stat-card ${statusFilter === card.key ? "stat-selected" : ""}`}
                key={card.label}
                onClick={() => setStatusFilter(card.key)}
              >
                <div className="stat-top">
                  <span className={`stat-icon stat-icon-${index}`}>
                    {card.icon}
                  </span>
                  {index === 0 && (
                    <span className="stat-total-label">ALL TIME</span>
                  )}
                </div>
                <div className="stat-value">{card.value ?? 0}</div>
                <div className="stat-label">{card.label}</div>
                <div className="stat-bottom">
                  <span className="stat-caption">
                    {index === 0 ? "Across all statuses" : "Applications"}
                  </span>
                  <span className="stat-arrow">↗</span>
                </div>
              </button>
            ))}
          </section>

          <section className="overview-row">
            <div className="section-heading">
              <div>
                <div className="eyebrow">YOUR PIPELINE</div>
                <h2>Applications overview</h2>
                <p>Monitor your progress at every stage.</p>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  clearFilters();
                }}
              >
                View all <span>→</span>
              </button>
            </div>

            <div className="pipeline">
              {[
                { label: "Applied", value: stats.Applied, color: "blue" },
                { label: "Interview", value: stats.Interview, color: "purple" },
                { label: "Offer", value: stats.Offer, color: "orange" },
                { label: "Accepted", value: stats.Accepted, color: "green" },
              ].map((stage) => {
                const total = stats.total || 1;
                const percentage = Math.round((stage.value / total) * 100);

                return (
                  <button
                    className="pipeline-stage"
                    key={stage.label}
                    onClick={() => setStatusFilter(stage.label)}
                  >
                    <div className="pipeline-stage-top">
                      <span className={`pipeline-dot ${stage.color}`} />
                      <span className="pipeline-label">{stage.label}</span>
                      <strong>{stage.value || 0}</strong>
                    </div>
                    <div className="progress-track">
                      <span
                        className={`progress-fill ${stage.color}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <small>{percentage}% of all applications</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="applications-section">
            <div className="section-heading applications-heading">
              <div>
                <div className="eyebrow">KEEP MOVING FORWARD</div>
                <h2>Your applications</h2>
                <p>All your opportunities, together in one place.</p>
              </div>
              <div className="application-total">
                <strong>{applications.length}</strong>
                <span>{applications.length === 1 ? "RESULT" : "RESULTS"}</span>
              </div>
            </div>

            <div className="toolbar">
              <label className="search-box">
                <span className="search-icon">⌕</span>
                <input
                  type="search"
                  placeholder="Search company or job role..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <kbd>⌕</kbd>
              </label>

              <label className="filter-select">
                <span>Filter:</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="All">All statuses</option>
                  {[
                    "Applied",
                    "Interview",
                    "Offer",
                    "Accepted",
                    "Rejected",
                    "Declined",
                  ].map((status) => (
                    <option value={status} key={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              {(search || statusFilter !== "All") && (
                <button className="clear-button" onClick={clearFilters}>
                  Clear
                </button>
              )}
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="loading-spinner" />
                <h3>Loading applications...</h3>
                <p>Getting your opportunities ready.</p>
              </div>
            ) : applications.length === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <span>▤</span>
                  <i>＋</i>
                </div>
                <h3>
                  {search || statusFilter !== "All"
                    ? "No matching applications"
                    : "Your next opportunity starts here"}
                </h3>
                <p>
                  {search || statusFilter !== "All"
                    ? "Try another search term or clear your filters."
                    : "Add your first job application to start building your career pipeline."}
                </p>
                {search || statusFilter !== "All" ? (
                  <button className="secondary-button" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : (
                  <button className="primary-button" onClick={openAddForm}>
                    ＋ Add your first application
                  </button>
                )}
              </div>
            ) : (
              <div className="applications-list">
                {applications.map((application) => {
                  const allowedStatuses =
                    STATUS_OPTIONS[application.status] || [];
                  const canDelete = [
                    "Applied",
                    "Rejected",
                    "Accepted",
                    "Declined",
                  ].includes(application.status);
                  const isExpanded = expandedHistory === application._id;

                  return (
                    <article className="application-card" key={application._id}>
                      <div className="company-avatar">
                        {getInitials(application.companyName)}
                      </div>

                      <div className="application-main">
                        <div className="application-title-row">
                          <h3>{application.companyName}</h3>
                          <span className={`status-badge status-${application.status.toLowerCase()}`}>
                            <span />
                            {application.status}
                          </span>
                          {application.isOverdue && application.status === "Applied" && (
                            <span className="overdue-badge">Overdue</span>
                          )}
                        </div>

                        <p className="job-role">{application.jobRole}</p>

                        <div className="application-meta">
                          <span className="job-type">
                            <span>▣</span> {application.jobType}
                          </span>
                          <span>
                            <span className="meta-symbol">◷</span> Applied{" "}
                            {formatDate(application.appliedDate)}
                          </span>
                          <span>
                            <span className="meta-symbol">＄</span>{" "}
                            {formatSalary(application.expectedSalary)}
                          </span>
                        </div>

                        {application.notes && (
                          <p className="application-notes">{application.notes}</p>
                        )}

                        <div className="application-id">
                          ID: {application.applicationId}
                        </div>

                        <button
                          className="history-toggle"
                          onClick={() =>
                            setExpandedHistory(isExpanded ? null : application._id)
                          }
                        >
                          <span>◷</span>{" "}
                          {isExpanded ? "Hide status history" : "View status history"}
                          <span className="history-chevron">
                            {isExpanded ? "⌃" : "⌄"}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="history-timeline">
                            {(application.statusHistory || []).map((item, index) => (
                              <div className="history-item" key={`${item.status}-${index}`}>
                                <span className="history-timeline-dot" />
                                <div>
                                  <strong>{item.status}</strong>
                                  <small>{formatDate(item.changedAt)}</small>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="application-actions">
                        {allowedStatuses.length > 0 && (
                          <label className="status-action">
                            <span>Update status</span>
                            <select
                              value=""
                              onChange={(event) => {
                                if (event.target.value) {
                                  changeStatus(application, event.target.value);
                                }
                              }}
                              aria-label={`Update status for ${application.companyName}`}
                            >
                              <option value="">Move to...</option>
                              {allowedStatuses.map((status) => (
                                <option value={status} key={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <button
                          className="action-button edit-button"
                          onClick={() => openEditForm(application)}
                          title="Edit application"
                        >
                          ✎ <span>Edit</span>
                        </button>

                        <button
                          className="action-button delete-button"
                          onClick={() => deleteApplication(application)}
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? "Delete application"
                              : "Applications in Interview or Offer status cannot be deleted"
                          }
                        >
                          × <span>Delete</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="list-footer">
              <span>
                Showing <strong>{applications.length}</strong> application
                {applications.length === 1 ? "" : "s"}
              </span>
              <span>JobTrack <span className="footer-separator">•</span> Stay organized, keep moving.</span>
            </div>
          </section>

          <footer className="page-footer">
            Built for your next career move <span>✦</span>
          </footer>
        </section>
      </main>

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="application-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  {editingId ? "UPDATE YOUR RECORD" : "A NEW OPPORTUNITY"}
                </div>
                <h2 id="form-title">
                  {editingId ? "Edit application" : "Add application"}
                </h2>
                <p>
                  {editingId
                    ? "Keep your application details up to date."
                    : "Record the details so you can keep track of your progress."}
                </p>
              </div>
              <button className="modal-close" onClick={closeForm} aria-label="Close form">
                ×
              </button>
            </div>

            <form className="application-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="form-field">
                  <span>Company name <b>*</b></span>
                  <input
                    name="companyName"
                    value={form.companyName}
                    onChange={handleFormChange}
                    placeholder="e.g. Google"
                    maxLength={120}
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Job role <b>*</b></span>
                  <input
                    name="jobRole"
                    value={form.jobRole}
                    onChange={handleFormChange}
                    placeholder="e.g. Software Engineer"
                    maxLength={120}
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Job type <b>*</b></span>
                  <select
                    name="jobType"
                    value={form.jobType}
                    onChange={handleFormChange}
                    required
                  >
                    {JOB_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Applied date <b>*</b></span>
                  <input
                    type="date"
                    name="appliedDate"
                    value={form.appliedDate}
                    onChange={handleFormChange}
                    max={new Date().toLocaleDateString("en-CA")}
                    disabled={Boolean(editingId)}
                    required
                  />
                  {editingId && (
                    <small className="field-hint">
                      Applied date cannot be changed.
                    </small>
                  )}
                </label>

                <label className="form-field form-field-full">
                  <span>Expected salary <small>(optional, INR)</small></span>
                  <div className="salary-input">
                    <span>₹</span>
                    <input
                      type="number"
                      name="expectedSalary"
                      value={form.expectedSalary}
                      onChange={handleFormChange}
                      placeholder="e.g. 600000"
                      min="0"
                      step="any"
                    />
                  </div>
                </label>

                <label className="form-field form-field-full">
                  <span>Notes <small>(optional)</small></span>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleFormChange}
                    placeholder="Recruiter details, interview notes, job link..."
                    rows="3"
                    maxLength={2000}
                  />
                </label>
              </div>

              <div className="form-info">
                <span>✦</span>
                {editingId
                  ? "Your application ID and applied date will remain unchanged."
                  : "Your application ID and 7-day follow-up date will be generated automatically."}
              </div>

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Save application"}
                  {!saving && <span>→</span>}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;