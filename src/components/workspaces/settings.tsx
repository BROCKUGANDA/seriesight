"use client";

/**
 * Workspace Settings: workspace identity, draft role configuration, haptics,
 * reduced-motion behaviour and the provider data-retention policy.
 */
import { useSyncExternalStore } from "react";
import { Panel } from "@/components/common/primitives";
import { useAuthStore } from "@/store/auth";
import { ALL_ROLES } from "@/domain/types";
import { ROLE_GLYPHS } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCallback, useEffect, useState } from "react";
import { useHashRoute } from "@/hooks/use-hash-route";
import { isTenantOwner } from "@/hooks/use-tenant-role";
import { subscribeToMediaQuery } from "@/lib/media-query";

interface OrganizationSummary {
  id: string;
  name: string;
  role: string;
  workspaces: { id: string; name: string; kind: string }[];
}

interface WorkspaceSummary {
  id: string;
  name: string;
  kind: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

async function apiRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Request failed.");
  return result.data as T;
}

export function Settings() {
  const user = useAuthStore((s) => s.user);
  const switchWorkspace = useAuthStore((s) => s.switchWorkspace);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useWorkspaceStore((s) => s.setHapticsEnabled);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const [, navigate] = useHashRoute();
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const reduceMotion = useSyncExternalStore(
    (cb) => subscribeToMediaQuery("(prefers-reduced-motion: reduce)", cb),
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("coach");
  const [inviteOrgId, setInviteOrgId] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [tenantBusy, setTenantBusy] = useState(false);
  const activeRole = workspaces.find((workspace) => workspace.id === user?.workspaceId)?.role ?? null;

  const loadTenants = useCallback(async () => {
    try {
      const [orgResult, workspaceResult] = await Promise.all([
        apiRequest<{ organizations: OrganizationSummary[] }>("/api/organizations"),
        apiRequest<{ workspaces: WorkspaceSummary[] }>("/api/workspaces"),
      ]);
      setOrganizations(orgResult.organizations);
      setWorkspaces(workspaceResult.workspaces);
      setInviteOrgId((current) => current || orgResult.organizations[0]?.id || "");
    } catch {
      setOrganizations([]);
      setWorkspaces([]);
    }
  }, []);

  useEffect(() => {
    if (user?.kind === "coach") queueMicrotask(() => void loadTenants());
  }, [user?.kind, user?.workspaceId, loadTenants]);

  const createOrg = async () => {
    setTenantBusy(true);
    try {
      await apiRequest("/api/organizations", "POST", { name: newOrgName });
      setNewOrgName("");
      await loadTenants();
      pushToast("Organization created with its own team workspace.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not create the organization.", "error");
    } finally {
      setTenantBusy(false);
    }
  };

  const invite = async () => {
    setTenantBusy(true);
    try {
      const result = await apiRequest<{ token: string }>(`/api/organizations/${inviteOrgId}/members`, "POST", {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteToken(result.token);
      setInviteEmail("");
      await loadTenants();
      pushToast("Invitation created. Copy the token now — it is shown once.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not create the invitation.", "error");
    } finally {
      setTenantBusy(false);
    }
  };

  const changeWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === user?.workspaceId) return;
    setTenantBusy(true);
    try {
      await switchWorkspace(workspaceId);
      pushToast("Workspace switched. Draft and evidence state reloaded.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not switch workspace.", "error");
    } finally {
      setTenantBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Workspace Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Workspace identity, role configuration, feedback preferences and data-governance boundaries.</p>
      </header>

      <Panel title="Workspace identity">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Field k="Workspace" v={user?.kind === "coach" ? "Private coach workspace" : "Isolated fixture sandbox"} />
          <Field k="Workspace ID" v={user?.workspaceId ?? "Loading…"} />
          <Field k="Our squad" v="Choose in Draft Room" />
          <Field k="Dataset" v="See active data source notice above" />
        </dl>
      </Panel>

      <Panel title="Organizations & workspaces" subtitle="Switch tenant context, create a team organization, and invite coaches">
        {user?.kind !== "coach" ? (
          <p className="text-xs text-[var(--text-secondary)]">Sign in with a coach account to manage organizations. Fixture demos use an isolated sandbox.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
              Active workspace
              <select
                value={user.workspaceId ?? ""}
                onChange={(event) => void changeWorkspace(event.target.value)}
                disabled={tenantBusy}
                className="cfg-select"
                aria-label="Active workspace"
              >
                {workspaces.length === 0 && <option value={user.workspaceId ?? ""}>Loading workspaces…</option>}
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.organizationName} — {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newOrgName}
                onChange={(event) => setNewOrgName(event.target.value)}
                placeholder="New organization name"
                aria-label="New organization name"
                className="cfg-select h-9"
              />
              <button type="button" onClick={() => void createOrg()} disabled={tenantBusy || newOrgName.trim().length < 2} className="ctrl-btn">Create organization</button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
              <select value={inviteOrgId} onChange={(event) => setInviteOrgId(event.target.value)} aria-label="Organization to invite into" className="cfg-select">
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
              <input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="Invitee email"
                aria-label="Invitee email"
                className="cfg-select h-9"
              />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} aria-label="Invite role" className="cfg-select">
                <option value="coach">Coach</option>
                <option value="analyst">Analyst</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="button" onClick={() => void invite()} disabled={tenantBusy || !inviteOrgId || inviteEmail.trim().length === 0 || !isTenantOwner(activeRole)} className="ctrl-btn" title={isTenantOwner(activeRole) ? undefined : "Only owners can invite members"}>Invite</button>
            </div>

            {inviteToken && (
              <div className="rounded-lg border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10 px-3 py-2" role="status">
                <p className="text-[11px] font-semibold text-[var(--accent-green)]">Invitation token — copy it now</p>
                <code className="mt-1 block break-all font-mono text-[10px] text-[var(--text-secondary)]">{inviteToken}</code>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Draft role configuration" subtitle="Players map to roles from observed data; champion flex options stay selectable">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {ALL_ROLES.map((r) => {
            const Glyph = ROLE_GLYPHS[r];
            return (
              <div key={r} className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-3 py-2.5">
                <span className="text-[var(--accent-cyan)]"><Glyph size={16} /></span>
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">{r}</p>
                  <p className="font-mono text-[10px] text-[var(--text-muted)]">required to finalize</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          The draft engine rejects completion while any pick lacks a role assignment. Never infer a player&apos;s role solely from a static champion-role mapping — the scouting workspace uses observed-role data where available.
        </p>
      </Panel>

      <Panel title="Feedback preferences">
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-4 py-3">
            <span>
              <span className="block text-sm text-[var(--text-primary)]">Haptic feedback</span>
              <span className="block text-[11px] text-[var(--text-muted)]">Brief pulses on pick confirm / invalid action / session complete. Supported mobile devices only; desktop always gets visual confirmation. Never fires on page load.</span>
            </span>
            <Switch
              checked={hapticsEnabled}
              onCheckedChange={(checked) => {
                setHapticsEnabled(checked);
                pushToast(checked ? "Haptics enabled where supported." : "Haptics disabled.");
              }}
              aria-label="Enable haptic feedback"
            />
          </label>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-4 py-3">
            <span>
              <span className="block text-sm text-[var(--text-primary)]">Reduced motion</span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                {reduceMotion
                  ? "Active — your OS requests reduced motion. All animations collapse to instant transitions."
                  : "Not requested. Seriesight honours prefers-reduced-motion globally; no perpetual ambient animation is used."}
              </span>
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${reduceMotion ? "border-[var(--accent-green)]/50 text-[var(--accent-green)]" : "border-[var(--border-active)] text-[var(--text-muted)]"}`}>
              {reduceMotion ? "Honoured" : "Standby"}
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Data retention & licensing boundaries" subtitle="Provider-specific policy — schema is not permission to retain licensed data">
        <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-[var(--text-secondary)]">
          <li>GRID Open Access is limited to non-commercial learning and experimentation; commercialization requires the appropriate GRID commercial licence.</li>
          <li>Never publish unauthorized GRID raw data or derivative datasets to the public repository. Only fields explicitly permitted by the applicable agreement may be stored or displayed.</li>
          <li>Where licensing does not permit retaining underlying data, the Evidence Ledger exposes only aggregate statistics plus provenance metadata.</li>
          <li>Fixture data is independently authored and always carries its fixture marker — synthetic records never appear inside an official-data view.</li>
          <li>No secrets, provider credentials or licensed raw datasets are committed to fixtures, screenshots or logs.</li>
        </ul>
      </Panel>

      <Panel title="Danger zone">
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          Draft sessions persist in the local database so boards stay reproducible between reloads. Closing the active
          session here clears it from this browser immediately; anything already finalized stays recorded. Full database
          cleanup is available on the Organisation plan or by written request.
        </p>
        <button type="button" onClick={() => setCleanupOpen(true)} className="ctrl-btn mt-3">
          Close active session in this browser
        </button>
      </Panel>

      <AlertDialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <AlertDialogContent className="border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--text-primary)]">Close the active draft session?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--text-secondary)]">
              The Draft Room and Series Lab will return to their empty configuration state in this browser. The session
              record remains in the demo database for reproducibility and can be reopened by creating a new board.
              This does not affect any other workspace or user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]">
              Keep working
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--accent-coral)] text-[#1c0a0e] hover:bg-[var(--accent-coral)]/90"
              onClick={() => {
                setActiveSession(null);
                setCleanupOpen(false);
                pushToast("Active session closed in this browser. The Draft Room is ready for a new board.");
                navigate("dashboard");
              }}
            >
              Close session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
      <dd className="mt-0.5 font-mono text-[11px] text-[var(--text-secondary)]">{v}</dd>
    </div>
  );
}
