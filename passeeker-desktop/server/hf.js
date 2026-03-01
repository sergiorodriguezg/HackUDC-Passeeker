export async function generateHFPassphrase(hfToken) {
  const token = String(hfToken || "").trim();
  if (!token) throw new Error("HF token missing");

  const model = "mistralai/Mistral-7B-Instruct-v0.2";
  const url = `https://api-inference.huggingface.co/models/${model}`;

  const prompt =
    "Generate ONE memorable passphrase. " +
    "Format: 4 random words separated by hyphens + 2 digits at the end. " +
    "No explanations. Example: river-falcon-mint-satellite-42";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 30, temperature: 0.9, return_full_text: false }
    })
  });

  if (!res.ok) throw new Error(`HF error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = Array.isArray(data)
    ? (data[0]?.generated_text ?? "")
    : (data.generated_text ?? data[0]?.generated_text ?? "");

  const oneLine = String(text).trim().split("\n")[0].trim();
  if (!oneLine) throw new Error("HF returned empty");
  return oneLine;
}