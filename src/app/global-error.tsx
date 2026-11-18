"use client";

/** Global error boundary — last resort when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#080C14", color: "#F2F6FC", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: 24 }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            {["#42D9FF", "#627DFF", "#EDF4FF", "#627DFF", "#9B8CFF"].map((c, i) => (
              <rect key={i} x={7 + i * 4.2} y={i === 2 ? 8 : 10 - Math.abs(i - 2) * 1.5} width="2.4" height={i === 2 ? 16 : 12 + Math.abs(i - 2) * 3} rx="1.2" fill={c} opacity="0.8" />
            ))}
            <circle cx="16" cy="16" r="14" stroke="#3D5D78" />
          </svg>
          <p style={{ fontSize: 22, fontWeight: 600 }}>Seriesight hit a critical error</p>
          <p style={{ fontSize: 14, color: "#AAB9CB", maxWidth: 420, textAlign: "center" }}>
            The application could not start. This is not a data problem — reload to retry, or return to the workspace overview.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={reset} style={{ border: "1px solid #42D9FF", background: "rgba(66,217,255,0.1)", color: "#42D9FF", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}>
              Reload
            </button>
            <a href="/" style={{ border: "1px solid #3D5D78", color: "#AAB9CB", padding: "10px 20px", borderRadius: 8, textDecoration: "none" }}>
              Workspace overview
            </a>
          </div>
          {error.digest ? <code style={{ fontSize: 11, color: "#728399" }}>trace: {error.digest}</code> : null}
        </div>
      </body>
    </html>
  );
}
