"use client";

// Last resort: an error in the root layout itself, where app/error.tsx cannot
// help because the layout that would wrap it is the thing that failed. It has to
// render its own <html> and <body>, and cannot use the app's fonts or CSS
// variables — those come from the layout that just broke — so the styling here
// is deliberately inline and self-contained.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAFAF8",
          color: "#0B0B0D",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.2, margin: 0 }}>
            The store didn&rsquo;t load.
          </h1>
          <p style={{ color: "#5B5B63", margin: 0, lineHeight: 1.6 }}>
            Something failed before the page could start. Nothing you own has been affected.
          </p>
          <div>
            <button
              onClick={reset}
              style={{
                border: 0,
                borderRadius: "999px",
                background: "#C8653D",
                color: "#fff",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
          {error.digest && (
            <p style={{ color: "#5B5B63", fontSize: "0.75rem", margin: 0 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
