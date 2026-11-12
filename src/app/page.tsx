import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/owner";

export default async function Home() {
  const owner = await getOwnerContext();
  redirect(owner ? "/companies" : "/login");
}
