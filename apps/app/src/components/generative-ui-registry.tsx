"use client";

import { useGenerativeUIExamples } from "@/hooks/use-generative-ui-examples";

/** Frontend tools must survive navigation from home to a generation session. */
export function GenerativeUIRegistry() {
  useGenerativeUIExamples();
  return null;
}
