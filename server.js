import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// ⚙️ روابط الطبقات من Environment Variables داخل Vercel Dashboard
const EXECUTION_LAYER = process.env.EXECUTION_LAYER_URL;
const SMART_LAYER = process.env.SMART_LAYER_URL;
const MEMORY_BRIDGE = process.env.MEMORY_BRIDGE_URL;

// ✅ الصفحة الرئيسية لتأكيد التشغيل
app.get("/", (req, res) => {
  res.send("✅ Bilal AI Unified Backend is running and fully synchronized.");
});

// 💬 استقبال الرسائل والمعلومات التشغيلية
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // 🔍 تحليل ذكي عبر Smart Layer
    const smart = await fetch(SMART_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    }).then(r => r.json());

    // 💾 تنفيذ وحفظ في Execution Layer
    const exec = await fetch(EXECUTION_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat",
        content: smart.cleaned || message,
        context: smart.context || {},
        metadata: {
          priority: "auto",
          source: "bilal-external-backend",
          timestamp: new Date().toISOString()
        }
      })
    }).then(r => r.json());

    return res.json({
      status: "success ✅",
      layer_response: exec.status || "executed",
      memory_saved: exec.memory_saved || false,
      analyzed_by: smart.model || "Smart Layer AI"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 🧠 تحليل نصوص تشغيلية أو بيانات
app.post("/analyze", async (req, res) => {
  try {
    const { text } = req.body;

    const memory = await fetch(MEMORY_BRIDGE)
      .then(r => r.json())
      .catch(() => ({}));

    const exec = await fetch(EXECUTION_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "analysis",
        content: text,
        memory,
        metadata: {
          source: "bilal-external-backend/analyze",
          auto_update: true,
          timestamp: new Date().toISOString()
        }
      })
    }).then(r => r.json());

    return res.json({
      status: "analysis_complete ✅",
      result: exec.output,
      memory_saved: exec.memory_saved
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 🩺 مراقبة تلقائية لجميع الطبقات
setInterval(async () => {
  try {
    const layers = [
      { name: "Execution Layer", url: EXECUTION_LAYER + "/health" },
      { name: "Smart Layer", url: SMART_LAYER + "/health" },
      { name: "Memory Bridge", url: MEMORY_BRIDGE + "/health" }
    ];
    for (const l of layers) {
      const res = await fetch(l.url).then(r => r.text()).catch(() => "offline ❌");
      console.log(`[HEALTH] ${l.name} → ${res}`);
    }
  } catch (err) {
    console.log("[HEALTH ERROR]", err.message);
  }
}, 60000); // كل دقيقة

// 📦 Export لتعمل على Vercel Serverless
export default app;
