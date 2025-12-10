import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

// إنشاء Express
const app = express();
app.use(bodyParser.json());

// روابط Vercel ENV
const EXECUTION_LAYER = process.env.EXECUTION_LAYER_URL;
const SMART_LAYER = process.env.SMART_LAYER_URL;
const MEMORY_BRIDGE = process.env.MEMORY_BRIDGE_URL;

// مسار اختبار
app.get("/", (req, res) => {
  res.send("Bilal AI Backend is running.");
});

// API الرئيسي
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const smart = await fetch(SMART_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    }).then(r => r.json());

    const exec = await fetch(EXECUTION_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat",
        content: smart.cleaned || message
      })
    }).then(r => r.json());

    return res.json({
      status: "success",
      response: exec.output,
      memory_saved: exec.memory_saved || false
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// التصدير الإجباري حتى يتعرف Vercel على الـ Route
export default app;
