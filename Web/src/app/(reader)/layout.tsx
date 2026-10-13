import { redirect } from "next/navigation";
import { getOwner } from "@/lib/owner";

export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  if (!(await getOwner())) redirect("/");
  return children;
}
