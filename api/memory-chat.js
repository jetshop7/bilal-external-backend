import fetch from "node-fetch";

function extractTextFromResponsesAPI(json) {
  // Best-effort extraction for Responses API output text
  if (json?.output_text) return json.output_text;

  const out = json?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
          if (c?.type === "text" && typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  // Fallback
  return null;
}

export default async function handler(req, res) {
  // CORS (helps for external testers)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).send("✅ /api/memory-chat is running (B1 retrieval enforced)");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { message, filters } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message (string) is required" });
    }

    const EXECUTION_LAYER_URL = process.env.EXECUTION_LAYER_URL;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!EXECUTION_LAYER_URL) {
      return res.status(500).json({ error: "Missing EXECUTION_LAYER_URL in Vercel env vars" });
    }

    // 1) Enforced retrieval from external memory
    const queryUrl = `${EXECUTION_LAYER_URL.replace(/\/$/, "")}/query`;
    const qBody = {
      query: message,
      ...(filters ? { filters } : {})
    };

    const memResp = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qBody)
    });

    const memJson = await memResp.json().catch(() => ({}));
    const results = memJson?.results || memJson?.data?.results || [];
    const count = memJson?.count ?? results?.length ?? 0;

    // Build a clean context block
    const top = Array.isArray(results) ? results.slice(0, 12) : [];
    const memoryContext = top
      .map((r, i) => {
        const id = r?.id || r?.record_id || `item_${i + 1}`;
        const content = r?.content || r?.text || "";
        const meta = r?.metadata ? JSON.stringify(r.metadata) : "";
        return `#${i + 1} [${id}]\n${content}\n${meta ? `meta: ${meta}` : ""}`.trim();
      })
      .join("\n\n---\n\n");

    // 2) If OPENAI_API_KEY exists => generate final answer using memory
    if (!OPENAI_API_KEY) {
      // If you prefer GPT to answer inside ChatGPT, return context only
      return res.status(200).json({
        status: "ok",
        mode: "context_only",
        memory_count: count,
        memory_context: memoryContext,
        raw_results: top
      });
    }

    const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const system = `
You are Bilal Executive AI.
You MUST answer the user using the external memory context when available.
If memory is empty, say clearly that no relevant records were found and propose what to store next.
Never invent records that are not in memory.
Respond in Arabic in a practical, step-by-step style.
`.trim();

    const user = `
USER QUESTION:
${message}

EXTERNAL MEMORY CONTEXT (may be empty):
${memoryContext || "[NO_RECORDS_FOUND]"}
`.trim();

    const oaResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: [{ type: "text", text: system }] },
          { role: "user", content: [{ type: "text", text: user }] }
        ]
      })
    });

    const oaJson = await oaResp.json().catch(() => ({}));
    const answer = extractTextFromResponsesAPI(oaJson);

    if (!oaResp.ok) {
      return res.status(500).json({
        status: "error",
        where: "openai_responses_api",
        http_status: oaResp.status,
        openai_error: oaJson,
        memory_count: count,
        memory_context: memoryContext
      });
    }

    return res.status(200).json({
      status: "success",
      mode: "retrieval_plus_answer",
      memory_count: count,
      answer: answer || "(No answer text returned from OpenAI)",
      used_memory: count > 0,
      memory_preview: top
    });
  } catch (err) {
    console.error("memory-chat error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
