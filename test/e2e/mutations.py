#!/usr/bin/env python3
"""اعتبارسنجی خود تست‌ها (mutation check): در یک «کپی» از پروژه عمداً رفتار را خراب می‌کند و انتظار دارد e2e شکست بخورد.
اگر تستی با جهش خراب سبز بماند، آن تست بی‌اثر است. اجرا: python3 test/e2e/mutations.py"""
import os,shutil,subprocess,sys,tempfile
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
M=[('کیبورد: غیرفعال‌کردن Enter/Space روی کارت','public/app.js',"e.target===c&&(e.key==='Enter'||e.key===' ')","false",'بعد از Enter'),
 ('حذف aria-current از کارت انتخاب‌شده','public/app.js',"${x.id===st.aid?' aria-current=\"true\"':''}","",'بعد از Enter'),
 ('ساعت نامشخص به‌جای «نامشخص» «بسته» نمایش داده شود','public/app.js',"unknown:['● ساعت کاری نامشخص','wn']","unknown:['● بسته','no']",'5 هر کارت'),
 ('ساعت بسته به‌جای «بسته» «باز» نمایش داده شود','public/app.js',"closed:['● بسته','no']","closed:['● باز (۰ تا ۲۴)','ok']",'5 هر کارت'),
 ('فیلتر «فقط بازها» نامشخص‌ها را هم نگه دارد','src/engine.js',"o.open&&hs.state!=='open'","o.open&&hs.state==='closed'",'«فقط بازها»'),
 ('مرتب‌سازی ترکیبی معکوس شود','src/engine.js',"smart:r=>r.score","smart:r=>-r.score",'4 مرتب‌سازی ترکیبی'),
 ('نام فروشگاه بدون escape (XSS)','public/app.js',"${fa(i+1)}. ${esc(x.name)}","${fa(i+1)}. ${x.name}",'10 '),
 ('انتخاب با کلیک نشانگر نقشه به کارت دیگری برود','public/app.js',"g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(g.dataset.pin,'pin')}}","g.onkeydown=null",'نشانگر نقشه')]
procs=[]
for n,(name,f,a,b,expect) in enumerate(M):
    d=tempfile.mkdtemp();shutil.copytree(ROOT,d+'/p',ignore=shutil.ignore_patterns('node_modules','.git'));p=d+'/p/'+f;s=open(p,encoding='utf8').read()
    if a not in s:print('جهش قابل اعمال نیست:',name);sys.exit(3)
    open(p,'w',encoding='utf8').write(s.replace(a,b,1))
    procs.append((name,expect,subprocess.Popen([sys.executable,d+'/p/test/e2e/e2e.py'],env={**os.environ,'E2E_PORT':str(4300+n)},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)))
bad=0
for name,expect,pr in procs:
    out=pr.communicate()[0];fails=[l for l in out.splitlines() if l.startswith('FAIL')];hit=[l for l in fails if expect in l]
    ok=pr.returncode!=0 and bool(hit);bad+=not ok
    print(('CAUGHT ' if ok else 'MISSED ')+name+(' → '+hit[0][5:90] if hit else ' (خروجی: %d شکست)'%len(fails)))
sys.exit(1 if bad else 0)
