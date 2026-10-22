async function redisCommand(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis environment variables are not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Redis command failed");
  return data.result;
}

async function sendMetaSubscribe(attribution, eventTime, eventId, telegramUserId) {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const allowedPixels = ["1098078499505737"];
  const requestedPixel = String(attribution?.pixel_id || process.env.META_PIXEL_ID || "1098078499505737");
  const pixelId = allowedPixels.includes(requestedPixel) ? requestedPixel : "1098078499505737";
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v24.0";
  const testEventCode = process.env.META_TEST_EVENT_CODE;
  if (!accessToken) throw new Error("META_CAPI_ACCESS_TOKEN is not configured");

  const userData = {};
  if (attribution?.fbp) userData.fbp = attribution.fbp;
  if (attribution?.fbc) userData.fbc = attribution.fbc;
  // Always provide a stable external_id: prefer the landing click ID, otherwise hash the Telegram user ID.
  const externalId = attribution?.click_id || (telegramUserId ? String(telegramUserId) : null);
  if (externalId) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(externalId.trim().toLowerCase()));
    userData.external_id = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const event = {
    event_name: "Subscribe",
    event_time: Number(eventTime) || Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: attribution?.landing_url || "https://b2-express.vercel.app/",
    user_data: userData
  };
  const payload = { data: [event] };
  if (testEventCode) payload.test_event_code = testEventCode;

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || "Meta CAPI request failed");
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const update = req.body;
    if (update?.chat_join_request) {
      const request = update.chat_join_request;
      const inviteLink = request.invite_link?.invite_link || null;
      let attribution = null;

      if (inviteLink) {
        try {
          const raw = await redisCommand(["GET", `invite:${inviteLink}`]);
          if (raw) {
            try { attribution = JSON.parse(raw); } catch { attribution = null; }
          }
        } catch (lookupError) {
          console.error("Redis attribution lookup failed:", lookupError.message);
        }
      }

      const subscriber = {
        telegram_user_id: request.from?.id || null,
        telegram_username: request.from?.username || null,
        chat_id: request.chat?.id || null,
        join_request_at: request.date ? new Date(request.date * 1000).toISOString() : new Date().toISOString(),
        invite_link: inviteLink,
        source: attribution?.source || null,
        campaign: attribution?.campaign || null,
        medium: attribution?.medium || null,
        content: attribution?.content || null,
        term: attribution?.term || null,
        click_id: attribution?.click_id || null,
        fbclid: attribution?.fbclid || null,
        fbp: attribution?.fbp || null,
        fbc: attribution?.fbc || null
      };

      const recordId = `${Date.now()}_${request.from?.id || "unknown"}`;
      try {
        await redisCommand(["SET", `subscriber:${recordId}`, JSON.stringify(subscriber), "EX", 60 * 60 * 24 * 90]);
      } catch (saveError) {
        console.error("Telegram join request Redis save failed:", saveError.message);
      }

      // Match the Kundan flow: send Subscribe only when this join request
      // can be linked to a landing-page click via the saved attribution record.
      if (attribution?.click_id) {
        const eventId = `subscriber_${attribution.click_id}`;
        try {
          const metaResult = await sendMetaSubscribe(attribution, request.date || Math.floor(Date.now() / 1000), eventId, request.from?.id);
          console.log("Meta CAPI Subscribe sent", {
            event_id: eventId,
            click_id: attribution.click_id,
            events_received: metaResult.events_received ?? null,
            matched_by_click_id: true
          });
        } catch (metaError) {
          console.error("Meta CAPI Subscribe failed:", metaError.message);
        }
      } else {
        console.log("Meta CAPI Subscribe skipped: no click attribution found", {
          chat_id: request.chat?.id || null,
          user_id: request.from?.id || null,
          invite_link_present: Boolean(inviteLink)
        });
      }

      console.log("Telegram join request saved", {
        chat_id: subscriber.chat_id,
        chat_title: request.chat?.title || null,
        user_id: subscriber.telegram_user_id,
        username: subscriber.telegram_username,
        source: subscriber.source,
        campaign: subscriber.campaign,
        click_id: subscriber.click_id
      });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return res.status(500).json({ ok: false, error: "Webhook processing failed" });
  }
}