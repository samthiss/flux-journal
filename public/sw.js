// The journal's service worker: it only shows the reminders the server pushes.
self.addEventListener("push", (event) => {
  let m = { title: "Trading Journal", body: "" };
  try {
    m = event.data ? event.data.json() : m;
  } catch {
    m.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(m.title, {
      body: m.body,
      tag: m.tag,
      renotify: !!m.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: m.url || "/trading-plan" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/trading-plan";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(url).then((w) => (w || c).focus());
      return self.clients.openWindow(url);
    })
  );
});
