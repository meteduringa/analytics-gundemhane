  "use client";

  import { useMemo, useState } from "react";
  import Link from "next/link";
  import DataTable from "@/components/analytics/ui/DataTable";
  import EmptyState from "@/components/analytics/ui/EmptyState";

  type Website = {
    id: string;
    name: string;
    allowedDomains: string[];
    createdAt: string;
  };

  const hostUrl =
    process.env.NEXT_PUBLIC_HOST_URL ?? "https://analytics.gundemhane.com";

  const externalSnippetFor = (websiteId: string) => `<script async src="${hostUrl}/tracker.js"
    data-website-id="${websiteId}"
    data-host-url="${hostUrl}">
  </script>`;

  const inlineSnippetFor = (websiteId: string) => `<script data-website-id="${websiteId}" data-host-url="${hostUrl}">
  (function () {
    var s = document.currentScript;
    if (!s) return;

    var websiteId = s.getAttribute("data-website-id");
    var hostUrl = s.getAttribute("data-host-url") || "";
    if (!websiteId || !hostUrl) return;

    var endpoint = hostUrl.replace(/\\/$/, "") + "/api/collect";
    var storage = localStorage;
    var visitorKey = "gh_analytics_visitor_id";
    var sessionKey = "gh_analytics_session_id";
    var lastSeenKey = "gh_analytics_last_seen";
    var sessionTimeout = 1800000;

    function uuid() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 3) | 8).toString(16);
      });
    }

    function getVisitorId() {
      var id = storage.getItem(visitorKey);
      if (!id) {
        id = uuid();
        storage.setItem(visitorKey, id);
      }
      return id;
    }

    function getSessionId() {
      var last = +storage.getItem(lastSeenKey) || 0;
      var now = Date.now();
      var id = storage.getItem(sessionKey);
      if (!id || now - last > sessionTimeout) {
        id = uuid();
        storage.setItem(sessionKey, id);
      }
      storage.setItem(lastSeenKey, String(now));
      return id;
    }

    function send(payload) {
      payload.website_id = websiteId;
      payload.visitor_id = getVisitorId();
      payload.session_id = getSessionId();
      payload.ts = Date.now();
      payload.screen = screen.width + "x" + screen.height;
      payload.language = navigator.language;
      payload["user-agent"] = navigator.userAgent;

      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, JSON.stringify(payload));
      } else {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: "omit",
        }).catch(function () {});
      }
    }

    function trackPageview() {
      send({
        type: "pageview",
        url: location.pathname + location.search,
        referrer: document.referrer || null,
      });
    }

    if (document.readyState === "complete") {
      trackPageview();
    } else {
      addEventListener("load", trackPageview, { once: true });
    }
  })();
  </script>`;

  const snippetFor = (websiteId: string, mode: "external" | "inline") =>
    mode === "inline" ? inlineSnippetFor(websiteId) : externalSnippetFor(websiteId);

  export default function AdminWebsites({
    initialWebsites,
  }: {
    initialWebsites: Website[];
  }) {
    const [websites, setWebsites] = useState(
      initialWebsites.map((site) => ({
        ...site,
        draftName: site.name,
        draftDomains: site.allowedDomains.join(", "),
      }))
    );
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDomains, setNewDomains] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [snippetMode, setSnippetMode] = useState<"external" | "inline">(
      "external"
    );

    const sortedWebsites = useMemo(
      () =>
        [...websites].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      [websites]
    );

    const refreshWebsite = (updated: Website) => {
      setWebsites((prev) =>
        prev.map((site) =>
          site.id === updated.id
            ? {
                ...updated,
                draftName: updated.name,
                draftDomains: updated.allowedDomains.join(", "),
              }
            : site
        )
      );
    };

    const handleCreate = async () => {
      setCreating(true);
      setError(null);
      try {
        const response = await fetch("/api/analytics/admin/websites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName,
            allowedDomains: newDomains,
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to create website.");
        }

        setWebsites((prev) => [
          {
            ...payload.website,
            createdAt: payload.website.createdAt,
            draftName: payload.website.name,
            draftDomains: payload.website.allowedDomains.join(", "),
          },
          ...prev,
        ]);
        setNewName("");
        setNewDomains("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create website.");
      } finally {
        setCreating(false);
      }
    };

    const handleUpdate = async (id: string, name: string, domains: string) => {
      setError(null);
      const response = await fetch(`/api/analytics/admin/websites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, allowedDomains: domains }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Failed to update website.");
        return;
      }
      refreshWebsite(payload.website);
    };

    const handleDelete = async (id: string) => {
      if (!confirm("Delete this website? This will remove all analytics data.")) {
        return;
      }
      setError(null);
      const response = await fetch(`/api/analytics/admin/websites/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json();
        setError(payload.error ?? "Failed to delete website.");
        return;
      }
      setWebsites((prev) => prev.filter((site) => site.id !== id));
    };

    const copySnippet = async (websiteId: string) => {
      await navigator.clipboard.writeText(snippetFor(websiteId, snippetMode));
    };

    return (
      <section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">Siteler</h2>
            <p className="text-sm text-slate-500">
              İzleme özellikleri oluştur ve domainleri yönet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              Snippet modu
            </span>
            <button
              type="button"
              onClick={() => setSnippetMode("external")}
              className={`rounded-full border px-3 py-1 transition ${
                snippetMode === "external"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              External
            </button>
            <button
              type="button"
              onClick={() => setSnippetMode("inline")}
              className={`rounded-full border px-3 py-1 transition ${
                snippetMode === "inline"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              Inline (CSP safe)
            </button>
          </div>
        </header>

        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Site adı"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Domain(ler) (virgülle ayır)"
              value={newDomains}
              onChange={(event) => setNewDomains(event.target.value)}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? "Ekleniyor..." : "Yeni site ekle"}
            </button>
          </div>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <DataTable
          headers={["Site", "Domain", "Durum", "İşlem"]}
          rows={sortedWebsites.map((site) => [
            <div key={`${site.id}-name`} className="space-y-1">
              <div className="font-medium text-slate-900">{site.name}</div>
              <div className="text-xs text-slate-400">{site.id}</div>
            </div>,
            <div key={`${site.id}-domain`} className="space-y-2">
              <input
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                value={site.draftDomains}
                onChange={(event) =>
                  setWebsites((prev) =>
                    prev.map((entry) =>
                      entry.id === site.id
                        ? { ...entry, draftDomains: event.target.value }
                        : entry
                    )
                  )
                }
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-600">
                {snippetFor(site.id, snippetMode)}
              </div>
            </div>,
            <span
              key={`${site.id}-status`}
              className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
            >
              Aktif
            </span>,
            <div key={`${site.id}-actions`} className="flex flex-col gap-2">
              <Link
                href={`/analytics/sites/${site.id}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700"
              >
                Görüntüle
              </Link>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                onClick={() => copySnippet(site.id)}
              >
                Kopyala
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600"
                onClick={() => handleDelete(site.id)}
              >
                Sil
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                onClick={() =>
                  handleUpdate(site.id, site.draftName, site.draftDomains)
                }
              >
                Kaydet
              </button>
            </div>,
          ])}
          empty={
            <EmptyState
              title="Henüz site yok"
              description="Yeni site eklediğinde burada listelenecek."
            />
          }
        />
      </section>
    );
  }

