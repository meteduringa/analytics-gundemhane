import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const PANEL_SESSION_COOKIE = "panel_session";
const PANEL_SESSION_TTL_SECONDS = 60 * 60 * 12;

type PanelRole = "ADMIN" | "CUSTOMER";

export type PanelSession = {
  id: string;
  email: string;
  name?: string | null;
  role: PanelRole;
  panelSections: string[];
  exp: number;
};

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for panel session signing.");
  }
  return secret;
};

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url");

const fromBase64Url = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

const sign = (payload: string) =>
  createHmac("sha256", getSecret()).update(payload).digest("base64url");

export const createPanelSessionToken = (
  input: Omit<PanelSession, "exp">
) => {
  const payload = JSON.stringify({
    ...input,
    exp: Date.now() + PANEL_SESSION_TTL_SECONDS * 1000,
  } satisfies PanelSession);
  const encodedPayload = toBase64Url(payload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const readPanelSession = async (): Promise<PanelSession | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PANEL_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as PanelSession;
    if (!parsed.id || !parsed.role || !parsed.email || !parsed.exp) {
      return null;
    }
    if (parsed.exp <= Date.now()) {
      return null;
    }
    return {
      ...parsed,
      panelSections: Array.isArray(parsed.panelSections)
        ? parsed.panelSections
        : [],
    };
  } catch {
    return null;
  }
};

export const setPanelSessionCookie = async (token: string) => {
  const cookieStore = await cookies();
  cookieStore.set(PANEL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PANEL_SESSION_TTL_SECONDS,
  });
};

export const clearPanelSessionCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.set(PANEL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
};
