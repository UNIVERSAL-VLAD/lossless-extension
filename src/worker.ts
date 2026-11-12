import { loadConfig, type Environment } from "./config.js";
import { homePage } from "./home.js";
import { TtlCache } from "./cache.js";
import { AppError, badRequest, notFound } from "./errors.js";
import { normalizeTrack, streamResponse, upstreamIdFromPublicId } from "./normalize.js";
import { createProvider, createSourceProvider } from "./providers/index.js";
import type { QobuzProvider, Quality, PublicTrack } from "./types.js";

export interface Env extends Environment {}

type Handler = (query: URLSearchParams, params: string[]) => Promise<Response>;
interface Route { pattern: RegExp; handler: Handler; }

// Keep provider instances and their in-memory caches alive between requests in the same Worker isolate.
let cachedRoutes: Route[] | undefined;

const manifests = {
  root: { id: "com.echomusic.lossless", name: "Lossless", version: "1.0.0" },
  qobuzdl: { id: "com.EchoMusic.qobuz.qobuzdl", name: "Qobuz-DL", version: "1.0.0" },
  lastbabe: { id: "com.EchoMusic.qobuz.lastbabe", name: "LastBabe", version: "1.0.0" },
  monochrome: { id: "com.EchoMusic.qobuz.monochrome", name: "Monochrome Lossless", version: "1.0.0" },
  deezer: { id: "com.EchoMusic.qobuz.deezer", name: "Deezer Fallback", version: "1.0.0" },
  eljohnzc: { id: "com.EchoMusic.qobuz.eljohnzc", name: "Eljohnzc Lossless", version: "1.0.0" },
  instable: { id: "com.EchoMusic.qobuz.instable", name: "Instable Lossless", version: "1.0.0" },
} as const;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...Object.fromEntries(new Headers(headers)) },
  });
}

function parseQuality(value?: string): Quality {
  const normalized = (value ?? "LOSSLESS").toUpperCase();
  if (normalized === "LOSSLESS" || normalized === "HIGH" || normalized === "LOW") return normalized;
  throw badRequest("quality must be LOSSLESS, HIGH, or LOW");
}

function createRoutes(config: ReturnType<typeof loadConfig>): Route[] {
  const routes: Route[] = [];
  const get = (pattern: RegExp, handler: Handler) => routes.push({ pattern, handler });

  get(/^\/$/, async () => new Response(homePage, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  get(/^\/health$/, async () => json({ ok: true }));

  const registerAddon = (prefix: string, provider: QobuzProvider, manifest: { id: string; name: string; version: string }) => {
    const searchCache = new TtlCache<PublicTrack[]>(config.cacheTtlMs);
    get(new RegExp(`^${prefix}/manifest\\.json$`), async () => json({
      ...manifest,
      resources: ["search", "stream"],
      allowDownloads: 0,
      settings: [{ key: "quality", type: "select", default: "lossless", options: [
        { label: "Lossless", value: "lossless" }, { label: "High", value: "high" }, { label: "Low", value: "low" },
      ] }],
    }, 200, { "Cache-Control": "public, max-age=3600, s-maxage=86400" }));

    get(new RegExp(`^${prefix}/search$`), async (params) => {
      const query = params.get("q")?.trim();
      if (!query) throw badRequest("q is required");
      const quality = parseQuality(params.get("quality") ?? undefined);
      const atmos = params.get("atmos") ?? "auto";
      const key = `${query}\u0000${quality}\u0000${atmos}`;
      const cached = searchCache.get(key);
      if (cached) return json({ tracks: cached }, 200, { "Cache-Control": "public, max-age=30, s-maxage=300, stale-while-revalidate=600" });
      try {
        const tracks = (await provider.search(query, quality, atmos)).flatMap(track => {
          try { return [normalizeTrack(track, config.idSecret)]; } catch { return []; }
        });
        searchCache.set(key, tracks);
        return json({ tracks }, 200, { "Cache-Control": "public, max-age=30, s-maxage=300, stale-while-revalidate=600" });
      } catch (error) {
        const stale = searchCache.getStale(key);
        if (stale) return json({ tracks: stale, stale: true }, 200, { "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=120" });
        throw error;
      }
    });

    get(new RegExp(`^${prefix}/stream/([^/]+)$`), async (params, [rawId]) => {
      const quality = parseQuality(params.get("quality") ?? undefined);
      const atmos = params.get("atmos") ?? "auto";
      const id = decodeURIComponent(rawId ?? "");
      if (!/^qobuz_[A-Za-z0-9_-]{10,120}$/.test(id)) throw notFound("track not found");
      const upstreamId = upstreamIdFromPublicId(id, config.idSecret);
      if (!upstreamId) throw notFound("track not available");
      const stream = await provider.getStream(upstreamId, quality, atmos);
      if (!stream) throw notFound("track not available");
      try { return json(streamResponse(stream, quality)); }
      catch { throw notFound("track has no playable rendition"); }
    });
  };

  registerAddon("", createProvider(config), manifests.root);
  registerAddon("/a", createSourceProvider(config, "qobuzdl"), manifests.qobuzdl);
  registerAddon("/b", createSourceProvider(config, "lastbabe"), manifests.lastbabe);
  registerAddon("/c", createSourceProvider(config, "monochrome"), manifests.monochrome);
  registerAddon("/d", createSourceProvider(config, "deezer"), manifests.deezer);
  registerAddon("/e", createSourceProvider(config, "eljohnzc"), manifests.eljohnzc);
  registerAddon("/f", createSourceProvider(config, "instable"), manifests.instable);
  return routes;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD")
      return json({ error: "method not allowed" }, 405, { Allow: "GET, HEAD" });
    try {
      const config = loadConfig(env);
      const url = new URL(request.url);
      cachedRoutes ??= createRoutes(config);
      for (const route of cachedRoutes) {
        const match = route.pattern.exec(url.pathname);
        if (match) {
          const response = await route.handler(url.searchParams, match.slice(1));
          return request.method === "HEAD" ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers }) : response;
        }
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      if (error instanceof AppError) return json({ error: error.message }, error.statusCode);
      const candidate = error as { statusCode?: unknown; status?: unknown };
      const status = typeof candidate?.statusCode === "number" ? candidate.statusCode :
        typeof candidate?.status === "number" ? candidate.status : 500;
      console.error(JSON.stringify({ level: "error", msg: error instanceof Error ? error.message : String(error) }));
      return json({ error: status >= 500 ? "upstream service unavailable" : "request failed" }, status);
    }
  },
};
