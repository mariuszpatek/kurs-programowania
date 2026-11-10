// Anthropic and OpenRouter behind one shape, so the student's ask() / chat() does not care which one
// the teacher picked; used by `llm` (ask() / chat()) and `assistant` (the tutor). Pure functions (no Deno,
// no network), tested in tests/llm-providers.test.ts.

export type Provider = 'anthropic' | 'openrouter';
export type Message = { role: 'user' | 'assistant'; content: string };
export type Effort = 'low' | 'medium' | 'high';
/** `effort` comes from the dashboard settings, the rest from the student's ask() / chat(). */
export type LlmRequest = { messages: Message[]; system?: string; temperature?: number; max_tokens: number; effort?: Effort };
export type LlmResult = { text: string; input_tokens: number; output_tokens: number; stop_reason: string; cost_usd: number | null };
export type Prices = { input_price_per_mtok: number; output_price_per_mtok: number };

// Newer models (e.g. Claude Haiku 5.5) think before answering and the thinking counts toward max_tokens,
// so the default leaves room for it; a tiny max_tokens can end before any text.
export const LIMITS = { messages: 40, chars: 24000, maxTokens: 4096, defaultMaxTokens: 1024 };

/** Checks what came from the browser; returns an error message in Polish, or the cleaned request. */
export function parseRequest(body: unknown): LlmRequest | string {
  const b = body as Record<string, unknown> | null;
  const raw = b?.messages;
  if (!Array.isArray(raw) || !raw.length) return 'chat() potrzebuje niepustej listy wiadomości.';
  if (raw.length > LIMITS.messages) return `Za długa rozmowa: najwyżej ${LIMITS.messages} wiadomości.`;
  const messages: Message[] = [];
  for (const [i, m] of raw.entries()) {
    const role = (m as Message)?.role;
    const content = (m as Message)?.content;
    if (role !== 'user' && role !== 'assistant') return `Wiadomość ${i + 1}: role musi być "user" albo "assistant".`;
    if (typeof content !== 'string' || !content.trim()) return `Wiadomość ${i + 1}: content musi być niepustym tekstem.`;
    messages.push({ role, content });
  }
  if (messages.at(-1)!.role !== 'user') return 'Ostatnia wiadomość musi mieć role "user".';
  const system = typeof b?.system === 'string' && b.system.trim() ? b.system : undefined;
  const total = messages.reduce((n, m) => n + m.content.length, system?.length ?? 0);
  if (total > LIMITS.chars) return `Za długi tekst: najwyżej ${LIMITS.chars} znaków razem.`;
  let temperature: number | undefined;
  if (b?.temperature !== undefined && b?.temperature !== null) {
    temperature = Number(b.temperature);
    if (!(temperature >= 0 && temperature <= 1)) return 'temperature musi być liczbą od 0 do 1.';
  }
  const requested = Number(b?.max_tokens ?? LIMITS.defaultMaxTokens);
  if (!(requested >= 1)) return 'max_tokens musi być liczbą dodatnią.';
  return { messages, system, temperature, max_tokens: Math.min(Math.floor(requested), LIMITS.maxTokens) };
}

/** URL, headers and body for the provider's HTTP API. */
export function buildCall(provider: Provider, model: string, apiKey: string, req: LlmRequest) {
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: {
        model,
        max_tokens: req.max_tokens,
        messages: req.messages,
        ...(req.system ? { system: req.system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      },
    };
  }
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'X-Title': 'Kurs programowania' },
    body: {
      model,
      max_tokens: req.max_tokens,
      messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages],
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.effort ? { reasoning: { effort: req.effort } } : {}),
      usage: { include: true },
    },
  };
}

/**
 * Newer models reject sampling parameters (Claude Haiku 5.5: any temperature other than 1) and older
 * ones reject effort (Claude Haiku 4.5). After a 400 the call is repeated once without them; returns
 * that request and what was dropped, or null when there is nothing to drop.
 */
export function withoutOptionalParams(req: LlmRequest): { request: LlmRequest; dropped: string[] } | null {
  const dropped = [...(req.temperature !== undefined ? ['temperature'] : []), ...(req.effort ? ['effort'] : [])];
  if (!dropped.length) return null;
  const { temperature: _t, effort: _e, ...rest } = req;
  return { request: rest, dropped };
}

/** The provider's JSON response in one shape. Throws when it has no text. */
export function parseResponse(provider: Provider, data: any): LlmResult {
  if (provider === 'anthropic') {
    const text = (data?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('');
    if (!Array.isArray(data?.content)) throw new Error('Anthropic: odpowiedź bez treści');
    return {
      text,
      input_tokens: Number(data.usage?.input_tokens ?? 0),
      output_tokens: Number(data.usage?.output_tokens ?? 0),
      stop_reason: String(data.stop_reason ?? ''),
      cost_usd: null,
    };
  }
  const choice = data?.choices?.[0];
  if (!choice) throw new Error('OpenRouter: odpowiedź bez treści');
  const cost = Number(data.usage?.cost);
  return {
    text: String(choice.message?.content ?? ''),
    input_tokens: Number(data.usage?.prompt_tokens ?? 0),
    output_tokens: Number(data.usage?.completion_tokens ?? 0),
    // "length" in OpenAI-style APIs means the same as "max_tokens" in Anthropic's
    stop_reason: choice.finish_reason === 'length' ? 'max_tokens' : String(choice.finish_reason ?? ''),
    cost_usd: Number.isFinite(cost) ? cost : null,
  };
}

/** Cost reported by the provider, or computed from token counts and the prices set in the dashboard. */
export function costOf(result: LlmResult, prices: Prices): number {
  if (result.cost_usd !== null) return result.cost_usd;
  return (result.input_tokens * prices.input_price_per_mtok + result.output_tokens * prices.output_price_per_mtok) / 1_000_000;
}

/** Error from the provider in words a student understands; `status` decides what the student gets back. */
export function providerError(status: number): { status: number; message: string } {
  if (status === 401 || status === 403) return { status: 502, message: 'Klucz API dostawcy modelu jest nieprawidłowy. Napisz do nauczyciela.' };
  if (status === 402) return { status: 502, message: 'Na koncie dostawcy modelu skończyły się środki. Napisz do nauczyciela.' };
  if (status === 429) return { status: 429, message: 'Dostawca modelu przyjmuje teraz za dużo zapytań. Spróbuj za chwilę.' };
  if (status === 529 || status >= 500) return { status: 503, message: 'Model jest chwilowo przeciążony albo niedostępny. Spróbuj za chwilę.' };
  return { status: 502, message: `Dostawca modelu odrzucił zapytanie (błąd ${status}).` };
}
