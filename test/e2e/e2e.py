#!/usr/bin/env python3
"""تست‌های مرورگر واقعی (Playwright + Chromium). داده: مجموعه‌ی آزمایشی کوچک و کنترل‌شده (شامل متن‌های HTML مخرب) — داده‌ی ترب نیست.
اجرا: python3 test/e2e/e2e.py   (نیاز: playwright برای Python و Chromium؛ بخشی از `npm test` نیست)"""
import csv,json,os,subprocess,sys,tempfile,time,re,urllib.request
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))));PORT=int(os.environ.get('E2E_PORT','4177'));URL=f'http://localhost:{PORT}/'
def w(path,cols,rows):
    with open(path,'w',newline='',encoding='utf-8') as f:
        x=csv.writer(f);x.writerow(cols);[x.writerow([r.get(c,'') for c in cols]) for r in rows]
def make(d):
    sp=lambda c,r,s:json.dumps([{'key':'رنگ','section':'a','value':c},{'key':'مقدار رم','section':'a','value':r},{'key':'حافظه داخلی','section':'a','value':s}],ensure_ascii=False)
    P=[('1','گلکسی X1 <b onclick="window.__x=1">bold</b>','سامسونگ','X1','آبی','8 گیگابایت','256 گیگابایت'),('2','گلکسی X1 قرمز','سامسونگ','X1','قرمز','8 گیگابایت','256 گیگابایت'),('4','گلکسی X2','سامسونگ','X2','آبی','8 گیگابایت','256 گیگابایت'),('5','گلکسی X1 بزرگ','سامسونگ','X1','آبی','12 گیگابایت','512 گیگابایت'),
       ('3','<img src=x onerror="window.__x=8">','"><svg onload="window.__x=7">','M<script>window.__x=9</script>','<u>رنگ</u>','8 گیگابایت','256 گیگابایت')]
    w(d+'/products.csv',['product_id','persian_title','brand_name','category_name','image_urls','model','specs'],[dict(product_id=a,persian_title=b,brand_name=c,category_name='گوشی موبایل',model=m,specs=sp(co,r,s)) for a,b,c,m,co,r,s in P])
    h24=json.dumps([[0,24]]*7);closed=json.dumps([None]*7)
    w(d+'/shops.csv',['shop_id','name','address','lat','lng','working_hours','installment'],[
     dict(shop_id='S1',name='فروشگاه نزدیک',address='پاساژ <script>window.__x=6</script>',lat='35.7011',lng='51.3912',working_hours=h24,installment='false'),
     dict(shop_id='S2',name='<img src=x onerror="window.__x=5">',address='ونک',lat='35.7575',lng='51.411',working_hours=closed,installment=''),
     dict(shop_id='S3',name='فروشگاه ساعت نامعلوم',address='غرب',lat='35.78',lng='51.37',working_hours='',installment='true'),
     dict(shop_id='S4',name='فروشگاه دور',address='شرق',lat='35.80',lng='51.50',working_hours=h24,installment='true')])
    now=datetime.now(timezone.utc);iso=lambda h:(now-timedelta(hours=h)).isoformat()
    O=[('1','S1',10e6,iso(2),''),('1','S2',9e6,iso(5),'گارانتی ۱۸ ماهه'),('1','S3',9.5e6,'',''),('1','S4',8e6,iso(40*24),''),('2','S1',10.5e6,iso(1),''),('4','S1',11e6,iso(1),''),('5','S1',12e6,iso(1),''),('3','S1',7e6,iso(1),'<script>window.__x=10</script>')]
    w(d+'/offers.csv',['offer_id','product_id','shop_id','price_toman','last_price_changed_at','description','seller_title','warranty'],[dict(offer_id=f'o{i}',product_id=p,shop_id=s,price_toman=int(pr),last_price_changed_at=u,warranty=g) for i,(p,s,pr,u,g) in enumerate(O)])
R=[]
def check(name,ok,detail=''):
    ok=ok is True  # فقط True واقعی؛ مقدار truthy مبهم پذیرفته نمی‌شود
    R.append((name,ok,detail));print(('PASS ' if ok else 'FAIL ')+name+(' — '+str(detail) if (detail and not ok) else ''))
def lum(c):
    r,g,b=[v/255 for v in c];f=lambda v:v/12.92 if v<=.03928 else((v+.055)/1.055)**2.4;return .2126*f(r)+.7152*f(g)+.0722*f(b)
def ratio(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True);return (la+.05)/(lb+.05)
def rgb(s):return [float(x) for x in re.findall(r'[\d.]+',s)[:3]]
def num(s):return float(s.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٫','0123456789.')).split()[0])
def choose(pg,t):pg.locator('.chips button',has_text=t).first.click()
def cards(pg):return pg.locator('.card[data-id]')
def card(pg,i):return pg.locator(f'.card[data-id="{i}"]')
def ids(pg):return pg.eval_on_selector_all('.card[data-id]','e=>e.map(x=>x.dataset.id)')
def prices(pg):return [float(x) for x in pg.eval_on_selector_all('.card[data-id]','e=>e.map(x=>x.dataset.price)')]
def kms(pg):return [float(x) for x in pg.eval_on_selector_all('.card[data-id]','e=>e.map(x=>x.dataset.km)')]
def hours(pg,i):
    s=card(pg,i).locator('.row.meta').nth(0).locator('span').nth(1);return s.inner_text().strip(),s.get_attribute('class')
def to_results(pg):
    pg.goto(URL);pg.wait_for_selector('.chips button');choose(pg,'گوشی موبایل');pg.wait_for_selector('.chips button');choose(pg,'سامسونگ');choose(pg,'آبی');pg.wait_for_selector('.chips button');choose(pg,'X1');pg.wait_for_selector('.chips button');choose(pg,'8 گیگابایت');pg.wait_for_selector('.card[data-id]')
def setrange(pg,v):pg.eval_on_selector('#rd',"(e,v)=>{e.value=v;e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'))}",str(v));pg.wait_for_timeout(400)
def idle(pg):pg.wait_for_function("()=>document.querySelector('.res')&&!document.querySelector('.res.loading')&&!document.querySelector('.res[aria-busy=true]')")
def cur(pg):return pg.eval_on_selector_all('.card[aria-current=true]','e=>e.map(x=>x.dataset.id)')
def main():
    d=tempfile.mkdtemp();make(d)
    srv=subprocess.Popen(['node','server.js'],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'DATA_DIR':d},stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    for _ in range(50):
        try:urllib.request.urlopen(URL+'api/health');break
        except Exception:time.sleep(.1)
    errs=[]
    try:
      with sync_playwright() as p:
        b=p.chromium.launch()
        def ctx(**kw):
            c=b.new_context(locale='fa-IR',**kw);c.route('**/*',lambda r:r.continue_() if r.request.url.startswith(URL) else r.abort());return c
        c=ctx(viewport={'width':1000,'height':900});pg=c.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
        # خطای meta در شروع
        pg.route('**/api/meta',lambda r:r.abort());pg.goto(URL);pg.wait_for_selector('button:has-text("تلاش مجدد")');check('8 خطای اتصال اولیه → دکمه‌ی تلاش مجدد و بدون چیپ',pg.locator('.chips button').count()==0)
        pg.unroute('**/api/meta');pg.click('button:has-text("تلاش مجدد")');pg.wait_for_selector('.chips button');check('8 تلاش مجدد اولیه → دسته‌ها نمایش داده می‌شوند',pg.locator('.chips button',has_text='گوشی موبایل').count()==1)
        # 1 جریان انتخاب
        to_results(pg);crumbs=pg.locator('#crumbs .chip').all_inner_texts()
        check('1 انتخاب دسته/برند/رنگ/مدل/رم → فقط P1 با ۴ فروشگاه',cards(pg).count()==4 and sorted(ids(pg))==['S1','S2','S3','S4'] and all(any(k in x for x in crumbs) for k in ['برند: سامسونگ','رنگ: آبی','مدل: X1','رم: 8 گیگابایت']),crumbs)
        check('1 عنوان محصول حاوی HTML به‌صورت متن نمایش داده می‌شود',pg.locator('#chat').inner_text().count('<b onclick="window.__x=1">bold</b>')==1 and pg.locator('#chat b[onclick]').count()==0)
        # 2 بودجه
        before=pg.locator('#crumbs .chip').all_inner_texts();pg.fill('#mx','1');pg.press('#mx','Tab');pg.wait_for_selector('.card:has-text("نتیجه‌ای")')
        check('2 بودجه‌ی غیرممکن → نتیجه خالی و انتخاب‌ها دقیقاً حفظ',cards(pg).count()==0 and pg.locator('#crumbs .chip').all_inner_texts()==before)
        pg.fill('#mx','9600000');pg.press('#mx','Tab');pg.wait_for_selector('.card[data-id]');pg.fill('#mn','8500000');pg.press('#mn','Tab');pg.wait_for_timeout(500)
        check('2 بازه‌ی بودجه اعمال می‌شود (فقط S2 و S3)',sorted(ids(pg))==['S2','S3'] and all(8.5e6<=x<=9.6e6 for x in prices(pg)),prices(pg))
        pg.fill('#mn','9000000');pg.fill('#mx','8000000');pg.press('#mx','Tab');pg.wait_for_timeout(500)
        check('2 بازه‌ی نامعتبر (حداقل>حداکثر): هشدار و اعمال‌نشدن',pg.locator('[role=alert]:has-text("نامعتبر")').count()==1 and cards(pg).count()==4)
        pg.fill('#mn','');pg.fill('#mx','');pg.press('#mx','Tab');pg.wait_for_timeout(500);check('2 پاک‌کردن بودجه → همه‌ی نتایج برمی‌گردند',cards(pg).count()==4)
        # 3 مقایسه
        for i in range(3):pg.locator('[data-c]').nth(i).check()
        pg.locator('[data-c]').nth(3).evaluate('e=>e.click()')
        hd=pg.locator('.cmp tr').first.locator('th').all_inner_texts()
        check('3 مقایسه‌ی دقیقاً ۳ فروشگاه (چهارمی رد می‌شود)',len(hd)==4 and pg.locator('[data-c]:checked').count()==3 and not pg.locator('[data-c]').nth(3).is_checked(),hd)
        rows={r.locator('th').first.inner_text():r.locator('td').all_inner_texts() for r in pg.locator('.cmp tr').all()[1:]}
        check('3 جدول مقایسه: ردیف‌های قیمت/فاصله/ساعت/اقساط/گارانتی/زمان/موجودی با ۳ ستون',set(rows)=={'قیمت','فاصله','ساعت کاری','اقساط','گارانتی','زمان قیمت','موجودی'} and all(len(v)==3 for v in rows.values()) and set(rows['موجودی'])=={'موجودی تأییدنشده'},rows)
        # 4 مرتب‌سازی
        pg.click('#s-price');pg.wait_for_timeout(400);check('4 مرتب‌سازی قیمت صعودی',prices(pg)==[8e6,9e6,9.5e6,10e6],prices(pg))
        pg.click('#s-dist');pg.wait_for_timeout(400);k=kms(pg);check('4 مرتب‌سازی فاصله صعودی (S1,S2,S3,S4)',ids(pg)==['S1','S2','S3','S4'] and k==sorted(k),(ids(pg),k))
        pg.click('#s-smart');pg.wait_for_timeout(400);pr,k=prices(pg),kms(pg);sc=[round(a/min(pr)+.03*b,3) for a,b in zip(pr,k)]
        check('4 مرتب‌سازی ترکیبی مطابق فرمول price/min+0.03×km',len(sc)==4 and sc==sorted(sc) and pg.locator('#s-smart[aria-pressed=true]').count()==1,sc)
        pg.click('#s-price');pg.wait_for_timeout(400)
        # 5 ساعت کاری: متن و وضعیت دقیق هر کارت
        exp={'S1':('● باز (۰ تا ۲۴)','ok'),'S2':('● بسته','no'),'S3':('● ساعت کاری نامشخص','wn'),'S4':('● باز (۰ تا ۲۴)','ok')}
        got={i:hours(pg,i) for i in exp};check('5 هر کارت متن و وضعیت دقیق ساعت کاری را دارد (S2 بسته، S3 نامشخص، S1/S4 باز)',all(got[i][0]==exp[i][0] and exp[i][1] in got[i][1].split() for i in exp),got)
        check('5 «بسته» و «نامشخص» با «باز» اشتباه نمی‌شوند؛ متن هر کدام در aria-label هم هست',all(exp[i][0] in card(pg,i).get_attribute('aria-label') for i in exp) and '● باز' not in card(pg,'S2').inner_text() and '● باز' not in card(pg,'S3').inner_text() and got['S2'][0]!=got['S3'][0])
        pg.click('#t-open');pg.wait_for_timeout(500);got2={i:hours(pg,i) for i in ids(pg)}
        check('5 «فقط بازها»: دقیقاً S1 و S4؛ بسته و نامشخص حذف',sorted(ids(pg))==['S1','S4'] and all(v[0]=='● باز (۰ تا ۲۴)' for v in got2.values()),got2)
        pg.click('#t-open');pg.wait_for_timeout(400);check('5 برداشتن فیلتر → هر ۴ فروشگاه',cards(pg).count()==4)
        # 9 اطلاعات ناقص
        c=lambda i:card(pg,i).inner_text()
        check('9 قیمت قدیمی فقط روی S4، زمان نامشخص فقط روی S3',  '(قدیمی)' in c('S4') and all('(قدیمی)' not in c(i) for i in['S1','S2','S3']) and 'زمان ثبت قیمت نامشخص' in c('S3') and all('زمان ثبت قیمت نامشخص' not in c(i) for i in['S1','S2','S4']))
        check('9 گارانتی: S2 دارد، بقیه «ثبت نشده»',  'گارانتی ۱۸ ماهه' in c('S2') and all('گارانتی: ثبت نشده' in c(i) for i in['S1','S3','S4']) and 'گارانتی: ثبت نشده' not in c('S2'))
        check('9 موجودی همه‌ی کارت‌ها «تأییدنشده»؛ هیچ تأیید مثبتی نیست',all('موجودی تأییدنشده' in c(i) for i in['S1','S2','S3','S4']) and all('✔' not in c(i) and 'موجود است' not in c(i) for i in ['S1','S2','S3','S4']))
        check('9 اقساط تفکیک‌شده: S1 ندارد، S2 نامشخص، S3/S4 اعلام‌شده',  'اقساط: ندارد' in c('S1') and 'اقساط: نامشخص' in c('S2') and all('اقساط: اعلام‌شده توسط فروشنده' in c(i) for i in['S3','S4']))
        ok=True
        for i in ids(pg):
            ca=card(pg,i).get_attribute('aria-label');pa=pg.eval_on_selector_all('[data-pin]','(e,id)=>e.filter(x=>x.dataset.pin===id).map(x=>x.getAttribute("aria-label")+"|"+x.querySelector("title").textContent)',i);ok=ok and len(pa)==1 and pa[0]==ca+'|'+ca
        check('3 کارت فروشگاه و نشانگر نقشه برای هر ۴ فروشگاه اطلاعات یکسان دارند',ok is True)
        check('3 نقشه: «فاصله مستقیم» و صراحت در نبود مسیر رانندگی',pg.locator('text=متصل نیست').count()>=1 and pg.locator('text=خط مستقیم').count()>=1)
        # انتخاب کارت با کیبورد (واقعی)
        s3=card(pg,'S3');initial=cur(pg);check('5 کارت S3 قابل فوکوس است (tabindex=0) و ابتدا انتخاب‌شده نیست',s3.get_attribute('tabindex')=='0' and initial and 'S3' not in initial and 'sel' not in s3.get_attribute('class').split(),initial)
        s3.focus();check('5 فوکوس واقعاً روی کارت S3 می‌نشیند',pg.evaluate('document.activeElement.dataset.id')=='S3')
        pg.keyboard.press('Enter');pg.wait_for_timeout(500)
        s3=card(pg,'S3');check('5 بعد از Enter: S3 تنها کارت aria-current و دارای کلاس sel',cur(pg)==['S3'] and 'sel' in s3.get_attribute('class').split() and pg.locator('.card.sel').count()==1,cur(pg))
        check('5 فوکوس بعد از انتخاب روی همان کارت می‌ماند',pg.evaluate('document.activeElement.dataset&&document.activeElement.dataset.id')=='S3')
        km3=float(s3.get_attribute('data-km'));lab=num(pg.locator('svg.map text:has-text("km")').first.text_content())
        check('5 نقشه هم انتخاب را نشان می‌دهد: مسیر خط‌چین و برچسب فاصله‌ی S3، نشانگر درشت‌شده',pg.locator('.route').count()==1 and abs(lab-km3)<.06 and pg.locator('[data-pin="S3"] circle').first.get_attribute('r')=='12',(lab,km3))
        card(pg,'S1').focus();pg.keyboard.press(' ');pg.wait_for_timeout(500);check('5 کلید Space هم کارت S1 را انتخاب می‌کند و انتخاب قبلی برداشته می‌شود',cur(pg)==['S1'])
        pg.locator('[data-pin="S4"]').focus();pg.keyboard.press('Enter');pg.wait_for_timeout(500);check('5 نشانگر نقشه با کیبورد (Enter) فروشگاه S4 را انتخاب می‌کند',cur(pg)==['S4'])
        # 6 نبود نتیجه + جایگزین
        setrange(pg,2);pg.wait_for_selector('.card:has-text("نتیجه‌ای")')
        tx=pg.locator('.card:has-text("نتیجه‌ای")').inner_text();check('6 نبود نتیجه + جایگزین با دلیل تفاوت (رنگ قرمز)',cards(pg).count()==0 and 'تفاوت: رنگ قرمز' in tx,tx[:200])
        setrange(pg,20);pg.wait_for_selector('.card[data-id]')
        # جریان
        pg.locator('#crumbs .chip',has_text='رنگ: آبی').click();pg.wait_for_selector('.chips button');check('جریان: حذف فیلتر، نتیجه‌ی قدیمی برداشته می‌شود',pg.locator('.res').count()==0);choose(pg,'قرمز');pg.wait_for_selector('.card[data-id]')
        cr=pg.locator('#crumbs .chip').all_inner_texts()
        check('جریان: تغییر رنگ؛ بقیه‌ی انتخاب‌ها حفظ، نتیجه = P2 در S1 با قیمت ۱۰٫۵م',ids(pg)==['S1'] and prices(pg)==[10.5e6] and all(any(k in x for x in cr) for k in ['برند: سامسونگ','رنگ: قرمز','مدل: X1','رم: 8 گیگابایت']) and 'قرمز' in pg.locator('#chat').inner_text(),cr)
        pg.click('text=← بازگشت');pg.wait_for_selector('.chips button');check('جریان: بازگشت آخرین انتخاب کاربر (رنگ) را برمی‌دارد و دوباره می‌پرسد',pg.locator('.res').count()==0 and 'رنگ' in pg.locator('.m').last.inner_text() and pg.locator('#crumbs .chip',has_text='رنگ:').count()==0 and pg.locator('#crumbs .chip',has_text='مدل:').count()==1)
        pg.click('#rs');pg.wait_for_selector('.chips button');check('جریان: شروع مجدد همه‌چیز را پاک می‌کند',pg.locator('#crumbs .chip').count()==0 and pg.locator('.res').count()==0 and pg.locator('.chips button',has_text='گوشی موبایل').count()==1)
        # 8 خطای API
        to_results(pg);pg.route('**/api/offers**',lambda r:r.fulfill(status=500,body='{}'));pg.click('#s-dist');pg.wait_for_selector('button:has-text("تلاش مجدد")')
        check('8 خطای ۵۰۰ آفرها: پیام خطا (role=alert) و تلاش مجدد',pg.locator('[role=alert] button:has-text("تلاش مجدد")').count()==1)
        pg.unroute('**/api/offers**');pg.click('button:has-text("تلاش مجدد")');idle(pg);pg.wait_for_selector('.card[data-id]');check('8 تلاش مجدد → ۴ کارت و مرتب‌سازی نزدیک‌ترین حفظ‌شده',cards(pg).count()==4 and ids(pg)==['S1','S2','S3','S4'],ids(pg))
        pg.route('**/api/options**',lambda r:r.abort());pg.click('#rs');pg.wait_for_selector('.chips button');choose(pg,'گوشی موبایل');pg.wait_for_selector('button:has-text("تلاش مجدد")')
        check('8 خطای شبکه‌ی گزینه‌ها: تلاش مجدد، بدون چیپ برند',pg.locator('.chips button').count()==0)
        pg.unroute('**/api/options**');pg.click('button:has-text("تلاش مجدد")');pg.wait_for_selector('.chips button');check('8 بعد از تلاش مجدد گزینه‌ی برند «سامسونگ» نمایش داده می‌شود',pg.locator('.chips button',has_text='سامسونگ').count()==1)
        # 10 امنیت
        to_results(pg);txt=' '.join(cards(pg).all_inner_texts())
        check('10 نام فروشگاه HTML مخرب به‌صورت متن نمایش داده می‌شود',card(pg,'S2').locator('b').first.inner_text().endswith('<img src=x onerror="window.__x=5">') and pg.locator('#chat img').count()==0)
        pg.fill('#q','<img src=x onerror=window.__x=3>');pg.press('#q','Enter');pg.wait_for_timeout(700)
        check('10 ورودی جست‌وجوی مخرب دقیقاً به‌صورت متن نمایش داده می‌شود',pg.locator('.u .bub').last.inner_text()=='<img src=x onerror=window.__x=3>' and pg.locator('.u .bub img').count()==0 and pg.locator('#chat img').count()==0)
        pg.click('#rs');pg.wait_for_selector('.chips button');choose(pg,'گوشی موبایل');pg.wait_for_selector('.chips button');chips=pg.locator('.chips button').all_inner_texts()
        check('10 برند مخرب در چیپ به‌صورت متن است',any('"><svg onload="window.__x=7">' in x for x in chips) and pg.locator('.chips svg').count()==0,chips)
        choose(pg,'<svg');pg.wait_for_selector('.card[data-id]');txt=pg.locator('#chat').inner_text()
        check('10 عنوان/مدل/رنگ/گارانتی/آدرس مخرب همه متن‌اند',all(x in txt for x in ['<img src=x onerror="window.__x=8">','<script>window.__x=10</script>','<script>window.__x=6</script>','<u>رنگ</u>','M<script>window.__x=9</script>']) and pg.locator('#chat script,#chat u,#chat img').count()==0)
        check('10 هیچ کد مخربی اجرا نشد (window.__x تعریف نشده)',pg.evaluate('typeof window.__x')=='undefined')
        # 7 موقعیت
        to_results(pg);pg.click('#gp');pg.wait_for_selector('.bub:has-text("رد شد")')
        check('7 رد مجوز موقعیت → موقعیت پیش‌فرض و ادامه‌ی کار',pg.locator('#ll').inner_text().endswith('پیش‌فرض (مرکز تهران)') and cards(pg).count()==4)
        pg.select_option('#pl',label='میدان ونک (تقریبی)');pg.wait_for_timeout(500);pg.click('#s-dist');pg.wait_for_timeout(400)
        check('7 انتخاب دستی موقعیت: S2 (ونک) نزدیک‌ترین با فاصله ≈۰',ids(pg)[0]=='S2' and kms(pg)[0]<.1 and 'میدان ونک' in pg.locator('#ll').inner_text(),(ids(pg),kms(pg)))
        c2=ctx(viewport={'width':1000,'height':900},geolocation={'latitude':32.65,'longitude':51.67},permissions=['geolocation']);g=c2.new_page();to_results(g);g.click('#gp');g.wait_for_selector('#ll:has-text("GPS")');g.wait_for_timeout(500)
        check('7 GPS خارج از تهران: هشدار محدوده‌ی نقشه و نبود نتیجه در شعاع',g.locator('text=خارج از محدوده').count()>=1 and cards(g).count()==0 and 'GPS' in g.locator('#ll').inner_text(),g.locator('#ll').inner_text());c2.close()
        # موبایل
        c3=ctx(viewport={'width':375,'height':667},is_mobile=True,has_touch=True);m=c3.new_page();to_results(m)
        small=m.eval_on_selector_all('.btn,.chip,select,input[type=number]','e=>e.filter(x=>x.offsetParent&&x.getBoundingClientRect().height>0&&x.getBoundingClientRect().height<43.5).map(x=>x.className+":"+Math.round(x.getBoundingClientRect().height))')
        check('9 موبایل: اندازه‌ی لمسی دکمه‌ها و فیلترها ≥۴۴px',small==[],small[:5]);check('9 موبایل: بدون اسکرول افقی',m.evaluate('document.documentElement.scrollWidth<=innerWidth+1')is True)
        m.tap('#t-inst');m.wait_for_timeout(500);check('9 موبایل: فیلتر اقساطی با لمس: دقیقاً S3 و S4',sorted(ids(m))==['S3','S4'],ids(m));c3.close()
        # فوکوس کیبورد
        bad=[];pg.focus('#q')
        for i in range(16):
            pg.keyboard.press('Tab');pg.wait_for_timeout(60);o=pg.evaluate('(()=>{const e=document.activeElement,s=getComputedStyle(e);return [e.tagName+"."+String(e.getAttribute("class")||"")+"#"+e.id,s.outlineStyle,parseFloat(s.outlineWidth)]})()')
            if not o[0].startswith('BODY') and (o[1]=='none' or o[2]<1):bad.append(o)
        check('9 فوکوس کیبورد روی همه‌ی کنترل‌ها (۱۶ Tab) قابل مشاهده است',bad==[],bad)
        for scheme in['light','dark']:
            cc=ctx(viewport={'width':1000,'height':900},color_scheme=scheme);q=cc.new_page();to_results(q);bad=[];seen=[]
            for sel in['.card .meta','.card .ok','.card .no','.card .wn','.card .price','.card .best','.btn']:
                e=q.locator(sel).first
                if e.count()==0:bad.append((sel,'یافت نشد'));continue
                v=e.evaluate("e=>{const c=getComputedStyle(e);let b=e,bg;while(b){bg=getComputedStyle(b).backgroundColor;if(bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;b=b.parentElement}return [c.color,bg]}");r=ratio(rgb(v[0]),rgb(v[1]));seen.append(sel)
                if r<4.5:bad.append((sel,round(r,2)))
            check(f'9 کنتراست متن ≥۴٫۵ روی هر ۷ عنصر ({scheme})',bad==[] and len(seen)==7,bad);cc.close()
        b.close()
    finally:
        srv.terminate()
    check('بدون خطای جاوااسکریپت در صفحه',errs==[],errs)
    f=[x for x in R if not x[1]];print(f'\n{len(R)-len(f)}/{len(R)} پاس')
    EXPECTED=int(os.environ.get('E2E_EXPECTED','0'))
    if EXPECTED and len(R)!=EXPECTED:print(f'تعداد بررسی‌ها {len(R)} است، نه {EXPECTED}');sys.exit(2)
    sys.exit(1 if f else 0)
main()
