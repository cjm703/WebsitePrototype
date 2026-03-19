// ════════════════════════════════════════════════════════
// React Error Boundary — catches render-time errors and
// displays a recovery UI instead of crashing the tree.
// ════════════════════════════════════════════════════════

import React from "react";
import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const info = errorInfo.componentStack || "";
    this.setState({ errorInfo: info });
    console.error("[ErrorBoundary] Caught error:", error, info);

    // Also persist to the error log if available
    try {
      const STORAGE_KEY = "inet-error-log";
      const MAX_ENTRIES = 200;
      const raw = safeGetItem(STORAGE_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      entries.unshift({
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "error",
        message: `[ErrorBoundary] ${error.message}`,
        source: error.stack?.split("\n")[1]?.trim() || "ErrorBoundary",
        player: safeGetItem("inet-user") || "Unknown",
        timestamp: new Date().toLocaleString(),
      });
      safeSetJson(STORAGE_KEY, entries.slice(0, MAX_ENTRIES));
    } catch {
      // localStorage might be full — silently fail
    }
  }

  handleRecover = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: "" });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "linear-gradient(180deg, #0A0A2A 0%, #060618 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
          }}
        >
          <div
            style={{
              background: "#0E0E35",
              border: "1px solid #FF4A4A55",
              borderRadius: 12,
              padding: "32px 40px",
              maxWidth: 480,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 0 40px #FF4A4A22",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <h2 style={{ color: "#FF6A6A", fontSize: 20, margin: "0 0 8px" }}>
              Something went wrong
            </h2>
            <p style={{ color: "#8A9ABB", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
              An error occurred while rendering this page.
              {this.state.error && (
                <span style={{ display: "block", marginTop: 8, color: "#FF8A8A", fontSize: 12, fontFamily: "monospace" }}>
                  {this.state.error.message.slice(0, 200)}
                </span>
              )}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={this.handleRecover}
                style={{
                  background: "#1A1A5B",
                  color: "#C0D0F0",
                  border: "1px solid #4A7BFF55",
                  borderRadius: 8,
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#2A2A7B")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#1A1A5B")}
              >
                Try to Recover
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  background: "#4A7BFF",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#5A8BFF")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#4A7BFF")}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}