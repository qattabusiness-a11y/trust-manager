"use client";

import { useState } from "react";

/** A stable "now" for the lifetime of a component (keeps render pure). */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
