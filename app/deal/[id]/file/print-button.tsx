"use client";

// Print/save-as-PDF control. Hidden when the page actually prints.

export function PrintButton() {
  return (
    <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 8 }}>
      <button
        onClick={() => window.print()}
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #cbd5e1",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Print / Save as PDF
      </button>
      <button
        onClick={() => window.history.back()}
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid transparent",
          background: "transparent",
          color: "#475569",
          cursor: "pointer",
        }}
      >
        Back to deal
      </button>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
}
