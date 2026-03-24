export const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
export const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || "llama-3.1-8b-instant";

export async function callGroq(messages, systemPrompt = "") {
  if (!GROQ_API_KEY) {
    throw new Error("Missing Groq API key. Set VITE_GROQ_API_KEY in .env.");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const apiMessage = data?.error?.message || data?.message || "Request failed.";
    throw new Error(`Groq API error (${res.status}): ${apiMessage}`);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Groq returned an empty response.");
  }

  return content;
}
