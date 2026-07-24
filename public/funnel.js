/*
 * Greater Inside funnel embed. Drop this on any sales/OTO page (any domain):
 *   <script src="https://grow.greaterinside.com/funnel.js" defer></script>
 *   <a data-gi-buy="placeholder-offer">Get it</a>
 * It rewrites [data-gi-buy] elements to the store checkout, carrying UTMs,
 * click ids, and referrer through the URL — no third-party cookies needed.
 */
(function () {
  var me = document.currentScript;
  var storeBase =
    (me && me.getAttribute("data-store")) ||
    (me && me.src ? new URL(me.src).origin : "");

  var KEEP = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "ttclid", "msclkid", "wbraid", "gbraid",
  ];

  function attribution() {
    var incoming = new URLSearchParams(location.search);
    var out = new URLSearchParams();
    KEEP.forEach(function (k) {
      var v = incoming.get(k);
      if (v) out.set(k, v);
    });
    if (document.referrer) out.set("ref", document.referrer);
    return out.toString();
  }

  function wire() {
    var qs = attribution();
    document.querySelectorAll("[data-gi-buy]").forEach(function (el) {
      var slug = el.getAttribute("data-gi-buy");
      if (!slug) return;
      var url = storeBase + "/checkout?product=" + encodeURIComponent(slug) + (qs ? "&" + qs : "");
      if (el.tagName === "A") el.setAttribute("href", url);
      else el.addEventListener("click", function () { location.href = url; });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
