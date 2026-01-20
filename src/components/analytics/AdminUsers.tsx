"use client";

import { useMemo, useState } from "react";

type Website = {
  id: string;
  name: string;
};

type CustomerUser = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  userWebsites: { website: Website }[];
};

export default function AdminUsers({
  initialUsers,
  websites,
}: {
  initialUsers: CustomerUser[];
  websites: Website[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (websites.length === 0) {
    return (
      <section className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Create a website before adding customer accounts.
      </section>
    );
  }

  const sortedUsers = useMemo(
    () =>
      [...users].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [users]
  );

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/analytics/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          email,
          password,
          websiteId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create user.");
      }
      setUsers((prev) => [payload.user, ...prev]);
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Customers</h2>
        <p className="text-sm text-slate-500">
          Create customer accounts and attach them to a website.
        </p>
      </header>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name (optional)"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={websiteId}
            onChange={(event) => setWebsiteId(event.target.value)}
          >
            {websites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Creating..." : "Add customer"}
        </button>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {sortedUsers.map((user) => (
          <div
            key={user.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-sm font-semibold text-slate-900">
              {user.name ?? "Customer"} • {user.email}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Websites:{" "}
              {user.userWebsites.length
                ? user.userWebsites.map((link) => link.website.name).join(", ")
                : "None"}
            </div>
          </div>
        ))}
        {sortedUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No customers yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}
