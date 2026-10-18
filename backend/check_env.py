from pathlib import Path

p = Path(__file__).resolve().parent.parent / ".env"
print("Ищу файл:", p)
print("Файл существует:", p.exists())
if p.exists():
    raw = p.read_bytes()
    print("Размер, байт:", len(raw))
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        print("ВНИМАНИЕ: файл в кодировке UTF-16, пересохраните его как UTF-8")
    text = raw.decode("utf-8-sig", errors="replace")
    names = [
        line.split("=")[0].strip()
        for line in text.splitlines()
        if "=" in line and not line.strip().startswith("#")
    ]
    print("Названия переменных:", names)
    print("DATABASE_URL есть:", "DATABASE_URL" in names)