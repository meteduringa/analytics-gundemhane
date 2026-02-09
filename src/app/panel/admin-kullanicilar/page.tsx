"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const sectionOptions = [
  { key: "home", label: "Anasayfa" },
  { key: "realtime", label: "Ziyaretçi (Anlık)" },
  { key: "daily", label: "Ziyaretçi (Günlük)" },
  { key: "settings", label: "Ayarlar" },
  { key: "discover", label: "Keşfet Analizi" },
];

type Site = {
  id: string;
  name: string;
};

type UserRow = {
  id: string;
  name?: string | null;
  email: string;
  role: "ADMIN" | "CUSTOMER";
  panelSections?: string[];
  userWebsites: { website: Site }[];
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name?: string | null;
    role: "ADMIN" | "CUSTOMER";
  } | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "CUSTOMER" as "ADMIN" | "CUSTOMER",
    websiteId: "",
    panelSections: [] as string[],
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthorized = window.localStorage.getItem("auth") === "1";
    if (!isAuthorized) {
      router.replace("/login");
      return;
    }
    const rawUser = window.localStorage.getItem("user");
    if (!rawUser) {
      router.replace("/login");
      return;
    }
    const parsed = JSON.parse(rawUser) as {
      id: string;
      email: string;
      name?: string | null;
      role: "ADMIN" | "CUSTOMER";
    };
    if (parsed.role !== "ADMIN") {
      router.replace("/panel");
      return;
    }
    setUser(parsed);
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  const loadData = async () => {
    if (!user) return;
    const siteParams = new URLSearchParams({
      userId: user.id,
      role: user.role,
    });
    const [sitesRes, usersRes] = await Promise.all([
      fetch(`/api/panel/sites?${siteParams.toString()}`),
      fetch(`/api/panel/admin-users?role=ADMIN`),
    ]);
    const sitesPayload = await sitesRes.json();
    const usersPayload = await usersRes.json();
    if (sitesRes.ok) {
      setSites(sitesPayload.sites ?? []);
    }
    if (usersRes.ok) {
      setUsers(usersPayload.users ?? []);
    }
  };

  useEffect(() => {
    if (!ready || !user) return;
    void loadData();
  }, [ready, user]);

  const handleCreate = async () => {
    if (!user) return;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorRole: user.role,
          ...newUser,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Kullanıcı eklenemedi.");
      }
      setNewUser({
        name: "",
        email: "",
        password: "",
        role: "CUSTOMER",
        websiteId: "",
        panelSections: [],
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcı eklenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (
    target: UserRow,
    updates: Partial<UserRow> & { password?: string; websiteId?: string }
  ) => {
    if (!user) return;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorRole: user.role,
          userId: target.id,
          ...updates,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Güncelleme başarısız.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncelleme başarısız.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (target: UserRow) => {
    if (!user) return;
    if (!confirm("Bu kullanıcı silinsin mi?")) return;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel/admin-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorRole: user.role, userId: target.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Silme başarısız.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız.");
    } finally {
      setIsSaving(false);
    }
  };

  const sectionLabel = (key: string) =>
    sectionOptions.find((item) => item.key === key)?.label ?? key;

  const siteOptions = useMemo(() => sites, [sites]);

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Kullanıcı Yönetimi
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Kullanıcılar</h1>
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <h2 className="text-lg font-semibold text-slate-900">Yeni Kullanıcı</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              Ad
              <input
                value={newUser.name}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, name: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Email
              <input
                value={newUser.email}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, email: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Şifre
              <input
                type="password"
                value={newUser.password}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, password: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Rol
              <select
                value={newUser.role}
                onChange={(event) =>
                  setNewUser((prev) => ({
                    ...prev,
                    role: event.target.value as "ADMIN" | "CUSTOMER",
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
              >
                <option value="CUSTOMER">Müşteri</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Site
              <select
                value={newUser.websiteId}
                onChange={(event) =>
                  setNewUser((prev) => ({
                    ...prev,
                    websiteId: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
              >
                <option value="">Seçiniz</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500">Sekmeler</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {sectionOptions.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={newUser.panelSections.includes(item.key)}
                    onChange={(event) => {
                      setNewUser((prev) => {
                        const next = new Set(prev.panelSections);
                        if (event.target.checked) {
                          next.add(item.key);
                        } else {
                          next.delete(item.key);
                        }
                        return { ...prev, panelSections: Array.from(next) };
                      });
                    }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="mt-5 rounded-2xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white"
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor..." : "Kullanıcı Oluştur"}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <h2 className="text-lg font-semibold text-slate-900">Kullanıcı Listesi</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">Sekmeler</th>
                  <th className="px-3 py-2">Şifre</th>
                  <th className="px-3 py-2">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                      Kullanıcı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  users.map((item) => (
                    <UserRowItem
                      key={item.id}
                      user={item}
                      sites={siteOptions}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      sectionLabel={sectionLabel}
                      isSaving={isSaving}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

type RowProps = {
  user: UserRow;
  sites: Site[];
  onUpdate: (
    user: UserRow,
    updates: Partial<UserRow> & { password?: string; websiteId?: string }
  ) => void;
  onDelete: (user: UserRow) => void;
  sectionLabel: (key: string) => string;
  isSaving: boolean;
};

const UserRowItem = ({
  user,
  sites,
  onUpdate,
  onDelete,
  sectionLabel,
  isSaving,
}: RowProps) => {
  const [password, setPassword] = useState("");
  const [sections, setSections] = useState<string[]>(user.panelSections ?? []);
  const [websiteId, setWebsiteId] = useState(
    user.userWebsites?.[0]?.website?.id ?? ""
  );

  return (
    <tr className="border-b border-slate-100 last:border-none">
      <td className="px-3 py-2 font-medium text-slate-800">{user.email}</td>
      <td className="px-3 py-2 text-slate-700">{user.role}</td>
      <td className="px-3 py-2 text-slate-700">
        <select
          value={websiteId}
          onChange={(event) => setWebsiteId(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
        >
          <option value="">Seçiniz</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-slate-700">
        <div className="flex flex-wrap gap-2">
          {sectionOptions.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600"
            >
              <input
                type="checkbox"
                checked={sections.includes(item.key)}
                onChange={(event) => {
                  setSections((prev) => {
                    const next = new Set(prev);
                    if (event.target.checked) {
                      next.add(item.key);
                    } else {
                      next.delete(item.key);
                    }
                    return Array.from(next);
                  });
                }}
              />
              {sectionLabel(item.key)}
            </label>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Yeni şifre"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-2 text-slate-700">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdate(user, {
                panelSections: sections,
                websiteId,
                password: password || undefined,
              })
            }
            disabled={isSaving}
            className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
          >
            Kaydet
          </button>
          <button
            type="button"
            onClick={() => onDelete(user)}
            disabled={isSaving}
            className="rounded-xl border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
          >
            Sil
          </button>
        </div>
      </td>
    </tr>
  );
};
