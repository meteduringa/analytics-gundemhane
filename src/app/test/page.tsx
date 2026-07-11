import { redirect } from "next/navigation";
import { readPanelSession } from "@/lib/panel-session";
import PanelTestPage from "../panel/test/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TestPage() {
  const session = await readPanelSession();
  if (!session) {
    redirect("/login");
  }

  return <PanelTestPage />;
}
