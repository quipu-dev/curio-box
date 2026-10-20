interface EventContext {
  request: Request;
}

export const onRequest = async ({ request }: EventContext): Promise<Response> => {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const remoteRes = await fetch(url, { redirect: 'follow' });
    const headers = new Headers(remoteRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(remoteRes.body, {
      status: remoteRes.status,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Proxy Error: ${msg}`, { status: 502 });
  }
};
