import { NextResponse } from "next/server";

const normalizeTarget = (value: string | null) => {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const encodePcToken = (source: string, category?: string | null) => {
  const payload = JSON.stringify({
    s: source,
    c: category ?? "",
  });
  return Buffer.from(payload).toString("base64url");
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = normalizeTarget(searchParams.get("target"));
  const category = searchParams.get("cat")?.trim();

  if (!target) {
    return NextResponse.json(
      { error: "target zorunludur." },
      { status: 400 }
    );
  }

  target.searchParams.delete("pc_source");
  target.searchParams.delete("pc_cat");
  const token = encodePcToken("popcent", category);
  const hashParams = new URLSearchParams(target.hash.replace(/^#/, ""));
  hashParams.set("pc", token);
  target.hash = hashParams.toString();

  return NextResponse.redirect(target.toString(), 302);
}
