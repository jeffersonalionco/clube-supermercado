import versionData from "./version.json";

/** Versão pública do Clube Superama+ (sincronizada com version.json). */
export const APP_VERSION = String(versionData?.version || "0.0.0");
