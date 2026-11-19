export const json = (data: unknown, status = 200, headers?: HeadersInit) => {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
};

export const error = (message: string, status: number) => json({ error: message }, status);
