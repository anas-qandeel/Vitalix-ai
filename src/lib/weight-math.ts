export function getBMICategory(bmi: number): {
  label: string;
  labelShort: string;
  color: string;       // Tailwind text color
  bgColor: string;     // Tailwind bg color
  borderColor: string; // Tailwind border color
  dot: string;         // Tailwind bg color for dot
  emoji: string;
} {
  if (bmi < 18.5) return {
    label: 'نحافة', labelShort: 'نحافة',
    color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', dot: 'bg-blue-500', emoji: '🔵',
  };
  if (bmi < 25) return {
    label: 'وزن صحي', labelShort: 'طبيعي',
    color: 'text-teal-700', bgColor: 'bg-teal-50', borderColor: 'border-teal-200', dot: 'bg-teal-500', emoji: '🟢',
  };
  if (bmi < 30) return {
    label: 'زيادة وزن', labelShort: 'زيادة',
    color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', dot: 'bg-amber-500', emoji: '🟡',
  };
  if (bmi < 35) return {
    label: 'سمنة درجة أولى', labelShort: 'سمنة أولى',
    color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', dot: 'bg-orange-500', emoji: '🟠',
  };
  return {
    label: 'سمنة درجة ثانية أو أعلى', labelShort: 'سمنة ثانية+',
    color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', dot: 'bg-rose-500', emoji: '🔴',
  };
}

export function calcWeightGoals(weightKg: number, heightCm: number): {
  bmi: number;
  idealMin: number;   // الحد الأدنى للوزن المثالي (BMI 18.5)
  idealMax: number;   // الحد الأعلى للوزن المثالي (BMI 24.9)
  toLoose: number;    // كيلو يجب إنقاصها للوصول لـ idealMax (0 إذا كان الوزن مثالياً أو أقل)
  firstGoal: number;  // الهدف المبدئي: 5% من الوزن الحالي، بحد أقصى المطلوب إنقاصه، وصفر إذا كان الوزن ضمن النطاق المثالي أو أقل
} {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  const idealMin = Math.round(18.5 * h * h * 10) / 10;
  const idealMax = Math.round(24.9 * h * h * 10) / 10;
  const toLoose = weightKg > idealMax ? Math.round((weightKg - idealMax) * 10) / 10 : 0;
  // الهدف المبدئي: 5% من الوزن الحالي، بحد أقصى المطلوب إنقاصه، وصفر إذا كان الوزن ضمن النطاق المثالي أو أقل
  const firstGoalRaw = weightKg * 0.05;
  const firstGoalUncapped = Math.round(firstGoalRaw * 2) / 2;
  const firstGoal = toLoose > 0 ? Math.min(firstGoalUncapped, toLoose) : 0;
  return { bmi, idealMin, idealMax, toLoose, firstGoal };
}
