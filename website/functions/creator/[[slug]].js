export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const slug = requestUrl.pathname.split("/").filter(Boolean)[1] || "";
  const shell = await getShell(context);
  const apiUrl = String(context.env.DEALDROP_API_URL || "").replace(/\/+$/, "");

  if (!apiUrl || !/^[a-f0-9]{24}$/.test(slug)) {
    return shell;
  }

  let creatorResponse;
  try {
    creatorResponse = await fetch(`${apiUrl}/creators/public/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
  } catch (_error) {
    return shell;
  }

  const creatorUrl = `${requestUrl.origin}/creator/${encodeURIComponent(slug)}`;
  if (!creatorResponse.ok) {
    const status = creatorResponse.status === 404 ? 404 : 503;
    const html = await shell.text();
    return htmlResponse(
      injectMetadata(html, {
        title: "Creator profile unavailable · DealDrop",
        description: "This public DealDrop creator profile is unavailable.",
        creatorUrl,
        imageUrl: `${requestUrl.origin}/favicon.svg`,
      }),
      status,
    );
  }

  let payload;
  try {
    payload = await creatorResponse.json();
  } catch (_error) {
    return shell;
  }

  const creator = payload && payload.data;
  if (!creator || creator.publicSlug !== slug) return shell;

  const rooms = Array.isArray(creator.rooms) ? creator.rooms : [];
  const firstRoomWithCover = rooms.find((room) => room && room.coverImageUrl);
  const html = await shell.text();
  const description =
    creator.bio || `Explore product collections curated by ${creator.displayName}.`;
  const enrichedHtml = injectCreatorData(
    injectMetadata(html, {
      title: `${creator.displayName} · DealDrop creator`,
      description,
      creatorUrl,
      imageUrl:
        creator.avatarUrl ||
        firstRoomWithCover?.coverImageUrl ||
        `${requestUrl.origin}/favicon.svg`,
    }),
    creator,
  );
  return htmlResponse(enrichedHtml, 200);
}

async function getShell(context) {
  if (context.env.ASSETS && typeof context.env.ASSETS.fetch === "function") {
    const assetUrl = new URL("/creator/index.html", context.request.url);
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
  result = replaceElementAttribute(result, "creator-document-title", "textContent", metadata.title);
  result = replaceElementAttribute(
    result,
    "creator-description-meta",
    "content",
    metadata.description,
  );
  result = replaceElementAttribute(result, "creator-og-title", "content", metadata.title);
  result = replaceElementAttribute(
    result,
    "creator-og-description",
    "content",
    metadata.description,
  );
  result = replaceElementAttribute(result, "creator-og-url", "content", metadata.creatorUrl);
  result = replaceElementAttribute(result, "creator-og-image", "content", metadata.imageUrl);
  return replaceElementAttribute(result, "creator-canonical", "href", metadata.creatorUrl);
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

function injectCreatorData(html, creator) {
  const serialized = JSON.stringify(creator)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return html.replace(
    "window.__DEALDROP_PUBLIC_CREATOR__ = null;",
    `window.__DEALDROP_PUBLIC_CREATOR__ = ${serialized};`,
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
