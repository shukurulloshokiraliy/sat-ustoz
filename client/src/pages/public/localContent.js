/**
 * Uzbek and Russian pages for search ("SAT online platforma", "SAT onlayn tayyorlov", "онлайн подготовка к SAT").
 * One source for both: scripts/seo.mjs prerenders them as real HTML for search engines, and LocalPage.jsx renders the
 * same text in the app, so what Google indexes is exactly what visitors see.
 * Facts here are stable (test format, scoring); prices and dates live in the app.
 */

export const LOCAL_PAGES = [
  {
    path: '/uz', lang: 'uz', alt: { en: '/', ru: '/ru' },
    title: 'SAT online platforma — SAT Ustoz | SAT Reading & Writing 200 dan 800 gacha',
    desc: 'SAT Ustoz — O‘zbekistondagi SAT online platforma: bepul SAT practice test, 200 dan 800 gacha roadmap, video darslar, SAT savollar banki, Bluebook uslubidagi mock testlar va SAT so‘zlari.',
    eyebrow: 'SAT ONLINE PLATFORMA',
    h1: 'SAT online platforma: Reading & Writing 200 dan 800 gacha',
    lead: 'SAT Ustoz — Digital SAT Reading and Writing bo‘limiga onlayn tayyorlanish uchun platforma. Bepul practice testdan boshlang, keyin ustoz tuzgan roadmap bo‘yicha bosqichma-bosqich o‘qing: har bir natijangizni ustoz ko‘rib boradi.',
    cta: [['/practice', 'Bepul SAT testni boshlash'], ['/signup', 'Bepul akkaunt ochish']],
    sections: [
      { h2: 'SAT Ustoz platformasida nimalar bor', html: `<ul>
<li><b>Bepul SAT practice test</b>: 27 ta savol, 32 daqiqa, ro‘yxatdan o‘tmasdan. Oxirida taxminiy ball va qaysi skill zaif ekani chiqadi.</li>
<li><b>200 dan 800 gacha roadmap</b>: video darslar, qoida varaqlari (PDF) va har dars oxirida level check. Darslar ketma-ket ochiladi, shuning uchun nimani o‘qish kerakligi doim aniq.</li>
<li><b>SAT savollar banki (Question Bank)</b>: rasmiy domen va skill‘lar bo‘yicha saralangan original savollar, har birida izoh va “Ustoz maslahati”.</li>
<li><b>Take a quiz</b>: har safar yangi 27 savollik modul, haqiqiy SAT tartibida: Words in Context, reading, grammar, transitions, student notes.</li>
<li><b>Full mock</b>: haqiqiy imtihondek ikki modul. Module 1 natijasi Module 2 qiyinligini belgilaydi, ball 200–800 shkalada hisoblanadi.</li>
<li><b>Bluebook uslubidagi test oynasi</b>: highlight va izoh, javobni chizib tashlash, Mark for Review, savollar navigatori, taymer. Testlar to‘liq ekranda, imtihon sharoitida o‘tadi.</li>
<li><b>Xatolar daftari</b>: har bir xato javob saqlanadi va 2 kundan keyin takrorlashga qaytadi.</li>
<li><b>SAT so‘zlari</b>: 980 dan ortiq so‘z, flashcard va testlar, Word Arena o‘yini (sinf bilan, jamoa bo‘lib yoki duel).</li>
</ul>` },
      { h2: 'Qanday ishlaydi', html: `<ol>
<li><b>Darajangizni bilib oling.</b> Bepul practice test 32 daqiqa davom etadi va qaysi skill‘larni birinchi o‘rganish kerakligini ko‘rsatadi.</li>
<li><b>Roadmap bo‘yicha o‘qing.</b> Video dars, qoidalar, mashq va level check: 80% olsangiz keyingi dars ochiladi.</li>
<li><b>Har kuni mashq qiling.</b> Yangi savollar, xatolar daftari va mock testlar bilan taxminiy ballingiz o‘sib borishini kuzating.</li>
</ol>` },
      { h2: 'Kimlar uchun', html: '<p>SAT‘ga Toshkentda, viloyatlarda yoki chet elda onlayn tayyorlanayotgan o‘quvchilar uchun: endi boshlayotganlardan 700+ ball olmoqchi bo‘lganlargacha. Platforma ingliz tilida, maslahatlar va qo‘llab-quvvatlash o‘zbek tilida.</p>' },
      { h2: 'Ustoz haqida', html: '<p>Platformani SAT o‘qituvchisi <b>Axror Alimjon</b> yaratgan: maqsad — O‘zbekistondagi har bir o‘quvchi tasodifiy testlar bilan emas, haqiqiy ustoz metodikasi bilan tayyorlansin. <a href="/about">Batafsil</a></p>' },
      { h2: 'Foydali maqolalar', html: `<ul>
<li><a href="/uz/sat-nima">SAT nima? Digital SAT haqida to‘liq ma‘lumot</a></li>
<li><a href="/uz/sat-reading-writing-tayyorgarlik">SAT Reading and Writing bo‘limiga qanday tayyorlanish kerak</a></li>
<li><a href="/uz/sat-ball-hisoblash">SAT ball qanday hisoblanadi</a></li>
<li><a href="/uz/bepul-sat-test">Bepul SAT practice test onlayn</a></li>
</ul>` },
    ],
    faq: [
      ['SAT online platforma nima?', 'SAT online platforma — SAT imtihoniga internet orqali tayyorlanish uchun sayt: darslar, savollar banki, testlar va natijalar tahlili bir joyda. SAT Ustoz Digital SAT Reading and Writing bo‘limiga ixtisoslashgan va ustoz nazorati bilan ishlaydi.'],
      ['SAT Ustoz‘da bepul nima bor?', 'Ro‘yxatdan o‘tmasdan bepul SAT practice test (27 savol, 32 daqiqa), har kuni bepul savollar, haftasiga bitta full mock va roadmap‘ning birinchi darslari.'],
      ['Testlar haqiqiy SAT‘ga o‘xshaydimi?', 'Ha. Test oynasi Bluebook uslubida: chapda matn, o‘ngda savol, highlight, javobni chizib tashlash, Mark for Review va taymer. Full mock‘da Module 1 natijasiga qarab Module 2 qiyinroq yoki osonroq bo‘ladi, ball 200–800 shkalada chiqadi.'],
      ['Telefonda ishlaydimi?', 'Ha. Platforma telefonda ham to‘liq ishlaydi, uni “Bosh ekranga qo‘shish” orqali ilova kabi o‘rnatish mumkin. Internet uzilib qolsa, javoblaringiz telefonda saqlanadi va internet qaytganda yuboriladi.'],
      ['Math bo‘limi ham bormi?', 'Hozircha SAT Ustoz Reading and Writing bo‘limiga ixtisoslashgan. Ball kalkulyatorida Math ham hisobga olinadi.'],
    ],
  },
  {
    path: '/ru', lang: 'ru', alt: { en: '/', uz: '/uz' },
    title: 'Онлайн-платформа для подготовки к SAT — SAT Ustoz | Reading & Writing от 200 до 800',
    desc: 'SAT Ustoz — онлайн-подготовка к Digital SAT (Reading & Writing) из Узбекистана: бесплатный пробный тест, дорожная карта от 200 до 800, видеоуроки, банк вопросов SAT, пробные экзамены в стиле Bluebook.',
    eyebrow: 'ОНЛАЙН-ПОДГОТОВКА К SAT',
    h1: 'Онлайн-платформа для подготовки к SAT Reading & Writing',
    lead: 'SAT Ustoz — платформа для подготовки к разделу Reading and Writing цифрового SAT. Начните с бесплатного пробного теста и двигайтесь по дорожной карте от 200 до 800 баллов под контролем преподавателя.',
    cta: [['/practice', 'Пройти бесплатный тест'], ['/signup', 'Создать аккаунт']],
    sections: [
      { h2: 'Что есть на платформе', html: `<ul>
<li><b>Бесплатный пробный тест SAT</b>: 27 вопросов, 32 минуты, без регистрации, с оценкой балла и разбором по навыкам.</li>
<li><b>Дорожная карта 200 → 800</b>: видеоуроки, конспекты правил и проверки уровня после каждого урока.</li>
<li><b>Банк вопросов SAT</b>: оригинальные вопросы по официальным разделам и навыкам с объяснениями.</li>
<li><b>Пробные экзамены (full mock)</b>: два адаптивных модуля, как на настоящем SAT, и балл по шкале 200–800.</li>
<li><b>Интерфейс как в Bluebook</b>: выделение и заметки, вычёркивание вариантов, Mark for Review, навигатор и таймер; тесты идут в полноэкранном режиме.</li>
<li><b>Тетрадь ошибок</b>: каждая ошибка возвращается на повторение через 2 дня.</li>
<li><b>Слова SAT</b>: более 980 слов, карточки с интервальным повторением и игра Word Arena.</li>
</ul>` },
      { h2: 'Как это работает', html: '<ol><li>Пройдите бесплатный тест и узнайте слабые навыки.</li><li>Занимайтесь по дорожной карте: урок, практика, проверка уровня.</li><li>Решайте новые вопросы каждый день и следите за ростом оценки балла.</li></ol>' },
      { h2: 'Для кого', html: '<p>Для школьников и студентов в Узбекистане и других странах, которые готовятся к SAT онлайн — от начального уровня до цели 700+. Платформа на английском, подсказки и поддержка на узбекском.</p>' },
    ],
    faq: [
      ['Есть ли бесплатный пробный тест SAT?', 'Да. Без регистрации: 27 вопросов Reading and Writing за 32 минуты, оценка балла и объяснения ответов.'],
      ['Похожи ли тесты на настоящий SAT?', 'Да. Интерфейс как в Bluebook, а в full mock второй модуль становится сложнее или легче по итогам первого, балл считается по шкале 200–800.'],
      ['Работает ли на телефоне?', 'Да, платформа адаптирована для телефона и устанавливается на главный экран как приложение.'],
    ],
  },
  {
    path: '/uz/sat-nima', lang: 'uz', article: true,
    title: 'SAT nima? Digital SAT formati, vaqti va ball tizimi | SAT Ustoz',
    desc: 'Digital SAT haqida to‘liq ma‘lumot: Reading and Writing va Math bo‘limlari, modullar, savollar soni, vaqt, adaptiv test va 400–1600 ball shkalasi.',
    eyebrow: 'QO‘LLANMA', h1: 'SAT nima? Digital SAT haqida to‘liq ma‘lumot',
    lead: 'SAT — College Board tashkil etadigan xalqaro imtihon. AQSh va boshqa davlatlardagi ko‘plab universitetlar qabulda SAT natijasini qabul qiladi. Hozir SAT kompyuterda, Bluebook dasturida topshiriladi.',
    sections: [
      { h2: 'Imtihon tuzilishi', html: `<ul>
<li><b>Reading and Writing</b>: 2 modul, har birida 27 ta savol, har biriga 32 daqiqa (jami 64 daqiqa).</li>
<li><b>Math</b>: 2 modul, har birida 22 ta savol, har biriga 35 daqiqa (jami 70 daqiqa).</li>
<li>Bo‘limlar orasida 10 daqiqalik tanaffus bor. Butun imtihon taxminan 2 soat 14 daqiqa davom etadi.</li>
</ul>` },
      { h2: 'Adaptiv test nima degani', html: '<p>Har bo‘limda birinchi modul hamma uchun bir xil. Birinchi modulni qanchalik yaxshi ishlaganingizga qarab ikkinchi modul <b>qiyinroq</b> yoki <b>osonroq</b> bo‘ladi. Yuqori ball olish uchun birinchi modulni yaxshi ishlash muhim: oson ikkinchi modulda maksimal ball cheklangan bo‘ladi.</p>' },
      { h2: 'Ball tizimi', html: '<p>Har bir bo‘lim <b>200 dan 800 gacha</b> baholanadi, umumiy ball <b>400–1600</b>. Ball faqat to‘g‘ri javoblar soniga emas, savollarning qiyinligiga ham bog‘liq. Noto‘g‘ri javob uchun ball ayirilmaydi, shuning uchun har bir savolga javob bering.</p>' },
      { h2: 'Reading and Writing bo‘limidagi savol turlari', html: '<ul><li><b>Information and Ideas</b>: asosiy g‘oya, xulosa (inference), dalil (command of evidence).</li><li><b>Craft and Structure</b>: Words in Context, matn tuzilishi va maqsadi, ikki matnni solishtirish.</li><li><b>Expression of Ideas</b>: transitions, student notes (rhetorical synthesis).</li><li><b>Standard English Conventions</b>: tinish belgilari, gap chegaralari, grammatika.</li></ul>' },
      { h2: 'Qayerdan boshlash kerak', html: '<p>Avval darajangizni biling: <a href="/practice">bepul SAT practice test</a> 32 daqiqada qaysi skill‘lar zaif ekanini ko‘rsatadi. Keyin <a href="/uz">SAT Ustoz roadmap</a>i bo‘yicha o‘qing.</p>' },
    ],
  },
  {
    path: '/uz/sat-reading-writing-tayyorgarlik', lang: 'uz', article: true,
    title: 'SAT Reading and Writing bo‘limiga qanday tayyorlanish kerak | SAT Ustoz',
    desc: 'SAT Reading and Writing bo‘limiga bosqichma-bosqich tayyorgarlik rejasi: grammatika, Words in Context, transitions, student notes va vaqtni to‘g‘ri taqsimlash.',
    eyebrow: 'QO‘LLANMA', h1: 'SAT Reading and Writing bo‘limiga qanday tayyorlanish kerak',
    lead: 'Reading and Writing bo‘limida qisqa matnlar va har biriga bitta savol beriladi. Bu bo‘limda ball tez o‘sadi, agar to‘g‘ri tartibda o‘qisangiz.',
    sections: [
      { h2: '1. Grammatikadan boshlang (Standard English Conventions)', html: '<p>Gap chegaralari (vergul, nuqtali vergul, ikki nuqta), fe‘l zamoni, olmosh va moslashuv — bu savollarning qoidasi aniq. Qoidani bir marta o‘rgansangiz, har safar to‘g‘ri topasiz. SAT Ustoz roadmap‘i shu sababli Writing Part 1–3 bilan boshlanadi.</p>' },
      { h2: '2. Transitions va student notes', html: '<p>Transition savollarida ikki gap orasidagi munosabatni aniqlang: qarama-qarshilik, sabab-natija, qo‘shimcha yoki misol. Student notes savollarida faqat savolda aytilgan maqsadga mos keladigan ma‘lumotni tanlang.</p>' },
      { h2: '3. Words in Context va so‘z boyligi', html: '<p>Variantlarga qaramasdan oldin bo‘sh joyga o‘zingiz so‘z o‘ylang, keyin ma‘nosi eng yaqin variantni tanlang. Har kuni 10–15 ta SAT so‘zini flashcard bilan takrorlash so‘z boyligini tez oshiradi.</p>' },
      { h2: '4. Reading savollari', html: '<p>Asosiy g‘oya, xulosa va dalil savollarida javob har doim matnda bo‘ladi. “Juda kuchli” yoki matnda yo‘q gaplarni o‘z ichiga olgan variantlarni chiqarib tashlang.</p>' },
      { h2: '5. Vaqt va mock testlar', html: '<p>Bir modulga 32 daqiqa, ya‘ni har savolga taxminan 71 soniya. Haftasiga kamida bitta to‘liq mock ishlang va har bir xatoni tahlil qiling: SAT Ustoz‘dagi xatolar daftari ularni 2 kundan keyin qayta beradi.</p><p><a href="/practice">Bepul SAT testni boshlash</a></p>' },
    ],
  },
  {
    path: '/uz/sat-ball-hisoblash', lang: 'uz', article: true,
    title: 'SAT ball qanday hisoblanadi — SAT ball kalkulyatori | SAT Ustoz',
    desc: 'SAT ball qanday hisoblanadi: 200–800 bo‘lim balli, 400–1600 umumiy ball, adaptiv modullar va savollar qiyinligi. Onlayn SAT ball kalkulyatori.',
    eyebrow: 'QO‘LLANMA', h1: 'SAT ball qanday hisoblanadi',
    lead: 'Digital SAT‘da ball faqat to‘g‘ri javoblar soniga bog‘liq emas: savollarning qiyinligi va qaysi ikkinchi modulga tushganingiz ham hisobga olinadi.',
    sections: [
      { h2: 'Asosiy qoidalar', html: '<ul><li>Har bir bo‘lim 200–800, umumiy ball 400–1600.</li><li>Noto‘g‘ri javob uchun ball ayirilmaydi.</li><li>Qiyin savollar ko‘proq “og‘ir” hisoblanadi.</li><li>Qiyinroq ikkinchi modulga tushsangiz, yuqori ball olish imkoniyati ochiladi.</li></ul>' },
      { h2: 'Ballingizni hisoblang', html: '<p>Bosh sahifadagi <a href="/">SAT ball kalkulyatori</a>da har bir modulda nechta to‘g‘ri javob berganingizni kiriting va taxminiy ballni ko‘ring. Aniq ball uchun <a href="/practice">bepul practice test</a> ishlang.</p><p>Eslatma: College Board‘ning aniq jadvallari ochiq emas va har testda biroz farq qiladi, shuning uchun kalkulyator taxminiy natija beradi.</p>' },
    ],
  },
  {
    path: '/uz/bepul-sat-test', lang: 'uz', article: true,
    title: 'Bepul SAT practice test onlayn — 27 savol, 32 daqiqa | SAT Ustoz',
    desc: 'Bepul SAT Reading and Writing practice test onlayn: 27 savol, 32 daqiqa, Bluebook uslubida, ro‘yxatdan o‘tmasdan. Taxminiy ball va izohlar bilan.',
    eyebrow: 'BEPUL TEST', h1: 'Bepul SAT practice test onlayn',
    lead: 'Haqiqiy Reading and Writing moduli kabi: 27 ta savol, 32 daqiqa, Bluebook uslubidagi oynada. Ro‘yxatdan o‘tish shart emas.',
    sections: [
      { h2: 'Test nimani o‘z ichiga oladi', html: '<ul><li>Information and Ideas: asosiy g‘oya, xulosa, dalil.</li><li>Craft and Structure: Words in Context, matn tuzilishi, ikki matn.</li><li>Expression of Ideas: transitions, student notes.</li><li>Standard English Conventions: gap chegaralari, grammatika.</li></ul>' },
      { h2: 'Natijada nima olasiz', html: '<p>Taxminiy ball, har bir skill bo‘yicha natija va har bir savolning izohi. Har kirishda yangi savollar beriladi.</p><p><a href="/practice">Testni boshlash</a></p>' },
    ],
  },
];

export const localByPath = (p) => LOCAL_PAGES.find((x) => x.path === p.replace(/\/$/, '') || (p === '/uz/' && x.path === '/uz'));
