(function () {
  "use strict";

  var config = window.DEALDROP_SITE_CONFIG || {};
  var initialRoom = window.__DEALDROP_PUBLIC_ROOM__;
  var loading = document.getElementById("room-loading");
  var error = document.getElementById("room-error");
  var view = document.getElementById("room-view");

  function setHidden(element, hidden) {
    if (element) element.classList.toggle("is-hidden", hidden);
  }

  function getSlug() {
    var match = window.location.pathname.match(/\/deal-room\/([^/]+)\/?$/i);
    if (match && match[1]) return decodeURIComponent(match[1]);
    return new URLSearchParams(window.location.search).get("slug") || "";
  }

  function getApiUrl() {
    return typeof config.apiUrl === "string" ? config.apiUrl.replace(/\/+$/, "") : "";
  }

  function getCreatorContext() {
    var creator = new URLSearchParams(window.location.search).get("creator") || "";
    return /^[a-f0-9]{24}$/.test(creator) ? creator : "";
  }

  function getMerchantUrl(item) {
    if (!item.url || !item.source) return item.url || "";

    var apiUrl = getApiUrl();
    if (!apiUrl) return item.url;

    var params = new URLSearchParams({
      url: item.url,
      marketplace: item.source,
      room: getSlug(),
    });
    var creator = getCreatorContext();
    if (creator) params.set("creator", creator);
    if (item.productIdentityId) params.set("product", item.productIdentityId);
    if (item.listingId) params.set("listing", item.listingId);
    return apiUrl + "/merchant-links?" + params.toString();
  }

  function setMeta(id, value, attribute) {
    var element = document.getElementById(id);
    if (element && value) element.setAttribute(attribute, value);
  }

  function getRoomUrl(room) {
    var base = (config.siteUrl || window.location.origin || "").replace(/\/+$/, "");
    return base + "/deal-room/" + encodeURIComponent(room.publicSlug);
  }

  function updateMetadata(room) {
    var title = room.name + " · DealDrop";
    var description = room.description || "Explore this public DealDrop collection.";
    var roomUrl = getRoomUrl(room);
    var image = room.coverImageUrl || roomUrl.replace(/\/deal-room\/[^/]+$/, "/favicon.svg");

    document.title = title;
    setMeta("room-description-meta", description, "content");
    setMeta("room-og-title", title, "content");
    setMeta("room-og-description", description, "content");
    setMeta("room-og-url", roomUrl, "content");
    setMeta("room-og-image", image, "content");
    setMeta("room-canonical", roomUrl, "href");
  }

  function formatSource(source) {
    if (!source) return "Marketplace source unavailable";
    return source.replace(/_/g, " ").replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
  }

  function formatPrice(price, currency) {
    if (price === null || price === undefined || !Number.isFinite(Number(price))) {
      return "Price unavailable";
    }

    if (currency) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currency,
          maximumFractionDigits: 2,
        }).format(Number(price));
      } catch (_error) {
        return currency + " " + Number(price).toLocaleString();
      }
    }

    return Number(price).toLocaleString();
  }

  function formatAvailability(availability) {
    if (availability === "available") return "Available when last observed";
    if (availability === "unavailable") return "Unavailable when last observed";
    return "Availability unknown";
  }

  function getFallbackUrl() {
    if (config.appUrl) return config.appUrl;
    var agent = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(agent) && config.iosStoreUrl) return config.iosStoreUrl;
    if (/Android/i.test(agent) && config.androidStoreUrl) return config.androidStoreUrl;
    return config.siteUrl || "/";
  }

  function bindAppAction(link) {
    var deepLink = link.getAttribute("data-deep-link");
    var fallbackUrl = getFallbackUrl();
    link.setAttribute("href", fallbackUrl);

    if (!deepLink) return;

    link.addEventListener("click", function (event) {
      event.preventDefault();
      var returnedToPage = false;
      var startedAt = Date.now();

      function cleanUp() {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }

      function onVisibilityChange() {
        if (document.visibilityState === "hidden") {
          returnedToPage = true;
          cleanUp();
        }
      }

      document.addEventListener("visibilitychange", onVisibilityChange);
      window.location.href = deepLink;
      window.setTimeout(function () {
        if (!returnedToPage && Date.now() - startedAt >= 900) {
          cleanUp();
          window.location.href = fallbackUrl;
        }
      }, 1100);
    });
  }

  function createAction(label, item) {
    var link = document.createElement("a");
    link.className = "button button-small button-outline";
    link.textContent = label;

    if (!item.url) {
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("title", "This item has no marketplace URL available.");
      return link;
    }

    link.href = getFallbackUrl();
    link.setAttribute("data-deal-room-action", "true");
    link.setAttribute(
      "data-deep-link",
      "dealdrop://paste-product?url=" + encodeURIComponent(item.url),
    );
    return link;
  }

  function renderItem(item) {
    var article = document.createElement("article");
    article.className = "public-room-item";

    var media = document.createElement("div");
    media.className = "public-room-item-media";
    if (item.imageUrl) {
      var image = document.createElement("img");
      image.src = item.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      media.appendChild(image);
    } else {
      media.textContent = "D";
      media.setAttribute("aria-hidden", "true");
    }
    article.appendChild(media);

    var content = document.createElement("div");
    content.className = "public-room-item-content";

    var source = document.createElement("p");
    source.className = "public-room-item-source";
    source.textContent = formatSource(item.source);
    content.appendChild(source);

    var title = document.createElement("h3");
    title.textContent = item.title || "Saved DealDrop product";
    content.appendChild(title);

    var price = document.createElement("p");
    price.className = "public-room-item-price";
    price.textContent = formatPrice(item.currentPrice, item.currency);
    content.appendChild(price);

    var availability = document.createElement("p");
    availability.className = "public-room-item-availability";
    availability.textContent = formatAvailability(item.availability);
    content.appendChild(availability);

    if (item.recommendation && item.recommendation.decision) {
      var recommendation = document.createElement("p");
      recommendation.className = "public-room-item-recommendation";
      recommendation.textContent =
        item.recommendation.decision + " · " + item.recommendation.explanation;
      content.appendChild(recommendation);
    }

    var actions = document.createElement("div");
    actions.className = "public-room-item-actions";
    actions.appendChild(createAction("Track this", item));
    actions.appendChild(createAction("Save in DealDrop", item));
    if (item.url) {
      var marketplaceLink = document.createElement("a");
      marketplaceLink.className = "public-room-item-link";
      marketplaceLink.href = getMerchantUrl(item);
      marketplaceLink.target = "_blank";
      marketplaceLink.rel = "noopener noreferrer";
      marketplaceLink.textContent = "Open marketplace ↗";
      actions.appendChild(marketplaceLink);
    }
    content.appendChild(actions);
    article.appendChild(content);
    return article;
  }

  function renderRoom(room) {
    updateMetadata(room);
    document.getElementById("room-name").textContent = room.name;

    var description = document.getElementById("room-description");
    description.textContent = room.description || "";
    setHidden(description, !room.description);

    var owner = document.getElementById("room-owner");
    owner.textContent = room.ownerDisplayName ? "Curated by " + room.ownerDisplayName : "";
    setHidden(owner, !room.ownerDisplayName);

    var items = Array.isArray(room.items) ? room.items : [];
    document.getElementById("room-item-count").textContent =
      items.length + " " + (items.length === 1 ? "product" : "products");
    var list = document.getElementById("room-items-list");
    list.replaceChildren();

    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "public-room-empty";
      empty.textContent = "This Deal Room is ready for its first product.";
      list.appendChild(empty);
    } else {
      items.forEach(function (item) {
        list.appendChild(renderItem(item));
      });
    }

    var fallbackMessage =
      config.appUrl || config.iosStoreUrl || config.androidStoreUrl
        ? "The app link will open DealDrop or the appropriate store."
        : "Install or open DealDrop from your device to keep this collection with you.";
    document.getElementById("room-app-note").textContent = fallbackMessage;
    document.getElementById("room-cta-note").textContent = fallbackMessage;
    document.querySelectorAll("[data-deal-room-action]").forEach(bindAppAction);
    setHidden(loading, true);
    setHidden(error, true);
    setHidden(view, false);
  }

  function showError(title, message) {
    document.getElementById("room-error-title").textContent = title;
    document.getElementById("room-error-copy").textContent = message;
    setHidden(loading, true);
    setHidden(view, true);
    setHidden(error, false);
  }

  function loadRoom() {
    var slug = getSlug();
    if (!/^[a-f0-9]{24}$/.test(slug)) {
      showError(
        "This Deal Room link is invalid",
        "Ask the creator for a current public Deal Room link.",
      );
      return;
    }

    if (initialRoom) {
      renderRoom(initialRoom);
      return;
    }

    var apiUrl = getApiUrl();
    if (!apiUrl) {
      showError(
        "Public rooms are not configured yet",
        "The DealDrop web destination needs its API connection configured before it can load this room.",
      );
      return;
    }

    fetch(apiUrl + "/deal-rooms/public/" + encodeURIComponent(slug), {
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (response.status === 404) throw new Error("not_found");
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      })
      .then(function (payload) {
        if (!payload || !payload.data) throw new Error("unavailable");
        renderRoom(payload.data);
      })
      .catch(function (loadError) {
        if (loadError && loadError.message === "not_found") {
          showError(
            "This Deal Room is unavailable",
            "The room may be private or no longer available.",
          );
        } else {
          showError(
            "We couldn't load this Deal Room",
            "Check your connection and try the link again.",
          );
        }
      });
  }

  loadRoom();
})();
