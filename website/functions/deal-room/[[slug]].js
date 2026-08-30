export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const slug = requestUrl.pathname.split("/").filter(Boolean)[1] || "";
  const shell = await getShell(context);
  const apiUrl = String(context.env.DEALDROP_API_URL || "").replace(/\/+$/, "");

  if (!apiUrl || !/^[a-f0-9]{24}$/.test(slug)) {
    return shell;
  }

  let roomResponse;
  try {
    roomResponse = await fetch(`${apiUrl}/deal-rooms/public/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
  } catch (_error) {
    return shell;
  }

  const roomUrl = `${requestUrl.origin}/deal-room/${encodeURIComponent(slug)}`;
  if (!roomResponse.ok) {
    const status = roomResponse.status === 404 ? 404 : 503;
    const html = await shell.text();
    return htmlResponse(
      injectMetadata(html, {
        title: "Deal Room unavailable · DealDrop",
        description: "This public DealDrop Deal Room is unavailable.",
        roomUrl,
        imageUrl: `${requestUrl.origin}/favicon.svg`,
      }),
      status,
    );
  }

  let payload;
  try {
    payload = await roomResponse.json();
  } catch (_error) {
    return shell;
  }

  const room = payload && payload.data;
  if (!room || room.publicSlug !== slug) return shell;

  const html = await shell.text();
  const description = room.description || "Explore this public DealDrop collection.";
  const enrichedHtml = injectRoomData(
    injectMetadata(html, {
      title: `${room.name} · DealDrop`,
      description,
      roomUrl,
      imageUrl: room.coverImageUrl || `${requestUrl.origin}/favicon.svg`,
    }),
    room,
  );
  return htmlResponse(enrichedHtml, 200);
}

async function getShell(context) {
  if (context.env.ASSETS && typeof context.env.ASSETS.fetch === "function") {
    const assetUrl = new URL("/deal-room/index.html", context.request.url);
    return context.env.ASSETS.fetch(new Request(assetUrl));
  }

  return context.next();
}

function htmlResponse(html, status) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function injectMetadata(html, metadata) {
  let result = html;
  result = replaceElementAttribute(result, "room-document-title", "textContent", metadata.title);
  result = replaceElementAttribute(
    result,
    "room-description-meta",
    "content",
    metadata.description,
  );
  result = replaceElementAttribute(result, "room-og-title", "content", metadata.title);
  result = replaceElementAttribute(result, "room-og-description", "content", metadata.description);
  result = replaceElementAttribute(result, "room-og-url", "content", metadata.roomUrl);
  result = replaceElementAttribute(result, "room-og-image", "content", metadata.imageUrl);
  return replaceElementAttribute(result, "room-canonical", "href", metadata.roomUrl);
}

function replaceElementAttribute(html, elementId, attribute, value) {
  const escapedValue = escapeHtml(String(value));
  if (attribute === "textContent") {
    return html.replace(
      new RegExp(`(<title[^>]+id=["']${elementId}["'][^>]*>)[\\s\\S]*?(</title>)`, "i"),
      `$1${escapedValue}$2`,
    );
  }

  return html.replace(
    new RegExp(`(<[^>]+id=["']${elementId}["'][^>]*\\b${attribute}=["'])[^"']*(["'])`, "i"),
    `$1${escapedValue}$2`,
  );
}

function injectRoomData(html, room) {
  const serialized = JSON.stringify(room)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return html.replace(
    "window.__DEALDROP_PUBLIC_ROOM__ = null;",
    `window.__DEALDROP_PUBLIC_ROOM__ = ${serialized};`,
  );
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
