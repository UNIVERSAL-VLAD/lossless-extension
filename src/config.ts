export interface Config {
  host: string;
  port: number;
  requestTimeoutMs: number;
  upstreamRetries: number;
  cacheTtlMs: number;
  idSecret: string;
  provider: "stub" | "http" | "qobuzdl" | "multi";
  apiBaseUrl?: string;
  searchPath?: string;
  streamPath?: string;
  apiToken?: string;
  lastBabeBaseUrl?: string;
  monochromeBaseUrl?: string;
  deezerBaseUrl?: string;
  eljohnzcBaseUrl?: string;
  instableBaseUrl?: string;
}

export type Environment = Record<string, string | undefined>;

const positiveInt = (env: Environment, name: string, fallback: number): number => {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};

export function loadConfig(env: Environment = process.env): Config {
  const provider = (env.QOBUZ_PROVIDER ?? "multi").toLowerCase();
  if (provider !== "stub" && provider !== "http" && provider !== "qobuzdl" && provider !== "multi")
    throw new Error("QOBUZ_PROVIDER must be stub, http, qobuzdl, or multi");
  const apiBaseUrl = env.QOBUZ_API_BASE_URL ?? env.QOBUZ_UPSTREAM_BASE_URL ?? "https://qobuz-dll.foreyou.workers.dev";
  if (provider === "http" && (!apiBaseUrl || !/^https:\/\//i.test(apiBaseUrl)))
    throw new Error("QOBUZ_API_BASE_URL must be an HTTPS URL when QOBUZ_PROVIDER=http");
  return {
    host: env.HOST ?? "0.0.0.0",
    port: positiveInt(env, "PORT", Number(env.X_ZOHO_CATALYST_LISTEN_PORT) || Number(env.SERVER_PORT) || 3000),
    requestTimeoutMs: positiveInt(env, "REQUEST_TIMEOUT_MS", 6000),
    upstreamRetries: positiveInt(env, "UPSTREAM_RETRIES", 1),
    cacheTtlMs: positiveInt(env, "CACHE_TTL_SECONDS", 300) * 1000,
    idSecret: env.QOBUZ_ID_SECRET ?? "qobuz-EchoMusic-id-secret-v1",
    provider: provider as Config["provider"],
    apiBaseUrl,
    searchPath: env.QOBUZ_SEARCH_PATH,
    streamPath: env.QOBUZ_STREAM_PATH,
    apiToken: env.QOBUZ_API_TOKEN,
    lastBabeBaseUrl: env.LASTBABE_BASE_URL ?? "https://lastbabe.velixir.run",
    monochromeBaseUrl: env.MONOCHROME_BASE_URL ?? "https://tracks.monochrome.st",
    deezerBaseUrl: env.DEEZER_BASE_URL ?? "https://dzr.tabs-vs-spaces.wtf",
    eljohnzcBaseUrl: env.ELJOHNZC_BASE_URL ?? "https://eljohnzc-addon.de.deplexo.com/4433c7caff7fd070309e",
    instableBaseUrl: env.INSTABLE_BASE_URL ?? "https://instable.arcod.xyz",
  };
}
