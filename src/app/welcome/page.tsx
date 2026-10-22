import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { IBM_Plex_Mono } from 'next/font/google';
import './welcome.css';
import WelcomeEffects from './WelcomeEffects';
import { PHONE_DISPLAY, PHONE_RAW, SALES_EMAIL, SOCIAL_LINKS, WHATSAPP_NUMBER, waLink } from '@/lib/contact';

// صفحة تسويقية عامة: خارج /dashboard عمداً كي لا ترث حارس تسجيل الدخول

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Vitalix-ai | تابع مرضاك بذكاء',
  description: 'Vitalix-ai برنامج تستخدمه أنت وفريقك في الصيدلية، يضمّ أدوات مستقلة لمتابعة مرضاك.',
  openGraph: {
    title: 'Vitalix-ai | تابع مرضاك بذكاء',
    description: 'Vitalix-ai برنامج تستخدمه أنت وفريقك في الصيدلية، يضمّ أدوات مستقلة لمتابعة مرضاك.',
    locale: 'ar_JO',
    type: 'website',
    url: 'https://vitalix-ai.com/welcome',
  },
};

// المصدر يُلحق بنص رسالة واتساب، فلا يُقبل منه إلا رمز قصير آمن وإلا عاد إلى القيمة الافتراضية
function cleanSource(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[a-z0-9_-]{1,20}$/i.test(v) ? v : 'web';
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const src = cleanSource((await searchParams).src);

  return (
    <div
      className="vx-welcome page"
      dir="rtl"
      lang="ar"
      style={{ '--f-mono': `${plexMono.style.fontFamily}, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` } as CSSProperties}
    >
      {/* التمرير السلس على html لا على الغلاف، ويُلغى عند تفضيل تقليل الحركة */}
      <style>{'html{scroll-behavior:smooth;}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'}</style>
      <svg width="0" height="0" style={{ 'position': 'absolute' } as CSSProperties} aria-hidden="true" focusable="false">
        <symbol id="i-check" viewBox="0 0 24 24"><polyline points="5 12.5 10 17 19 7.5"/></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.1A8 8 0 1 1 20 12Z"/><path d="M8.5 10.5h7M8.5 13.6h4.5"/></symbol>
        <symbol id="i-pill" viewBox="0 0 24 24"><g transform="rotate(-45 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g></symbol>
        <symbol id="i-pulse" viewBox="0 0 24 24"><polyline points="3 12 7 12 9.5 6 14 18 16.5 12 21 12"/></symbol>
        <symbol id="i-out" viewBox="0 0 24 24"><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M9 8l-4 4 4 4M5 12h10"/></symbol>
        <symbol id="i-scale" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M7.5 11a4.5 4.5 0 0 1 9 0Z"/><path d="M12 11l1.8-2.8"/><path d="M8.5 16.5h2M13.5 16.5h2"/></symbol>
        <symbol id="i-box" viewBox="0 0 24 24"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.2 14.5c2.2.2 3.9 1.6 4.6 4"/></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9Z"/><path fill="currentColor" stroke="none" d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6Z"/><polyline points="8.8 12 11.2 14.4 15.5 10"/></symbol>
        <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6.2A2.2 2.2 0 0 0 13.3 4H6.2A2.2 2.2 0 0 0 4 6.2v7.1a2.2 2.2 0 0 0 2.2 2.2h2.3"/></symbol>
        <symbol id="i-phone" viewBox="0 0 24 24"><path d="M5.5 4h3l1.8 4.6-2.3 1.5a10.5 10.5 0 0 0 5.9 5.9l1.5-2.3L20 15.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4Z"/></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><polyline points="3.5 7 12 13 20.5 7"/></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></symbol>
        <symbol id="i-store" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5Z"/></symbol>
        <symbol id="i-gift" viewBox="0 0 24 24"><rect x="3.5" y="8.5" width="17" height="4" rx="1.2"/><path d="M5 12.5v6.3a1.7 1.7 0 0 0 1.7 1.7h10.6a1.7 1.7 0 0 0 1.7-1.7v-6.3M12 8.5v12"/><path d="M12 8.5C10.4 4.7 6.5 4.9 6.7 7.4c.1 1.3 2 1.1 5.3 1.1Zm0 0c1.6-3.8 5.5-3.6 5.3-1.1-.1 1.3-2 1.1-5.3 1.1Z"/></symbol>
        <symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 3.5H7.5A2 2 0 0 0 5.5 5.5v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h4.5"/></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M7 4.8v14.4L19 12Z"/></symbol>
      </svg>

      <header className="top">
          <div className="wrap">
            <a className="brand" href="#top" aria-label="Vitalix-ai">
              <span className="brand-mark logo" aria-hidden="true"></span>
              <span className="brand-name">Vitalix-ai</span>
            </a>
            <a className="top-link" href="#contact">تواصل معنا</a>
          </div>
        </header>

        <main id="top">

          {/* Hero */}
          <section className="hero" aria-labelledby="hero-title">
            <div className="wrap">
              <div className="hero-copy">
                <p className="eyebrow rise" style={{ '--d': '.05s' } as CSSProperties}>نظام بالذكاء الاصطناعي لمتابعة مرضى الصيدلية</p>
                <h1 id="hero-title" className="rise" style={{ '--d': '.12s' } as CSSProperties}>تابع مرضاك <em>بذكاء</em></h1>
                <p className="lede rise" style={{ '--d': '.2s' } as CSSProperties}>Vitalix-ai برنامج تستخدمه أنت وفريقك في الصيدلية، يضمّ أدوات مستقلة لمتابعة مرضاك: الأدوية المزمنة، وطلبات الأدوية غير المتوفرة، وسجل الوصفات الجاهز للجنة التفتيش، وقياسات الضغط والسكر والوزن، وخطط الوزن، وتهاني أعياد الميلاد، واقتراح منتجات من صيدليتك تناسب كل مريض. كلها متاحة لك في اشتراك واحد، وكل أداة منها تساعدك على أن يبقى مريضك يعود إلى صيدليتك، وعلى زيادة فرص البيع.</p>
                <div className="actions rise" style={{ '--d': '.28s' } as CSSProperties}>
                  <a className="btn btn-wa" href={waLink(`${src}-hero`)} target="_blank" rel="noopener">
                    <svg className="i" aria-hidden="true"><use href="#i-chat"/></svg>اسأل عن عرض الإطلاق
                  </a>
                  <a className="btn btn-line" href="#system">تعرّف على النظام</a>
                </div>
                <ul className="facts rise" style={{ '--d': '.36s' } as CSSProperties}>
                  <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>يعمل على الهاتف والكمبيوتر</li>
                  <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>بيانات كل صيدلية معزولة عن غيرها</li>
                </ul>
              </div>

              <div className="hero-art rise" style={{ '--d': '.3s' } as CSSProperties}>
                <div className="screen" role="img" aria-label="مثال لقائمة المتابعة اليومية في الصيدلية">
                  <div className="screen-head">
                    <span className="screen-title">اليوم في صيدليتك</span>
                    <span className="chip chip-warn">3 تحتاج متابعتك</span>
                  </div>
                  <div className="screen-body">
                    <div className="rx">
                      <span className="rx-name">محمود خليل</span>
                      <span className="rx-drug">ميتفورمين 850 ملغ · ينفد اليوم</span>
                      <span className="chip chip-high">تذكير</span>
                    </div>
                    <div className="rx">
                      <span className="rx-name">ريم سامي</span>
                      <span className="rx-drug">طلب سيتاليبتين 50 ملغ · تأخر يوماً</span>
                      <span className="swap">
                        <span className="chip chip-warn">طلب متأخر</span>
                        <span className="chip chip-ok">تم الإرسال</span>
                      </span>
                    </div>
                    <div className="rx">
                      <span className="rx-name">هالة سمير</span>
                      <span className="rx-drug">عيد ميلادها اليوم</span>
                      <span className="chip chip-ok">تهنئة</span>
                    </div>
                  </div>
                  <div className="screen-foot"><svg className="i" aria-hidden="true"><use href="#i-chat"/></svg>الرسائل جاهزة على واتساب، تضغط إرسال فقط</div>
                </div>
              </div>
            </div>
          </section>

          {/* Problem */}
          <section className="section alt" aria-labelledby="why-title">
            <div className="wrap">
              <p className="kicker">لماذا Vitalix-ai</p>
              <h2 id="why-title">مريضك المزمن سيصرف دواءه في كل الأحوال. المهم من أي صيدلية.</h2>
              <ul className="losses">
                <li className="loss">
                  <span className="loss-icon"><svg className="i" aria-hidden="true"><use href="#i-pill"/></svg></span>
                  <div>
                    <h3>علبته القادمة قد تكون من صيدلية أخرى</h3>
                    <p>مريض الضغط أو السكري يحتاج علبة جديدة كل شهر. إذا لم تتواصل معه صيدليتك قبل أن ينفد دواؤه، فقد يشتريها من صيدلية أخرى في طريقه.</p>
                  </div>
                </li>
                <li className="loss">
                  <span className="loss-icon"><svg className="i" aria-hidden="true"><use href="#i-pulse"/></svg></span>
                  <div>
                    <h3>قراءات المريض لا تُحفظ</h3>
                    <p>في كثير من الصيدليات يُقاس ضغط المريض أو سكره ثم لا تُسجَّل القراءة في أي مكان. وفي زيارته التالية لا تعرف إن كانت قراءاته تتحسّن أم تسوء.</p>
                  </div>
                </li>
                <li className="loss">
                  <span className="loss-icon"><svg className="i" aria-hidden="true"><use href="#i-out"/></svg></span>
                  <div>
                    <h3>نصيحتك قد تُنسى بعد أن يخرج المريض</h3>
                    <p>تشرح للمريض قراءته وتنصحه، لكنه يخرج دون شيء مكتوب يرجع إليه. ومع الوقت قد ينسى النصيحة، وينسى أي صيدلية اهتمت به.</p>
                  </div>
                </li>
                <li className="loss">
                  <span className="loss-icon"><svg className="i" aria-hidden="true"><use href="#i-box"/></svg></span>
                  <div>
                    <h3>فرصة بيع قد تضيع في كل زيارة</h3>
                    <p>مريض ضغطه مرتفع قد يحتاج جهاز قياس منزلياً، ومريض يتّبع خطة وزن قد يحتاج مكمّلاً مناسباً. إذا لم يُقترح عليه المنتج المناسب وقت الزيارة، فقد يشتريه من مكان آخر أو لا يشتريه أبداً.</p>
                  </div>
                </li>
              </ul>
            </div>
          </section>

          {/* Modules */}
          <section className="section" id="system" aria-labelledby="system-title">
            <div className="wrap">
              <p className="kicker">داخل النظام</p>
              <h2 id="system-title">ثماني أدوات تعمل معاً لمتابعة مرضاك</h2>
              <p className="sec-lede">الأمثلة أدناه ببيانات تجريبية.</p>

              <div className="modules">

                {/* Chronic */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-pill"/></svg>الأدوية المزمنة</span>
                    <h3>مريضك المزمن يبقى مريضك</h3>
                    <p>سجّل أدوية مريضك المزمنة في ملفه، وكم حبة يأخذ منها يومياً. يحسب النظام متى سينتهي كل دواء ويخبرك قبل نفاده بأيام، فترسل للمريض تذكيراً على واتساب من رقم صيدليتك، وتجهّز علبته قبل أن يأتي.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تعرف كل يوم من يقترب دواؤه من النفاد</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تذكير على واتساب باسم صيدليتك بضغطة زر</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تجهّز الكمية المطلوبة من المخزون قبل وصول المريض</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لقائمة الأدوية المزمنة مع موعد نفاد كل علبة">
                      <div className="screen-head">
                        <span className="screen-title">الأدوية المزمنة</span>
                        <span className="chip chip-warn">اليوم: 2 للتواصل</span>
                      </div>
                      <div className="screen-body">
                        <div className="rx">
                          <span className="rx-name">محمود خليل</span>
                          <span className="rx-drug">ميتفورمين 850 ملغ · حبتان يومياً</span>
                          <span className="chip chip-high">تنفد اليوم</span>
                          <span className="supply is-high" style={{ '--w': '4%' } as CSSProperties}><i></i></span>
                        </div>
                        <div className="rx">
                          <span className="rx-name">سارة أحمد</span>
                          <span className="rx-drug">أملوديبين 5 ملغ · حبة يومياً</span>
                          <span className="chip chip-warn">بعد 3 أيام</span>
                          <span className="supply is-warn" style={{ '--w': '10%' } as CSSProperties}><i></i></span>
                        </div>
                        <div className="rx">
                          <span className="rx-name">ليلى يوسف</span>
                          <span className="rx-drug">أتورفاستاتين 20 ملغ · حبة يومياً</span>
                          <span className="chip chip-flat">بعد 12 يوماً</span>
                          <span className="supply" style={{ '--w': '40%' } as CSSProperties}><i></i></span>
                        </div>
                      </div>
                      <div className="prep">
                        <p className="prep-title"><svg className="i" aria-hidden="true"><use href="#i-box"/></svg>جهّز قبل وصول المرضى</p>
                        <div className="prep-row"><span>ميتفورمين 850 ملغ · علبتان</span><span>لمحمود خليل</span></div>
                        <div className="prep-row"><span>أملوديبين 5 ملغ · علبة واحدة</span><span>لسارة أحمد</span></div>
                      </div>
                    </div>
                  </div>
                </article>


                {/* Patient requests */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-box"/></svg>طلبات المرضى<span className="new">جديد</span></span>
                    <h3>دواء مريضك غير متوفر؟ تابعه حتى يصل</h3>
                    <p>سجّل طلب المريض عندما لا يتوفر الدواء في صيدليتك، وسجّل العربون إن دفعه. يعرف النظام ساعات دوام المستودعات وعطلة الجمعة، فيقدّر متى يصل الطلب، وينبّهك عندما يتأخر. وحين يصل الدواء تجد رسالة المريض جاهزة، فترسلها من رقم صيدليتك بضغطة زر.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تنبيه عندما يتأخر الطلب عن موعد وصوله المتوقع</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>رسالتا تأكيد ووصول جاهزتان على واتساب</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تعرف من الصفحة الرئيسية ما يحتاج متابعتك اليوم</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لقائمة طلبات المرضى مع حالة كل طلب">
                      <div className="screen-head">
                        <span className="screen-title">طلبات المرضى</span>
                        <span className="chip chip-warn">طلب متأخر</span>
                      </div>
                      <div className="screen-body">
                        <div className="rx">
                          <span className="rx-name">ريم سامي</span>
                          <span className="rx-drug">سيتاليبتين 50 ملغ · علبة واحدة</span>
                          <span className="chip chip-high">تأخر يوماً</span>
                        </div>
                        <div className="rx">
                          <span className="rx-name">محمود خليل</span>
                          <span className="rx-drug">ميتفورمين 850 ملغ · علبتان</span>
                          <span className="chip chip-flat">بانتظار المستودع</span>
                        </div>
                        <div className="rx">
                          <span className="rx-name">هالة سمير</span>
                          <span className="rx-drug">أملوديبين 5 ملغ · علبة واحدة</span>
                          <span className="chip chip-ok">وصل</span>
                        </div>
                      </div>
                    </div>
                    <div className="handoff"><svg className="i" aria-hidden="true"><use href="#i-down"/></svg>وحين يصل الدواء، تصل المريض من رقم صيدليتك</div>
                    <div className="chat" role="img" aria-label="مثال لرسالة وصول الطلب كما تصل المريض على واتساب">
                      <div className="chat-head">
                        <span className="avatar"><svg aria-hidden="true"><use href="#i-store"/></svg></span>
                        <span className="chat-who"><b>صيدليتك</b><small>واتساب</small></span>
                      </div>
                      <div className="bubble">
                        <p>أهلاً ريم، وصل طلبك من الصيدلية ويمكنك استلامه متى شئتِ.</p>
                        <time>11:20</time>
                      </div>
                    </div>
                  </div>
                </article>

                {/* Prescription register */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-doc"/></svg>سجل الوصفات<span className="new">جديد</span></span>
                    <h3>سجل وصفاتك جاهز عندما تطلبه لجنة التفتيش</h3>
                    <p>سجّل كل وصفة وقت صرفها: اسم المريض والأدوية، وأرفق صورتها إن أردت. تُرتَّب الوصفات بحسب اليوم، وتبحث فيها وتصفّيها، وتربطها بملف المريض عندما يكون مسجّلاً عندك. وعند زيارة اللجنة تصدّر ملف PDF يحمل اسم صيدليتك، مرتباً من الأقدم إلى الأحدث، وتسلّمه لهم.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>صورة الوصفة أو ملف PDF مرفق بكل وصفة</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>ربط اختياري بملف المريض، دون أن يكون الملف شرطاً</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تصدير PDF مرتّب باسم صيدليتك</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-shield"/></svg>أي تعديل أو حذف يُسجَّل لمالك الصيدلية في سجلّ النشاط</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لسجل وصفات اليوم">
                      <div className="screen-head">
                        <span className="screen-title">سجل الوصفات <small>اليوم</small></span>
                        <span className="chip chip-ok">3 وصفات</span>
                      </div>
                      <div className="screen-body">
                        <div className="rx">
                          <span className="rx-name">ريم سامي</span>
                          <span className="rx-drug">سيتاليبتين 50 ملغ</span>
                          <span className="chip chip-flat">9:40 ص</span>
                        </div>
                        <div className="rx">
                          <span className="rx-name">هالة سمير</span>
                          <span className="rx-drug">ميتفورمين 500 ملغ · أتورفاستاتين 20 ملغ · أسبرين 81 ملغ</span>
                          <span className="chip chip-flat">11:15 ص</span>
                        </div>
                        <div className="rx">
                          <span className="rx-name">محمود خليل</span>
                          <span className="rx-drug">أملوديبين 5 ملغ</span>
                          <span className="chip chip-flat">4:05 م</span>
                        </div>
                      </div>
                    </div>
                    <div className="handoff"><svg className="i" aria-hidden="true"><use href="#i-doc"/></svg>وعند طلب اللجنة، ملف باسم صيدليتك</div>
                    <div className="doc" role="img" aria-label="مثال لسجل الوصفات بصيغة PDF يحمل اسم الصيدلية">
                      <div className="doc-head">
                        <span className="avatar"><svg aria-hidden="true"><use href="#i-store"/></svg></span>
                        <span className="chat-who"><b>صيدليتك</b><small>العنوان ورقم الهاتف</small></span>
                        <span className="chip chip-flat doc-tag"><span className="ltr">PDF</span></span>
                      </div>
                      <p className="doc-title">سجلّ الوصفات الطبية</p>
                      <p className="doc-meta">من <span className="ltr">15/10/2026</span> إلى <span className="ltr">21/10/2026</span></p>
                      <table className="doc-table txt">
                        <thead><tr><th>م</th><th>المريض</th><th>الدواء</th><th>الوقت</th></tr></thead>
                        <tbody>
                          <tr><td className="m">1</td><td>ريم سامي</td><td>سيتاليبتين 50 ملغ</td><td className="t">9:40 ص</td></tr>
                          <tr><td className="m" rowSpan={3}>2</td><td rowSpan={3}>هالة سمير</td><td>ميتفورمين 500 ملغ</td><td className="t" rowSpan={3}>11:15 ص</td></tr>
                          <tr><td>أتورفاستاتين 20 ملغ</td></tr>
                          <tr><td>أسبرين 81 ملغ</td></tr>
                          <tr><td className="m">3</td><td>محمود خليل</td><td>أملوديبين 5 ملغ</td><td className="t">4:05 م</td></tr>
                        </tbody>
                      </table>
                      <div className="doc-foot"><span>الأربعاء <span className="ltr">21/10/2026</span></span><span>عدد الوصفات: 3</span></div>
                    </div>
                  </div>
                </article>

                {/* Birthdays */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-gift"/></svg>أعياد ميلاد المرضى</span>
                    <h3>تهنئة من صيدليتك في يوم ميلاد مريضك</h3>
                    <p>يعرف النظام تاريخ ميلاد كل مريض، فينبّهك في يوم عيد ميلاده. بضغطة زر تصله تهنئة على واتساب من صيدليتك، فيشعر أن صيدليته تعرفه وتهتم به.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تنبيه في يوم ميلاد كل مريض</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تهنئة جاهزة تخرج من رقم صيدليتك</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>لمسة شخصية تقوّي علاقة المريض بصيدليتك</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لتنبيه أعياد ميلاد المرضى اليوم مع زر تهنئة على واتساب">
                      <div className="screen-head">
                        <span className="screen-title">أعياد ميلاد اليوم</span>
                        <span className="chip chip-ok">مريضان</span>
                      </div>
                      <div className="screen-body">
                        <div className="bday">
                          <span className="initial" aria-hidden="true">ه</span>
                          <span className="bday-who"><b>هالة سمير</b><small>عيد ميلادها اليوم</small></span>
                          <span className="mini-wa"><svg className="i" aria-hidden="true"><use href="#i-chat"/></svg>أرسل التهنئة</span>
                        </div>
                        <div className="bday">
                          <span className="initial" aria-hidden="true">ي</span>
                          <span className="bday-who"><b>يوسف خالد</b><small>عيد ميلاده اليوم</small></span>
                          <span className="mini-wa"><svg className="i" aria-hidden="true"><use href="#i-chat"/></svg>أرسل التهنئة</span>
                        </div>
                      </div>
                    </div>
                    <div className="handoff"><svg className="i" aria-hidden="true"><use href="#i-down"/></svg>تصل المريض من رقم صيدليتك</div>
                    <div className="chat" role="img" aria-label="مثال لرسالة تهنئة بعيد الميلاد كما تصل المريض">
                      <div className="chat-head">
                        <span className="avatar"><svg aria-hidden="true"><use href="#i-store"/></svg></span>
                        <span className="chat-who"><b>صيدليتك</b><small>واتساب</small></span>
                      </div>
                      <div className="bubble">
                        <p>كل عام وأنتِ بخير يا هالة. أسرة صيدليتك تتمنى لكِ عاماً مليئاً بالصحة والعافية.</p>
                        <time>09:15</time>
                      </div>
                    </div>
                  </div>
                </article>

                {/* Vitals */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-pulse"/></svg>القياسات والملخّص الذكي</span>
                    <h3>الذكاء الاصطناعي يشرح للمريض قراءاته</h3>
                    <p>عندما تقيس للمريض ضغطه أو سكره أو وزنه، سجّل القراءة في النظام. يحلّلها ذكاء اصطناعي مخصّص للعمل الصيدلاني، يأخذ في حسابه عمر المريض وتشخيصه وحساسياته وقراءاته السابقة، ويمرّ بعدة مراحل من التدقيق قبل أن يصلك. والنتيجة ملخّص موثوق بلغة بسيطة يخبر المريض هل قراءته طبيعية أم مرتفعة، وما الخطوة التالية. تراجعه أنت، ثم ترسله له على واتساب باسم صيدليتك، ومعه رابط صفحة فيها تفاصيل زيارته ومنتجات مقترحة له من رفّ صيدليتك.</p>
                    <p>وإذا طلب الطبيب من المريض سجلّاً بقراءاته خلال فترة، تجهّزه له صيدليتك من النظام ملف PDF منظّماً يحمل اسمها، يأخذه إلى طبيبه.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>ذكاء اصطناعي مخصّص بعدة مراحل تدقيق، وأنت تعتمد النتيجة</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>قراءات كل زيارة محفوظة لتقارن بها لاحقاً</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>سجلّ قراءات PDF باسم صيدليتك يأخذه المريض إلى طبيبه</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لقياسات زيارة اليوم والملخّص الذكي">
                      <div className="screen-head">
                        <span className="screen-title">زيارة اليوم <small>سارة أحمد · 64 سنة</small></span>
                      </div>
                      <div className="screen-body">
                        <div className="readings">
                          <div className="reading is-warn">
                            <span className="r-label">ضغط الدم</span>
                            <span className="r-val">148/92</span>
                            <span className="r-unit">mmHg</span>
                            <span className="r-flag">أعلى من حدّها</span>
                          </div>
                          <div className="reading is-ok">
                            <span className="r-label">سكر صائم</span>
                            <span className="r-val">96</span>
                            <span className="r-unit">mg/dL</span>
                            <span className="r-flag">طبيعي</span>
                          </div>
                          <div className="reading">
                            <span className="r-label">الوزن</span>
                            <span className="r-val">84.2</span>
                            <span className="r-unit">kg</span>
                            <span className="r-flag"><span className="ltr">BMI 29.1</span></span>
                          </div>
                        </div>
                        <div className="ai-row">
                          <svg className="i" aria-hidden="true"><use href="#i-spark"/></svg>
                          <b>الملخّص الذكي</b>
                          <span className="chip chip-ok">راجعه الصيدلاني</span>
                        </div>
                      </div>
                    </div>
                    <div className="handoff"><svg className="i" aria-hidden="true"><use href="#i-down"/></svg>يصل المريض من رقم صيدليتك</div>
                    <div className="chat" role="img" aria-label="مثال لرسالة الملخّص كما تصل المريض على واتساب">
                      <div className="chat-head">
                        <span className="avatar"><svg aria-hidden="true"><use href="#i-store"/></svg></span>
                        <span className="chat-who"><b>صيدليتك</b><small>واتساب</small></span>
                      </div>
                      <div className="bubble">
                        <p>أهلاً سارة، قراءة ضغطك اليوم <span className="ltr">148/92</span>، وهي أعلى قليلاً من المعدّل المناسب لك. سكرك الصائم 96 وهو ضمن الطبيعي. نرجو أن تمرّي علينا لإعادة القياس خلال أسبوع.</p>
                        <span className="bubble-link"><svg className="i" aria-hidden="true"><use href="#i-arrow"/></svg>تفاصيل زيارتك ومنتجات تناسبك على صفحتك</span>
                        <time>10:47</time>
                      </div>
                    </div>
                    <div className="handoff"><svg className="i" aria-hidden="true"><use href="#i-doc"/></svg>وعند طلب الطبيب، سجلّ قراءات باسم صيدليتك</div>
                    <div className="doc" role="img" aria-label="مثال لسجل قراءات الضغط والسكر بصيغة PDF يحمل اسم الصيدلية">
                      <div className="doc-head">
                        <span className="avatar"><svg aria-hidden="true"><use href="#i-store"/></svg></span>
                        <span className="chat-who"><b>صيدليتك</b><small>العنوان ورقم الهاتف</small></span>
                        <span className="chip chip-flat doc-tag"><span className="ltr">PDF</span></span>
                      </div>
                      <p className="doc-title">سجلّ قراءات الضغط والسكر</p>
                      <p className="doc-meta">سارة أحمد · من <span className="ltr">14/9/2026</span> إلى <span className="ltr">14/10/2026</span></p>
                      <table className="doc-table">
                        <thead><tr><th>التاريخ</th><th>الضغط <span className="ltr">mmHg</span></th><th>سكر صائم <span className="ltr">mg/dL</span></th></tr></thead>
                        <tbody>
                          <tr><td>14/9</td><td className="hi">152/94</td><td>101</td></tr>
                          <tr><td>21/9</td><td className="hi">150/93</td><td>99</td></tr>
                          <tr><td>28/9</td><td>146/90</td><td>97</td></tr>
                          <tr><td>7/10</td><td>144/88</td><td>95</td></tr>
                          <tr><td>14/10</td><td className="hi">148/92</td><td>96</td></tr>
                        </tbody>
                      </table>
                      <div className="doc-foot"><span>المتوسط: <span className="ltr">148/91</span> · <span className="ltr">98</span></span><span>الصيدلاني: د. هبة ناصر</span></div>
                    </div>
                  </div>
                </article>

                {/* Weight */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-scale"/></svg>خطة الوزن</span>
                    <h3>صيدليتك تقدّم خدمة متابعة الوزن والتغذية</h3>
                    <p>تقيس وزن المريض وطوله، فيجهّز الذكاء الاصطناعي من ملفه نظاماً غذائياً وعادات يومية صحية تناسب هدفه، سواء أراد إنقاص وزنه أو زيادته، مع منتجات من رفّ صيدليتك تناسب حالته. ويراعي في ذلك أدويته إن وُجدت، وحساسياته من الأطعمة، والحمل والإرضاع.</p>
                    <p>يحصل المريض على صفحة على هاتفه فيها خطته، ويعود إليك ليقيس وزنه ويرى تقدّمه من زيارة إلى أخرى.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>نظام غذائي وعادات يومية تناسب هدف كل مريض</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>تراعي تداخل أدويته مع الطعام وحساسياته</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>منتجات مقترحة من رفّ صيدليتك تناسب حالته</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen">
                      <div className="screen-head">
                        <span className="screen-title">خطة الوزن <small>خالد عمر</small></span>
                        <span className="chip chip-ok"><span className="ltr">−4.3</span> كغ</span>
                      </div>
                      <div className="screen-body">
                        <svg className="chart" viewBox="0 0 320 170" role="img" aria-label="وزن خالد عمر عبر خمس زيارات، من 92.4 إلى 88.1 كغ، والهدف الأول 86 كغ">
                          <text className="ch-x" x="36" y="9" textAnchor="end">كغ</text>
                          <line className="ch-grid" x1="44" y1="20" x2="304" y2="20"/>
                          <line className="ch-grid" x1="44" y1="68" x2="304" y2="68"/>
                          <text className="ch-axis" x="36" y="24" textAnchor="end">94</text>
                          <text className="ch-axis" x="36" y="72" textAnchor="end">90</text>
                          <text className="ch-axis" x="36" y="120" textAnchor="end">86</text>
                          <path className="ch-area" d="M44 39.2 L108 54.8 L172 68 L236 77.6 L300 90.8 L300 140 L44 140 Z"/>
                          <line className="ch-goal" x1="44" y1="116" x2="304" y2="116"/>
                          <text className="ch-goal-lbl" x="304" y="110" textAnchor="end">الهدف الأول</text>
                          <line className="ch-base" x1="44" y1="140" x2="304" y2="140"/>
                          <polyline className="ch-line" pathLength="1" points="44,39.2 108,54.8 172,68 236,77.6 300,90.8"/>
                          <circle className="ch-dot" cx="44" cy="39.2" r="4"/>
                          <circle className="ch-dot" cx="108" cy="54.8" r="4"/>
                          <circle className="ch-dot" cx="172" cy="68" r="4"/>
                          <circle className="ch-dot" cx="236" cy="77.6" r="4"/>
                          <circle className="ch-end" cx="300" cy="90.8" r="6"/>
                          <text className="ch-lbl" x="300" y="76" textAnchor="middle">88.1</text>
                          <text className="ch-x" x="44" y="160" textAnchor="middle">البداية</text>
                          <text className="ch-x" x="108" y="160" textAnchor="middle">أسبوع 2</text>
                          <text className="ch-x" x="172" y="160" textAnchor="middle">أسبوع 4</text>
                          <text className="ch-x" x="236" y="160" textAnchor="middle">أسبوع 6</text>
                          <text className="ch-x" x="296" y="160" textAnchor="middle">أسبوع 8</text>
                        </svg>
                        <div className="stats">
                          <div className="stat"><span>البداية</span><b>92.4<small>كغ</small></b></div>
                          <div className="stat"><span>الآن</span><b>88.1<small>كغ</small></b></div>
                          <div className="stat"><span>الهدف الأول</span><b>86.0<small>كغ</small></b></div>
                        </div>
                      </div>
                    </div>
                    <div className="handoff"><svg className="i" aria-hidden="true"><use href="#i-down"/></svg>وهذه خطته كما يراها على هاتفه</div>
                    <div className="phone" role="img" aria-label="مثال لصفحة خطة الوزن على هاتف المريض: وجبات وعادات ومنتجات مقترحة">
                      <div className="chat-head">
                        <span className="avatar"><svg aria-hidden="true"><use href="#i-store"/></svg></span>
                        <span className="chat-who"><b>صيدليتك</b><small>خطة خالد عمر</small></span>
                        <span className="chip chip-ok kcal"><span className="ltr">1,800</span> سعرة يومياً</span>
                      </div>
                      <div className="plan-sec">
                        <div className="plan-h">وجباتك اليوم</div>
                        <div className="meal"><b>الفطور</b><span>بيضتان مسلوقتان، شريحة خبز أسمر، خيار وبندورة</span></div>
                        <div className="meal"><b>الغداء</b><span>صدر دجاج مشوي، نصف كوب أرز بني، سلطة خضراء</span></div>
                        <div className="meal"><b>العشاء</b><span>كوب لبن قليل الدسم، حبة تفاح</span></div>
                      </div>
                      <div className="plan-sec">
                        <div className="plan-h">عادات يومية</div>
                        <div className="habit"><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>اشرب 8 أكواب ماء موزّعة على اليوم</div>
                        <div className="habit"><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>امشِ 30 دقيقة بعد العشاء</div>
                        <div className="habit"><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>نم 7 ساعات على الأقل</div>
                      </div>
                      <div className="plan-sec">
                        <div className="plan-h">منتجات مقترحة لك من صيدليتك</div>
                        <div className="prod">
                          <span className="thumb"><svg className="i" aria-hidden="true"><use href="#i-scale"/></svg></span>
                          <span className="prod-name"><b>ميزان وزن رقمي</b><small>لمتابعة وزنك في البيت</small></span>
                        </div>
                        <div className="prod">
                          <span className="thumb"><svg className="i" aria-hidden="true"><use href="#i-box"/></svg></span>
                          <span className="prod-name"><b>مكمّل ألياف غذائية</b><small>يساعد على الشعور بالشبع</small></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                {/* Catalog */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-box"/></svg>كتالوج المنتجات</span>
                    <h3>فرص بيع أكثر، بمنتجات تناسب كل مريض</h3>
                    <p>صوّر علبة أي منتج على رفّ صيدليتك، من مكمّلات وأجهزة ومستلزمات، فيقرأ الذكاء الاصطناعي العلبة ويجهّز له بطاقة أمان: مكوّناته، وما فيه من مسبّبات حساسية، وهل يناسب الحامل والمرضعة. تراجع البطاقة وتؤكّدها.</p>              <p>بعدها، في كل زيارة أو خطة وزن، يقترح عليك النظام من منتجاتك ما يناسب حالة المريض، ويستبعد ما يتعارض مع حساسياته أو حمله. تختار ما تريد، فيظهر للمريض بصورته على صفحته.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>صوّر العلبة، والذكاء الاصطناعي يجهّز بطاقة الأمان</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>اقتراحات تناسب حالة كل مريض وتستبعد ما لا يناسبه</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>منتجاتك تظهر للمريض بصورها على صفحته</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-shield"/></svg>لا يقبل أي دواء، وأربع طبقات حماية، منها ذكاء اصطناعي مخصّص، تمنع إدخاله ولو بالخطأ</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لبطاقة أمان منتج وملاءمته لمريضين">
                      <div className="screen-head">
                        <span className="screen-title">بطاقة الأمان</span>
                        <span className="chip chip-ok">أكّدها الصيدلاني</span>
                      </div>
                      <div className="screen-body">
                        <div className="product">
                          <span className="thumb thumb-photo">{/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/welcome/omega3.jpg" alt="عبوة أوميغا 3" width="64" height="64" loading="lazy" /></span>
                          <span className="product-name"><b>أوميغا 3 · 1000 ملغ</b><span>مكمّل غذائي · كبسولات</span></span>
                        </div>
                        <div className="safety">
                          <div className="fact"><span>مسبّبات الحساسية</span><span className="chip chip-warn">سمك</span></div>
                          <div className="fact"><span>يحتوي سكراً</span><span className="chip chip-flat">لا</span></div>
                          <div className="fact"><span>الحمل</span><span className="chip chip-ok">مناسب</span></div>
                          <div className="fact"><span>الإرضاع</span><span className="chip chip-ok">مناسب</span></div>
                        </div>
                        <p className="fit-title">اقتراحه لمرضاك</p>
                        <div className="fit">
                          <span className="fit-who"><b>ريم سامي</b><small>حساسية مسجّلة من السمك</small></span>
                          <span className="chip chip-high">غير مناسب</span>
                        </div>
                        <div className="fit">
                          <span className="fit-who"><b>خالد عمر</b><small>لا تعارض مع ملفه</small></span>
                          <span className="chip chip-ok">مناسب</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                {/* Team */}
                <article className="module">
                  <div className="module-copy">
                    <span className="tag"><svg className="i" aria-hidden="true"><use href="#i-users"/></svg>فريق الصيدلية</span>
                    <h3>كل موظف بحسابه، وكل خطوة مسجّلة باسمه</h3>
                    <p>يدخل كل موظف برمز خاص من 6 أرقام. يُسجَّل كل قياس وكل رسالة وكل تجديد باسم من قام به، فتعرف من خدم كل مريض ومتى.</p>
                    <ul className="points">
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>صلاحيات تحفظ خصوصية ملفات المرضى</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>سجلّ نشاط يومي للصيدلية</li>
                      <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>إضافة الموظفين وإدارتهم من حساب المالك</li>
                    </ul>
                  </div>
                  <div className="module-art">
                    <div className="screen" role="img" aria-label="مثال لسجل نشاط موظفي الصيدلية">
                      <div className="screen-head">
                        <span className="screen-title">سجلّ النشاط <small>اليوم</small></span>
                      </div>
                      <div className="screen-body">
                        <ul className="log">
                          <li><time>10:42</time><span className="initial" aria-hidden="true">ر</span><p><b>رنا محمد</b> سجّلت قياس ضغط لسارة أحمد</p></li>
                          <li><time>10:47</time><span className="initial" aria-hidden="true">ر</span><p><b>رنا محمد</b> أرسلت الملخّص الذكي لسارة أحمد</p></li>
                          <li><time>12:18</time><span className="initial" aria-hidden="true">ع</span><p><b>عمر سليم</b> جدّد الدواء المزمن لمحمود خليل</p></li>
                        </ul>
                      </div>
                      <div className="screen-foot">
                        <svg className="i" aria-hidden="true"><use href="#i-shield"/></svg>
                        دخول الموظف برمزه الخاص
                        <span className="pin" aria-hidden="true"><i className="on"></i><i className="on"></i><i className="on"></i><i className="on"></i><i></i><i></i></span>
                      </div>
                    </div>
                  </div>
                </article>

              </div>
            </div>
          </section>

          {/* AI */}
          <section className="section alt" aria-labelledby="ai-title">
            <div className="wrap">
              <p className="kicker">الذكاء الاصطناعي في Vitalix-ai</p>
              <h2 id="ai-title">أربع خطوات قبل أن يصل الملخّص إلى مريضك</h2>
              <p className="sec-lede">الملخّص الذي يكتبه الذكاء الاصطناعي يمرّ بثلاث خطوات تدقيق داخل النظام، ثم يصلك أنت لتعتمده.</p>
              <ol className="layers">
                <li className="layer">
                  <span className="layer-n">1</span>
                  <div><h3>فحص القراءات بقواعد طبية ثابتة</h3><p>قبل أي كتابة، يقارن النظام قراءات المريض بالحدود المعتمدة لعمره وتشخيصه، فيعرف إن كانت طبيعية أم مرتفعة.</p></div>
                </li>
                <li className="layer">
                  <span className="layer-n">2</span>
                  <div><h3>كتابة الملخّص ضمن حدود صارمة</h3><p>يكتب الذكاء الاصطناعي الملخّص بلغة بسيطة، ملتزماً بنتيجة الفحص وبقواعد تمنعه من التشخيص أو اقتراح الأدوية.</p></div>
                </li>
                <li className="layer">
                  <span className="layer-n">3</span>
                  <div><h3>تدقيق ثانٍ للملخّص</h3><p>يمرّ الملخّص على مرحلة تدقيق ثانية تضبط طوله ووضوحه قبل أن يصلك.</p></div>
                </li>
                <li className="layer is-you">
                  <span className="layer-n">4</span>
                  <div><h3>مراجعتك واعتمادك</h3><p>تقرأ الملخّص وتعدّله إن أردت، ولا يصل إلى المريض إلا عندما ترسله أنت.</p></div>
                </li>
              </ol>
              <div className="build">
                <h3>بُني بأيدي صيادلة ذوي خبرة ومهندسي برمجيات</h3>
                <p>كل أداة في Vitalix-ai صمّمها صيادلة يعملون في الميدان مع فريق هندسي، وتعمل فوق بنية ذكاء اصطناعي متعددة الطبقات.</p>
                <ul className="specs">
                  <li>وكلاء ذكاء اصطناعي مستقلون لكل مجال، القياسات والتغذية والمنتجات، معزولون عن بعضهم تماماً</li>
                  <li>محرّك قواعد سريرية حتمي يسبق كل نموذج لغوي</li>
                  <li>مخطّطات استجابة صارمة تقيّد ما يكتبه النموذج</li>
                  <li>فحص حتمي لمسبّبات الحساسية والحمل والإرضاع قبل أي اقتراح</li>
                  <li>جداول تداخلات دواء وغذاء راجعها صيادلة</li>
                  <li>عزل كامل لبيانات كل صيدلية على مستوى قاعدة البيانات</li>
                </ul>
              </div>
              <div className="boundary">
                <svg className="i" aria-hidden="true"><use href="#i-shield"/></svg>
                <p><b>Vitalix-ai لا يشخّص ولا يقترح أدوية أو علاجات.</b> هو أداة تساعدك على متابعة مرضاك، وتقرّبك منهم، وتحافظ عليهم.</p>
              </div>
            </div>
          </section>

          {/* Getting started */}
          <section className="section" aria-labelledby="start-title">
            <div className="wrap">
              <p className="kicker">كيف تبدأ</p>
              <h2 id="start-title">أربع خطوات لتبدأ باستخدام Vitalix-ai</h2>
              <p className="sec-lede">نرافقك من أول رسالة حتى يصبح النظام جزءاً من عمل صيدليتك اليومي.</p>
              <ol className="layers">
                <li className="layer">
                  <span className="layer-n">1</span>
                  <div><h3>تواصل معنا على واتساب</h3><p>راسلنا، فنجيب عن أسئلتك ونخبرك بتفاصيل عرض الإطلاق.</p></div>
                </li>
                <li className="layer">
                  <span className="layer-n">2</span>
                  <div><h3>نجهّز حساب صيدليتك</h3><p>ننشئ حساب صيدليتك ونضيف موظفيك، ولكل موظف رمز دخول خاص به.</p></div>
                </li>
                <li className="layer">
                  <span className="layer-n">3</span>
                  <div><h3>ندرّب فريقك</h3><p>نعلّم فريقك استخدام النظام خطوة بخطوة خلال فترة التدريب.</p></div>
                </li>
                <li className="layer">
                  <span className="layer-n">4</span>
                  <div><h3>تبدأ بتسجيل مرضاك</h3><p>سجّل مرضاك وأدويتهم وقياساتهم، ويبدأ النظام بتنبيهك ومساعدتك في متابعتهم.</p></div>
                </li>
              </ol>
            </div>
          </section>

          {/* Offer and contact */}
          <section className="band" id="contact" aria-labelledby="offer-title">
            <div className="wrap">
              <div className="band-copy">
                <p className="kicker">عرض الإطلاق · لأول 100 صيدلية فقط</p>
                <h2 id="offer-title">سعر تشجيعي وفترة مجانية لأول 100 صيدلية</h2>
                <ul className="offer-list">
                  <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>سعر إطلاق تشجيعي لا يتكرر</li>
                  <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>فترة مجانية إضافية مع اشتراكك الأول</li>
                  <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>كل أدوات النظام دون استثناء</li>
                  <li><svg className="i" aria-hidden="true"><use href="#i-check"/></svg>إعداد حساب صيدليتك وموظفيك، وتدريب فريقك</li>
                </ul>
                <a className="btn btn-wa" href={waLink(`${src}-offer`)} target="_blank" rel="noopener">
                  <svg className="i" aria-hidden="true"><use href="#i-chat"/></svg>احجز مكان صيدليتك على واتساب
                </a>
                <p className="offer-note">العرض مرة واحدة لكل صيدلية، وينتهي باشتراك أول 100 صيدلية. تفاصيله على واتساب.</p>
              </div>
              <div className="contact">
                <div className="contact-row">
                  <span className="ci"><svg className="i" aria-hidden="true"><use href="#i-phone"/></svg></span>
                  <span className="c-text">
                    <span className="c-label">واتساب واتصال</span>
                    <span className="c-val" id="c-phone">{PHONE_DISPLAY}</span>
                    <span className="c-sub"><a href={`tel:+${WHATSAPP_NUMBER}`}>اتصل الآن</a></span>
                  </span>
                  <button className="copy" type="button" data-copy={PHONE_RAW} aria-controls="c-phone" aria-label="نسخ رقم الهاتف">
                    <svg className="i" aria-hidden="true"><use href="#i-copy"/></svg><span className="copy-label">نسخ</span>
                  </button>
                </div>
                <div className="contact-row">
                  <span className="ci"><svg className="i" aria-hidden="true"><use href="#i-mail"/></svg></span>
                  <span className="c-text">
                    <span className="c-label">البريد الإلكتروني</span>
                    <span className="c-val" id="c-mail">{SALES_EMAIL}</span>
                    <span className="c-sub"><a href={`mailto:${SALES_EMAIL}`}>أرسل رسالة</a></span>
                  </span>
                  <button className="copy" type="button" data-copy={SALES_EMAIL} aria-controls="c-mail" aria-label="نسخ البريد الإلكتروني">
                    <svg className="i" aria-hidden="true"><use href="#i-copy"/></svg><span className="copy-label">نسخ</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

        </main>

        <footer className="foot">
          <div className="wrap">
            <span className="foot-brand"><span className="logo" aria-hidden="true"></span><b>Vitalix-ai</b> · تابع مرضاك بذكاء</span>
            <span><span className="ltr">© 2026</span> جميع الحقوق محفوظة · <span className="ltr">vitalix-ai.com</span></span>
      {SOCIAL_LINKS.length > 0 && (
        <span className="foot-social">
          {SOCIAL_LINKS.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
          ))}
        </span>
      )}
          </div>
        </footer>

      <a className="wa-float" href={waLink(`${src}-float`)} target="_blank" rel="noopener">
        <svg className="i" aria-hidden="true"><use href="#i-chat"/></svg>تواصل معنا على واتساب
      </a>
      <WelcomeEffects />
    </div>
  );
}
