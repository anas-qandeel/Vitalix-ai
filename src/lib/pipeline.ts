import { supabase } from '@/lib/supabase';

export type CareStage = 'due' | 'messaged' | 'no_response' | 'renewed' | 'archived';

export interface PipelineRecord {
  id: string;
  pipeline_stage: CareStage;
  reminded_at: string | null;
  updated_at: string;
  cycle_date: string;
  insurance_status: string | null;
}

export async function upsertPipeline(
  pharmacyId: string,
  patientId: string,
  stage: CareStage,
  extra?: { reminded_at?: string }
): Promise<PipelineRecord | null> {
  const today = new Date().toISOString().split('T')[0];
  const row = { pharmacy_id: pharmacyId, patient_id: patientId, payment_type: 'cash', pipeline_stage: stage, cycle_date: today, ...extra };
  const { data: existing } = await supabase.from('refill_tracking_pipeline').select('id').eq('pharmacy_id', pharmacyId).eq('patient_id', patientId).eq('payment_type', 'cash').maybeSingle();
  if (existing?.id) {
    const { data } = await supabase.from('refill_tracking_pipeline').update({ pipeline_stage: stage, cycle_date: today, ...extra }).eq('id', existing.id).select().single();
    return data as PipelineRecord | null;
  } else {
    const { data } = await supabase.from('refill_tracking_pipeline').insert(row).select().single();
    return data as PipelineRecord | null;
  }
}
