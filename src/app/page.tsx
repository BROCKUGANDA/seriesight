"use client";

/**
 * Seriesight — League of Legends esports coaching intelligence and Fearless Draft
 * management platform. The sandbox preview exposes only `/`, so the eight
 * workspace destinations live on hash routes inside this client shell
 * (PRD Part D information architecture preserved 1:1).
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CommandCenter } from "@/components/workspaces/command-center";
import { OpponentIntelligence } from "@/components/workspaces/scouting";
import { MacroAtlas } from "@/components/workspaces/macro-atlas";
import { DraftRoom } from "@/components/workspaces/draft-room";
import { SeriesLab } from "@/components/workspaces/series-lab";
import { EvidenceLedger } from "@/components/workspaces/evidence-ledger";
import { DataSources } from "@/components/workspaces/data-sources";
import { Settings } from "@/components/workspaces/settings";
import { useHashRoute } from "@/hooks/use-hash-route";
import { ApertureLoader, SignalSweep } from "@/components/loading/loaders";

function WorkspaceView({ route }: { route: string }) {
  switch (route) {
    case "scouting":
      return <OpponentIntelligence />;
    case "macro":
      return <MacroAtlas />;
    case "draft":
      return <DraftRoom />;
    case "series-lab":
      return <SeriesLab />;
    case "evidence":
      return <EvidenceLedger />;
    case "data-sources":
      return <DataSources />;
    case "settings":
      return <Settings />;
    default:
      return <CommandCenter />;
  }
}

export default function SeriesightApp() {
  const [route] = useHashRoute();
  const [booted, setBooted] = useState(false);
  const [bootPhase, setBootPhase] = useState(0);

  // Brand boot sequence: aperture loader → content (PRD F5/F2 motion-hero window).
  useEffect(() => {
    const t1 = setTimeout(() => setBootPhase(1), 620);
    const t2 = setTimeout(() => setBooted(true), 860);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-void)]">
        {bootPhase === 0 ? <ApertureLoader /> : <SignalSweep label="Connecting to fixture workspace" className="w-64" />}
      </div>
    );
  }

  return (
    <AppShell>
      <WorkspaceView route={route} />
    </AppShell>
  );
}
