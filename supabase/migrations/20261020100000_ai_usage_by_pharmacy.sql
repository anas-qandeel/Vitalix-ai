-- استهلاك الذكاء الاصطناعي لكل (صيدلية، نموذج) في شهر واحد بتوقيت عمّان. قراءة فقط، service_role فقط.
-- calls تستثني fallback لأنها رسالة احتياطية محلية لا استدعاء حقيقي لـ Gemini.
-- توكنز التفكير تُضم للمخرجات لأن Gemini يحاسبها بسعر المخرجات.
create or replace function public.ai_usage_by_pharmacy(p_month date)
returns table (
  pharmacy_id uuid, pharmacy_name text, model text,
  calls bigint, failed bigint, prompt_tokens bigint, output_tokens bigint
) language sql stable security definer set search_path = public as $$
  select l.pharmacy_id, p.name, l.model,
         count(*) filter (where l.outcome <> 'fallback'),
         count(*) filter (where l.outcome = 'failed'),
         coalesce(sum(l.prompt_tokens), 0)::bigint,
         coalesce(sum(l.output_tokens + l.thoughts_tokens), 0)::bigint
  from public.ai_usage_log l
  join public.pharmacies p on p.id = l.pharmacy_id
  where l.created_at >= (date_trunc('month', p_month::timestamp)) at time zone 'Asia/Amman'
    and l.created_at <  (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Asia/Amman'
  group by l.pharmacy_id, p.name, l.model;
$$;
revoke execute on function public.ai_usage_by_pharmacy(date) from public, anon, authenticated;
grant  execute on function public.ai_usage_by_pharmacy(date) to service_role;
