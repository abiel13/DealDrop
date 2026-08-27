(function () {
  "use strict";

  var config = window.DEALDROP_SITE_CONFIG || {};
  var initialCreator = window.__DEALDROP_PUBLIC_CREATOR__;
  var loading = document.getElementById("creator-loading");
  var error = document.getElementById("creator-error");
  var view = document.getElementById("creator-view");

  function setHidden(element, hidden) {
    if (element) element.classList.toggle("is-hidden", hidden);
  }

  function getSlug() {
    var match = window.location.pathname.match(/\/creator\/([^/]+)\/?$/i);
    if (match && match[1]) return decodeURIComponent(match[1]);
    return new URLSearchParams(window.location.search).get("slug") || "";
  }

  function getApiUrl() {
    return typeof config.apiUrl === "string" ? config.apiUrl.replace(/\/+$/, "") : "";
  }

  function getCreatorUrl(creator) {
    var base = (config.siteUrl || window.location.origin || "").replace(/\/+$/, "");
    return base + "/creator/" + encodeURIComponent(creator.publicSlug);
  }

  function setMeta(id, value, attribute) {
    var element = document.getElementById(id);
    if (element && value) element.setAttribute(attribute, value);
  }

  function updateMetadata(creator) {
    var title = creator.displayName + " · DealDrop creator";
    var description =
      creator.bio || "Explore useful product collections from this DealDrop creator.";
    var creatorUrl = getCreatorUrl(creator);
    var firstRoom = Array.isArray(creator.rooms) ? creator.rooms[0] : null;
    var image =
      creator.avatarUrl ||
      (firstRoom && firstRoom.coverImageUrl) ||
      creatorUrl.replace(/\/creator\/[^/]+$/, "/favicon.svg");

    document.title = title;
    setMeta("creator-description-meta", description, "content");
    setMeta("creator-og-title", title, "content");
    setMeta("creator-og-description", description, "content");
    setMeta("creator-og-url", creatorUrl, "content");
    setMeta("creator-og-image", image, "content");
    setMeta("creator-canonical", creatorUrl, "href");
  }

  function formatSource(source) {
    if (!source) return "Marketplace unavailable";
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

  function availabilityLabel(availability) {
    if (availability === "available") return "Available when last observed";
    if (availability === "unavailable") return "Sold out or unavailable";
    return "Availability unknown";
  }

  function formatPriceChange(item) {
    var percent = Number(item.priceChangePercent);
    if (!Number.isFinite(percent) || percent === 0 || item.lastUpdateType !== "price_changed") {
      return "";
    }
    return (percent < 0 ? "↓ " : "↑ ") + Math.abs(percent * 100).toFixed(1) + "%";
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
      var leftPage = false;
      var startedAt = Date.now();

      function onVisibilityChange() {
        if (document.visibilityState === "hidden") {
          leftPage = true;
          document.removeEventListener("visibilitychange", onVisibilityChange);
        }
      }

      document.addEventListener("visibilitychange", onVisibilityChange);
      window.location.href = deepLink;
      window.setTimeout(function () {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (!leftPage && Date.now() - startedAt >= 900) window.location.href = fallbackUrl;
      }, 1100);
    });
  }

  function createItemPreview(item) {
    var row = document.createElement("li");
    row.className = "creator-product-preview";

    var copy = document.createElement("div");
    var title = document.createElement("strong");
    title.textContent = item.title || "Saved DealDrop product";
    copy.appendChild(title);
    var source = document.createElement("span");
    source.textContent = formatSource(item.source);
    copy.appendChild(source);

    var details = document.createElement("div");
    details.className = "creator-product-details";
    var price = document.createElement("strong");
    price.textContent = formatPrice(item.currentPrice, item.currency);
    details.appendChild(price);
    var availability = document.createElement("span");
    availability.textContent = availabilityLabel(item.availability);
    if (item.availability === "unavailable") availability.className = "is-unavailable";
    details.appendChild(availability);

    var change = formatPriceChange(item);
    if (change) {
      var changeCopy = document.createElement("span");
      changeCopy.className = Number(item.priceChange) < 0 ? "is-price-drop" : "is-price-rise";
      changeCopy.textContent = change;
      details.appendChild(changeCopy);
    }

    row.appendChild(copy);
    row.appendChild(details);
    return row;
  }

  function createCollection(room, creator) {
    var article = document.createElement("article");
    article.className = "creator-collection-card";

    var items = Array.isArray(room.items) ? room.items : [];
    var fallbackImage = items.find(function (item) {
      return item.imageUrl;
    });
    var imageUrl = room.coverImageUrl || (fallbackImage && fallbackImage.imageUrl);
    var media = document.createElement("div");
    media.className = "creator-collection-media";
    if (imageUrl) {
      var image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      media.appendChild(image);
    } else {
      media.textContent = "D";
      media.setAttribute("aria-hidden", "true");
    }
    article.appendChild(media);

    var content = document.createElement("div");
    content.className = "creator-collection-content";
    var eyebrow = document.createElement("p");
    eyebrow.className = "creator-collection-eyebrow";
    eyebrow.textContent = items.length + " " + (items.length === 1 ? "product" : "products");
    content.appendChild(eyebrow);
    var heading = document.createElement("h2");
    heading.textContent = room.name;
    content.appendChild(heading);
    if (room.description) {
      var description = document.createElement("p");
      description.className = "creator-collection-description";
      description.textContent = room.description;
      content.appendChild(description);
    }

    if (items.length > 0) {
      var previews = document.createElement("ul");
      previews.className = "creator-product-previews";
      items.slice(0, 4).forEach(function (item) {
        previews.appendChild(createItemPreview(item));
      });
      content.appendChild(previews);
    }

    var actions = document.createElement("div");
    actions.className = "creator-collection-actions";
    var open = document.createElement("a");
    open.className = "button button-small button-dark";
    var roomParams = new URLSearchParams({ creator: creator.publicSlug });
    open.href = "/deal-room/" + encodeURIComponent(room.publicSlug) + "?" + roomParams.toString();
    open.textContent = "Open collection ↗";
    actions.appendChild(open);
    var save = document.createElement("a");
    save.className = "button button-small button-outline";
    save.href = getFallbackUrl();
    save.textContent = "Save in DealDrop";
    save.setAttribute("data-creator-app-action", "true");
    save.setAttribute(
      "data-deep-link",
      "dealdrop://creator/" + encodeURIComponent(creator.publicSlug),
    );
    actions.appendChild(save);
    content.appendChild(actions);
    article.appendChild(content);
    return article;
  }

  function renderCreator(creator) {
    updateMetadata(creator);
    document.getElementById("creator-name").textContent = creator.displayName;
    var bio = document.getElementById("creator-bio");
    bio.textContent = creator.bio || "";
    setHidden(bio, !creator.bio);

    var avatar = document.getElementById("creator-avatar");
    avatar.replaceChildren();
    if (creator.avatarUrl) {
      var image = document.createElement("img");
      image.src = creator.avatarUrl;
      image.alt = creator.displayName + " avatar";
      avatar.appendChild(image);
      avatar.removeAttribute("aria-hidden");
    } else {
      avatar.textContent = (creator.displayName || "D").charAt(0).toUpperCase();
      avatar.setAttribute("aria-hidden", "true");
    }

    var rooms = Array.isArray(creator.rooms) ? creator.rooms : [];
    var countLabel =
      rooms.length + " public " + (rooms.length === 1 ? "collection" : "collections");
    document.getElementById("creator-room-count").textContent = countLabel;
    document.getElementById("creator-collection-count").textContent = countLabel;

    var list = document.getElementById("creator-collections-list");
    list.replaceChildren();
    if (rooms.length === 0) {
      var empty = document.createElement("p");
      empty.className = "public-room-empty";
      empty.textContent = "This creator is preparing their first public collection.";
      list.appendChild(empty);
    } else {
      rooms.forEach(function (room) {
        list.appendChild(createCollection(room, creator));
      });
    }

    var profileDeepLink = "dealdrop://creator/" + encodeURIComponent(creator.publicSlug);
    var primaryAction = document.querySelector(".creator-hero [data-creator-app-action]");
    if (primaryAction) primaryAction.setAttribute("data-deep-link", profileDeepLink);
    document.getElementById("creator-app-note").textContent =
      config.appUrl || config.iosStoreUrl || config.androidStoreUrl
        ? "The app link will open DealDrop or the appropriate store."
        : "Open DealDrop on your device to save one of these collections.";
    document.querySelectorAll("[data-creator-app-action]").forEach(bindAppAction);
    setHidden(loading, true);
    setHidden(error, true);
    setHidden(view, false);
  }

  function showError(title, message) {
    document.getElementById("creator-error-title").textContent = title;
    document.getElementById("creator-error-copy").textContent = message;
    setHidden(loading, true);
    setHidden(view, true);
    setHidden(error, false);
  }

  function fetchCreator(slug, isRefresh) {
    var apiUrl = getApiUrl();
    var suffix = isRefresh ? "?refresh=1" : "";
    return fetch(apiUrl + "/creators/public/" + encodeURIComponent(slug) + suffix, {
      headers: { Accept: "application/json" },
    }).then(function (response) {
      if (response.status === 404) throw new Error("not_found");
      if (!response.ok) throw new Error("unavailable");
      return response.json();
    });
  }

  function startLiveRefresh(slug) {
    if (!getApiUrl()) return;
    window.setInterval(function () {
      if (document.visibilityState === "hidden") return;
      fetchCreator(slug, true)
        .then(function (payload) {
          if (payload && payload.data) renderCreator(payload.data);
        })
        .catch(function () {
          // Keep the last known creator collections visible during a failed refresh.
        });
    }, 60000);
  }

  function loadCreator() {
    var slug = getSlug();
    if (!/^[a-f0-9]{24}$/.test(slug)) {
      showError(
        "This creator link is invalid",
        "Ask the creator for their current public profile link.",
      );
      return;
    }

    if (initialCreator) {
      renderCreator(initialCreator);
      startLiveRefresh(slug);
      return;
    }

    var apiUrl = getApiUrl();
    if (!apiUrl) {
      showError(
        "Creator pages are not configured yet",
        "The DealDrop website needs its API connection configured before it can load this profile.",
      );
      return;
    }

    fetchCreator(slug, false)
      .then(function (payload) {
        if (!payload || !payload.data) throw new Error("unavailable");
        renderCreator(payload.data);
        startLiveRefresh(slug);
      })
      .catch(function (loadError) {
        if (loadError && loadError.message === "not_found") {
          showError(
            "This creator profile is unavailable",
            "The profile may be private or no longer available.",
          );
        } else {
          showError(
            "We couldn't load this creator",
            "Check your connection and try the link again.",
          );
        }
      });
  }

  loadCreator();
})();
