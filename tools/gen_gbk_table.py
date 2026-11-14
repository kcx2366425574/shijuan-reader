#!/usr/bin/env python3
"""生成 GBK 双字节解码表。

输出 src/core/gbk-table.js。索引公式：
    index = (lead - 0x81) * 192 + (trail - 0x40)

0x7F 在 GBK 尾字节中无效，保留为替换符。这样表大小为 126 * 192 = 24192。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "core" / "gbk-table.js"

table = []
for lead in range(0x81, 0xFF):
    for trail in range(0x40, 0x100):
        if trail == 0x7F or trail > 0xFE:
            table.append("\ufffd")
            continue
        try:
            ch = bytes([lead, trail]).decode("gbk")
        except UnicodeDecodeError:
            ch = "\ufffd"
        table.append(ch)

text = "".join(table)
# JSON 字符串与 JS 字符串兼容，但 U+2028/U+2029 需显式转义。
text = text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
encoded = json.dumps(text, ensure_ascii=False)

content = f"""// 由 tools/gen_gbk_table.py 自动生成，请勿手动修改。
// GBK 双字节表，索引：((lead - 0x81) * 192) + (trail - 0x40)
export const GBK_TABLE = {encoded}

export const GBK_LEAD_START = 0x81
export const GBK_LEAD_END = 0xfe
export const GBK_TRAIL_START = 0x40
export const GBK_TRAIL_END = 0xfe
export const GBK_STRIDE = 192
"""
OUT.write_text(content, encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(table)} slots)")
