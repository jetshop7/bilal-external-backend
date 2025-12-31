import fetch from "node-fetch";

/**
 * B1 MEMORY-ENFORCED GPT ENDPOINT
 * Always:
 * 1) Query external memory
 * 2) Inject memory into GPT context
 * 3) Generate final answer
 */

export default async function handler(req, res) {
  // ===============================
  // CORS
  // ===============================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).send("✅ /api/memory-chat is running (B1 enforced)");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ===============================
    // INPUT
    // ===============================
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid message" });
    }

    // ===============================
    // 1️⃣ RETRIEVE EXTERNAL MEMORY (REAL)
    // ===============================
    let memories = [];

    try {
      const memoryRes = await fetch(
        process.env.EXECUTION_LAYER_URL + "/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: message,
            limit: 5
          })
        }
      );

      const memoryData = await memoryRes.json();
      memories = Array.isArray(memoryData?.results)
        ? memoryData.results
        : [];
    } catch (memoryErr) {
      console.error("Memory query failed:", memoryErr.message);
      memories = [];
    }

let memoryText;

if (memories.length > 0) {
  memoryText = memories.map(m => `- ${m.content}`).join("\n");
} else {
  // Fallback: load last memories (sanity check)
  try {
    const fallbackRes = await fetch(
      process.env.EXECUTION_LAYER_URL + "/query",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "",
          limit: 5
        })
      }
    );

    const fallbackData = await fallbackRes.json();
    const fallbackMemories = fallbackData?.results || [];

    memoryText = fallbackMemories.length
      ? fallbackMemories.map(m => `- ${m.content}`).join("\n")
      : "⚠️ الذاكرة الخارجية متصلة لكنها فارغة حاليًا.";
  } catch {
    memoryText = "⚠️ تعذر الوصول إلى الذاكرة الخارجية.";
  }
}

    // ===============================
    // 2️⃣ CALL OPENAI (CHAT COMPLETIONS – CORRECT)
    // ===============================
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                `أنت Bilal Executive AI.\n` +
                `يجب عليك استخدام الذاكرة الخارجية التالية قبل أي إجابة.\n\n` +
                `🧠 الذاكرة الخارجية:\n${memoryText}`
            },
            {
              role: "user",
              content: message
            }
          ]
        })
      }
    );

    const openaiJson = await openaiResponse.json();

    // ===============================
    // 3️⃣ EXTRACT FINAL TEXT
    // ===============================
    let finalText = "❌ لم يتم توليد رد.";

    if (
      openaiJson?.choices &&
      openaiJson.choices[0]?.message?.content
    ) {
      finalText = openaiJson.choices[0].message.content;
    }

    return res.status(200).json({
      status: "success",
      memory_used: memories.length,
      reply: finalText
    });

  } catch (err) {
    console.error("Fatal error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
