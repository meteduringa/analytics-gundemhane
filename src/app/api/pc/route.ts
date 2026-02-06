import { NextResponse } from "next/server";

const normalizeTarget = (value: string | null) => {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
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

  target.searchParams.set("pc_source", "popcent");
  if (category) {
    target.searchParams.set("pc_cat", category);
  }

  return NextResponse.redirect(target.toString(), 302);
}
