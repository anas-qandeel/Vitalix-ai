-- طبقة القاعدة ضد الأدوية: جدول حظر + trigger يرفض إدراج/تعديل منتج يطابق دواءً
-- مهما كان مصدر الكتابة. القائمة الأولية منسوخة من src/lib/medicine-blocklist.ts.
-- قاعدة المطابقة مطابقة للكود: generic بحدود كلمة لاتينية؛ brand احتواءً بطول >= 4.

create table if not exists public.medicine_blocklist (
  id         uuid primary key default gen_random_uuid(),
  term       text not null,
  term_type  text not null check (term_type in ('generic','brand')),
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists medicine_blocklist_term_uniq
  on public.medicine_blocklist (public.normalize_ar(term), term_type);

alter table public.medicine_blocklist enable row level security;
drop policy if exists "blocklist read" on public.medicine_blocklist;
create policy "blocklist read" on public.medicine_blocklist
  for select to authenticated using (true);
-- لا سياسات كتابة: الإضافة والتعديل عبر service_role / SQL Editor فقط (مالك المنصة).

create or replace function public.medicine_blocklist_match(p_name text, p_profile jsonb)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  texts text[];
  ing   text[];
  t     text;
  r     record;
  hits  text[] := '{}';
begin
  texts := array[public.normalize_ar(coalesce(p_name, ''))];
  if p_profile is not null and jsonb_typeof(p_profile->'active_ingredients') = 'array' then
    select array_agg(public.normalize_ar(x)) into ing
    from jsonb_array_elements_text(p_profile->'active_ingredients') x;
    if ing is not null then texts := texts || ing; end if;
  end if;

  for r in
    select term, term_type, public.normalize_ar(term) as nt
    from public.medicine_blocklist where is_active
  loop
    foreach t in array texts loop
      if t is null or t = '' then continue; end if;
      if r.term_type = 'generic' then
        if t ~* ('(^|[^a-z])' || r.nt || '([^a-z]|$)') then hits := hits || r.term; exit; end if;
      else
        if length(r.nt) >= 4 and position(r.nt in t) > 0 then hits := hits || r.term; exit; end if;
      end if;
    end loop;
  end loop;
  return hits;
end
$$;

create or replace function public.pharmacy_products_reject_medicine()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare hits text[];
begin
  hits := public.medicine_blocklist_match(new.brand_name, new.clinical_profile);
  if coalesce(array_length(hits, 1), 0) > 0 then
    raise exception 'MEDICINE_BLOCKED: يبدو أن هذا مستحضر دوائي (%) — الأدوية لا تُدرج في الكتالوج', array_to_string(hits, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists trg_products_reject_medicine on public.pharmacy_products;
create trigger trg_products_reject_medicine
  before insert or update of brand_name, clinical_profile on public.pharmacy_products
  for each row execute function public.pharmacy_products_reject_medicine();

-- القائمة الأولية (مولَّدة آلياً من الكود)
insert into public.medicine_blocklist (term, term_type) values
('paracetamol','generic'),
('acetaminophen','generic'),
('ibuprofen','generic'),
('diclofenac','generic'),
('naproxen','generic'),
('aspirin','generic'),
('acetylsalicylic','generic'),
('mefenamic','generic'),
('ketoprofen','generic'),
('celecoxib','generic'),
('tramadol','generic'),
('codeine','generic'),
('cetirizine','generic'),
('loratadine','generic'),
('desloratadine','generic'),
('fexofenadine','generic'),
('chlorpheniramine','generic'),
('diphenhydramine','generic'),
('pseudoephedrine','generic'),
('phenylephrine','generic'),
('omeprazole','generic'),
('esomeprazole','generic'),
('pantoprazole','generic'),
('lansoprazole','generic'),
('ranitidine','generic'),
('famotidine','generic'),
('loperamide','generic'),
('domperidone','generic'),
('metoclopramide','generic'),
('ondansetron','generic'),
('bisacodyl','generic'),
('mebeverine','generic'),
('hyoscine','generic'),
('amoxicillin','generic'),
('clavulanate','generic'),
('azithromycin','generic'),
('clarithromycin','generic'),
('ciprofloxacin','generic'),
('levofloxacin','generic'),
('metronidazole','generic'),
('cefixime','generic'),
('cefuroxime','generic'),
('doxycycline','generic'),
('nitrofurantoin','generic'),
('fluconazole','generic'),
('terbinafine','generic'),
('clotrimazole','generic'),
('nystatin','generic'),
('ivermectin','generic'),
('albendazole','generic'),
('mebendazole','generic'),
('acyclovir','generic'),
('amlodipine','generic'),
('lisinopril','generic'),
('enalapril','generic'),
('ramipril','generic'),
('losartan','generic'),
('valsartan','generic'),
('candesartan','generic'),
('bisoprolol','generic'),
('atenolol','generic'),
('metoprolol','generic'),
('carvedilol','generic'),
('hydrochlorothiazide','generic'),
('furosemide','generic'),
('spironolactone','generic'),
('indapamide','generic'),
('atorvastatin','generic'),
('rosuvastatin','generic'),
('simvastatin','generic'),
('ezetimibe','generic'),
('warfarin','generic'),
('clopidogrel','generic'),
('rivaroxaban','generic'),
('apixaban','generic'),
('digoxin','generic'),
('nitroglycerin','generic'),
('isosorbide','generic'),
('metformin','generic'),
('gliclazide','generic'),
('glimepiride','generic'),
('glibenclamide','generic'),
('sitagliptin','generic'),
('vildagliptin','generic'),
('linagliptin','generic'),
('empagliflozin','generic'),
('dapagliflozin','generic'),
('pioglitazone','generic'),
('insulin','generic'),
('liraglutide','generic'),
('semaglutide','generic'),
('tirzepatide','generic'),
('dulaglutide','generic'),
('orlistat','generic'),
('sibutramine','generic'),
('phentermine','generic'),
('lorcaserin','generic'),
('naltrexone','generic'),
('bupropion','generic'),
('topiramate','generic'),
('levothyroxine','generic'),
('carbimazole','generic'),
('methimazole','generic'),
('prednisolone','generic'),
('prednisone','generic'),
('dexamethasone','generic'),
('hydrocortisone','generic'),
('betamethasone','generic'),
('estradiol','generic'),
('progesterone','generic'),
('testosterone','generic'),
('letrozole','generic'),
('salbutamol','generic'),
('budesonide','generic'),
('fluticasone','generic'),
('montelukast','generic'),
('theophylline','generic'),
('diazepam','generic'),
('alprazolam','generic'),
('clonazepam','generic'),
('zolpidem','generic'),
('sertraline','generic'),
('fluoxetine','generic'),
('escitalopram','generic'),
('amitriptyline','generic'),
('gabapentin','generic'),
('pregabalin','generic'),
('carbamazepine','generic'),
('valproate','generic'),
('levetiracetam','generic'),
('minoxidil','generic'),
('finasteride','generic'),
('hydroquinone','generic'),
('isotretinoin','generic'),
('tretinoin','generic'),
('sildenafil','generic'),
('tadalafil','generic'),
('nicotine','generic'),
('allopurinol','generic'),
('colchicine','generic'),
('tamsulosin','generic'),
('oxybutynin','generic'),
('panadol','brand'),
('بانادول','brand'),
('adol','brand'),
('ادول','brand'),
('revanin','brand'),
('ريفانين','brand'),
('cetal','brand'),
('سيتال','brand'),
('brufen','brand'),
('بروفين','brand'),
('voltaren','brand'),
('فولتارين','brand'),
('cataflam','brand'),
('كاتافلام','brand'),
('olfen','brand'),
('اولفين','brand'),
('augmentin','brand'),
('اوغمنتين','brand'),
('zithromax','brand'),
('زيثروماكس','brand'),
('flagyl','brand'),
('فلاجيل','brand'),
('nexium','brand'),
('نيكسيوم','brand'),
('losec','brand'),
('لوسيك','brand'),
('glucophage','brand'),
('غلوكوفاج','brand'),
('جلوكوفاج','brand'),
('amlor','brand'),
('املور','brand'),
('norvasc','brand'),
('نورفاسك','brand'),
('concor','brand'),
('كونكور','brand'),
('diovan','brand'),
('دايفان','brand'),
('ديوفان','brand'),
('co-diovan','brand'),
('crestor','brand'),
('كريستور','brand'),
('lipitor','brand'),
('ليبيتور','brand'),
('januvia','brand'),
('جانوفيا','brand'),
('galvus','brand'),
('غالفس','brand'),
('جالفس','brand'),
('jardiance','brand'),
('جارديانس','brand'),
('ozempic','brand'),
('اوزمبيك','brand'),
('saxenda','brand'),
('ساكسندا','brand'),
('wegovy','brand'),
('mounjaro','brand'),
('مونجارو','brand'),
('xenical','brand'),
('زينيكال','brand'),
('orlistat','brand'),
('refit','brand'),
('euthyrox','brand'),
('يوثيروكس','brand'),
('ventolin','brand'),
('فنتولين','brand'),
('zyrtec','brand'),
('زيرتك','brand'),
('claritine','brand'),
('كلاريتين','brand'),
('telfast','brand'),
('تلفاست','brand'),
('imodium','brand'),
('ايموديوم','brand'),
('motilium','brand'),
('موتيليوم','brand'),
('buscopan','brand'),
('بوسكوبان','brand'),
('viagra','brand'),
('فياجرا','brand'),
('cialis','brand'),
('سياليس','brand'),
('lasix','brand'),
('لازكس','brand'),
('aspocid','brand'),
('اسبوسيد','brand'),
('plavix','brand'),
('بلافيكس','brand')
on conflict do nothing;
