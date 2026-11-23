import os
from PIL import Image, ImageDraw, ImageFont

CROPS = [
    {
        "filename": "cat1_01_ext_cancelling.png",
        "real_source": "/Users/vaibhavarya/.gemini/antigravity/brain/5068940e-3d76-409c-bf5a-038d3a9564d5/.user_uploaded/media_1795347427303_6ca035ab.jpg",
        "box": (10, 50, 420, 360),
        "fallback_text": "(x² - 9)/(x - 3) = 0",
        "size": (450, 200)
    },
    {
        "filename": "cat1_02_ext_cancelling.png",
        "text": "(x² - 4)/(x - 2) = 0",
        "size": (450, 180)
    },
    {
        "filename": "cat1_04_ext_cancelling.png",
        "text": "(x² - 5x + 6)/(x - 2) = 0",
        "size": (500, 180)
    },
    {
        "filename": "cat2_01_domain_exclusion.png",
        "text": "1/(x - 5) = 0",
        "size": (350, 160)
    },
    {
        "filename": "cat2_03_domain_exclusion.png",
        "text": "√(2x + 6) = x - 1",
        "size": (450, 180)
    },
    {
        "filename": "cat3_01_quad_roots.png",
        "text": "x² - 5x + 6 = 0",
        "size": (420, 180)
    },
    {
        "filename": "cat3_02_quad_roots.png",
        "text": "x² - 4 = 0",
        "size": (350, 160)
    },
    {
        "filename": "cat3_03_quad_roots.png",
        "text": "x² + 9 = 0",
        "size": (350, 160)
    },
    {
        "filename": "cat4_01_signs.png",
        "text": "-3 · (-4) - 5",
        "size": (400, 160)
    },
    {
        "filename": "cat5_02_fractions.png",
        "text": "(2/5)x = 10",
        "size": (380, 160)
    },
    {
        "filename": "cat6_01_abs_val.png",
        "text": "|x - 3| = 7",
        "size": (380, 160)
    },
    {
        "filename": "cat6_03_abs_val.png",
        "text": "|x + 5| = -3",
        "size": (380, 160)
    },
    {
        "filename": "cat7_01_systems.png",
        "text": "x + y = 10\nx - y = 2",
        "size": (380, 240)
    },
    {
        "filename": "cat8_01_calculus.png",
        "text": "d/dx(x³)",
        "size": (350, 160)
    },
    {
        "filename": "cat9_01_inequalities.png",
        "text": "2x - 4 > 6",
        "size": (380, 160)
    }
]

def main():
    target_dir = os.path.join(os.path.dirname(__file__), "handwritten")
    os.makedirs(target_dir, exist_ok=True)
    
    font_path = "/System/Library/Fonts/Supplemental/ChalkboardSE.ttc"
    font = ImageFont.truetype(font_path, size=46)

    for item in CROPS:
        dest_path = os.path.join(target_dir, item["filename"])
        
        # Check if real user drawing source exists
        if "real_source" in item and os.path.exists(item["real_source"]):
            try:
                src_img = Image.open(item["real_source"])
                cropped = src_img.crop(item["box"])
                cropped.save(dest_path)
                print(f"Cropped real source for {item['filename']} -> {dest_path}")
                continue
            except Exception as e:
                print(f"Could not crop real source for {item['filename']}: {e}, falling back to font rendering")

        # Render handwritten font image
        w, h = item["size"]
        img = Image.new("RGB", (w, h), color=(251, 251, 250))
        draw = ImageDraw.Draw(img)
        lines = item["text"].split("\n")
        y = (h - len(lines) * 60) // 2
        for line in lines:
            draw.text((40, y), line, fill=(28, 28, 28), font=font)
            y += 65
            
        img.save(dest_path)
        print(f"Rendered handwriting font image for {item['filename']} -> {dest_path}")

if __name__ == "__main__":
    main()
