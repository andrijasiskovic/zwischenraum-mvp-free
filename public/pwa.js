(function registerPwa() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function onLoad() {
    navigator.serviceWorker.register("./sw.js").catch(function ignoreRegistrationError() {
      // The app still works as a normal website if service workers are unavailable.
    });
  });
})();
