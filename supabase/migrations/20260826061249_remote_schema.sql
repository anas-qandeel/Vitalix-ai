


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."auto_calculate_next_refill"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.daily_dosage > 0 THEN
        -- التاريخ القادم = تاريخ الصرف الأخير + (إجمالي الحبوب المتاحة بالعلب / الجرعة اليومية)
        NEW.next_refill_date := NEW.last_refill_date + ((NEW.pills_per_box * NEW.boxes_count) / NEW.daily_dosage)::INTEGER;
    ELSE
        NEW.next_refill_date := NEW.last_refill_date + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_calculate_next_refill"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_pharmacy_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select ps.pharmacy_id
  from public.pharmacy_staff ps
  where ps.user_id = auth.uid()
    and ps.is_active = true
    and ps.pharmacy_id = nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid
  limit 1;
$$;


ALTER FUNCTION "public"."current_pharmacy_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role_name"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'none');
$$;


ALTER FUNCTION "public"."current_role_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_staff_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select ps.id
  from public.pharmacy_staff ps
  where ps.user_id = auth.uid()
    and ps.is_active = true
    and ps.pharmacy_id = nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid
  limit 1;
$$;


ALTER FUNCTION "public"."current_staff_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_pharmacy_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  alphabet text := 'ACDEFGHJKMNPQRTUVWXY34679';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.pharmacies where short_code = code);
  end loop;
  return code;
end;
$$;


ALTER FUNCTION "public"."gen_pharmacy_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pharmacy_admin_view"() RETURNS TABLE("id" "uuid", "name" "text", "pharmacist_name" "text", "phone_number" "text", "country" "text", "city_address" "text", "status" "text", "total_amount_due" numeric, "paid_amount" numeric, "expiry_date" "date", "second_payment_date" "date", "created_at" timestamp with time zone, "email" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.pharmacist_name, p.phone_number, p.country,
         p.city_address, p.status, p.total_amount_due, p.paid_amount,
         p.expiry_date, p.second_payment_date, p.created_at, u.email
  FROM pharmacies p
  LEFT JOIN auth.users u ON (p.id = u.id);
END;
$$;


ALTER FUNCTION "public"."get_pharmacy_admin_view"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_admins"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "role" "text", "created_at" timestamp with time zone, "email" "text", "name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select 
    pa.id,
    pa.user_id,
    pa.role,
    pa.created_at,
    coalesce(au.email::text, 'admin@vitalix.ai') as email,
    coalesce(pa.name, au.raw_user_meta_data->>'full_name', 'أنس قنديل') as name
  from platform_admins pa
  left join auth.users au on pa.user_id = au.id;
$$;


ALTER FUNCTION "public"."get_platform_admins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_admins_view"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "role" "text", "created_at" timestamp with time zone, "email" character varying, "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT pa.id, pa.user_id, pa.role, pa.created_at, au.email, pa.name
  FROM platform_admins pa
  JOIN auth.users au ON (pa.user_id = au.id);
END;
$$;


ALTER FUNCTION "public"."get_platform_admins_view"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.platform_admins 
        WHERE platform_admins.user_id = $1
    );
END;
$_$;


ALTER FUNCTION "public"."is_platform_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_birthday_greeting_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_staff_name text;
  v_patient    text;
begin
  if new.staff_id is null then
    return new;
  end if;

  select ps.name into v_staff_name
  from public.pharmacy_staff ps where ps.id = new.staff_id;

  select p.name into v_patient
  from public.patients p where p.id = new.patient_id;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label)
  values
    (new.pharmacy_id, new.staff_id, v_staff_name,
     'birthday_greeting_sent', 'greeting', new.patient_id, v_patient);

  return new;
end;
$$;


ALTER FUNCTION "public"."log_birthday_greeting_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_catalog_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_action     text;
  v_label      text;
  v_kind       text;
  v_category   text;
begin
  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  -- الجدولان متوازيان ويختلفان في اسم عمود الصنف فقط
  if TG_TABLE_NAME = 'pharmacy_catalog' then
    v_kind  := 'catalog';
    v_label := coalesce(new.brand_name, old.brand_name);
  else
    v_kind  := 'recommendation';
    v_label := coalesce(new.product_name, old.product_name);
  end if;

  v_category := coalesce(new.category, old.category);

  if TG_OP = 'INSERT' then
    v_action := v_kind || '_added';
  elsif TG_OP = 'UPDATE' then
    -- الإخفاء عبر is_active يُسجَّل حذفاً لا تعديلاً
    if old.is_active is distinct from new.is_active and new.is_active = false then
      v_action := v_kind || '_deactivated';
    else
      v_action := v_kind || '_updated';
    end if;
  else
    v_action := v_kind || '_deleted';
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, v_kind,
     coalesce(new.id, old.id), v_label,
     jsonb_build_object('category', v_category));

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."log_catalog_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_medication_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_patient    text;
  v_action     text;
  v_med        text;
  v_entity     uuid;
begin
  v_staff_id := public.current_staff_id();

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  -- بلا هوية موظف لا نسجّل: الكتابة أتت من supabaseAdmin أو من مسار خادم،
  -- وسجل يقول «مجهول» يعطي ثقة كاذبة
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'medication_added';
    v_med    := new.medication_name;
    v_entity := new.id;
  elsif TG_OP = 'UPDATE' then
    -- الحذف عندك تعطيل لا محو: status ينتقل إلى deleted
    if old.status is distinct from new.status and new.status = 'deleted' then
      v_action := 'medication_deleted';
    else
      v_action := 'medication_updated';
    end if;
    v_med    := new.medication_name;
    v_entity := new.id;
  else
    v_action := 'medication_deleted';
    v_med    := old.medication_name;
    v_entity := old.id;
  end if;

  select p.name into v_patient
  from public.patients p
  where p.id = coalesce(new.patient_id, old.patient_id);

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, 'medication', v_entity, v_med,
     jsonb_build_object('patient_name', v_patient,
                        'patient_id', coalesce(new.patient_id, old.patient_id)));

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."log_medication_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_patient_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_action     text;
begin
  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  if TG_OP = 'INSERT' then
    v_action := 'patient_added';
  elsif TG_OP = 'UPDATE' then
    v_action := 'patient_updated';
  else
    v_action := 'patient_deleted';
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, 'patient',
     coalesce(new.id, old.id), coalesce(new.name, old.name));

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."log_patient_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_reminder_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_patient    text;
  v_old        text;
  v_actor      text;
  v_expiry     int := 5;
begin
  v_old := case when TG_OP = 'UPDATE' then old.pipeline_stage else null end;

  -- لا شيء يُسجَّل إن لم تتغيّر المرحلة، ولا عند الدخول إلى due (نتيجة حسابية لا قرار)
  if new.pipeline_stage is not distinct from v_old then
    return new;
  end if;
  if new.pipeline_stage not in ('messaged','no_response','renewed','archived') then
    return new;
  end if;

  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return new;
  end if;

  -- الانتقال إلى no_response وحده قد يكون تلقائياً: إن تجاوزت المدة العتبة فهو النظام
  if new.pipeline_stage = 'no_response'
     and new.reminded_at is not null
     and (now()::date - new.reminded_at::date) >= v_expiry then
    v_actor := 'system';
  else
    v_actor := 'staff';
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  select p.name into v_patient
  from public.patients p where p.id = new.patient_id;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, new.pharmacy_id), v_staff_id, v_staff_name,
     'stage_changed', 'reminder', new.patient_id, v_patient,
     jsonb_build_object('from', v_old, 'to', new.pipeline_stage, 'actor', v_actor));

  return new;
end;
$$;


ALTER FUNCTION "public"."log_reminder_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_ar"("s" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(
    regexp_replace(
      regexp_replace(
        translate(
          btrim(s),
          'أإآٱٲٳٵءؤئةىی',
          'اااااااءءءهيي'
        ),
        '[\u064B-\u065F\u0670]', '', 'g'
      ),
      '[\u0653-\u0655]', '', 'g'
    )
  );
$$;


ALTER FUNCTION "public"."normalize_ar"("s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_owner_deactivation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.role = 'owner' and new.is_active is distinct from true then
    raise exception 'لا يمكن تعطيل حساب المالك — استخدم إيقاف الصيدلية بدلاً من ذلك';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_owner_deactivation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "staff_name" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "entity_label" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "pharmacy_id" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."admin_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admin_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admin_audit_log_id_seq" OWNED BY "public"."admin_audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."birthday_greetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "greeted_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."birthday_greetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chronic_medications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "medication_name" "text" NOT NULL,
    "pills_per_box" integer NOT NULL,
    "boxes_count" integer DEFAULT 1 NOT NULL,
    "daily_dosage" numeric NOT NULL,
    "dosage_unit" "text" DEFAULT 'pill'::"text" NOT NULL,
    "last_refill_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "next_refill_date" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chronic_medications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid",
    "pharmacy_name" "text",
    "pharmacist_name" "text",
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "rating" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "admin_note" "text",
    "handled_by" "text",
    "handled_at" timestamp with time zone,
    "actions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "birth_date" "date" NOT NULL,
    "height" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "diagnosed_conditions" "text"[] DEFAULT '{}'::"text"[],
    "name_normalized" "text" GENERATED ALWAYS AS ("public"."normalize_ar"("name")) STORED
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "pharmacist_name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "country" "text" NOT NULL,
    "city_address" "text" NOT NULL,
    "status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "subscription_type" "text" DEFAULT 'standard'::"text" NOT NULL,
    "total_amount_due" numeric DEFAULT 50.00 NOT NULL,
    "paid_amount" numeric DEFAULT 0.00 NOT NULL,
    "expiry_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "second_payment_date" "date",
    "pharmacy_name" character varying(255) DEFAULT 'صيدلية معتمدة'::character varying,
    "group_id" "uuid",
    "short_code" "text" DEFAULT "public"."gen_pharmacy_code"() NOT NULL,
    "license_no" "text",
    "max_staff" integer DEFAULT 8 NOT NULL
);


ALTER TABLE "public"."pharmacies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacy_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "category" character varying(50) NOT NULL,
    "brand_name" character varying(150) NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "image_url" "text",
    "ai_pitch_prompt" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."pharmacy_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacy_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."pharmacy_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacy_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pharmacy_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacy_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "category" character varying(50) NOT NULL,
    "product_name" character varying(200) NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "image_url" "text",
    "ai_description" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "pharmacy_recommendations_category_check" CHECK ((("category")::"text" = ANY ((ARRAY['b12'::character varying, 'omega3'::character varying, 'fiber'::character varying, 'vitamin_d'::character varying, 'calcium'::character varying, 'magnesium_potassium'::character varying, 'protein'::character varying, 'sugar_substitute'::character varying, 'blood_sugar_support'::character varying, 'zinc_selenium'::character varying, 'probiotic'::character varying, 'iron'::character varying, 'appetite_stimulant'::character varying, 'satiety_aid'::character varying, 'multivitamin'::character varying])::"text"[])))
);


ALTER TABLE "public"."pharmacy_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacy_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "login_slug" "text",
    "must_change_pin" boolean DEFAULT true NOT NULL,
    "last_login_at" timestamp with time zone,
    "phone" "text",
    CONSTRAINT "pharmacy_staff_role_chk" CHECK (("role" = ANY (ARRAY['owner'::"text", 'pharmacist'::"text", 'assistant'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."pharmacy_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pharmacy_usage_daily" (
    "pharmacy_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "distinct_devices" integer DEFAULT 0 NOT NULL,
    "distinct_staff" integer DEFAULT 0 NOT NULL,
    "patients_added" integer DEFAULT 0 NOT NULL,
    "peak_concurrent" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."pharmacy_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'support'::"text" NOT NULL,
    "permissions" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    CONSTRAINT "platform_admins_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'support_admin'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refill_tracking_pipeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "payment_type" "text" NOT NULL,
    "pipeline_stage" "text" DEFAULT 'pending'::"text" NOT NULL,
    "insurance_status" "text",
    "rejection_reason" "text",
    "total_value" numeric,
    "copay_percent" integer,
    "copay_amount" numeric,
    "reminded_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cycle_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."refill_tracking_pipeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_audit_log" (
    "id" bigint NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_id" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."staff_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."staff_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."staff_audit_log_id_seq" OWNED BY "public"."staff_audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."staff_login_attempts" (
    "user_id" "uuid" NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "last_attempt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_login_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "bp_systolic" integer,
    "bp_diastolic" integer,
    "is_dual_bp" boolean DEFAULT false,
    "sugar_value" integer,
    "sugar_test_type" "text",
    "weight" numeric,
    "symptoms" "text"[],
    "had_stimulants" boolean DEFAULT false,
    "recent_exertion" boolean DEFAULT false,
    "recent_heavy_meal" boolean DEFAULT false,
    "is_stressed" boolean DEFAULT false,
    "took_medication" boolean DEFAULT true,
    "ai_report_output" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "performed_by" "text",
    "heart_rate" integer,
    "took_bp_medication" boolean DEFAULT false,
    "took_sugar_medication" boolean DEFAULT false,
    "recorded_by" "uuid"
);


ALTER TABLE "public"."visitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weight_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pharmacy_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "weight_kg" numeric NOT NULL,
    "height_cm" numeric NOT NULL,
    "bmi" numeric NOT NULL,
    "bmi_category" "text" NOT NULL,
    "ideal_weight_min" numeric NOT NULL,
    "ideal_weight_max" numeric NOT NULL,
    "target_loss_kg" numeric DEFAULT 0 NOT NULL,
    "first_goal_kg" numeric DEFAULT 0 NOT NULL,
    "nutrition_plan" "jsonb",
    "plan_generated_at" timestamp with time zone,
    "performed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."weight_plans" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."staff_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."staff_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."birthday_greetings"
    ADD CONSTRAINT "birthday_greetings_patient_id_greeted_on_key" UNIQUE ("patient_id", "greeted_on");



ALTER TABLE ONLY "public"."birthday_greetings"
    ADD CONSTRAINT "birthday_greetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chronic_medications"
    ADD CONSTRAINT "chronic_medications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacies"
    ADD CONSTRAINT "pharmacies_phone_number_key" UNIQUE ("phone_number");



ALTER TABLE ONLY "public"."pharmacies"
    ADD CONSTRAINT "pharmacies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacy_catalog"
    ADD CONSTRAINT "pharmacy_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacy_devices"
    ADD CONSTRAINT "pharmacy_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacy_devices"
    ADD CONSTRAINT "pharmacy_devices_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."pharmacy_groups"
    ADD CONSTRAINT "pharmacy_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacy_recommendations"
    ADD CONSTRAINT "pharmacy_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacy_staff"
    ADD CONSTRAINT "pharmacy_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pharmacy_usage_daily"
    ADD CONSTRAINT "pharmacy_usage_daily_pkey" PRIMARY KEY ("pharmacy_id", "day");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."refill_tracking_pipeline"
    ADD CONSTRAINT "refill_tracking_pipeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_audit_log"
    ADD CONSTRAINT "staff_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_login_attempts"
    ADD CONSTRAINT "staff_login_attempts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."visitations"
    ADD CONSTRAINT "visitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weight_plans"
    ADD CONSTRAINT "weight_plans_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_log_pharmacy_created_idx" ON "public"."activity_log" USING "btree" ("pharmacy_id", "created_at" DESC);



CREATE INDEX "birthday_greetings_pharmacy_date_idx" ON "public"."birthday_greetings" USING "btree" ("pharmacy_id", "greeted_on" DESC);



CREATE INDEX "idx_admin_audit_ph" ON "public"."admin_audit_log" USING "btree" ("pharmacy_id", "created_at" DESC);



CREATE INDEX "idx_catalog_ph" ON "public"."pharmacy_catalog" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_chronic_medications_pharmacy" ON "public"."chronic_medications" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_chronic_ph" ON "public"."chronic_medications" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_devices_pharmacy" ON "public"."pharmacy_devices" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_feedback_ph" ON "public"."feedback" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_patients_name_normalized" ON "public"."patients" USING "btree" ("name_normalized" "text_pattern_ops");



CREATE INDEX "idx_patients_ph" ON "public"."patients" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_patients_pharmacy" ON "public"."patients" USING "btree" ("pharmacy_id");



CREATE UNIQUE INDEX "idx_pharmacies_code" ON "public"."pharmacies" USING "btree" ("short_code");



CREATE INDEX "idx_pharmacies_group" ON "public"."pharmacies" USING "btree" ("group_id");



CREATE INDEX "idx_pharmacy_staff_pharmacy" ON "public"."pharmacy_staff" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_recommendations_ph_cat" ON "public"."pharmacy_recommendations" USING "btree" ("pharmacy_id", "category") WHERE "is_active";



CREATE INDEX "idx_recs_ph" ON "public"."pharmacy_recommendations" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_refill_ph" ON "public"."refill_tracking_pipeline" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_refill_tracking_pipeline_pharmacy" ON "public"."refill_tracking_pipeline" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_staff_audit_ph" ON "public"."staff_audit_log" USING "btree" ("pharmacy_id", "created_at" DESC);



CREATE INDEX "idx_staff_ph" ON "public"."pharmacy_staff" USING "btree" ("pharmacy_id");



CREATE UNIQUE INDEX "idx_staff_pharmacy_user" ON "public"."pharmacy_staff" USING "btree" ("pharmacy_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_staff_slug_per_pharmacy" ON "public"."pharmacy_staff" USING "btree" ("pharmacy_id", "login_slug") WHERE ("login_slug" IS NOT NULL);



CREATE INDEX "idx_visitations_ph" ON "public"."visitations" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_visitations_pharmacy" ON "public"."visitations" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_visitations_recorded_by" ON "public"."visitations" USING "btree" ("recorded_by");



CREATE INDEX "idx_weight_ph" ON "public"."weight_plans" USING "btree" ("pharmacy_id");



CREATE INDEX "idx_weight_plans_patient" ON "public"."weight_plans" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_weight_plans_pharmacy" ON "public"."weight_plans" USING "btree" ("pharmacy_id", "created_at" DESC);



CREATE UNIQUE INDEX "pharmacies_short_code_unique_ci" ON "public"."pharmacies" USING "btree" ("upper"("short_code"));



CREATE OR REPLACE TRIGGER "trg_log_birthday_greeting_activity" AFTER INSERT ON "public"."birthday_greetings" FOR EACH ROW EXECUTE FUNCTION "public"."log_birthday_greeting_activity"();



CREATE OR REPLACE TRIGGER "trg_log_catalog_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."pharmacy_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."log_catalog_activity"();



CREATE OR REPLACE TRIGGER "trg_log_medication_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."chronic_medications" FOR EACH ROW EXECUTE FUNCTION "public"."log_medication_activity"();



CREATE OR REPLACE TRIGGER "trg_log_patient_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."log_patient_activity"();



CREATE OR REPLACE TRIGGER "trg_log_recommendation_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."pharmacy_recommendations" FOR EACH ROW EXECUTE FUNCTION "public"."log_catalog_activity"();



CREATE OR REPLACE TRIGGER "trg_log_reminder_activity" AFTER INSERT OR UPDATE ON "public"."refill_tracking_pipeline" FOR EACH ROW EXECUTE FUNCTION "public"."log_reminder_activity"();



CREATE OR REPLACE TRIGGER "trg_pipeline_updated_at" BEFORE UPDATE ON "public"."refill_tracking_pipeline" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_owner_deactivation" BEFORE INSERT OR UPDATE ON "public"."pharmacy_staff" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_owner_deactivation"();



CREATE OR REPLACE TRIGGER "trigger_auto_refill_date" BEFORE INSERT OR UPDATE ON "public"."chronic_medications" FOR EACH ROW EXECUTE FUNCTION "public"."auto_calculate_next_refill"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."pharmacy_staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."birthday_greetings"
    ADD CONSTRAINT "birthday_greetings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."birthday_greetings"
    ADD CONSTRAINT "birthday_greetings_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."birthday_greetings"
    ADD CONSTRAINT "birthday_greetings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."pharmacy_staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chronic_medications"
    ADD CONSTRAINT "chronic_medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chronic_medications"
    ADD CONSTRAINT "chronic_medications_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pharmacies"
    ADD CONSTRAINT "pharmacies_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."pharmacy_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pharmacies"
    ADD CONSTRAINT "pharmacies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pharmacy_catalog"
    ADD CONSTRAINT "pharmacy_catalog_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pharmacy_devices"
    ADD CONSTRAINT "pharmacy_devices_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pharmacy_recommendations"
    ADD CONSTRAINT "pharmacy_recommendations_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pharmacy_staff"
    ADD CONSTRAINT "pharmacy_staff_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pharmacy_staff"
    ADD CONSTRAINT "pharmacy_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pharmacy_usage_daily"
    ADD CONSTRAINT "pharmacy_usage_daily_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refill_tracking_pipeline"
    ADD CONSTRAINT "refill_tracking_pipeline_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refill_tracking_pipeline"
    ADD CONSTRAINT "refill_tracking_pipeline_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_login_attempts"
    ADD CONSTRAINT "staff_login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitations"
    ADD CONSTRAINT "visitations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitations"
    ADD CONSTRAINT "visitations_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitations"
    ADD CONSTRAINT "visitations_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."pharmacy_staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weight_plans"
    ADD CONSTRAINT "weight_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weight_plans"
    ADD CONSTRAINT "weight_plans_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE CASCADE;



CREATE POLICY "Allow users to select their own admin role" ON "public"."platform_admins" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Owners can update their pharmacy" ON "public"."pharmacies" FOR UPDATE USING ((("id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = 'owner'::"text"))) WITH CHECK ((("id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = 'owner'::"text")));



CREATE POLICY "Platform admins can view all pharmacies" ON "public"."pharmacies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."platform_admins"
  WHERE ("platform_admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant members can read their pharmacy" ON "public"."pharmacies" FOR SELECT USING (("id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."birthday_greetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chronic_medications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chronic_medications_tenant_rw" ON "public"."chronic_medications" TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"())) WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_admin_delete" ON "public"."feedback" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "feedback_admin_update" ON "public"."feedback" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "feedback_insert" ON "public"."feedback" FOR INSERT TO "authenticated" WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));



CREATE POLICY "feedback_select" ON "public"."feedback" FOR SELECT TO "authenticated" USING ((("pharmacy_id" = "public"."current_pharmacy_id"()) OR "public"."is_platform_admin"()));



CREATE POLICY "owner reads own pharmacy activity" ON "public"."activity_log" FOR SELECT TO "authenticated" USING ((("pharmacy_id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = 'owner'::"text")));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients_tenant_rw" ON "public"."patients" TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"())) WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."pharmacies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pharmacy_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pharmacy_catalog_tenant_rw" ON "public"."pharmacy_catalog" TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"())) WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."pharmacy_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pharmacy_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pharmacy_recommendations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pharmacy_recommendations_read" ON "public"."pharmacy_recommendations" FOR SELECT TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"()));



CREATE POLICY "pharmacy_recommendations_write" ON "public"."pharmacy_recommendations" TO "authenticated" USING ((("pharmacy_id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = ANY (ARRAY['owner'::"text", 'pharmacist'::"text"])))) WITH CHECK ((("pharmacy_id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = ANY (ARRAY['owner'::"text", 'pharmacist'::"text"]))));



ALTER TABLE "public"."pharmacy_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pharmacy_staff_owner_write" ON "public"."pharmacy_staff" TO "authenticated" USING ((("pharmacy_id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = 'owner'::"text"))) WITH CHECK ((("pharmacy_id" = "public"."current_pharmacy_id"()) AND ("public"."current_role_name"() = 'owner'::"text")));



CREATE POLICY "pharmacy_staff_read" ON "public"."pharmacy_staff" FOR SELECT TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."pharmacy_usage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refill_tracking_pipeline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refill_tracking_pipeline_tenant_rw" ON "public"."refill_tracking_pipeline" TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"())) WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));



CREATE POLICY "staff insert own greeting" ON "public"."birthday_greetings" FOR INSERT TO "authenticated" WITH CHECK ((("pharmacy_id" = "public"."current_pharmacy_id"()) AND ("staff_id" = "public"."current_staff_id"())));



CREATE POLICY "staff read own pharmacy greetings" ON "public"."birthday_greetings" FOR SELECT TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."staff_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_login_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitations_tenant_rw" ON "public"."visitations" TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"())) WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));



ALTER TABLE "public"."weight_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weight_plans_tenant_rw" ON "public"."weight_plans" TO "authenticated" USING (("pharmacy_id" = "public"."current_pharmacy_id"())) WITH CHECK (("pharmacy_id" = "public"."current_pharmacy_id"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."auto_calculate_next_refill"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_calculate_next_refill"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_calculate_next_refill"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_pharmacy_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_pharmacy_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_pharmacy_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_role_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_staff_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_staff_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_staff_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_staff_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gen_pharmacy_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."gen_pharmacy_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_pharmacy_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pharmacy_admin_view"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_admins"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_admins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_admins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_admins_view"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_platform_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_birthday_greeting_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_birthday_greeting_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_birthday_greeting_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_catalog_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_catalog_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_catalog_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_medication_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_medication_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_medication_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_patient_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_patient_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_patient_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_reminder_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_reminder_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_reminder_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_ar"("s" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_ar"("s" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_ar"("s" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_owner_deactivation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_owner_deactivation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_owner_deactivation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."birthday_greetings" TO "anon";
GRANT ALL ON TABLE "public"."birthday_greetings" TO "authenticated";
GRANT ALL ON TABLE "public"."birthday_greetings" TO "service_role";



GRANT ALL ON TABLE "public"."chronic_medications" TO "anon";
GRANT ALL ON TABLE "public"."chronic_medications" TO "authenticated";
GRANT ALL ON TABLE "public"."chronic_medications" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacies" TO "anon";
GRANT ALL ON TABLE "public"."pharmacies" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacies" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacy_catalog" TO "anon";
GRANT ALL ON TABLE "public"."pharmacy_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacy_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacy_devices" TO "anon";
GRANT ALL ON TABLE "public"."pharmacy_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacy_devices" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacy_groups" TO "anon";
GRANT ALL ON TABLE "public"."pharmacy_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacy_groups" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacy_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."pharmacy_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacy_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacy_staff" TO "anon";
GRANT ALL ON TABLE "public"."pharmacy_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacy_staff" TO "service_role";



GRANT ALL ON TABLE "public"."pharmacy_usage_daily" TO "anon";
GRANT ALL ON TABLE "public"."pharmacy_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."pharmacy_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."refill_tracking_pipeline" TO "anon";
GRANT ALL ON TABLE "public"."refill_tracking_pipeline" TO "authenticated";
GRANT ALL ON TABLE "public"."refill_tracking_pipeline" TO "service_role";



GRANT ALL ON TABLE "public"."staff_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."staff_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_login_attempts" TO "anon";
GRANT ALL ON TABLE "public"."staff_login_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_login_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."visitations" TO "anon";
GRANT ALL ON TABLE "public"."visitations" TO "authenticated";
GRANT ALL ON TABLE "public"."visitations" TO "service_role";



GRANT ALL ON TABLE "public"."weight_plans" TO "anon";
GRANT ALL ON TABLE "public"."weight_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."weight_plans" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

alter table "public"."pharmacy_recommendations" drop constraint "pharmacy_recommendations_category_check";

alter table "public"."pharmacy_recommendations" add constraint "pharmacy_recommendations_category_check" CHECK (((category)::text = ANY ((ARRAY['b12'::character varying, 'omega3'::character varying, 'fiber'::character varying, 'vitamin_d'::character varying, 'calcium'::character varying, 'magnesium_potassium'::character varying, 'protein'::character varying, 'sugar_substitute'::character varying, 'blood_sugar_support'::character varying, 'zinc_selenium'::character varying, 'probiotic'::character varying, 'iron'::character varying, 'appetite_stimulant'::character varying, 'satiety_aid'::character varying, 'multivitamin'::character varying])::text[]))) not valid;

alter table "public"."pharmacy_recommendations" validate constraint "pharmacy_recommendations_category_check";


  create policy "catalog_images_delete_own_pharmacy"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'catalog-images'::text) AND ((storage.foldername(name))[1] = (public.current_pharmacy_id())::text)));



  create policy "catalog_images_insert_own_pharmacy"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'catalog-images'::text) AND ((storage.foldername(name))[1] = (public.current_pharmacy_id())::text)));



