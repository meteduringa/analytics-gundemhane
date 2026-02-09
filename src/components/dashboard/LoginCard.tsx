"use client";

import { Lock, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Props = { onSuccess?: () => void };

const LoginCard = ({ onSuccess }: Props) => {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "" });
  const [touched, setTouched] = useState({ username: false, password: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ username: true, password: true });
    if (!form.username || !form.password) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/panel/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Kullanıcı adı veya şifre hatalı.");
      }
      window.localStorage.setItem("auth", "1");
      window.localStorage.setItem("user", JSON.stringify(payload.user));
      onSuccess?.();
      router.push("/panel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcı adı veya şifre hatalı.");
    } finally {
      setLoading(false);
    }
  };

  const hasError = (field: "username" | "password") =>
    touched[field] && form[field].length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-[14px] bg-white p-8 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.4)]"
    >
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold">
          <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 bg-clip-text text-transparent">
            Elmas
          </span>{" "}
          <span className="text-slate-900">Giriş</span>
        </h1>
        <span className="h-[2px] w-20 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"></span>
      </div>

      <div className="mt-8 space-y-5">
        {["username", "password"].map((field) => {
          const label = field === "username" ? "Kullanıcı Adı" : "Şifre";
          const icon =
            field === "username" ? (
              <User className="h-4 w-4 text-slate-500" />
            ) : (
              <Lock className="h-4 w-4 text-slate-500" />
            );
          return (
            <label
              key={field}
              className="flex flex-col gap-2 text-xs font-semibold text-slate-500"
            >
              {label}
              <div
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition ${
                  hasError(field as "username" | "password")
                    ? "border-rose-400 bg-rose-50/40"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                {icon}
                <input
                  type={field === "password" ? "password" : "text"}
                  value={form[field as "username" | "password"]}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      [field]: event.target.value,
                    }))
                  }
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, [field]: true }))
                  }
                  className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
              {hasError(field as "username" | "password") && (
                <p className="text-[11px] font-semibold text-rose-500">
                  Bu alan zorunludur.
                </p>
              )}
            </label>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 text-center text-sm font-semibold text-rose-500">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-400/40 transition hover:brightness-95 hover:shadow-emerald-500/50 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
      </button>

      <button
        type="button"
        onClick={() => setShowReset((prev) => !prev)}
        className="mt-4 w-full text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        Şifremi unuttum
      </button>

      {showReset && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Şifrenizi sıfırlamak için lütfen yöneticinizle iletişime geçin.
          İsterseniz admin panelinden yeni şifre atanabilir.
        </div>
      )}
    </form>
  );
};

export default LoginCard;
