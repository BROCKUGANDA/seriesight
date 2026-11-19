"use client";

/** Global error boundary — last resort when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#F1F0E9", color: "#20231D", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: 24 }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            {["#58750B", "#176D43", "#20231D", "#6350A2", "#9A3E68"].map((color, i) => (
              <rect key={color} x={7 + i * 4.2} y={i === 2 ? 8 : 10 - Math.abs(i - 2) * 1.5} width="2.4" height={i === 2 ? 16 : 12 + Math.abs(i - 2) * 3} rx="1.2" fill={color} opacity="0.8" />
            ))}
            <circle cx="16" cy="16" r="14" stroke="#8F9383" />
          </svg>
          <p style={{ fontSize: 22, fontWeight: 600 }}>Seriesight hit a critical error</p>
          <p style={{ fontSize: 14, color: "#50564B", maxWidth: 420, textAlign: "center" }}>
            The application could not render. Reload to try again, or return to the landing page if the problem persists.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={reset} style={{ border: "1px solid #58750B", background: "rgba(88,117,11,0.10)", color: "#3F5605", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}>
              Reload
            </button>
            <a href="/" style={{ border: "1px solid #8F9383", color: "#50564B", padding: "10px 20px", borderRadius: 8, textDecoration: "none" }}>
              Landing page
            </a>
          </div>
          {error.digest ? <code style={{ fontSize: 11, color: "#687064" }}>trace: {error.digest}</code> : null}
        </div>
      </body>
    </html>
  );
}
