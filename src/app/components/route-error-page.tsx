import React from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { useRouteError } from "react-router";
import { isStaleChunkError } from "@/lib/lazy-module";

function getRouteErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "statusText" in error) {
    return String((error as { statusText?: unknown }).statusText || "Unknown route error");
  }
  return "Unknown route error";
}

export function RouteErrorPage() {
  const error = useRouteError();
  const staleChunk = isStaleChunkError(error);
  const message = getRouteErrorMessage(error);
  const onPublicWiki = typeof window !== "undefined" && window.location.pathname.startsWith("/wiki");

  return (
    <main className="min-h-screen bg-[#060817] px-4 py-10 text-[#D8E4FF] flex items-center justify-center">
      <section
        className="w-full max-w-[520px] border p-6"
        style={{
          borderColor: staleChunk ? "#8A682D" : "#6A2A3A",
          borderRadius: 8,
          background: "#0B1230",
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center border"
            style={{
              borderColor: staleChunk ? "#C89B48" : "#D65A73",
              borderRadius: 6,
              color: staleChunk ? "#FFD37A" : "#FF91A5",
              background: staleChunk ? "#2A210D" : "#2A1018",
            }}
          >
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold">
              {staleChunk ? "The website was updated" : "This page could not load"}
            </h1>
            <p className="mt-2 text-[12px] leading-5 text-[#9EB0D2]">
              {staleChunk
                ? "The page file changed while this browser session was open. Reload to use the newest version."
                : "The rest of the website is still available. Reload this page or return to a safe starting point."}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 border px-4 py-2 text-[12px] font-semibold hover:bg-[#244783]"
            style={{ borderColor: "#4A7BFF", borderRadius: 6, background: "#183564", color: "#FFFFFF" }}
          >
            <RefreshCw size={13} /> Reload page
          </button>
          <button
            type="button"
            onClick={() => window.location.assign(onPublicWiki ? "/wiki" : "/interface")}
            className="flex items-center gap-2 border px-4 py-2 text-[12px] hover:bg-[#172344]"
            style={{ borderColor: "#304A76", borderRadius: 6, background: "#101A36", color: "#BED0F4" }}
          >
            <Home size={13} /> {onPublicWiki ? "Back to Wiki" : "Back to Dashboard"}
          </button>
        </div>

        <details className="mt-5 border-t pt-3 text-[10px] text-[#7688AA]" style={{ borderTopColor: "#21355A" }}>
          <summary className="cursor-pointer select-none">Technical details</summary>
          <div className="mt-2 break-words font-mono">{message.slice(0, 500)}</div>
        </details>
      </section>
    </main>
  );
}
