"use client";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { resetWorkspace, updateWorkspace, useWorkspace } from "../lib/store";
import { Badge, Heading } from "./ui";

import { Integrations } from "./integrations";
export function Settings() {
  const state = useWorkspace();
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState("");
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "career-compass-workspace.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Exported your current workspace records.");
  }
  function exportBrowserBackup(key: string) {
    try {
      const data = localStorage.getItem(key);
      if (!data) {
        setNotice("No backup exists under this key in this browser.");
        return;
      }
      const url = URL.createObjectURL(
        new Blob([data], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "career-compass-browser-backup.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Browser backup exported. The database was not changed.");
    } catch {
      setNotice("Browser storage could not be read.");
    }
  }
  return (
    <>
      <Heading
        eyebrow="MAKE THIS WORKSPACE YOURS"
        title="Make this workspace yours"
        description="Add your background and search preferences. Your records are saved to the local database on this computer."
      />
      <div className="settings-grid">
        <div className="stack">
          <section className="panel">
            <div className="section-title">
              <h2>Your introduction</h2>
              <Badge>Database autosave</Badge>
            </div>
            <p className="muted">
              Used in LinkedIn drafts. Include facts you want to share; alumni
              preferences do not imply your education.
            </p>
            <div className="form-grid">
              <label className="full">
                Your name
                <input
                  maxLength={100}
                  value={state.profile.name}
                  placeholder="How should people address you?"
                  onChange={(e) =>
                    updateWorkspace((s) => ({
                      ...s,
                      profile: { ...s.profile, name: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="full">
                Your introduction in English
                <textarea
                  value={state.profile.background}
                  maxLength={1500}
                  placeholder="For example: I'm exploring entry-level product and data roles. Use your actual background."
                  onChange={(e) =>
                    updateWorkspace((s) => ({
                      ...s,
                      profile: { ...s.profile, background: e.target.value },
                    }))
                  }
                />
              </label>
            </div>
            <p className="footnote">
              Use your actual background. Automated personal-fit scoring and
              resume uploads are not enabled yet.
            </p>
            {!!state.profile.highlights?.length && (
              <details className="profile-evidence">
                <summary>Resume & project evidence used in drafts</summary>
                {state.profile.highlights.map((h, i) => (
                  <div className="integration-row" key={i}>
                    <strong>{h.family}</strong>
                    <p>{h.text}</p>
                    <small>Source: {h.source}</small>
                  </div>
                ))}
                <p className="muted">{state.profile.caution}</p>
                <p>Imported files: {state.profile.sources?.join(" · ")}</p>
              </details>
            )}
          </section>
          <section className="panel">
            <h2>Search preferences</h2>
            <div className="preference-mix">
              <strong>Discovery target: 60 / 20 / 20</strong>
              <p>
                60% mid-to-large tech · 20% Chinese global companies · 20%
                startups & small companies. Targets guide ordering when roles
                are available.
              </p>
            </div>
            <label className="toggle-row">
              <div>
                <strong>Exclude TikTok</strong>
                <p>You can change this preference at any time.</p>
              </div>
              <input
                type="checkbox"
                checked={state.preferences.excludeTikTok}
                onChange={(e) =>
                  updateWorkspace((s) => ({
                    ...s,
                    preferences: {
                      ...s.preferences,
                      excludeTikTok: e.target.checked,
                    },
                  }))
                }
              />
            </label>
            <label className="toggle-row">
              <div>
                <strong>
                  Hide US roles that explicitly exclude sponsorship
                </strong>
                <p>
                  Keep roles with unknown policies; excluded roles retain their
                  evidence.
                </p>
              </div>
              <input
                type="checkbox"
                checked={state.preferences.hideNoSponsor}
                onChange={(e) =>
                  updateWorkspace((s) => ({
                    ...s,
                    preferences: {
                      ...s.preferences,
                      hideNoSponsor: e.target.checked,
                    },
                  }))
                }
              />
            </label>
            <p className="footnote">
              Non-US roles use local work authorization requirements, not OPT
              rules.
            </p>
          </section>
        </div>
        <div className="stack">
          <Integrations />
          <section className="panel">
            <h2>Workspace data & recovery</h2>
            <p className="muted">
              Drafts, contacts, applications, and reminders are saved in SQLite
              on this computer. Cross-device sync is not enabled. Export JSON
              before making major changes.
            </p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() =>
                  exportBrowserBackup("career-compass:workspace:v1")
                }
              >
                Export previous browser data
              </button>
              <button
                className="button secondary"
                onClick={() => exportBrowserBackup("career-compass:unsaved:v2")}
              >
                Export unsaved backup
              </button>
              <button className="button secondary" onClick={exportData}>
                <Download size={15} />
                Export JSON
              </button>
              <button
                className="button secondary"
                onClick={() => setResetting(true)}
              >
                <RotateCcw size={15} />
                Clear workspace
              </button>
            </div>
            {resetting && (
              <div className="warning" role="alert">
                <p>
                  This clears the active workspace, including applications,
                  contacts, your introduction and drafts. Source caches and
                  Gmail events remain. Export a backup first.
                </p>
                <div className="button-row">
                  <button
                    className="button danger"
                    onClick={() => {
                      resetWorkspace();
                      setResetting(false);
                      setNotice("Workspace cleared.");
                    }}
                  >
                    Confirm reset
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setResetting(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {notice && (
              <p role="status" className="info-note">
                {notice}
              </p>
            )}
          </section>
        </div>
      </div>

    </>
  );
}
