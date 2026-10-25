// ai-engine.js

// 1. PDF TEXT EXTRACTOR USING PDF.JS (Client-Side)
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';

export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }
  return fullText;
}


// 2. 3-TIER AI ENGINE (Groq -> Gemini -> OpenRouter)
export async function callAIWithFallbacks(messages, studyModePrompt, apiKeys) {
  // apiKeys object format: { groqKey, geminiKey, openrouterKey }
  
  // Try 1: Groq (Primary - Ultra Fast Llama 3.3)
  if (apiKeys.groqKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKeys.groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: studyModePrompt }, ...messages],
          temperature: 0.7
        })
      });
      if (response.ok) {
        const data = await response.json();
        return { text: data.choices[0].message.content, provider: "Groq (Llama 3.3)" };
      }
    } catch (err) {
      console.warn("Groq failed, switching to Backup 1 (Gemini)...", err);
    }
  }

  // Try 2: Google Gemini (Backup 1)
  if (apiKeys.geminiKey) {
    try {
      // Format messages for Gemini API
      const geminiContents = messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKeys.geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: studyModePrompt }] },
          contents: geminiContents
        })
      });
      if (response.ok) {
        const data = await response.json();
        return { text: data.candidates[0].content.parts[0].text, provider: "Google Gemini" };
      }
    } catch (err) {
      console.warn("Gemini failed, switching to Backup 2 (OpenRouter)...", err);
    }
  }

  // Try 3: OpenRouter (Backup 2 - Free models like Mistral or Qwen)
  if (apiKeys.openrouterKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKeys.openrouterKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistralai/mistral-7b-instruct:free",
          messages: [{ role: "system", content: studyModePrompt }, ...messages]
        })
      });
      if (response.ok) {
        const data = await response.json();
        return { text: data.choices[0].message.content, provider: "OpenRouter (Free Tier)" };
      }
    } catch (err) {
      console.error("All AI providers failed:", err);
    }
  }

  throw new Error("All AI providers failed or no valid API keys were provided.");
}
