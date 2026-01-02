/**
 * B1 MEMORY-ENFORCED GPT ENDPOINT
 * Phase 16 (Closed) + Phase 17.0 (Steps 1 → 5)
 * Central Memory = Source of Truth
 * Execution Layer = Mirror Read (READ ONLY)
 */

// ===============================
// PHASE 20.1 — MEMORY STRUCTURE FINALIZATION
// ===============================
const MEMORY_SCHEMA_VERSION = 1;

const MEMORY_TYPES = Object.freeze({
  CHAT: "chat",
  OBSERVATION_SNAPSHOT: "observation_snapshot"
});

const ENTITY_TYPES = Object.freeze({
  CONVERSATION: "conversation",
  SYSTEM_HEALTH: "system_health"
});

function computeLabel(executionObservationScore) {
  return executionObservationScore >= 0.8
    ? "high_activity"
    : executionObservationScore >= 0.4
    ? "medium_activity"
    : executionObservationScore > 0
    ? "low_activity"
    : "no_activity";
}

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
      .send("✅ /api/memory-chat is running (Phase 17.0)");
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
            memory_type: MEMORY_TYPES.CHAT,
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
    // PHASE 17.0 — STEP 3: OBSERVATION SCORE (READ ONLY)
    // ===============================
    let executionObservationScore = 0;

    if (executionMirrorCount >= 50) {
      executionObservationScore = 1.0;
    } else if (executionMirrorCount >= 20) {
      executionObservationScore = 0.6;
    } else if (executionMirrorCount > 0) {
      executionObservationScore = 0.3;
    } else {
      executionObservationScore = 0.0;
    }

    // ===============================
    // PHASE 17.0 — STEP 5: STABILITY GATE (READ ONLY)
    // ===============================
    const stability =
      executionObservationScore === 0
        ? "stable"
        : executionObservationScore < 0.5
        ? "monitor"
        : "unstable";
    
    // ===============================
    // PHASE 20.1 — NORMALIZED LABEL (SINGLE SOURCE)
    // ===============================
    const label = computeLabel(executionObservationScore);

    // ===============================
    // PHASE 18.0 — STEP 2: OBSERVATION TREND (READ ONLY)
    // ===============================
    let observationTrend = "unknown";

    try {
      const trendRes = await fetch(
        `${process.env.CENTRAL_MEMORY_URL}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memory_type: "observation_snapshot",
            limit: 5
          })
        }
      );

      const trendJson = await trendRes.json();
      const snapshots = Array.isArray(trendJson?.results)
        ? trendJson.results
        : [];

      if (snapshots.length >= 2) {
        const first =
          snapshots[snapshots.length - 1]?.metadata
            ?.execution_observation_score ?? 0;
        const last =
          snapshots[0]?.metadata
            ?.execution_observation_score ?? 0;

        if (last > first) observationTrend = "increasing";
        else if (last < first) observationTrend = "decreasing";
        else observationTrend = "stable";
      }
    } catch {
      observationTrend = "unknown";
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
                `المصدر الحتمي للقرار هو الذاكرة الخارجية (Central Memory) فقط.\n\n` +
                `🧠 الذاكرة المعتمدة:\n${memoryText}\n\n` +
                `📊 سياق تنفيذي (Read-Only | لا يؤثر على القرار):\n` +
                `- execution_logs_recent_count: ${executionMirrorCount}\n` +
                `- note: هذا السياق للمراقبة فقط ولا يُستخدم لاتخاذ القرار.`
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
            memory_type: MEMORY_TYPES.CHAT,
            entity_type: ENTITY_TYPES.CONVERSATION,
            status: "active",
            content: message,
            metadata: {
              schema_version: MEMORY_SCHEMA_VERSION,
              response: finalText,
              source: "memory_chat_phase20",
              saved_at: new Date().toISOString()
            }
          }
        })
      });
    } catch {}
    // ===============================
    // PHASE 18.0 — STEP 1: SAVE OBSERVATION SNAPSHOT (READ ONLY)
    // ===============================
    try {
      await fetch(`${process.env.CENTRAL_MEMORY_URL}/central-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record: {
            memory_type: MEMORY_TYPES.OBSERVATION_SNAPSHOT,
            entity_type: ENTITY_TYPES.SYSTEM_HEALTH,
            status: "active",
            content: "execution_observation_snapshot",
            metadata: {
              schema_version: MEMORY_SCHEMA_VERSION,
              execution_mirror_used: executionMirrorCount,
              execution_observation_score: executionObservationScore,
              stability,
              label,
              captured_at: new Date().toISOString()
            }
          }
        })
      });
    } catch {
      // silent — observation must never block
    }

    // ===============================
    // RESPONSE
    // ===============================
    return res.status(200).json({
      status: "success",
      memory_used: memories.length,

      execution_mirror_used: executionMirrorCount,
      execution_observation_score: executionObservationScore,

      observation: {
        execution_mirror_used: executionMirrorCount,
        execution_observation_score: executionObservationScore,
        label
      },

      stability,
      observation_trend: observationTrend,
      reply: finalText
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
