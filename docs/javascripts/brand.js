;(function () {
  function brandTitle() {
    document
      .querySelectorAll(".md-header__topic:first-child .md-ellipsis")
      .forEach(function (el) {
        if (el.querySelector(".ic-brand")) return
        if (el.textContent.trim() !== "Illinois Chat") return
        el.innerHTML =
          '<span class="ic-brand ic-brand-illinois">Illinois</span> ' +
          '<span class="ic-brand ic-brand-chat">Chat</span>'
      })
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(brandTitle)
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", brandTitle)
  }
  brandTitle()
})()
