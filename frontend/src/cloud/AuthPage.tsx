import { useState, type FormEvent } from 'react';
import { Cloud, Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { requireSupabase } from './client';

type Mode = 'login' | 'signup' | 'reset' | 'update';

function friendlyError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (/email not confirmed/i.test(message)) return 'تحقق من بريدك الإلكتروني أولًا، ثم حاول مرة أخرى.';
  if (/already registered/i.test(message)) return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.';
  if (/password/i.test(message) && /characters|least/i.test(message)) return 'استخدم كلمة مرور من 8 أحرف على الأقل.';
  if (/rate limit/i.test(message)) return 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.';
  return message || 'تعذر إكمال العملية. حاول مرة أخرى.';
}

export default function AuthPage({ recovery = false, onRecoveryDone }: { recovery?: boolean; onRecoveryDone?: () => void }) {
  const [mode, setMode] = useState<Mode>(recovery ? 'update' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirm('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode !== 'reset' && password.length < 8) return setError('استخدم كلمة مرور من 8 أحرف على الأقل.');
    if ((mode === 'signup' || mode === 'update') && password !== confirm) return setError('كلمتا المرور غير متطابقتين.');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else if (mode === 'signup') {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { data, error: authError } = await requireSupabase().auth.signUp({
          email: email.trim(), password,
          options: { data: { name: name.trim() }, emailRedirectTo: redirectTo },
        });
        if (authError) throw authError;
        if (!data.session) setNotice('تم إنشاء الحساب. افتح رسالة التحقق التي وصلت إلى بريدك ثم سجّل الدخول.');
      } else if (mode === 'reset') {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error: authError } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (authError) throw authError;
        setNotice('أرسلنا رابط استعادة كلمة المرور إذا كان البريد مسجلًا.');
      } else {
        const { error: authError } = await requireSupabase().auth.updateUser({ password });
        if (authError) throw authError;
        setNotice('تم تحديث كلمة المرور بنجاح.');
        onRecoveryDone?.();
      }
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : 'تعذر إكمال العملية'));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'مرحبًا بعودتك' : mode === 'signup' ? 'أنشئ مساحتك الآمنة' : mode === 'reset' ? 'استعادة كلمة المرور' : 'كلمة مرور جديدة';
  const subtitle = mode === 'login' ? 'بياناتك ومهامك معك على كل جهاز.' : mode === 'signup' ? 'حساب واحد، مزامنة خاصة، ووصول من الجوال والكمبيوتر.' : mode === 'reset' ? 'أدخل بريدك وسنرسل لك رابطًا آمنًا.' : 'اختر كلمة مرور قوية لحسابك.';

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:flex sm:items-center sm:justify-center" dir="rtl">
      <div className="mx-auto grid w-full max-w-3xl overflow-hidden rounded-card border border-line bg-card shadow-md animate-fadeIn sm:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden bg-brand p-8 text-white sm:flex sm:flex-col sm:justify-between">
          <div className="absolute -start-16 -top-16 h-44 w-44 rounded-full bg-white/10" aria-hidden="true" />
          <div className="absolute -bottom-20 -end-20 h-56 w-56 rounded-full bg-black/10" aria-hidden="true" />
          <div className="relative">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><ShieldCheck className="h-5 w-5" /></div>
            <h1 className="text-2xl font-extrabold leading-tight">عِش آمن</h1>
            <p className="mt-2 max-w-xs text-[13px] leading-6 text-white/80">نظامك الشخصي للمهام والذاكرة واليوميات والأهداف، أصبح متاحًا بأمان على أجهزتك.</p>
          </div>
          <div className="relative space-y-2.5 text-[13px] text-white/85">
            <p className="flex items-center gap-2"><Cloud className="h-4 w-4 shrink-0" /> مزامنة تلقائية ومباشرة</p>
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0" /> كل حساب يرى بياناته فقط</p>
          </div>
        </section>

        <section className="p-6 sm:p-8">
          <div className="mb-5 sm:hidden"><p className="text-xl font-extrabold text-brand-dark">عِش آمن</p></div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-[13px] text-ink-faint">{subtitle}</p>
          <form className="mt-5 space-y-3" onSubmit={submit}>
            {mode === 'signup' && <label className="block"><span className="label">الاسم</span><div className="relative"><UserPlus className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-faint" /><input className="input !ps-10" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="اسمك" /></div></label>}
            {mode !== 'update' && <label className="block"><span className="label">البريد الإلكتروني</span><div className="relative"><Mail className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-faint" /><input className="input !ps-10" dir="ltr" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" /></div></label>}
            {mode !== 'reset' && <label className="block"><span className="label">كلمة المرور</span><div className="relative"><KeyRound className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-faint" /><input className="input !ps-10 !pe-10" dir="ltr" type={showPassword ? 'text' : 'password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="btn-icon absolute end-1.5 top-1" aria-label="إظهار كلمة المرور">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>}
            {(mode === 'signup' || mode === 'update') && <label className="block"><span className="label">تأكيد كلمة المرور</span><input className="input" dir="ltr" type={showPassword ? 'text' : 'password'} required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>}
            {error && <div className="rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger" role="alert">{error}</div>}
            {notice && <div className="rounded-lg border border-brand-lighter bg-brand-soft px-3.5 py-2.5 text-[13px] text-brand-dark" role="status">{notice}</div>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : mode === 'login' ? <LogIn className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}{mode === 'login' ? 'تسجيل الدخول' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'reset' ? 'إرسال رابط الاستعادة' : 'حفظ كلمة المرور'}</button>
          </form>
          {!recovery && <div className="mt-5 space-y-1.5 text-center text-[13px]">
            {mode === 'login' && <button className="text-brand-dark hover:underline" onClick={() => switchMode('reset')}>نسيت كلمة المرور؟</button>}
            <p className="text-ink-faint">{mode === 'signup' ? 'لديك حساب؟' : 'ليس لديك حساب؟'}{' '}<button className="font-bold text-brand-dark hover:underline" onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'سجّل الدخول' : 'أنشئ حسابًا'}</button></p>
            {mode === 'reset' && <button className="font-bold text-brand-dark hover:underline" onClick={() => switchMode('login')}>العودة لتسجيل الدخول</button>}
          </div>}
        </section>
      </div>
    </main>
  );
}

