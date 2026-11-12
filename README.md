# Lossless Extension

A self-hosted lossless audio addon for Echo Music, powered by multi-provider streaming.

## Deploy to Cloudflare Workers

1. Connect this GitHub repository in **Cloudflare Dashboard → Workers & Pages → Create → Import a repository**.
2. Add the secret `QOBUZ_ID_SECRET` in **Settings → Variables and Secrets**. Generate a strong value with `openssl rand -hex 32`.
3. Deploy using the `wrangler.toml` configuration in this repository. The Worker URL will look like `https://lossless-extension.<account>.workers.dev`.

CLI deployment:

```bash
npm install
npx wrangler login
npx wrangler secret put QOBUZ_ID_SECRET
npm run deploy:worker
```

Test the deployment by opening `/health`; it should return `{"ok":true}`. Add the base Worker URL to Echo Music under **Settings → Sources → Add an Addon**.

## Configuration

The default provider mode is `multi`. Optional Worker variables:

| Variable | Default | Description |
| --- | --- | --- |
| `QOBUZ_PROVIDER` | `multi` | `multi`, `qobuzdl`, `http`, or `stub` |
| `QOBUZ_ID_SECRET` | built-in fallback | Secret used to sign track IDs; set a strong secret in production |
| `QOBUZ_UPSTREAM_BASE_URL` | Qobuz-DL endpoint | Qobuz-DL upstream base URL |
| `LASTBABE_BASE_URL` | LastBabe endpoint | LastBabe upstream base URL |
| `MONOCHROME_BASE_URL` | Monochrome endpoint | Monochrome upstream base URL |
| `DEEZER_BASE_URL` | Deezer endpoint | Deezer upstream base URL |
| `ELJOHNZC_BASE_URL` | Eljohnzc endpoint | Eljohnzc upstream base URL |
| `INSTABLE_BASE_URL` | Instable endpoint | Instable upstream base URL |
| `REQUEST_TIMEOUT_MS` | `6000` | Upstream request timeout |
| `UPSTREAM_RETRIES` | `1` | Retry count |
| `CACHE_TTL_SECONDS` | `300` | Search cache lifetime |

The `http` provider also requires `QOBUZ_API_BASE_URL`, `QOBUZ_SEARCH_PATH`, and `QOBUZ_STREAM_PATH`. Set `QOBUZ_API_TOKEN` as a secret if needed.

## Routes

| Prefix | Provider |
| --- | --- |
| `/` | Multi-provider |
| `/a` | Qobuz-DL |
| `/b` | LastBabe |
| `/c` | Monochrome |
| `/d` | Deezer |
| `/e` | Eljohnzc |
| `/f` | Instable |

Each addon exposes `GET /manifest.json`, `GET /search?q=<query>&quality=<quality>`, and `GET /stream/<id>`.

## Local development and tests

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
npm test
npm run build
npm run dev:worker
```

The original Node/Vercel entry point remains available; Cloudflare Workers uses `src/worker.ts`.

## Disclaimer

This community-maintained addon depends on third-party upstream providers, which may change or become unavailable. Users are responsible for complying with applicable laws and third-party terms. No audio files are stored by this addon.
