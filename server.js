import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Load env vars
const EXECUTION_LAYER = process.env.EXECUTION_LAYER_URL;
const SMART_LAYER = process.env.SMART_LAYER_URL;
const MEMORY_BRIDGE = process.env.MEMORY_BRIDGE_URL;

// Debug log for Vercel
console.log("ENV CHECK:", { EXECUTION_LAYER, SMART_LAYER, MEMORY_BRIDGE });

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // Safety check
    if (!SMART_LAYER || !EXECUTION_LAYER) {
      return res.status(500).json({ 
        status: "error",
        message: "Environment Variables missing for Workers"
      });
    }

    // SMART LAYER
    const smart = await fetch(SMART_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    }).then(r => r.json());

    // EXECUTION LAYER
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
      response: exec.output || null,
      memory_saved: exec.memory_saved || false
    });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ANALYZE endpoint
app.post("/analyze", async (req, res) => {
  try {
    const { text } = req.body;

    // MEMORY BRIDGE must POST
    const memory = await fetch(MEMORY_BRIDGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_memory" })
    }).then(r => r.json())
      .catch(() => ({}));

    const exec = await fetch(EXECUTION_LAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "analysis",
        content: text,
        memory
      })
    }).then(r => r.json());

    return res.json({
      status: "analysis_complete",
      result: exec.output,
      memory_saved: exec.memory_saved
    });

  } catch (err) {
    console.error("ANALYZE ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Default route
app.get("/", (req, res) => {
  res.send("Bilal AI Backend is running.");
});

// Server
app.listen(3000, () => console.log("Server running on port 3000"));
