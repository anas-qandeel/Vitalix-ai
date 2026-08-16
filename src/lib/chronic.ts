export interface Patient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
}

export interface ChronicMed {
  id: string;
  patient_id: string;
  pharmacy_id: string;
  medication_name: string;
  pills_per_box: number;
  boxes_count: number;
  daily_dosage: number;
  dosage_unit: string;
  last_refill_date: string;
  next_refill_date: string;
  status: string;
}

export function calcDaysLeft(d: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const next = new Date(d); next.setHours(0,0,0,0);
  return Math.ceil((next.getTime() - today.getTime()) / 86400000);
}

function pluralizeDays(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

export function pluralizeDaysLeft(days: number): string {
  if (days < 0) return `متأخر ${Math.abs(days)} أيام`;
  if (days === 0) return 'ينفد اليوم';
  return `متبقي ${pluralizeDays(days)}`;
}
