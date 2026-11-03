import type { Metadata } from 'next';
import { patientPageMetadata } from '@/lib/patient-public-meta';

// الصفحة نفسها 'use client' فلا تصدّر metadata؛ هذا الـ layout الخادمي يحمل عنوان التبويب والمعاينة بهوية الصيدلية
export async function generateMetadata({ params }: { params: Promise<{ planId: string }> }): Promise<Metadata> {
  const { planId } = await params;
  return patientPageMetadata('weight_plans', planId, 'خطة وزنك');
}

export default function WeightPlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
