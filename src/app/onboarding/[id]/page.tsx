import { OnboardingDetailPage } from "@/modules/onboarding/components/OnboardingPage";

/** Тонкий маршрут: вся логика в src/modules/onboarding. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return OnboardingDetailPage({ id });
}
