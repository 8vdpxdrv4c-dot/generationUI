"use client";

import { ReactNode, useEffect, useState } from "react";

interface ExampleLayoutProps {
  chatContent: ReactNode;
  /** Optional right-hand column, e.g. the history sidebar. */
  aside?: ReactNode;
}

export function ExampleLayout({
  chatContent,
  aside,
}: ExampleLayoutProps) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className="example-layout relative flex-1 min-h-0 flex flex-row">
      {/* Chat Content */}
      <div className="h-full flex-1 min-w-0 min-h-0 max-lg:px-4">
        {chatContent}
      </div>
      {aside && (
        <div
          className="example-layout-aside"
          style={compact ? {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            width: "min(340px, calc(100vw - 68px))",
          } : undefined}
        >
          {aside}
        </div>
      )}
    </div>
  );
}
