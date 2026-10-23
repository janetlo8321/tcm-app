"""從 tcm-notes/病證合併/資料/病證.json 產生大廳「病證區域」用的清單 model/zz.json
只放系統名、病名和資料庫裡的 id（z{系統序}_{病序}），不含任何內容。
用法：python3 tools/zz.py ../../../tcm-notes/病證合併/資料/病證.json model/zz.json
"""
import json, sys

EXCLUDE = ('青光眼',)   # 使用者要求不收

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
systems = []
for i, s in enumerate(d['systems']):
    ds = [{'id': f'z{i}_{j}', 'name': x['name']}
          for j, x in enumerate(s['diseases']) if not any(e in x['name'] for e in EXCLUDE)]
    systems.append({'name': s['name'], 'diseases': ds})
json.dump({'systems': systems}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(sum(len(s['diseases']) for s in systems), 'diseases')
