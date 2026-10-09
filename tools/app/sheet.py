"""Contact sheet of screenshots: python tools/app/sheet.py out.png in1.png in2.png ... (side by side, scaled to one height)."""
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
h = 1000
ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
sheet = Image.new('RGB', (sum(i.width for i in ims) + 12 * (len(ims) - 1), h), (128, 128, 128))
x = 0
for i in ims:
    sheet.paste(i, (x, 0)); x += i.width + 12
sheet.save(out)
