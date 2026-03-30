const SILENCED_METHODS = ["log", "warn", "error", "info", "debug", "trace"];

export async function register() {
  if (globalThis.__APP_CONSOLE_SILENCED__) return;

  SILENCED_METHODS.forEach((method) => {
    if (typeof console?.[method] === "function") {
      console[method] = () => {};
    }
  });

  globalThis.__APP_CONSOLE_SILENCED__ = true;
}
