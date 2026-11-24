import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import cached from '../seed/ai-cache.json' with { type: 'json' };

// The AI only turns messy text into JSON fields. Rules decide everything else.
// Replies are cached by input hash so a demo can replay without a key or network.
const cache: Record<string, unknown> = { ...cached };

const providers = () => [
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant' },
  { name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite' },
];

export async function extractJson<T>(instructions: string, text: string): Promise<T> {
  const hash = createHash('sha256').update(instructions + '\n---\n' + text).digest('hex').slice(0, 16);
  if (hash in cache) return cache[hash] as T;

  const errors: string[] = [];
  for (const p of providers().filter((p) => p.key)) {
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: instructions + '\nReply with one JSON object only.' },
            { role: 'user', content: text },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      const out = JSON.parse(json.choices[0].message.content) as T;
      cache[hash] = out;
      try { writeFileSync('seed/ai-cache.json', JSON.stringify(cache, null, 2)); } catch { /* read-only on Lambda */ }
      return out;
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.length ? `AI failed: ${errors.join('; ')}` : 'No cached reply and no GROQ_API_KEY/GEMINI_API_KEY set');
}
