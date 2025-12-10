export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message } = req.body;

    // Debug
    console.log("Incoming message:", message);

    const execUrl = process.env.EXECUTION_LAYER_URL;
    const smartUrl = process.env.SMART_LAYER_URL;
    const memoryUrl = process.env.MEMORY_BRIDGE_URL;

    // 1️⃣ Smart Layer
    const smart = await fetch(smartUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }).then(r => r.json());

    // 2️⃣ Execution Layer
    const exec = await fetch(execUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat",
        content: smart.cleaned || message,
      }),
    }).then(r => r.json());

    return res.status(200).json({
      status: "success",
      response: exec.output || null,
      memory_saved: exec.memory_saved || false,
    });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
