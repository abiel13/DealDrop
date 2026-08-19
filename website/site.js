(function () {
  "use strict";

  const config = window.DEALDROP_SITE_CONFIG || {};

  document.querySelectorAll("[data-current-year]").forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll("[data-app-link]").forEach(function (link) {
    if (config.appUrl) {
      link.setAttribute("href", config.appUrl);
      return;
    }

    link.setAttribute("href", "#app-coming-soon");
    link.setAttribute("aria-describedby", "app-access-note");
    link.addEventListener("click", function () {
      const note = document.getElementById("app-access-note");
      if (note) {
        note.setAttribute("data-highlight", "true");
        window.setTimeout(function () {
          note.removeAttribute("data-highlight");
        }, 1800);
      }
    });
  });

  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  if (menuButton && nav) {
    menuButton.addEventListener("click", function () {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      nav.classList.toggle("is-open", !isOpen);
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menuButton.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      });
    });
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealItems = document.querySelectorAll("[data-reveal]");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  revealItems.forEach(function (item) {
    observer.observe(item);
  });
})();
