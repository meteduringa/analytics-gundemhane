"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LinkStatus = {
  linked: boolean;
  telegramChatId: string | null;
  activeTokenExpiresAt: string | null;
  websites: { id: string; name: string }[];
};

const formatIstanbulDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function TelegramPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [freshExpiry, setFreshExpiry] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/panel/telegram-link");
      const payload = await response.json();
      if (response.status === 401) {
        window.localStorage.removeItem("auth");
        window.localStorage.removeItem("user");
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Telegram durumu alınamadı.");
      }
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telegram durumu alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthorized = window.localStorage.getItem("auth") === "1";
    if (!isAuthorized) {
      router.replace("/login");
      return;
    }
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    void loadStatus();
  }, [ready]);

  const generateCode = async () => {
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/panel/telegram-link", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Kod üretilemedi.");
      }
      setFreshCode(payload.code);
      setFreshExpiry(payload.expiresAt);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kod üretilemedi.");
    } finally {
      setGenerating(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Telegram bağlantısı kaldırılsın mı?")) return;
    setDisconnecting(true);
    setError("");
    try {
      const response = await fetch("/api/panel/telegram-link", {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Bağlantı kaldırılamadı.");
      }
      setFreshCode(null);
      setFreshExpiry(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı kaldırılamadı.");
    } finally {
      setDisconnecting(false);
    }
  };

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Telegram
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Telegram Bağlantısı</h1>
          <p className="text-sm text-slate-500">
            Panel hesabını Telegram botuna bağla. Böylece /rakam ve /hedef
            komutları çalışır.
          </p>
        </header>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">Bağlantı Durumu</h2>
              <p className="text-sm text-slate-500">
                Bot: <span className="font-semibold text-slate-700">@elmasistatistik_bot</span>
              </p>
              <p className="text-sm text-slate-500">
                Durum:{" "}
                <span className={status?.linked ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                  {status?.linked ? "Bağlı" : "Bağlı değil"}
                </span>
              </p>
              <p className="text-sm text-slate-500">
                Chat ID: <span className="font-semibold text-slate-700">{status?.telegramChatId ?? "-"}</span>
              </p>
              <p className="text-sm text-slate-500">
                Yetkili firma:
                {" "}
                <span className="font-semibold text-slate-700">
                  {(status?.websites ?? []).map((site) => site.name).join(", ") || "-"}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadStatus()}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {loading ? "Yükleniyor..." : "Durumu Yenile"}
              </button>
              <button
                type="button"
                onClick={() => void generateCode()}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {generating ? "Kod üretiliyor..." : "Bağlantı Kodu Üret"}
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={!status?.linked || disconnecting}
                className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {status?.linked
                  ? disconnecting
                    ? "Kaldırılıyor..."
                    : "Bağlantıyı Kaldır"
                  : "Bağlantı Yok"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <h2 className="text-lg font-semibold text-slate-900">Bağlantı Adımları</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-600">
            <li>Bu ekrandan bir bağlantı kodu üret.</li>
            <li>Telegram’da <span className="font-semibold">@elmasistatistik_bot</span> botunu aç.</li>
            <li>
              Bota şu komutu yaz:
              <div className="mt-2 rounded-2xl bg-slate-900 px-4 py-3 font-mono text-sm text-white">
                /baglan KOD
              </div>
            </li>
            <li>Bağlantı tamamlandıktan sonra /rakam ve /hedef komutlarını kullan.</li>
            <li>
              Telegram üzerinden bağlantıyı kaldırmak istersen:
              <div className="mt-2 rounded-2xl bg-slate-900 px-4 py-3 font-mono text-sm text-white">
                /baglantikes
              </div>
            </li>
          </ol>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <h2 className="text-lg font-semibold text-slate-900">Aktif Kod</h2>
          {freshCode ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-slate-900 px-4 py-4 font-mono text-2xl tracking-[0.35em] text-white">
                {freshCode}
              </div>
              <p className="text-sm text-slate-500">
                Son geçerlilik:{" "}
                <span className="font-semibold text-slate-700">
                  {formatIstanbulDateTime(freshExpiry)}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Henüz yeni bir bağlantı kodu üretilmedi. Kod ürettikten sonra burada görünür.
            </p>
          )}

          {!freshCode && status?.activeTokenExpiresAt ? (
            <p className="mt-3 text-sm text-amber-600">
              Daha önce üretilmiş aktif bir kod var. Son geçerlilik:{" "}
              {formatIstanbulDateTime(status.activeTokenExpiresAt)}
            </p>
          ) : null}
        </section>
      </div>
    </DashboardLayout>
  );
}
