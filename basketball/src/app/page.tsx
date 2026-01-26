import { redirect } from "next/navigation";

export default function Home() {
  // For MVP, redirect to login page
  // Later this will check auth and redirect to dashboard if logged in
  redirect("/login");
}
