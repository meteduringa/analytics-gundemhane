import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/account/sign-in");
  }

  if (session.user.role === "ADMIN") {
    redirect("/analytics/admin");
  }

  redirect("/analytics");
}
