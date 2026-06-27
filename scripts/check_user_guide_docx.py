from pathlib import Path
from zipfile import ZipFile


path = Path("D:/RuleQuant/release/RuleQuant使用说明书_20260626_可转发版.docx")
with ZipFile(path) as package:
    names = set(package.namelist())
    required = ["word/document.xml", "word/styles.xml", "word/footer1.xml", "[Content_Types].xml"]
    print("missing=", [name for name in required if name not in names])
    xml = package.read("word/document.xml").decode("utf-8")
    for text in [
        "RuleQuant 回测终端使用说明书",
        "打开RuleQuant网页.hta",
        "每天同步和计算流程",
        "单双自用 4455",
        "仅供公式研究和参考排序",
    ]:
        print(text, text in xml)
    print("paragraph tags", xml.count("<w:p"))
    print("table tags", xml.count("<w:tbl>"))
