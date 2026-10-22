# B2 Express

Kundan-inspired dark/gold Telegram landing page with per-click invite links, Redis attribution storage, Telegram join-request webhook, and Meta Conversions API Subscribe events.

## Vercel environment variables

Set these in the B2 Express Vercel project (Production, and Preview if needed):

- `TELEGRAM_BOT_TOKEN` — token for the Telegram bot that creates invite links and receives updates.
- `TELEGRAM_CHAT_ID` — target Telegram channel/group ID. The bot must be an administrator and have permission to invite users/manage invite links.
- `KV_REST_API_URL` — Redis REST endpoint.
- `KV_REST_API_TOKEN` — Redis REST token.
- `META_PIXEL_ID` — `1098078499505737` (default in code, still set it explicitly in Vercel).
- `META_CAPI_ACCESS_TOKEN` — access token for this same Meta Pixel.
- `WEBHOOK_SETUP_SECRET` — a long random secret used to protect webhook setup.
- Optional: `META_GRAPH_API_VERSION` (defaults to `v24.0`), `META_TEST_EVENT_CODE` (only while testing).

Use a Redis database dedicated to this project, or at minimum unique keys. Do not expose tokens in frontend code or commit them to GitHub.

## Deploy and configure

1. Confirm Vercel imports this repository and deploys the `main` branch.
2. Add the environment variables above and redeploy.
3. Configure the Telegram webhook by POSTing to `/api/setup-webhook` with header `x-setup-secret: <WEBHOOK_SETUP_SECRET>`. Example:

   ```bash
   curl -X POST https://b2-express.vercel.app/api/setup-webhook \
     -H 'x-setup-secret: YOUR_WEBHOOK_SETUP_SECRET'
   ```

4. Visit the landing page with UTM parameters or `fbclid`, click Join, and submit a Telegram join request. Confirm Vercel logs show `Telegram join request saved` and, when Meta succeeds, `Meta CAPI Subscribe sent`.
5. Check Events Manager Test Events using `META_TEST_EVENT_CODE` during testing, then remove that variable for normal production reporting.

## Flow

Landing PageView → click Join → `/api/create-invite` creates a unique Telegram join-request link and saves attribution in Redis → Telegram sends `chat_join_request` to `/api/telegram` → subscriber is saved in Redis → Meta CAPI Subscribe is attempted.

This tracks a Telegram **channel/group join request**, not an incoming message in a personal Telegram inbox.