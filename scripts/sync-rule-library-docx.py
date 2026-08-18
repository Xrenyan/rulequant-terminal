from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


CATEGORY_BY_LABEL = {
    "杀一肖": "kill_zodiac",
    "选生肖": "include_zodiac",
    "杀一波": "kill_color",
    "杀半波": "kill_half_color",
    "参考波色": "include_color",
    "杀单双": "kill_parity",
    "参考单双": "include_parity",
    "杀大小": "kill_size",
    "参考大小": "include_size",
    "杀一合": "kill_sum",
    "杀一尾": "kill_tail",
    "杀一头": "kill_head",
    "杀半头": "kill_half_head",
    "杀一门": "kill_door",
    "杀一行": "kill_element",
    "杀一段": "kill_segment",
    "七尾": "seven_tail",
    "取六肖": "six_zodiac",
    "八肖": "eight_zodiac",
    "八肖管两期": "eight_zodiac_two_period",
    "九肖": "nine_zodiac",
    "杀三肖 / 九肖": "kill_three_as_nine",
    "自定义集合": "custom_set",
}

SOURCE_BY_LABEL = {
    "用户提供公式": "user_provided",
    "人工新增公式": "manual",
    "系统推荐公式": "system_recommended",
    "TXT 导入公式": "txt_import",
    "复制公式": "copied",
    "示例公式": "example",
}

RENAMED_RULES = {
    "L序杀一尾公式1：": "杀一尾公式1：",
    "D杀一段规1：2026.0709起自己用2": "D杀一段规1：2026.0709起",
    "L序杀一段规2026.07.09新增自己用3": "L序杀一段规2026.07.09新增",
    "D序杀一头 - 平1平3波加平6自用头1": "D序杀一头 - 平1平3波加平6",
    "D序杀一肖-2026.07.29新增杀肖类 [D序]自用杀肖4": "D序杀一肖-2026.07.29新增杀肖类 [D序]",
    "L序杀一肖 - 2026.07.29新增杀肖类 [L序]自用6": "L序杀一肖 - 2026.07.29新增杀肖类 [L序]",
    "D序杀一肖-2026.07.29新增1杀肖类 [D序]自用5": "D序杀一肖-2026.07.29新增1杀肖类 [D序]",
    "D序杀一段 -2026.07.29新增杀段类 [D序]自己用": "D序杀一段 -2026.07.29新增杀段类 [D序]",
}

REMOVED_RULES = {"L序杀一行 - 样例核心"}

SYNCED_AT = "2026-08-16T12:16:24Z"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync RuleQuant seed rules from an exported Word library.")
    parser.add_argument("document", type=Path)
    parser.add_argument("rules", type=Path)
    return parser.parse_args()


def parse_bool_status(value: str) -> tuple[bool, bool, bool]:
    return (
        "已启用" in value,
        "计算异常" not in value,
        "不参与综合参考" not in value and "参与综合参考" in value,
    )


def parse_output_config(value: str) -> tuple[str, str]:
    match = re.fullmatch(r"归一化：(.+?)；目标：(.+)", value.strip())
    if not match:
        raise ValueError(f"无法识别输出配置：{value}")
    return match.group(1).strip(), match.group(2).strip()


def parse_pattern(value: str) -> list[int]:
    if value == "无固定取位循环":
        return []
    return [int(item) for item in re.findall(r"\d+", value)]


def optional_value(value: str) -> str | None:
    clean = value.strip()
    return None if clean in {"", "无"} else clean


def parse_anchor_config(value: str) -> dict[str, Any]:
    match = re.fullmatch(
        r"锚点期号：(.+?)；锚点位置：(.+?)；管\s*(\d+)\s*期；验证偏移\s*(\d+)\s*期",
        value.strip(),
    )
    if not match:
        raise ValueError(f"无法识别锚点配置：{value}")
    anchor_issue = optional_value(match.group(1))
    anchor_index = optional_value(match.group(2))
    return {
        "anchorIssue": anchor_issue,
        "anchorPatternIndex": int(anchor_index) if anchor_index is not None else None,
        "periodSpan": int(match.group(3)),
        "verifyOffset": int(match.group(4)),
    }


def extract_entries(document_path: Path) -> list[dict[str, Any]]:
    document = Document(document_path)
    blocks = list(document.iter_inner_content())
    details_start = next(
        index
        for index, block in enumerate(blocks)
        if isinstance(block, Paragraph) and block.text.strip() == "逐条公式详情"
    ) + 1

    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    section = ""

    for block in blocks[details_start:]:
        if isinstance(block, Paragraph):
            value = block.text.strip()
            style_name = block.style.name if block.style else ""
            heading_match = re.fullmatch(r"(\d{2,3})\s{2}(.+)", value)
            if style_name.startswith("Heading 2") and heading_match:
                if current is not None:
                    entries.append(current)
                current = {
                    "index": int(heading_match.group(1)),
                    "name": heading_match.group(2).strip(),
                    "examples": [],
                }
                section = "meta"
                continue
            if current is None or not value:
                continue
            if style_name.startswith("Heading 3"):
                section = {
                    "规则状态与配置": "config",
                    "规则说明": "description",
                    "手算样例": "examples",
                }.get(value, section)
            elif section == "meta":
                parts = [part.strip() for part in value.split("·")]
                if len(parts) < 3:
                    raise ValueError(f"无法识别规则元数据：{value}")
                current["categoryLabel"] = parts[0]
                current["orderMode"] = parts[1].removesuffix("序").strip()
                current["sourceLabel"] = " · ".join(parts[2:])
            elif section == "description":
                current["description"] = "" if value == "暂无说明" else value
            elif section == "examples" and value != "暂无手算样例":
                current["examples"].append(value)
        elif isinstance(block, Table) and current is not None:
            rows = [[cell.text.strip() for cell in row.cells] for row in block.rows]
            if len(rows) == 1 and len(rows[0]) == 1 and rows[0][0].startswith("公式"):
                current["formula"] = re.sub(r"^公式\s*", "", rows[0][0]).strip()
            elif rows and all(len(row) >= 2 for row in rows):
                current["config"] = {row[0]: row[1] for row in rows}

    if current is not None:
        entries.append(current)

    for expected_index, entry in enumerate(entries, 1):
        if entry.get("index") != expected_index:
            raise ValueError(f"公式序号不连续：期望 {expected_index}，得到 {entry.get('index')}")
        required = {"name", "categoryLabel", "orderMode", "sourceLabel", "formula", "config"}
        missing = required.difference(entry)
        if missing:
            raise ValueError(f"第 {expected_index} 条公式缺少字段：{sorted(missing)}")
    return entries


def find_existing_rule(
    entry: dict[str, Any],
    existing_rules: list[dict[str, Any]],
    used_ids: set[str],
) -> dict[str, Any] | None:
    imported_id = f"rq-docx-20260816-{entry['index']:03d}"
    imported_matches = [
        rule for rule in existing_rules if rule["id"] not in used_ids and rule["id"] == imported_id
    ]
    if len(imported_matches) == 1:
        return imported_matches[0]

    category = CATEGORY_BY_LABEL[entry["categoryLabel"]]
    exact_matches = [
        rule
        for rule in existing_rules
        if rule["id"] not in used_ids
        and rule["name"] == entry["name"]
        and rule["category"] == category
        and rule["orderMode"] == entry["orderMode"]
    ]
    if len(exact_matches) == 1:
        return exact_matches[0]

    previous_name = RENAMED_RULES.get(entry["name"])
    if previous_name:
        renamed_matches = [
            rule for rule in existing_rules if rule["id"] not in used_ids and rule["name"] == previous_name
        ]
        if len(renamed_matches) == 1:
            return renamed_matches[0]
    return None


def build_rule(
    entry: dict[str, Any],
    existing: dict[str, Any] | None,
    document_name: str,
) -> dict[str, Any]:
    category = CATEGORY_BY_LABEL.get(entry["categoryLabel"])
    source_type = SOURCE_BY_LABEL.get(entry["sourceLabel"])
    if not category or not source_type:
        raise ValueError(f"未支持的公式标签：{entry['categoryLabel']} / {entry['sourceLabel']}")

    config = entry["config"]
    enabled, can_compute, participates = parse_bool_status(config["运行状态"])
    normalizer, target = parse_output_config(config["输出配置"])
    anchor = parse_anchor_config(config["锚点与管期"])
    source_file = config["来源记录"].strip()
    if source_file in {"未记录", "无"}:
        source_file = ""

    rule = deepcopy(existing) if existing is not None else {}
    rule.update(
        {
            "id": existing["id"] if existing is not None else f"rq-docx-20260816-{entry['index']:03d}",
            "name": entry["name"],
            "category": category,
            "orderMode": entry["orderMode"],
            "formula": entry["formula"],
            "normalizer": normalizer,
            "target": target,
            "verifyMode": "next_special",
            "positionPattern": parse_pattern(config["取位循环"]),
            "periodSpan": anchor["periodSpan"],
            "verifyOffset": anchor["verifyOffset"],
            "enabled": enabled,
            "manuallyConfirmed": existing.get("manuallyConfirmed", False) if existing else False,
            "participatesInReference": participates,
            "sourceType": source_type,
            "origin": existing.get("origin") if existing and existing.get("origin") else document_name,
            "canCompute": can_compute,
            "parseStatus": "parsed" if can_compute else "failed",
            "verifyStatus": existing.get("verifyStatus", "unchecked") if existing else "unchecked",
            "tags": existing.get("tags", []) if existing else [entry["categoryLabel"], f"{entry['orderMode']}序", entry["sourceLabel"]],
            "description": entry.get("description", ""),
            "sourceFile": source_file,
            "examples": entry.get("examples", []),
            "createdAt": existing.get("createdAt", SYNCED_AT) if existing else SYNCED_AT,
            "updatedAt": SYNCED_AT,
        }
    )
    for key in ("anchorIssue", "anchorPatternIndex"):
        if anchor[key] is None:
            rule.pop(key, None)
        else:
            rule[key] = anchor[key]
    rule.pop("librarySignature", None)
    return rule


def main() -> None:
    args = parse_args()
    with args.rules.open(encoding="utf-8") as handle:
        existing_rules = json.load(handle)

    entries = extract_entries(args.document)
    used_ids: set[str] = set()
    synchronized_by_id: dict[str, dict[str, Any]] = {}
    added_rules: list[dict[str, Any]] = []
    added_ids: list[str] = []

    for entry in entries:
        existing = find_existing_rule(entry, existing_rules, used_ids)
        rule = build_rule(entry, existing, args.document.name)
        used_ids.add(rule["id"])
        if existing is None:
            added_rules.append(rule)
            added_ids.append(rule["id"])
        else:
            synchronized_by_id[rule["id"]] = rule

    synchronized = [
        synchronized_by_id[rule["id"]]
        for rule in existing_rules
        if rule["id"] in synchronized_by_id
    ] + added_rules

    unused_existing = [rule["name"] for rule in existing_rules if rule["id"] not in used_ids]
    expected_removed = REMOVED_RULES.intersection(rule["name"] for rule in existing_rules)
    if set(unused_existing) != expected_removed:
        raise ValueError(f"最新文档未能对账这些已有公式：{unused_existing}")
    if len(synchronized) != 160:
        raise ValueError(f"同步数量异常：总计 {len(synchronized)}，新增 {len(added_ids)}")
    if len({rule["id"] for rule in synchronized}) != len(synchronized):
        raise ValueError("同步后出现重复公式 ID")

    with args.rules.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(synchronized, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(json.dumps({"total": len(synchronized), "added": len(added_ids), "updated": len(used_ids) - len(added_ids)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
