"use client";

/** Global error boundary — last resort when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0A0A0E", color: "#F5F7FB", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: 24 }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            {["#C6FF3E", "#46E8B0", "#F5F7FB", "#9D7BFF", "#FF5CA8"].map((c, i) => (
              <rect key={i} x={7 + i * 4.2} y={i === 2 ? 8 : 10 - Math.abs(i - 2) * 1.5} width="2.4" height={i === 2 ? 16 : 12 + Math.abs(i - 2) * 3} rx="1.2" fill={c} opacity="0.8" />
            ))}
            <circle cx="16" cy="16" r="14" stroke="#464C5E" />
          </svg>
          <p style={{ fontSize: 22, fontWeight: 600 }}>Seriesight hit a critical error</p>
          <p style={{ fontSize: 14, color: "#C3CAD8", maxWidth: 420, textAlign: "center" }}>
            The application could not start. This is not a data problem — reload to retry, or return to the workspace overview.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={reset} style={{ border: "1px solid #C6FF3E", background: "rgba(198,255,62,0.10)", color: "#C6FF3E", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}>
              Reload
            </button>
            <a href="/" style={{ border: "1px solid #464C5E", color: "#C3CAD8", padding: "10px 20px", borderRadius: 8, textDecoration: "none" }}>
              Workspace overview
            </a>
          </div>
          {error.digest ? <code style={{ fontSize: 11, color: "#8D96A9" }}>trace: {error.digest}</code> : null}
        </div>
      </body>
    </html>
  );
}
