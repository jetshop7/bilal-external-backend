import fetch from "node-fetch";

export default async function handler(req, res) {
  // السماح بالطلبات الخارجية (CORS)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // اختبار سريع
  if (req.method === "GET") {
    return res
      .status(200)
      .send("✅ /api/memory-chat is running (B1 retrieval enforced)");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // 1️⃣ استرجاع الذاكرة من ai-execution-layer
    const memoryResponse = await fetch(
      `${process.env.EXECUTION_LAYER_URL}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: message,
          limit: 10
        })
      }
    );

    const memoryData = await memoryResponse.json();

    const memoryText =
      memoryData.results && memoryData.results.length > 0
        ? memoryData.results
            .map((r, i) => `(${i + 1}) ${r.content}`)
            .join("\n")
        : "لا توجد ذاكرة مطابقة.";

    // 2️⃣ إرسال الطلب إلى OpenAI (Responses API الصحيح)
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "output_text",
                  text:
                    "أنت Bilal Executive AI. استخدم فقط المعلومات القادمة من الذاكرة الخارجية للإجابة."
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `سؤال المستخدم:\n${message}\n\nالذاكرة الخارجية:\n${memoryText}`
                }
              ]
            }
          ]
        })
      }
    );

    const openaiData = await openaiResponse.json();

    // استخراج النص النهائي
    let finalText = "❌ لم يتم توليد رد.";

    if (openaiData.output) {
      for (const item of openaiData.output) {
        if (item.content) {
          for (const c of item.content) {
            if (c.type === "output_text") {
              finalText = c.text;
              break;
            }
          }
        }
      }
    }

    return res.status(200).json({
      status: "success",
      memory_used: memoryData.count || 0,
      reply: finalText
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
