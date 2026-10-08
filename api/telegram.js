import crypto from "crypto";

export default async function handler(req, res) {
  console.log("=== TELEGRAM WEBHOOK HIT ===");

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      message: "Webhook is working"
    });
  }

  try {
    // =========================================
    // TELEGRAM WEBHOOK SECRET
    // =========================================

    const expectedSecret =
      process.env.TELEGRAM_WEBHOOK_SECRET;

    const receivedSecret =
      req.headers["x-telegram-bot-api-secret-token"];

    if (
      expectedSecret &&
      receivedSecret !== expectedSecret
    ) {
      console.log("❌ Invalid Telegram webhook secret");

      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    const update = req.body;

    console.log("Telegram update received");

    // =========================================
    // ENVIRONMENT VARIABLES
    // =========================================

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;

    const metaPixelId =
      process.env.META_PIXEL_ID;

    const metaAccessToken =
      process.env.META_CAPI_ACCESS_TOKEN;

    if (!redisUrl || !redisToken) {
      console.error(
        "❌ Redis environment variables missing"
      );

      return res.status(500).json({
        ok: false,
        error: "Redis configuration missing"
      });
    }

    if (!metaPixelId || !metaAccessToken) {
      console.error(
        "❌ Meta CAPI environment variables missing"
      );

      return res.status(500).json({
        ok: false,
        error: "Meta CAPI configuration missing"
      });
    }

    // =========================================
    // REDIS HELPER
    // =========================================

    async function redisCommand(command) {
      const response = await fetch(redisUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${redisToken}`
        },
        body: JSON.stringify(command)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
          "Redis request failed"
        );
      }

      return result;
    }

    // =========================================
    // SHA256 HELPER
    // =========================================

    function sha256(value) {
      return crypto
        .createHash("sha256")
        .update(String(value))
        .digest("hex");
    }

    // =========================================
    // META CAPI HELPER
    // =========================================

    async function sendMetaEvent(eventData) {
      const metaUrl =
        `https://graph.facebook.com/v23.0/${metaPixelId}/events`;

      const payload = {
        data: [eventData],
        access_token: metaAccessToken
      };

      console.log("=== META CAPI REQUEST ===");
      console.log(
        JSON.stringify({
          data: [
            {
              ...eventData,
              user_data: {
                ...eventData.user_data,
                external_id: "[HASHED]"
              }
            }
          ],
          access_token: "[HIDDEN]"
        })
      );

      const response = await fetch(metaUrl, {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(payload)
      });

      const result = await response.json();

      console.log("=== META CAPI RESPONSE ===");
      console.log(JSON.stringify(result));

      if (!response.ok) {
        throw new Error(
          result?.error?.message ||
          "Meta CAPI request failed"
        );
      }

      return result;
    }

    // =========================================
    // TELEGRAM JOIN REQUEST
    // =========================================

    if (update.chat_join_request) {
      const request =
        update.chat_join_request;

      const user =
        request.from || {};

      const channelId =
        request.chat?.id || null;

      const channelTitle =
        request.chat?.title || null;

      const userId =
        user.id || null;

      const username =
        user.username || null;

      const firstName =
        user.first_name || null;

      const lastName =
        user.last_name || null;

      const inviteLink =
        request.invite_link?.invite_link || null;

      const requestDate =
        request.date ||
        Math.floor(Date.now() / 1000);

      console.log(
        "=== JOIN REQUEST RECEIVED ==="
      );

      console.log(
        "Channel:",
        channelTitle
      );

      console.log(
        "Channel ID:",
        channelId
      );

      console.log(
        "User ID:",
        userId
      );

      console.log(
        "Username:",
        username
      );

      console.log(
        "Invite Link:",
        inviteLink
      );

      // =========================================
      // SAVE JOIN REQUEST
      // =========================================

      const joinData = {
        event: "telegram_join_request",

        channel_id: channelId,

        channel_title: channelTitle,

        telegram_user_id: userId,

        username: username,

        first_name: firstName,

        last_name: lastName,

        invite_link: inviteLink,

        request_date: requestDate,

        received_at:
          new Date().toISOString()
      };

      const joinRedisKey =
        inviteLink
          ? `telegram_join:${inviteLink}`
          : `telegram_join:user:${userId}:${requestDate}`;

      await redisCommand([
        "SET",
        joinRedisKey,
        JSON.stringify(joinData),
        "EX",
        "2592000"
      ]);

      console.log(
        "✅ Join request saved to Redis"
      );

      // =========================================
      // CHECK INVITE LINK
      // =========================================

      if (!inviteLink) {
        console.log(
          "⚠️ No invite link found"
        );

        return res.status(200).json({
          ok: true,
          message:
            "Join request saved, no invite link"
        });
      }

      // =========================================
      // FIND ATTRIBUTION
      // =========================================

      const attributionKey =
        `telegram_attribution:${encodeURIComponent(
          inviteLink
        )}`;

      console.log(
        "Looking for attribution:",
        attributionKey
      );

      const attributionResult =
        await redisCommand([
          "GET",
          attributionKey
        ]);

      let attribution = null;

      if (attributionResult?.result) {
        try {
          attribution =
            JSON.parse(
              attributionResult.result
            );
        } catch (error) {
          console.error(
            "❌ Attribution JSON parse error",
            error
          );
        }
      }

      if (!attribution) {
        console.log(
          "⚠️ No Meta attribution found"
        );

        return res.status(200).json({
          ok: true,
          message:
            "Join request saved, attribution not found"
        });
      }

      // =========================================
      // ATTRIBUTION LOGS
      // =========================================

      console.log(
        "=== META ATTRIBUTION FOUND ==="
      );

      console.log(
        "Tracking ID:",
        attribution.tracking_id
      );

      console.log(
        "Has FBC:",
        !!attribution.fbc
      );

      console.log(
        "Has FBP:",
        !!attribution.fbp
      );

      console.log(
        "Has FBCLID:",
        !!attribution.fbclid
      );

      console.log(
        "Has Client IP:",
        !!attribution.client_ip_address
      );

      console.log(
        "Has User Agent:",
        !!attribution.client_user_agent
      );

      // =========================================
      // META USER DATA
      // =========================================

      const userData = {};

      // FBC
      if (attribution.fbc) {
        userData.fbc =
          attribution.fbc;
      }

      // FBP
      if (attribution.fbp) {
        userData.fbp =
          attribution.fbp;
      }

      // REAL CLIENT IP FROM LANDING PAGE
      if (attribution.client_ip_address) {
        userData.client_ip_address =
          attribution.client_ip_address;
      }

      // REAL BROWSER USER AGENT
      if (attribution.client_user_agent) {
        userData.client_user_agent =
          attribution.client_user_agent;
      }

      // =========================================
      // TELEGRAM USER ID AS HASHED EXTERNAL ID
      // =========================================

      if (userId) {
        userData.external_id =
          sha256(userId);
      }

      // =========================================
      // META EVENT
      // =========================================

      const eventTime =
        Number(requestDate) ||
        Math.floor(Date.now() / 1000);

      const eventId =
        attribution.tracking_id ||
        `${userId}_${eventTime}`;

      const metaEvent = {
        event_name: "Subscribe",

        event_time: eventTime,

        event_id: eventId,

        action_source: "website",

        user_data: userData,

        custom_data: {
          telegram_user_id:
            String(userId || ""),

          telegram_username:
            username || "",

          telegram_channel_id:
            String(channelId || ""),

          telegram_channel_title:
            channelTitle || ""
        }
      };

      console.log(
        "=== SENDING META CAPI EVENT ==="
      );

      console.log(
        "Event:",
        metaEvent.event_name
      );

      console.log(
        "Event ID:",
        eventId
      );

      console.log(
        "Has External ID:",
        !!userData.external_id
      );

      console.log(
        "Has FBC:",
        !!userData.fbc
      );

      console.log(
        "Has FBP:",
        !!userData.fbp
      );

      console.log(
        "Has Client IP:",
        !!userData.client_ip_address
      );

      console.log(
        "Has User Agent:",
        !!userData.client_user_agent
      );

      // =========================================
      // SEND META CAPI
      // =========================================

      const metaResult =
        await sendMetaEvent(
          metaEvent
        );

      console.log(
        "✅ META SUBSCRIBE EVENT SENT"
      );

      console.log(
        "Events received:",
        metaResult?.events_received
      );

      return res.status(200).json({
        ok: true,

        telegram:
          "join_request_saved",

        attribution:
          "found",

        meta:
          "Subscribe_sent",

        events_received:
          metaResult?.events_received || 0
      });
    }

    // =========================================
    // OTHER TELEGRAM UPDATES
    // =========================================

    return res.status(200).json({
      ok: true,
      message: "Update received"
    });

  } catch (error) {

    console.error(
      "❌ TELEGRAM WEBHOOK ERROR"
    );

    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
