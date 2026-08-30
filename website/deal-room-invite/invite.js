(function () {
  "use strict";

  var config = window.DEALDROP_SITE_CONFIG || {};
  var openLink = document.getElementById("invite-open");
  var note = document.getElementById("invite-note");
  var error = document.getElementById("invite-error");
  var token = new URLSearchParams(window.location.search).get("token") || "";

  function getFallbackUrl() {
    if (config.appUrl) return config.appUrl;
    var agent = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(agent) && config.iosStoreUrl) return config.iosStoreUrl;
    if (/Android/i.test(agent) && config.androidStoreUrl) return config.androidStoreUrl;
    return config.siteUrl || "/";
  }

  if (!token) {
    error.classList.remove("is-hidden");
    openLink.classList.add("is-disabled");
    openLink.setAttribute("aria-disabled", "true");
    openLink.setAttribute("tabindex", "-1");
    note.textContent = "";
    return;
  }

  var deepLink = "dealdrop://deal-room-invite?token=" + encodeURIComponent(token);
  var fallbackUrl = getFallbackUrl();
  openLink.href = fallbackUrl;
  note.textContent =
    config.appUrl || config.iosStoreUrl || config.androidStoreUrl
      ? "The app link will open DealDrop or the appropriate store."
      : "If DealDrop is installed, this button will open the app. Otherwise, install DealDrop and return to this invitation.";

  openLink.addEventListener("click", function (event) {
    event.preventDefault();
    var leftPage = false;
    var startedAt = Date.now();

    function cleanUp() {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        leftPage = true;
        cleanUp();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.location.href = deepLink;
    window.setTimeout(function () {
      if (!leftPage && Date.now() - startedAt >= 900) {
        cleanUp();
        window.location.href = fallbackUrl;
      }
    }, 1100);
  });
})();
