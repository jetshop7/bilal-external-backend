/**
 * B1 MEMORY-ENFORCED GPT ENDPOINT
 * Phase 16 (Closed) + Phase 17.0 Step 1
 * Central Memory = Source of Truth
 * Execution Layer = Mirror Read (READ ONLY)
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
    return res
      .status(200)
      .send("✅ /api/memory-chat is running (Phase 17.0 – Mirror Read)");
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
      return res.status(400).json({ error: "Invalid message" });
    }

    // ===============================
    // 1️⃣ QUERY CENTRAL MEMORY (SOURCE OF TRUTH)
    // ===============================
    let memories = [];

    try {
      const memoryRes = await fetch(
        `${process.env.CENTRAL_MEMORY_URL}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memory_type: "chat",
            limit: 5
          })
        }
      );

      const memoryJson = await memoryRes.json();
      memories = Array.isArray(memoryJson?.results)
        ? memoryJson.results
        : [];
    } catch {
      memories = [];
    }

    // ===============================
    // PHASE 16.2 — HARD MEMORY GUARD
    // ===============================
    if (!memories || memories.length === 0) {
      return res.status(412).json({
        status: "blocked",
        reason: "NO_EXTERNAL_MEMORY",
        message: "⛔ لا يمكن توليد إجابة بدون ذاكرة خارجية."
      });
    }

    // ===============================
    // PHASE 17.0 — MIRROR READ (EXECUTION LAYER) — READ ONLY
    // ===============================
    let executionMirrorCount = 0;

    try {
      const execRes = await fetch(
        `${process.env.EXECUTION_LAYER_URL}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memory_type: "execution_log",
            limit: 3
          })
        }
      );

      const execJson = await execRes.json();
      if (Array.isArray(execJson?.results)) {
        executionMirrorCount = execJson.results.length;
      }
    } catch {
      executionMirrorCount = 0;
    }

    // ===============================
    // MEMORY TEXT FOR GPT
    // ===============================
    const memoryText = memories
      .map(m => `- ${m.content}`)
      .join("\n");

    // ===============================
    // 2️⃣ CALL OPENAI
    // ===============================
    const openaiRes = await fetch(
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
                `يجب استخدام الذاكرة التالية قبل أي إجابة:\n\n${memoryText}`
            },
            {
              role: "user",
              content: message
            }
          ]
        })
      }
    );

    const openaiJson = await openaiRes.json();

    const finalText =
      openaiJson?.choices?.[0]?.message?.content ||
      "❌ لم يتم توليد رد.";

    // ===============================
    // 3️⃣ SAVE CHAT TO CENTRAL MEMORY
    // ===============================
    try {
      await fetch(`${process.env.CENTRAL_MEMORY_URL}/central-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record: {
            memory_type: "chat",
            entity_type: "conversation",
            status: "active",
            content: message,
            metadata: {
              response: finalText,
              source: "memory_chat_phase17",
              saved_at: new Date().toISOString()
            }
          }
        })
      });
    } catch {}

    // ===============================
    // RESPONSE
    // ===============================
    return res.status(200).json({
      status: "success",
      memory_used: memories.length,
      execution_mirror_used: executionMirrorCount,
      reply: finalText
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
