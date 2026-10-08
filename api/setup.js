export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "TELEGRAM_BOT_TOKEN is missing"
      });
    }

    if (!secret) {
      return res.status(500).json({
        ok: false,
        error: "TELEGRAM_WEBHOOK_SECRET is missing"
      });
    }

    const webhookUrl =
      "https://b2-express.vercel.app/api/telegram";

    // =========================
    // STEP 1: REMOVE OLD WEBHOOK
    // =========================

    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      {
        method: "POST"
      }
    );

    const deleteResult = await deleteResponse.json();

    console.log("Delete webhook:", deleteResult);

    // =========================
    // STEP 2: SET NEW WEBHOOK
    // =========================

    const setResponse = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ["chat_join_request"]
        })
      }
    );

    const setResult = await setResponse.json();

    console.log("Set webhook:", setResult);

    return res.status(200).json({
      ok: setResult.ok,
      webhookUrl: webhookUrl,
      deleteWebhook: deleteResult,
      telegram: setResult
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
