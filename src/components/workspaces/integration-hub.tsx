"use client";

/**
 * Integration Hub — the operational surface of the integration fabric.
 *
 * Shows every seam (production controllers → bus → consumers & sinks),
 * the durable outbox event stream with dead-letter replay, signed inbound
 * webhook documentation with a one-click simulator, outbound subscriber
 * endpoint management with connectivity tests, the delivery ledger and the
 * notification feed. Everything a coach needs to connect Seriesight to
 * internal and external systems — and prove the connections work.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiFetch, apiPost, apiFetch as fetchEnvelope } from "@/lib/api-client";
import { Panel, StatTile, ErrorState, SkeletonBlock } from "@/components/common/primitives";
import { SeamGlyph, ImportGlyph, RiskGlyph, EvidenceGlyph, IntegrityGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

/* ── API shapes (mirror /api/integration/overview) ─────────────────────── */

interface SeamDescriptor {
  id: string;
  name: string;
  kind: "controller" | "adapter" | "consumer" | "sink";
  direction: "inbound" | "outbound" | "internal";
  protocol: string;
  topics: string[];
  description: string;
  availability: "live" | "optional";
}

interface Overview {
  seams: SeamDescriptor[];
  topics: { topic: string; label: string; producers: string[]; consumers: string[] }[];
  scheduler?: {
    started: boolean;
    disabled: boolean;
    intervalMs: number;
    limit: number;
    startedAt: string | null;
    lastTickAt: string | null;
    ticks: number;
    lastTally: { scanned: number; delivered: number; rescheduled: number; dead: number } | null;
    lastError: string | null;
  };
  connectors?: {
    id: string;
    name: string;
    kind: string;
    baseUrl: string;
    ingestTopics: string[];
    subscribedTopics: string[];
    status: "up" | "down";
    detail: string | null;
    checkedAt: string;
  }[];
  bus: {
    counts: { pending: number; processing: number; delivered: number; dead: number };
    metrics: { total: number; byTopic: Record<string, number>; lastEventAt: string | null };
    workerHint: string;
  };
  events: {
    id: string;
    topic: string;
    source: string;
    direction: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    correlationId: string | null;
    createdAt: string;
    processedAt: string | null;
    lastError: string | null;
    payloadPreview: string;
  }[];
  endpoints: {
    id: string;
    label: string;
    url: string;
    topics: string[];
    status: string;
    urlPolicy: { ok: boolean; host: string; reason?: string };
    secretPreview: string;
    successCount: number;
    failureCount: number;
    lastDeliveryAt: string | null;
    lastStatusCode: number | null;
    createdAt: string;
  }[];
  deliveries: {
    id: string;
    eventId: string;
    endpointLabel: string;
    status: string;
    attempts: number;
    lastStatusCode: number | null;
    lastError: string | null;
    createdAt: string;
    deliveredAt: string | null;
  }[];
  notifications: { id: string; topic: string; severity: string; title: string; body: string; read: boolean; createdAt: string }[];
  inbound: {
    topics: string[];
    headerName: string;
    secretIsDocumentedDefault: boolean;
    secret: string | null;
    secretPreview: string;
    paths: Record<string, string>;
  };
  sinks: { auditPath: string; warehousePath: string; resolvedDir: string };
}

/* ── Visual tokens ──────────────────────────────────────────────────────── */

const KIND_STYLE: Record<SeamDescriptor["kind"], { label: string; cls: string }> = {
  controller: { label: "Controller", cls: "border-[var(--accent-cyan)]/45 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]" },
  adapter: { label: "Adapter", cls: "border-[var(--accent-violet)]/45 bg-[var(--accent-violet)]/10 text-[var(--accent-violet)]" },
  consumer: { label: "Consumer", cls: "border-[var(--accent-green)]/45 bg-[var(--accent-green)]/10 text-[var(--accent-green)]" },
  sink: { label: "Sink", cls: "border-[var(--accent-amber)]/45 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]" },
};

const EVENT_STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  pending: { cls: "border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]", label: "Pending" },
  processing: { cls: "border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]", label: "Processing" },
  delivered: { cls: "border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 text-[var(--accent-green)]", label: "Delivered" },
  dead: { cls: "border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]", label: "Dead letter" },
};

const SEVERITY_STYLE: Record<string, string> = {
  info: "border-[var(--accent-cyan)]/40 text-[var(--accent-cyan)]",
  success: "border-[var(--accent-green)]/40 text-[var(--accent-green)]",
  warning: "border-[var(--accent-amber)]/40 text-[var(--accent-amber)]",
  error: "border-[var(--accent-coral)]/40 text-[var(--accent-coral)]",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Web-Crypto HMAC signature matching the server contract (sha256=<hex>). */
async function signWebhookPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function IntegrationHub() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({ label: "", url: "", topics: ["*"] as string[] });
  const pushToast = useWorkspaceStore((s) => s.pushToast);

  const load = useCallback(async () => {
    try {
      const overview = await apiFetch<Overview>("/api/integration/overview");
      setData(overview);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e : null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const interval = setInterval(load, 10_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [load]);

  const runAction = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    try {
      pushToast(await fn(), "ok");
      await load();
    } catch (e) {
      const msg = e instanceof ApiClientError ? `${e.message} (${e.code})` : "The action could not complete. Check your connection and retry.";
      pushToast(msg, "error");
    } finally {
      setBusy(null);
    }
  };

  const dispatchCycle = () => runAction("dispatch", async () => {
    const r = await apiPost<{ scanned: number; delivered: number; rescheduled: number; dead: number }>("/api/integration/dispatch", {});
    return `Dispatch cycle complete — ${r.delivered} delivered, ${r.rescheduled} rescheduled, ${r.dead} dead-lettered of ${r.scanned} due events.`;
  });

  const pollProvider = () => runAction("poll", async () => {
    const r = await apiPost<{ status: string; detail: string; eventEmitted: boolean }>("/api/integration/poll", {});
    return `GRID probe: ${r.status}${r.eventEmitted ? " — health event published to the bus." : " — no key configured, event suppressed."}`;
  });

  const simulateInbound = () => runAction("simulate", async () => {
    const body = JSON.stringify({
      ourTeamId: "C9",
      opponentTeamId: "NVX",
      result: "win",
      gameNumber: 2,
      patch: "14.9",
      tournament: "Scrim Block 4",
      notes: "Simulated from the Integration Hub.",
      externalSystem: "hub-simulator",
    });
    const secret = data?.inbound.secret;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers["x-seriesight-signature"] = await signWebhookPayload(secret, body);
    const res = await fetch("/api/integration/ingest/scrim.result.recorded", { method: "POST", headers, body, cache: "no-store" });
    const json = (await res.json()) as { success: boolean; data?: { eventId: string; verified: boolean }; error?: { message: string } };
    if (!json.success) throw new ApiClientError({ code: "WEBHOOK_SIGNATURE_INVALID", message: json.error?.message ?? "Inbound webhook rejected.", retryable: false, recovery: "Check the shared inbound secret." });
    return `Inbound scrim webhook accepted — verified: ${json.data?.verified ? "yes" : "no"}, event ${json.data?.eventId.slice(0, 8)}… dispatched to consumers and sinks.`;
  });

  const replayEvent = (eventId: string) => runAction(`replay:${eventId}`, async () => {
    const r = await apiPost<{ status: string }>(`/api/integration/events/${eventId}/replay`, {});
    return `Replay finished — event is now ${r.status}.`;
  });

  const testEndpoint = (endpointId: string) => runAction(`test:${endpointId}`, async () => {
    const r = await apiPost<{ delivery: { status: string; statusCode: number | null; lastError: string | null } | null }>(`/api/integration/endpoints/${endpointId}/test`, {});
    const d = r.delivery;
    return d?.status === "delivered"
      ? `Ping delivered — receiver answered HTTP ${d.statusCode}. Signature verified on the wire.`
      : `Ping failed — ${d?.lastError ?? "no delivery row was created"}. Check the endpoint URL policy and receiver.`;
  });

  const addEndpoint = () => runAction("add-endpoint", async () => {
    const r = await apiPost<{ endpoint: { label: string; secret: string } }>("/api/integration/endpoints", newEndpoint);
    setShowAddEndpoint(false);
    setNewEndpoint({ label: "", url: "", topics: ["*"] });
    return `Endpoint "${r.endpoint.label}" registered. Signing secret (shown once): ${r.endpoint.secret}`;
  });

  const toggleEndpoint = (id: string, status: string) => runAction(`toggle:${id}`, async () => {
    const next = status === "active" ? "paused" : "active";
    await fetchEnvelope(`/api/integration/endpoints/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    return `Endpoint ${next === "active" ? "resumed" : "paused"}.`;
  });

  const removeEndpoint = (id: string) => runAction(`remove:${id}`, async () => {
    await fetchEnvelope(`/api/integration/endpoints/${id}`, { method: "DELETE" });
    return "Endpoint unregistered; its delivery ledger rows were removed.";
  });

  const markNotificationsRead = () => runAction("notify-read", async () => {
    await apiFetch("/api/integration/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) });
    return "All integration notifications marked read.";
  });

  const groupedSeams = useMemo(() => {
    const seams = data?.seams ?? [];
    return {
      producers: seams.filter((s) => s.kind === "controller" || (s.kind === "adapter" && s.direction === "inbound")),
      bus: seams.filter((s) => s.kind === "adapter" && s.direction === "outbound"),
      consumers: seams.filter((s) => s.kind === "consumer"),
      sinks: seams.filter((s) => s.kind === "sink"),
    };
  }, [data]);

  const unreadNotifications = data?.notifications.filter((n) => !n.read).length ?? 0;

  const schedulerChip = (() => {
    const s = data?.scheduler;
    if (!s) return null;
    if (s.disabled) {
      return { label: "Background dispatch: delegated to external cron", cls: "border-[var(--accent-violet)]/45 bg-[var(--accent-violet)]/10 text-[var(--accent-violet)]" };
    }
    if (!s.started) {
      return { label: "Background dispatch: not running this process", cls: "border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]" };
    }
    const since = s.lastTickAt ? timeAgo(s.lastTickAt) : "starting…";
    return { label: `Background dispatch: every ${Math.round(s.intervalMs / 1000)}s · last tick ${since}`, cls: "border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 text-[var(--accent-green)]" };
  })();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold text-[var(--text-primary)]">
            <SeamGlyph size={22} className="text-[var(--accent-cyan)]" />
            Integration Hub
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            Every seam between Seriesight and internal or external systems: production controllers publish to the durable outbox bus, consumers process, sinks deliver.
            Signatures, retries and dead-lettering are enforced on the wire.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={dispatchCycle} disabled={busy !== null} className="min-h-[36px]">
            <ImportGlyph size={14} className="mr-1.5" />
            Run dispatch cycle
          </Button>
          <Button size="sm" variant="outline" onClick={pollProvider} disabled={busy !== null} className="min-h-[36px]">
            Poll provider
          </Button>
          <Button size="sm" variant="outline" onClick={simulateInbound} disabled={busy !== null} className="min-h-[36px]">
            Simulate inbound webhook
          </Button>
        </div>
      </header>

      {error ? (
        <ErrorState code={error.code} message={error.message} recovery={error.recovery} retryable={error.retryable} onRetry={load} />
      ) : !data ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-48" />)}</div>
      ) : (
        <>
          {/* Health tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Events delivered" value={data.bus.counts.delivered} tone="accent" detail="consumers + sinks completed" />
            <StatTile label="Pending" value={data.bus.counts.pending} tone={data.bus.counts.pending > 0 ? "warn" : "default"} detail="awaiting dispatch cycle" />
            <StatTile label="Dead letters" value={data.bus.counts.dead} tone={data.bus.counts.dead > 0 ? "warn" : "default"} detail="replayable below" />
            <StatTile label="Subscriber endpoints" value={data.endpoints.filter((e) => e.status === "active").length} tone="violet" detail={`${data.endpoints.length} registered`} />
            <StatTile label="Unread notifications" value={unreadNotifications} tone={unreadNotifications > 0 ? "accent" : "default"} detail="integration feed" />
          </div>

          {/* Live connections — background scheduler + real external connectors */}
          {(schedulerChip || (data.connectors?.length ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {schedulerChip && (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${schedulerChip.cls}`}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                  {schedulerChip.label}
                </span>
              )}
              {(data.connectors ?? []).map((c) => (
                <span
                  key={c.id}
                  title={`${c.baseUrl}${c.ingestTopics.length > 0 ? ` · publishes ${c.ingestTopics.join(", ")}` : ""}${c.subscribedTopics.length > 0 ? ` · subscribed to ${c.subscribedTopics.join(", ")}` : ""}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    c.status === "up"
                      ? "border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 text-[var(--accent-green)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-muted)]"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.status === "up" ? "bg-current" : "bg-[var(--text-muted)]"}`} />
                  {c.name}: {c.status}
                </span>
              ))}
            </div>
          )}

          {/* Seam map */}
          <Panel
            title="Seam map"
            subtitle="Producers write to the outbox bus; the dispatch engine fans out to consumers and sinks. Every arrow is signed, retried and journaled."
          >
            <div className="grid gap-4 xl:grid-cols-[1fr_auto_1.2fr]">
              <SeamColumn title="Producers — controllers & inbound adapters" items={groupedSeams.producers} accent="var(--accent-cyan)" />
              <div className="flex items-center justify-center xl:flex-col">
                <BusNode pending={data.bus.counts.pending} dead={data.bus.counts.dead} total={data.bus.metrics.total} />
              </div>
              <div className="flex flex-col gap-4">
                <SeamColumn title="Consumers — internal processors" items={groupedSeams.consumers} accent="var(--accent-green)" compact />
                <SeamColumn title="Sinks — terminal destinations" items={groupedSeams.sinks} accent="var(--accent-amber)" compact />
              </div>
            </div>
          </Panel>

          {/* Event stream */}
          <Panel
            title="Event stream — durable outbox"
            subtitle={`${data.bus.counts.pending} pending · ${data.bus.counts.processing} processing · ${data.bus.counts.delivered} delivered · ${data.bus.counts.dead} dead-lettered. ${data.bus.workerHint}`}
            actions={<Badge variant="outline" className="tnum">{data.events.length} recent</Badge>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Topic</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Attempts</th>
                    <th className="py-2 pr-3 font-medium">Age</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.slice(0, 12).map((e) => (
                    <tr key={e.id} className="border-b border-[var(--border-subtle)]/60 align-top">
                      <td className="max-w-[220px] py-2.5 pr-3">
                        <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]" title={e.payloadPreview}>{e.payloadPreview || "—"}</p>
                        <p className="truncate text-[10px] text-[var(--text-muted)]" title={e.lastError ?? undefined}>{e.lastError ?? e.correlationId ?? ""}</p>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-[var(--text-primary)]">{e.topic}</td>
                      <td className="max-w-[160px] truncate py-2.5 pr-3 font-mono text-[11px] text-[var(--text-secondary)]" title={e.source}>{e.source}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${EVENT_STATUS_STYLE[e.status]?.cls ?? ""}`}>
                          {e.status === "dead" && <RiskGlyph size={11} />}
                          {EVENT_STATUS_STYLE[e.status]?.label ?? e.status}
                        </span>
                      </td>
                      <td className="tnum py-2.5 pr-3 text-[var(--text-secondary)]">{e.attempts}/{e.maxAttempts}</td>
                      <td className="py-2.5 pr-3 text-[var(--text-muted)]">{timeAgo(e.createdAt)}</td>
                      <td className="py-2.5">
                        {(e.status === "dead" || e.status === "pending") && (
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => replayEvent(e.id)} disabled={busy !== null}>
                            Replay
                          </Button>
                        )}
                        {e.status === "delivered" && <span className="text-[10px] text-[var(--text-muted)]">completed {e.processedAt ? timeAgo(e.processedAt) : ""}</span>}
                      </td>
                    </tr>
                  ))}
                  {data.events.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-[var(--text-muted)]">No events yet — run an import, finalize a draft, capture a lead, or simulate an inbound webhook.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Outbound endpoints */}
          <Panel
            title="Outbound subscribers — external systems receiving our events"
            subtitle="Each delivery is signed with the endpoint's secret (HMAC-SHA256) and journaled in the delivery ledger. Secrets are shown once at registration."
            actions={
              <Button size="sm" variant="outline" onClick={() => setShowAddEndpoint((v) => !v)} className="min-h-[32px]">
                {showAddEndpoint ? "Cancel" : "Register endpoint"}
              </Button>
            }
          >
            {showAddEndpoint && (
              <div className="mb-4 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)]/60 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-[var(--text-secondary)]">
                    Label
                    <Input value={newEndpoint.label} onChange={(e) => setNewEndpoint((v) => ({ ...v, label: e.target.value }))} placeholder="CRM pipeline" className="mt-1" />
                  </label>
                  <label className="text-xs text-[var(--text-secondary)]">
                    Receiver URL (https, or http for loopback testing)
                    <Input value={newEndpoint.url} onChange={(e) => setNewEndpoint((v) => ({ ...v, url: e.target.value }))} placeholder="https://ops.example.com/hooks/seriesight" className="mt-1" />
                  </label>
                </div>
                <fieldset className="mt-3">
                  <legend className="mb-1.5 text-xs text-[var(--text-secondary)]">Subscribed topics</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {["*", ...data.topics.map((t) => t.topic)].map((topic) => (
                      <label key={topic} className="flex min-h-[28px] items-center gap-2 font-mono text-[11px] text-[var(--text-secondary)]">
                        <Checkbox
                          checked={newEndpoint.topics.includes(topic)}
                          onCheckedChange={(checked) =>
                            setNewEndpoint((v) => ({ ...v, topics: checked ? [...v.topics, topic] : v.topics.filter((t) => t !== topic) }))
                          }
                          aria-label={`Subscribe to ${topic}`}
                        />
                        {topic}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={addEndpoint} disabled={busy !== null || newEndpoint.label.length < 2 || newEndpoint.url.length < 8}>Register endpoint</Button>
                  <span className="text-[11px] text-[var(--text-muted)]">A 24-byte signing secret is generated and shown once.</span>
                </div>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {data.endpoints.map((ep) => (
                <div key={ep.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{ep.label}</p>
                      <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]" title={ep.url}>{ep.url}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${ep.status === "active" ? EVENT_STATUS_STYLE.delivered.cls : EVENT_STATUS_STYLE.pending.cls}`}>
                      {ep.status === "active" ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Topics: <span className="font-mono text-[var(--text-secondary)]">{ep.topics.join(", ")}</span>
                  </p>
                  <p className="tnum mt-1 text-[11px] text-[var(--text-muted)]">
                    Secret {ep.secretPreview} · {ep.successCount} delivered / {ep.failureCount} failed · last HTTP {ep.lastStatusCode ?? "—"} {ep.lastDeliveryAt ? `· ${timeAgo(ep.lastDeliveryAt)}` : ""}
                  </p>
                  {!ep.urlPolicy.ok && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--accent-coral)]"><RiskGlyph size={12} /> {ep.urlPolicy.reason}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => testEndpoint(ep.id)} disabled={busy !== null}>Send test ping</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => toggleEndpoint(ep.id, ep.status)} disabled={busy !== null}>
                      {ep.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] text-[var(--accent-coral)]" onClick={() => removeEndpoint(ep.id)} disabled={busy !== null}>Remove</Button>
                  </div>
                </div>
              ))}
              {data.endpoints.length === 0 && (
                <p className="py-4 text-xs text-[var(--text-muted)] lg:col-span-2">
                  No external subscribers yet. Register a receiver URL — for a zero-setup loop test, point it at your own inbound receiver path with topic integration.ping.
                </p>
              )}
            </div>

            {/* Delivery ledger */}
            {data.deliveries.length > 0 && (
              <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Delivery ledger — most recent attempts</p>
                <ul className="flex flex-col gap-1.5">
                  {data.deliveries.slice(0, 6).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${d.status === "delivered" ? EVENT_STATUS_STYLE.delivered.cls : EVENT_STATUS_STYLE.dead.cls}`}>{d.status}</span>
                      <span className="font-medium text-[var(--text-primary)]">{d.endpointLabel}</span>
                      <span className="font-mono text-[var(--text-muted)]">HTTP {d.lastStatusCode ?? "—"}</span>
                      <span>{timeAgo(d.createdAt)}</span>
                      {d.lastError && <span className="truncate text-[var(--accent-coral)]" title={d.lastError}>{d.lastError}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Inbound guide */}
            <Panel
              title="Inbound webhook guide — the seam external systems push through"
              subtitle={`POST to the topic path with ${data.inbound.headerName}: sha256=<hex HMAC of the raw body>. ${data.inbound.secretIsDocumentedDefault ? "This deployment runs on the documented demo secret; set SERIESIGHT_INBOUND_SECRET to rotate it." : "A custom secret is configured; only its preview is shown."}`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {data.inbound.topics.map((t) => (
                    <Badge key={t} variant="outline" className="font-mono text-[10px]">{data.inbound.paths[t]}</Badge>
                  ))}
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  <p className="text-[var(--text-muted)]"># Sign + send from any shell</p>
                  <p>body=&apos;&#123;&quot;opponentTeamId&quot;:&quot;NVX&quot;,&quot;result&quot;:&quot;win&quot;&#125;&apos;</p>
                  <p>
                    sig=&quot;sha256=$(printf &apos;%s&apos; &quot;$body&quot; | openssl dgst -sha256 -hmac &apos;
                    <span className="text-[var(--accent-amber)]">{data.inbound.secret ?? data.inbound.secretPreview}</span>
                    &apos; -hex | cut -d&apos; &apos; -f2)&quot;
                  </p>
                  <p>curl -X POST /api/integration/ingest/scrim.result.recorded \</p>
                  <p className="pl-4">-H &quot;content-type: application/json&quot; -H &quot;x-seriesight-signature: $sig&quot; -d &quot;$body&quot;</p>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Payloads are schema-validated per topic; invalid signatures are rejected with 401 before any parsing, and every accepted webhook is published to the bus with direction <span className="font-mono">inbound</span>.
                </p>
              </div>
            </Panel>

            {/* Notification feed */}
            <Panel
              title="Integration notifications"
              subtitle="Written by the notification consumer — mirrored into the shell notification centre."
              actions={
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={markNotificationsRead} disabled={busy !== null || unreadNotifications === 0}>
                  Mark all read
                </Button>
              }
            >
              <ul className="flex flex-col gap-2.5">
                {data.notifications.map((n) => (
                  <li key={n.id} className={`rounded-lg border px-3.5 py-2.5 ${SEVERITY_STYLE[n.severity] ?? SEVERITY_STYLE.info} bg-[var(--surface-2)]/40`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-medium ${n.read ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>{n.title}</p>
                      <span className="text-[10px] text-[var(--text-muted)]">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{n.body}</p>
                  </li>
                ))}
                {data.notifications.length === 0 && <li className="py-4 text-xs text-[var(--text-muted)]">No notifications yet — they appear as producers fire events.</li>}
              </ul>
            </Panel>
          </div>

          {/* Sink paths + topic catalogue */}
          <Panel title="Topic catalogue & sink paths" subtitle="The full contract surface: who produces each topic, who consumes it, and where terminal data lands.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2 pr-3 font-medium">Topic</th>
                    <th className="py-2 pr-3 font-medium">Producers</th>
                    <th className="py-2 pr-3 font-medium">Consumers & sinks</th>
                    <th className="py-2 font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topics.map((t) => (
                    <tr key={t.topic} className="border-b border-[var(--border-subtle)]/60">
                      <td className="py-2.5 pr-3">
                        <p className="font-mono text-[11px] text-[var(--text-primary)]">{t.topic}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{t.label}</p>
                      </td>
                      <td className="max-w-[220px] py-2.5 pr-3 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">{t.producers.join(", ") || "—"}</td>
                      <td className="max-w-[280px] py-2.5 pr-3 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">{t.consumers.join(", ") || "—"}</td>
                      <td className="tnum py-2.5 text-[var(--text-secondary)]">{data.bus.metrics.byTopic[t.topic] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
              <IntegrityGlyph size={12} className="text-[var(--accent-amber)]" />
              Sink paths: <span className="font-mono text-[var(--text-secondary)]">{data.sinks.auditPath}</span> · <span className="font-mono text-[var(--text-secondary)]">{data.sinks.warehousePath}</span>
              <EvidenceGlyph size={12} className="ml-2 text-[var(--accent-cyan)]" />
              Exports land in <span className="font-mono text-[var(--text-secondary)]">{data.sinks.resolvedDir}</span>
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ── Seam map sub-components ────────────────────────────────────────────── */

function SeamColumn({ title, items, accent, compact = false }: { title: string; items: SeamDescriptor[]; accent: string; compact?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]" style={{ color: accent }}>{title}</p>
      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <div key={s.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/50 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${KIND_STYLE[s.kind].cls}`}>{KIND_STYLE[s.kind].label}</span>
              <p className="text-xs font-medium text-[var(--text-primary)]">{s.name}</p>
              {s.availability === "optional" && <span className="rounded border border-[var(--border-active)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">optional</span>}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{s.description}</p>
            <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]" title={s.topics.join(", ")}>
              <span className="font-mono">{s.protocol}</span> · {s.topics.join(", ")}
            </p>
          </div>
        ))}
        {items.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">—</p>}
      </div>
      {compact && <div className="h-1" />}
    </div>
  );
}

function BusNode({ pending, dead, total }: { pending: number; dead: number; total: number }) {
  return (
    <div className="rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5 px-4 py-3 text-center pulse-border" aria-label="Integration bus: durable outbox and dispatch engine">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-cyan)]">Bus</p>
      <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Durable outbox</p>
      <p className="tnum mt-1.5 text-lg font-semibold text-[var(--text-primary)]">{total}</p>
      <p className="text-[10px] text-[var(--text-muted)]">events published</p>
      <div className="mt-2 flex justify-center gap-3 text-[10px]">
        <span className="text-[var(--accent-amber)]">{pending} queued</span>
        <span className={dead > 0 ? "text-[var(--accent-coral)]" : "text-[var(--text-muted)]"}>{dead} dead</span>
      </div>
    </div>
  );
}
