export default async function handler(req, res) {
  // منع الطرق غير المسموح بها
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

    // روابط الWorkers من متغيرات البيئة
    const EXECUTION_LAYER = process.env.EXECUTION_LAYER_URL;
    const SMART_LAYER = process.env.SMART_LAYER_URL;
    const MEMORY_BRIDGE = process.env.MEMORY_BRIDGE_URL;

    // إرسال النص إلى smart layer
    const smartResponse = await fetch(SMART_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const smart = await smartResponse.json();

    // إرسال للExecution Layer
    const execResponse = await fetch(EXECUTION_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat",
        content: smart.cleaned || message
      })
    });

    const exec = await execResponse.json();

    return res.status(200).json({
      status: "success",
      cleaned_message: smart.cleaned,
      response: exec.output,
      memory_saved: exec.memory_saved || false
    });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
