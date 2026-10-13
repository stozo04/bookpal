// Reads a server-sent event stream from fetch, calling back per event.
export async function readEvents(response: Response, onEvent: (event: string, data: Record<string, unknown>) => void) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = block.match(/^event: (.*)$/m)?.[1] ?? "message";
      try {
        onEvent(event, JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "{}"));
      } catch {}
    }
  }
}
