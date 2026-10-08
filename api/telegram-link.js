export default async function handler(req, res) {
  console.log("=== TELEGRAM LINK API HIT ===");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;

    if (!botToken) {
      console.error("❌ TELEGRAM_BOT_TOKEN missing");

      return res.status(500).json({
        ok: false,
        error: "Telegram bot token missing"
      });
    }

    if (!channelId) {
      console.error("❌ TELEGRAM_CHANNEL_ID missing");

      return res.status(500).json({
        ok: false,
        error: "Telegram channel ID missing"
      });
    }

    if (!redisUrl || !redisToken) {
      console.error("❌ Redis configuration missing");

      return res.status(500).json({
        ok: false,
        error: "Redis configuration missing"
      });
    }

    const body = req.body || {};

    const fbclid = body.fbclid || null;
    const fbc = body.fbc || null;
    const fbp = body.fbp || null;

    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const clientUserAgent =
      req.headers["user-agent"] || null;

    const trackingId =
      `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 12)}`;

    console.log("=== ATTRIBUTION DATA ===");
    console.log("Tracking ID:", trackingId);
    console.log("FBCLID:", fbclid ? "present" : "none");
    console.log("FBC:", fbc ? "present" : "none");
    console.log("FBP:", fbp ? "present" : "none");
    console.log("Client IP:", clientIp ? "present" : "none");
    console.log(
      "User Agent:",
      clientUserAgent ? "present" : "none"
    );

    // =========================================
    // TELEGRAM CREATE INVITE LINK
    // =========================================

    const telegramUrl =
      `https://api.telegram.org/bot${botToken}/createChatInviteLink`;

    const telegramResponse = await fetch(
      telegramUrl,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          chat_id: channelId,

          creates_join_request: true
        })
      }
    );

    const telegramResult =
      await telegramResponse.json();

    console.log("=== TELEGRAM RESPONSE ===");
    console.log(
      JSON.stringify(telegramResult)
    );

    if (
      !telegramResponse.ok ||
      !telegramResult.ok ||
      !telegramResult.result?.invite_link
    ) {
      throw new Error(
        telegramResult?.description ||
        "Telegram invite link creation failed"
      );
    }

    const inviteLink =
      telegramResult.result.invite_link;

    console.log(
      "✅ Invite Link:",
      inviteLink
    );

    // =========================================
    // REDIS ATTRIBUTION
    // =========================================

    const attribution = {
      tracking_id: trackingId,

      invite_link: inviteLink,

      fbclid: fbclid,

      fbc: fbc,

      fbp: fbp,

      client_ip_address: clientIp,

      client_user_agent: clientUserAgent,

      created_at:
        new Date().toISOString()
    };

    const attributionKey =
      `telegram_attribution:${encodeURIComponent(
        inviteLink
      )}`;

    const redisResponse =
      await fetch(redisUrl, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization:
            `Bearer ${redisToken}`
        },

        body: JSON.stringify([
          "SET",
          attributionKey,
          JSON.stringify(attribution),
          "EX",
          "2592000"
        ])
      });

    const redisResult =
      await redisResponse.json();

    if (!redisResponse.ok) {
      throw new Error(
        redisResult?.error ||
        "Redis save failed"
      );
    }

    console.log(
      "✅ Attribution saved to Redis"
    );

    console.log(
      "Redis Key:",
      attributionKey
    );

    // =========================================
    // IMPORTANT: FRONTEND RESPONSE
    // =========================================

    return res.status(200).json({
      ok: true,

      invite_link: inviteLink,

      inviteLink: inviteLink,

      tracking_id: trackingId
    });

  } catch (error) {
    console.error(
      "❌ TELEGRAM LINK API ERROR"
    );

    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Please try again."
    });
  }
}
