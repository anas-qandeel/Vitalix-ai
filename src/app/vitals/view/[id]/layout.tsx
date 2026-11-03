import type { Metadata } from 'next';
import { patientPageMetadata } from '@/lib/patient-public-meta';

// الصفحة نفسها 'use client' فلا تصدّر metadata؛ هذا الـ layout الخادمي يحمل عنوان التبويب والمعاينة بهوية الصيدلية
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return patientPageMetadata('visitations', id, 'نتيجة فحصك');
}

export default function VitalsViewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
