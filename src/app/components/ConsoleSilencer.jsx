"use client";

import { useEffect } from "react";

const SILENCED_METHODS = ["log", "warn", "error", "info", "debug", "trace"];

export default function ConsoleSilencer() {
  useEffect(() => {
    if (window.__APP_CONSOLE_SILENCED__) return;

    SILENCED_METHODS.forEach((method) => {
      if (typeof console?.[method] === "function") {
        console[method] = () => {};
      }
    });

    window.__APP_CONSOLE_SILENCED__ = true;
  }, []);

  return null;
}
