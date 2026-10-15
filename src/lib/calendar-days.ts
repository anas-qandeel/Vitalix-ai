/** أيام تقويمية منذ لحظة معيّنة (من منتصف الليل المحلي): "أمس" = 1 مهما كانت ساعة الحدث — نفس مقياس calcDaysLeft */
export function calendarDaysSince(iso: string): number {
  const start = new Date(iso); start.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}
