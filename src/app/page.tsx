"use client";

/**
 * Seriesight — League of Legends esports coaching intelligence and Fearless Draft
 * management platform. The sandbox preview exposes only `/`, so the commercial
 * site (landing, pricing, legal) and the eight workspace destinations live on
 * hash routes inside this client shell (PRD Part D information architecture preserved).
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
import { LandingPage } from "@/components/marketing/landing";
import { PricingPage } from "@/components/marketing/pricing";
import { LegalPage } from "@/components/marketing/legal";
import { useHashRoute, isMarketingRoute } from "@/hooks/use-hash-route";
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

function MarketingView({ route }: { route: string }) {
  switch (route) {
    case "pricing":
      return <PricingPage />;
    case "terms":
      return <LegalPage document="terms" />;
    case "privacy":
      return <LegalPage document="privacy" />;
    default:
      return <LandingPage />;
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
        {bootPhase === 0 ? <ApertureLoader /> : <SignalSweep label="Connecting to Seriesight" className="w-64" />}
      </div>
    );
  }

  if (isMarketingRoute(route)) {
    return <MarketingView route={route} />;
  }

  return (
    <AppShell>
      <WorkspaceView route={route} />
    </AppShell>
  );
}
