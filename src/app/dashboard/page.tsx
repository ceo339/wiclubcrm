import { redirect } from "next/navigation";

// The network-wide dashboard this page used to render now lives on Главная
// itself (Anastasiia: "Главная и сводка — это одна и та же вкладка в
// прототипе") — see src/app/page.tsx. This route stays only so an old
// bookmark or link to /dashboard still lands somewhere real.
export default function DashboardRedirectPage() {
  redirect("/");
}
