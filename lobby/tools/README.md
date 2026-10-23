# 大廳人體模型與穴位資料的產生方式

- `bp3d.py`：讀 @dagno/anatomy-model（BodyParts3D，CC BY 4.0）的二進位資料；去掉皮膚內層、補洞。
- `build_model.py`：挑出皮膚、骨骼、臟腑，簡化後輸出 `../model/body.json` 與 `body.bin.gz`。
- `lm.py`：骨性標誌與「從體內往外射到皮膚」的工具。
- `acupoints.py`：依取法（骨度分寸＋骨性標誌）定位十四經 361 穴，輸出 `../model/points.json`
  （經絡筆畫、循行動畫用的臟腑位置、骨度分寸尺）。

執行：`python3 build_model.py ../model && python3 acupoints.py ../model/points.json`
（需要 numpy、scipy、trimesh、fast-simplification、embreex、rtree；模型路徑寫在 bp3d.py 的 ROOT）。
- `zz.py`：從 tcm-notes 的 病證.json 產生 `model/zz.json`（病證區域用的系統與病名清單，只有名字和 id，不收青光眼）
