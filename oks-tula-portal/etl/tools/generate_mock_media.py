#!/usr/bin/env python3
"""
Генератор демонстрационных медиа «До / В процессе / После» и снимков камер
(Приложение C.3 ТЗ). Создаёт SVG-плейсхолдеры в data/mock/media/ и манифест
manifest.json, который читает apps/api/prisma/seed.ts (is_mock=true).

Кадры — НЕ настоящие фото/снимки; каждый содержит явную пометку «ДЕМО-ДАННЫЕ».
Выборка: 5 активных объектов с координатами + 5 заметных введённых
(детский сад в Заокском, школа в «Северной Мызе», манеж на Косой горе и др.).

Запуск: python3 etl/tools/generate_mock_media.py
"""
import json, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NORM = os.path.join(ROOT, 'data', 'processed', 'objects.normalized.json')
OUT = os.path.join(ROOT, 'data', 'mock', 'media')
os.makedirs(OUT, exist_ok=True)

W, H = 800, 500
WATERMARK = 'ДЕМО-ДАННЫЕ · не является реальным фото/снимком'

def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def frame(title, subtitle, body, accent):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{accent[0]}"/><stop offset="1" stop-color="{accent[1]}"/></linearGradient></defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
{body}
<rect x="0" y="0" width="{W}" height="52" fill="rgba(0,0,0,0.55)"/>
<text x="16" y="26" fill="#fff" font-size="17" font-weight="700">{esc(title)}</text>
<text x="16" y="45" fill="#e0e0e0" font-size="13">{esc(subtitle)}</text>
<rect x="0" y="{H-30}" width="{W}" height="30" fill="rgba(0,0,0,0.6)"/>
<text x="16" y="{H-10}" fill="#ffcc80" font-size="13" font-weight="700">{esc(WATERMARK)}</text>
</svg>'''

def before_body(seed):
    # «спутниковый снимок»: зелёно-бурые пятна + сетка полей
    import random
    r = random.Random(seed)
    parts = []
    for _ in range(26):
        x, y = r.randint(0, W-90), r.randint(60, H-70)
        w, h = r.randint(40, 120), r.randint(30, 90)
        c = r.choice(['#4b6b3a', '#5c7a45', '#6b5b3a', '#7a6b45', '#3f5a34', '#8a7a55'])
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}" opacity="0.85" rx="6"/>')
    for x in range(0, W, 80):
        parts.append(f'<line x1="{x}" y1="52" x2="{x}" y2="{H-30}" stroke="#2f3d28" stroke-width="1" opacity="0.3"/>')
    return '\n'.join(parts)

def process_body(progress, seed):
    # «стройплощадка»: котлован → каркас по мере progress (0..1)
    import random
    r = random.Random(seed)
    parts = ['<rect x="0" y="300" width="800" height="170" fill="#8d7a5c"/>']
    parts.append('<rect x="60" y="180" width="680" height="150" fill="#6e6252" opacity="0.6"/>')
    if progress < 0.34:
        parts.append('<rect x="120" y="250" width="560" height="80" fill="#4a4034"/>')
        parts.append('<text x="400" y="300" fill="#d7ccc8" font-size="20" text-anchor="middle">котлован / фундамент</text>')
    elif progress < 0.67:
        for x in range(140, 660, 60):
            parts.append(f'<rect x="{x}" y="200" width="18" height="130" fill="#b0bec5"/>')
        parts.append('<rect x="130" y="190" width="540" height="16" fill="#90a4ae"/>')
        parts.append('<text x="400" y="170" fill="#eceff1" font-size="18" text-anchor="middle">возведение каркаса</text>')
    else:
        parts.append('<rect x="140" y="150" width="520" height="180" fill="#cfd8dc"/>')
        for x in range(160, 640, 48):
            for y in range(170, 320, 40):
                parts.append(f'<rect x="{x}" y="{y}" width="30" height="24" fill="#78909c"/>')
        parts.append('<text x="400" y="140" fill="#fff" font-size="18" text-anchor="middle">отделка / завершение</text>')
    # кран
    parts.append('<rect x="700" y="90" width="10" height="240" fill="#f9a825"/>')
    parts.append('<rect x="600" y="90" width="150" height="10" fill="#f9a825"/>')
    return '\n'.join(parts)

def after_body(seed):
    # «архитектурный рендер»: здание + небо, рамка «материал предоставлен заказчиком»
    parts = ['<rect x="0" y="52" width="800" height="200" fill="#bfe3ff"/>']
    parts.append('<circle cx="660" cy="120" r="34" fill="#fff59d"/>')
    parts.append('<rect x="0" y="250" width="800" height="220" fill="#c8e6c9"/>')
    parts.append('<rect x="150" y="150" width="500" height="230" fill="#eceff1" stroke="#90a4ae" stroke-width="3"/>')
    parts.append('<polygon points="150,150 400,80 650,150" fill="#b0bec5"/>')
    for x in range(180, 630, 60):
        for y in range(180, 360, 50):
            parts.append(f'<rect x="{x}" y="{y}" width="40" height="32" fill="#81d4fa" stroke="#4fc3f7"/>')
    parts.append('<rect x="360" y="300" width="80" height="80" fill="#90a4ae"/>')
    # рамка-пометка
    parts.append('<rect x="8" y="60" width="784" height="404" fill="none" stroke="#e65100" stroke-width="4" stroke-dasharray="14 8"/>')
    parts.append('<rect x="300" y="66" width="200" height="26" fill="#e65100"/>')
    parts.append('<text x="400" y="85" fill="#fff" font-size="14" text-anchor="middle" font-weight="700">материал предоставлен заказчиком</text>')
    return '\n'.join(parts)

def camera_body(ts, seed):
    import random
    r = random.Random(seed)
    parts = ['<rect x="0" y="52" width="800" height="418" fill="#263238"/>']
    parts.append('<rect x="0" y="330" width="800" height="140" fill="#37474f"/>')
    parts.append('<rect x="250" y="200" width="300" height="150" fill="#455a64"/>')
    parts.append(f'<circle cx="{r.randint(120,680)}" cy="360" r="16" fill="#ffca28" opacity="0.8"/>')
    parts.append('<rect x="16" y="64" width="18" height="18" fill="#e53935"><animate attributeName="opacity" values="1;0.2;1" dur="1.5s" repeatCount="indefinite"/></rect>')
    parts.append('<text x="42" y="79" fill="#ffcdd2" font-size="14" font-weight="700">LIVE (демо)</text>')
    parts.append(f'<text x="784" y="79" fill="#b0bec5" font-size="14" text-anchor="end">{esc(ts)}</text>')
    for y in range(60, H-30, 4):
        parts.append(f'<line x1="0" y1="{y}" x2="800" y2="{y}" stroke="#000" stroke-width="1" opacity="0.05"/>')
    return '\n'.join(parts)

def ymd(iso):
    return (iso or '').replace('-', '')[:8] or '00000000'

def main():
    objs = json.load(open(NORM, encoding='utf-8'))
    by_row = {o['sourceRowNumber']: o for o in objs}
    active_with_coords = [o['sourceRowNumber'] for o in objs if o.get('statusGroup') != 'completed' and o.get('lat') is not None][:5]
    featured_completed = [1, 5, 7, 9, 12]
    selected = list(dict.fromkeys(featured_completed + active_with_coords))

    media, cameras = [], []
    for row in selected:
        o = by_row.get(row)
        if not o:
            continue
        name = (o['name'] or '')[:70]
        ys = o.get('yearStart') or 2018
        ye = o.get('yearEnd') or (o.get('commissioningYear') or 2025)
        cp_start = (o.get('contractPeriod') or {}).get('start')
        cp_end = (o.get('contractPeriod') or {}).get('end')
        completed = o.get('statusGroup') == 'completed'

        # --- До (архивный снимок) ---
        d_before = f"{ys}-06-01"
        fn = f"{row}_before_sat_{ymd(d_before)}.svg"
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(
            frame(f'«До» — {name}', f'Архивный снимок места · {d_before[:4]} (Sentinel-2/Landsat, демо)',
                  before_body(row), ['#3d5a3a', '#2b3d28']))
        media.append({"sourceRowNumber": row, "kind": "before_sat", "takenAt": d_before,
                      "url": f"/mock-media/{fn}", "year": ys,
                      "caption": f'Место до начала работ ({d_before[:4]})'})

        # --- В процессе (2 кадра) ---
        for i, prog in enumerate([0.3, 0.72], start=1):
            if cp_start and cp_end:
                d0 = datetime.date.fromisoformat(cp_start)
                d1 = datetime.date.fromisoformat(cp_end)
                dproc = (d0 + (d1 - d0) * prog).isoformat()
            else:
                dproc = f"{min(ys + i, ye)}-0{i+2}-15"
            fn = f"{row}_process_photo_{ymd(dproc)}.svg"
            open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(
                frame(f'«В процессе» — {name}', f'Ход строительства · {dproc} (кадр {i}/2, демо)',
                      process_body(prog, row * 10 + i), ['#5d5348', '#3a332c']))
            media.append({"sourceRowNumber": row, "kind": "process_photo", "takenAt": dproc,
                          "url": f"/mock-media/{fn}", "year": int(dproc[:4]),
                          "caption": f'Ход строительства ({dproc})'})

        # --- После (рендер) ---
        d_after = o.get('actDate') or (f"{o['commissioningYear']}-12-31" if o.get('commissioningYear') else f"{ye}-12-31")
        fn = f"{row}_after_render_{ymd(d_after)}.svg"
        cap = 'Введён в эксплуатацию' if completed else 'Проектный облик (плановый ввод)'
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(
            frame(f'«После» — {name}', f'Архитектурный рендер · {cap} · {d_after[:4]} (демо)',
                  after_body(row), ['#bfe3ff', '#e1f5fe']))
        lon, lat = o.get('lon'), o.get('lat')
        bounds = None
        if lon is not None and lat is not None:
            bounds = {"west": lon - 0.002, "south": lat - 0.0012, "east": lon + 0.002, "north": lat + 0.0012}
        media.append({"sourceRowNumber": row, "kind": "after_render", "takenAt": d_after,
                      "url": f"/mock-media/{fn}", "year": int(d_after[:4]), "bounds": bounds,
                      "caption": f'Рендер «После» — {cap.lower()}'})

        # --- Камера (для активных с координатами) ---
        if not completed:
            for n in range(2):
                ts = f"2026-09-1{3-n} 1{n}:2{n}:00"
                fn = f"{row}_camera_{n}.svg"
                open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(
                    frame(f'Камера стройплощадки — {name}', f'Последний кадр · {ts} (демо-заглушка)',
                          camera_body(ts, row * 10 + n), ['#263238', '#37474f']))
                cameras.append({"sourceRowNumber": row, "title": f'Камера стройплощадки (демо) #{n+1}',
                                "type": "snapshot", "url": f"/mock-media/{fn}", "refreshSec": 30})

    manifest = {"generatedAt": datetime.date.today().isoformat(), "media": media, "cameras": cameras}
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f"сгенерировано: объектов {len(selected)}, медиа-кадров {len(media)}, снимков камер {len(cameras)}")
    print(f"файлов в data/mock/media: {len([f for f in os.listdir(OUT) if f.endswith('.svg')])}")

if __name__ == '__main__':
    main()
