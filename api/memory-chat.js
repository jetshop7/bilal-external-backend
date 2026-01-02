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
// ===============================
// PHASE 21.0 — AUTO MEMORY GOVERNANCE (PILOT MODE) — STEP 1
// Kill Switch + One-Action Guard + Execution Gate (NO execution yet)
// ===============================
const AUTO_MEMORY_GOVERNANCE = Object.freeze({
  enabled: String(process.env.AUTO_MEMORY_GOVERNANCE || "false") === "true", // Kill Switch
  one_action_per_request: true, // always true in Pilot
});

// ===============================
// PHASE 20.4 — MEMORY POLICIES (BALANCED · READ ONLY)
// ===============================
const MEMORY_POLICIES = Object.freeze({
  mode: "balanced",

  safe_auto_actions: [
    "summarize_mid_term",
    "merge_exact_duplicates",
    "reduce_context_window",
    "reorder_priority"
  ],

  auth_required_actions: [
    "delete_memory",
    "merge_similar_analysis",
    "reclassify_memory",
    "drop_old_entries"
  ],

  forbidden_actions: [
    "delete_strategic_intelligence",
    "delete_financial_history",
    "modify_decision_records",
    "cleanup_without_trace"
  ]
});

// ===============================
// PHASE 20.4 — POLICY RULES MAPPING (READ ONLY)
// ===============================
function mapPolicyRules({ health, drift, policies }) {
  const rules = [];

  // Rule: Inflation
  if (health.inflation_risk === "high") {
    rules.push({
      when: "inflation_risk = high",
      allow: policies.safe_auto_actions.includes("summarize_mid_term")
        ? ["suggest_summarize_mid_term"]
        : [],
      deny: ["delete_memory"],
      explanation:
        "عند ارتفاع خطر التضخم، يُسمح باقتراح ضغط الذاكرة المتوسطة فقط دون حذف."
    });
  }

  // Rule: Duplication
  if (health.duplicate_ratio >= 0.25) {
    rules.push({
      when: "duplicate_ratio >= 0.25",
      allow: policies.safe_auto_actions.includes("merge_exact_duplicates")
        ? ["suggest_merge_exact_duplicates"]
        : [],
      deny: ["merge_similar_analysis"],
      explanation:
        "عند وجود تكرار ملحوظ، يُسمح باقتراح دمج المتطابق حرفيًا فقط، ويُمنع دمج التحليلات المتشابهة."
    });
  }

  // Rule: Drift
  if (drift?.topical_drift === "high") {
    rules.push({
      when: "topical_drift = high",
      allow: ["suggest_review_context"],
      deny: ["cleanup_without_trace"],
      explanation:
        "عند وجود انحراف موضوعي مرتفع، يُقترح مراجعة السياق دون أي تنظيف تلقائي."
    });
  }

  // Default rule
  if (rules.length === 0) {
    rules.push({
      when: "system_normal",
      allow: [],
      deny: [],
      explanation: "النظام في حالة طبيعية ولا يُقترح أي إجراء."
    });
  }

  return rules;
}
// ===============================
// PHASE 20.4 — POLICY CONFIDENCE EVALUATOR (3 LEVELS · READ ONLY)
// ===============================
function evaluatePolicyConfidence({ health, drift }) {
  // LOW confidence
  if (
    health.inflation_risk !== "high" &&
    health.duplicate_ratio < 0.25
  ) {
    return {
      level: "low",
      explanation:
        "المؤشرات ضعيفة أو أولية، لا يُنصح بأي اقتراح فعلي حاليًا."
    };
  }

  // HIGH confidence
  if (
    health.inflation_risk === "high" &&
    health.duplicate_ratio >= 0.5
  ) {
    return {
      level: "high",
      explanation:
        "المؤشرات قوية جدًا، ويمكن لاحقًا التفكير في اقتراحات قوية أو طلب تفويض."
    };
  }

  // MEDIUM confidence (default)
  return {
    level: "medium",
    explanation:
      "المؤشرات واضحة لكن غير حرجة، يُنصح باقتراحات محسوبة فقط."
  };
}
// ===============================
// PHASE 21.0 — EXECUTION GATE (STEP 1) — READ/DECIDE ONLY
// ===============================
function evaluateGovernanceGate({ policyConfidence, governanceConfig }) {
  // Kill Switch OFF => never allow
  if (!governanceConfig.enabled) {
    return {
      allowed: false,
      reason: "KILL_SWITCH_OFF",
      selected_action: null
    };
  }

  // One-action guard (Pilot rule)
  if (!governanceConfig.one_action_per_request) {
    return {
      allowed: false,
      reason: "ONE_ACTION_GUARD_DISABLED",
      selected_action: null
    };
  }

  // Confidence gate
  const level = policyConfidence?.level || "low";
  if (level === "low") {
    return {
      allowed: false,
      reason: "CONFIDENCE_LOW",
      selected_action: null
    };
  }

  // Allowed in Pilot (but we still won't execute in Step 1)
  return {
    allowed: true,
    reason: level === "high" ? "CONFIDENCE_HIGH" : "CONFIDENCE_MEDIUM",
    selected_action: null
  };
}
// ===============================
// PHASE 21.0 — SAFE ACTION SELECTOR (STEP 2 · DRY-RUN)
// ===============================
function selectSafeActionDryRun({ health, rules, confidence }) {
  // Gate: only medium or high confidence
  if (!confidence || confidence.level === "low") {
    return {
      selected_action: null,
      reason: "CONFIDENCE_TOO_LOW"
    };
  }

  // Priority 1: Inflation
  if (health.inflation_risk === "high") {
    return {
      selected_action: "summarize_mid_term",
      reason: "inflation_risk_high"
    };
  }

  // Priority 2: Duplication
  if (health.duplicate_ratio >= 0.25) {
    return {
      selected_action: "merge_exact_duplicates",
      reason: "duplicate_ratio_high"
    };
  }

  // Default
  return {
    selected_action: null,
    reason: "NO_SAFE_ACTION_MATCHED"
  };
}
// ===============================
// PHASE 21.0 — DECISION LOGGER (DRY-RUN ONLY)
// ===============================
async function logDecisionDryRun({
  centralMemoryUrl,
  decision,
  reason,
  confidence,
  memoryHealth,
  policies
}) {
  try {
    await fetch(`${centralMemoryUrl}/central-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record: {
          memory_type: DECISION_LOG_TYPE,
          entity_type: DECISION_ENTITY,
          status: "active",
          content: "auto_governance_decision",
          metadata: {
            mode: "dry_run",
            selected_action: decision,
            reason,
            policy_confidence: confidence,
            memory_health_snapshot: memoryHealth,
            applied_policies: policies.mode,
            recorded_at: new Date().toISOString()
          }
        }
      })
    });
  } catch {
    // Silent by design — decision logging must never block
  }
}

const ENTITY_TYPES = Object.freeze({
  CONVERSATION: "conversation",
  SYSTEM_HEALTH: "system_health"
});
// ===============================
// PHASE 21.0 — DECISION LOG TYPES
// ===============================
const DECISION_LOG_TYPE = "decision_log";
const DECISION_ENTITY = "auto_governance";

function computeLabel(executionObservationScore) {
  return executionObservationScore >= 0.8
    ? "high_activity"
    : executionObservationScore >= 0.4
    ? "medium_activity"
    : executionObservationScore > 0
    ? "low_activity"
    : "no_activity";
}
// ===============================
// PHASE 20.1 — WRITE VALIDATION (WHITELIST)
// ===============================
function validateMemoryWrite(memory_type, entity_type) {
  const validMemoryTypes = Object.values(MEMORY_TYPES);
  const validEntityTypes = Object.values(ENTITY_TYPES);

  if (!validMemoryTypes.includes(memory_type)) {
    throw new Error(`INVALID_MEMORY_TYPE: ${memory_type}`);
  }
  if (!validEntityTypes.includes(entity_type)) {
    throw new Error(`INVALID_ENTITY_TYPE: ${entity_type}`);
  }
}
// ===============================
// PHASE 20.2 — QUERY NORMALIZATION
// ===============================
function normalizeMemoryQuery({ memory_type, limit }) {
  const SAFE_LIMIT_MAX = 10;

  return {
    memory_type,
    limit:
      typeof limit === "number" && limit > 0
        ? Math.min(limit, SAFE_LIMIT_MAX)
        : 5,
    order_by: "created_at",
    order_dir: "desc"
  };
}
// ===============================
// PHASE 20.2 — MEMORY WINDOWING HELPERS
// ===============================
async function getShortTermMemory(fetchFn, memoryType) {
  const res = await fetchFn(
    `${process.env.CENTRAL_MEMORY_URL}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        normalizeMemoryQuery({
          memory_type: memoryType,
          limit: 3
        })
      )
    }
  );
  const json = await res.json();
  return Array.isArray(json?.results) ? json.results : [];
}

async function getMidTermMemory(fetchFn, memoryType) {
  const res = await fetchFn(
    `${process.env.CENTRAL_MEMORY_URL}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        normalizeMemoryQuery({
          memory_type: memoryType,
          limit: 10
        })
      )
    }
  );
  const json = await res.json();
  return Array.isArray(json?.results) ? json.results : [];
}
// ===============================
// PHASE 20.2 — CONTROLLED CONTEXT BUILDER
// ===============================
function buildContextMemory({
  shortTerm,
  midTerm,
  stability,
  observationTrend
}) {
  let context = [...shortTerm];

  const shouldExpand =
    stability !== "stable" ||
    observationTrend !== "stable" ||
    shortTerm.length < 2;

  if (shouldExpand && midTerm.length > 0) {
    context = [...context, ...midTerm];
  }

  return context;
}
// ===============================
// PHASE 20.3 — MEMORY HEALTH ANALYZER
// ===============================
function analyzeMemoryHealth({ shortTerm, midTerm, context }) {
  const shortCount = shortTerm.length;
  const midCount = midTerm.length;
  const contextCount = context.length;

  // حساب التكرار حسب content
  const contents = context.map(m => m.content);
  const uniqueCount = new Set(contents).size;
  const duplicateRatio =
    contextCount > 0
      ? Number(((contextCount - uniqueCount) / contextCount).toFixed(2))
      : 0;

  // مؤشر تضخم السياق (بسيط ومتحفظ)
  const inflationRisk =
    contextCount >= 8
      ? "high"
      : contextCount >= 5
      ? "medium"
      : "low";

  return {
    short_term_size: shortCount,
    mid_term_size: midCount,
    context_size: contextCount,
    duplicate_ratio: duplicateRatio,
    inflation_risk: inflationRisk
  };
}
// ===============================
// PHASE 20.3 — MEMORY DRIFT ANALYZER
// ===============================
function analyzeMemoryDrift({ shortTerm, midTerm }) {
  const normalize = text =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

  // كلمات السياق الفوري
  const shortTokens = shortTerm.flatMap(m => normalize(m.content));

  // كلمات السياق المتوسط
  const midTokens = midTerm.flatMap(m => normalize(m.content));

  const shortSet = new Set(shortTokens);
  const midSet = new Set(midTokens);

  // تقاطع المفردات
  const intersection = [...shortSet].filter(t => midSet.has(t));
  const overlapRatio =
    shortSet.size > 0
      ? Number((intersection.length / shortSet.size).toFixed(2))
      : 0;

  // مؤشرات الانحراف
  const topicalDrift = overlapRatio < 0.2 ? "high" : overlapRatio < 0.5 ? "medium" : "low";
  const stagnationRisk = shortSet.size < 5 && midSet.size > 20 ? "high" : "low";

  return {
    overlap_ratio: overlapRatio,
    topical_drift: topicalDrift,
    stagnation_risk: stagnationRisk
  };
}
// ===============================
// PHASE 20.3 — MEMORY RECOMMENDATION ENGINE (READ ONLY)
// ===============================
function generateMemoryRecommendations({ health, drift }) {
  const recommendations = [];

  if (health.inflation_risk === "high") {
    recommendations.push({
      type: "inflation",
      level: "warning",
      message: "يُنصح بتقليل حجم السياق أو ضغط الذاكرة المتوسطة (Mid-term)."
    });
  }

  if (health.duplicate_ratio >= 0.3) {
    recommendations.push({
      type: "deduplication",
      level: "suggestion",
      message: "يوجد تكرار ملحوظ في الذاكرة. يُنصح بدمج أو إزالة الإدخالات المتشابهة."
    });
  }

  if (drift?.topical_drift === "high") {
    recommendations.push({
      type: "drift",
      level: "warning",
      message: "الذاكرة بدأت تنحرف عن مواضيع الاستخدام الحالي."
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: "health",
      level: "ok",
      message: "الذاكرة في حالة جيدة ولا تحتاج إلى تدخل حاليًا."
    });
  }

  return recommendations;
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

    // ===============================// ===============================
// 1️⃣ QUERY CENTRAL MEMORY — SHORT TERM (SOURCE OF TRUTH)
// ===============================
let shortTermMemories = [];
let midTermMemories = [];

try {
  shortTermMemories = await getShortTermMemory(fetch, MEMORY_TYPES.CHAT);
  midTermMemories = await getMidTermMemory(fetch, MEMORY_TYPES.CHAT);
} catch {
  shortTermMemories = [];
  midTermMemories = [];
}

    // ===============================
    // PHASE 16.2 — HARD MEMORY GUARD
    // ===============================
    if (!shortTermMemories || shortTermMemories.length === 0) {
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
          body: JSON.stringify(
            normalizeMemoryQuery({
              memory_type: MEMORY_TYPES.OBSERVATION_SNAPSHOT,
              limit: 5
            })
          )

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
    const contextMemories = buildContextMemory({
      shortTerm: shortTermMemories,
      midTerm: midTermMemories,
      stability,
      observationTrend
    });

    const memoryText = contextMemories
      .map(m => `- ${m.content}`)
      .join("\n");
    // ===============================
    // PHASE 20.3 — MEMORY HEALTH SNAPSHOT (READ ONLY)
    // ===============================
    const memoryHealth = analyzeMemoryHealth({
      shortTerm: shortTermMemories,
      midTerm: midTermMemories,
      context: contextMemories
    });
    // ===============================
    // PHASE 20.3 — MEMORY DRIFT SNAPSHOT (READ ONLY)
    // ===============================
    const memoryDrift = analyzeMemoryDrift({
      shortTerm: shortTermMemories,
      midTerm: midTermMemories
    });
    // ===============================
    // PHASE 20.3 — MEMORY RECOMMENDATIONS (READ ONLY)
    // ===============================
    const memoryRecommendations = generateMemoryRecommendations({
      health: memoryHealth,
      drift: memoryDrift
    });
    // ===============================
    // PHASE 20.4 — POLICY RULES EVALUATION (READ ONLY)
    // ===============================
    const policy_rules = mapPolicyRules({
      health: memoryHealth,
      drift: memoryDrift,
      policies: MEMORY_POLICIES
    });
    // ===============================
    // PHASE 20.4 — POLICY CONFIDENCE LEVEL (READ ONLY)
    // ===============================
    const policy_confidence = evaluatePolicyConfidence({
      health: memoryHealth,
      drift: memoryDrift
    });
    // ===============================
    // PHASE 21.0 — GOVERNANCE GATE RESULT (STEP 1) — NO execution
    // ===============================
    const governance_gate = evaluateGovernanceGate({
      policyConfidence: policy_confidence,
      governanceConfig: AUTO_MEMORY_GOVERNANCE
    });
    // ===============================
    // PHASE 21.0 — DRY-RUN ACTION DECISION (STEP 2)
    // ===============================
    const dry_run_action = selectSafeActionDryRun({
      health: memoryHealth,
      rules: policy_rules,
      confidence: policy_confidence
    });
    // ===============================
    // PHASE 21.0 — LOG DRY-RUN DECISION (STEP 3)
    // ===============================
    if (dry_run_action?.selected_action) {
      await logDecisionDryRun({
        centralMemoryUrl: process.env.CENTRAL_MEMORY_URL,
        decision: dry_run_action.selected_action,
        reason: dry_run_action.reason,
        confidence: policy_confidence.level,
        memoryHealth,
        policies: memory_policies
      });
    }

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
      validateMemoryWrite(
        MEMORY_TYPES.CHAT,
        ENTITY_TYPES.CONVERSATION
      );
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
      validateMemoryWrite(
        MEMORY_TYPES.OBSERVATION_SNAPSHOT,
        ENTITY_TYPES.SYSTEM_HEALTH
      );
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
      memory_used: contextMemories.length,

      execution_mirror_used: executionMirrorCount,
      execution_observation_score: executionObservationScore,

      observation: {
        execution_mirror_used: executionMirrorCount,
        execution_observation_score: executionObservationScore,
        label
      },

      stability,
      observation_trend: observationTrend,
      memory_policies: MEMORY_POLICIES,
      policy_rules,
      policy_confidence,
      governance: {
        pilot_mode: true,
        kill_switch_enabled: AUTO_MEMORY_GOVERNANCE.enabled,
        one_action_per_request: AUTO_MEMORY_GOVERNANCE.one_action_per_request,
        gate: governance_gate,
        dry_run: {
          enabled: true,
          selected_action: dry_run_action.selected_action,
          reason: dry_run_action.reason
        }
      },

      memory_health: memoryHealth,
      memory_drift: memoryDrift,
      memory_recommendations: memoryRecommendations,
      reply: finalText
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
