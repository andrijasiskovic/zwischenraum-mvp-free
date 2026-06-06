(function registerPwa() {
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function reloadOnUpdate() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", function onLoad() {
    navigator.serviceWorker.register("./sw.js?v=20260606-group-progress").catch(function ignoreRegistrationError() {
      // The app still works as a normal website if service workers are unavailable.
    });
  });
})();
