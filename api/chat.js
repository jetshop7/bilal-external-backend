export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Bilal AI Backend is running /api/chat (serverless)");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // روابط الWorkers
    const SMART_LAYER = process.env.SMART_LAYER_URL;
    const MEMORY_BRIDGE = process.env.MEMORY_BRIDGE_URL;

    // 🔹 مرحلة 1: تنظيف وفلترة الرسالة عبر Smart Layer
    const smartResponse = await fetch(SMART_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const smart = await smartResponse.json();
    const cleanedMessage = smart.cleaned || message;

    // 🔹 مرحلة 2: إرسال الرسالة إلى Memory Bridge ليتم حفظها في نظام الذاكرة الكامل
    const bridgeResponse = await fetch(MEMORY_BRIDGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_record",
        content: cleanedMessage,
        source: "vercel-backend"
      })
    });

    const bridgeResult = await bridgeResponse.json();

    return res.status(200).json({
      status: "success",
      cleaned_message: cleanedMessage,
      memory_pipeline: "passed_to_bridge",
      bridge_response: bridgeResult
    });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
