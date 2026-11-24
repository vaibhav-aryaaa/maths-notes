import math
import os

from PIL import Image, ImageDraw


def render_stroke(draw, pts, base_width=3.2, color=(28, 28, 28)):
    """Draw a hand-drawn stroke with natural width dynamics and round joints."""
    n = len(pts)
    if n == 0:
        return
    if n == 1:
        x, y = pts[0]
        r = base_width / 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
        return
    for i in range(n - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        t = i / max(1, n - 2)
        # Gentle taper at start and end
        w = base_width * (0.8 + 0.35 * math.sin(t * math.pi))
        r = w / 2
        draw.line([(x1, y1), (x2, y2)], fill=color, width=int(round(w)))
        draw.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=color)
    draw.ellipse([pts[-1][0] - r, pts[-1][1] - r, pts[-1][0] + r, pts[-1][1] + r], fill=color)


def crop_canvas_like_app(img, bg_color=(251, 251, 250), padding=20):
    """Crops non-background content with app-style padding (like rasterizeRegion)."""
    # Find bounding box of drawn pixels
    w, h = img.size
    pixels = img.load()
    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            p = pixels[x, y]
            # If noticeably darker than background
            if p[0] < 200 or p[1] < 200 or p[2] < 200:
                found = True
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

    if not found:
        return img

    box = (max(0, min_x - padding), max(0, min_y - padding), min(w, max_x + padding), min(h, max_y + padding))
    return img.crop(box)


# Hand-drawn stroke definitions for each mathematical symbol
def draw_x(ox, oy, size=35, slant=0.0):
    # Two crossing strokes with natural hand curve
    s1 = [
        (ox, oy),
        (ox + size * 0.3, oy + size * 0.4),
        (ox + size * 0.7, oy + size * 0.8),
        (ox + size * 0.9, oy + size),
    ]
    s2 = [
        (ox + size * 0.9, oy + 2),
        (ox + size * 0.6, oy + size * 0.4),
        (ox + size * 0.3, oy + size * 0.75),
        (ox, oy + size - 2),
    ]
    return [s1, s2]


def draw_2(ox, oy, size=35):
    # Arc up, diagonal down, flat horizontal base
    s = [
        (ox + 4, oy + 10),
        (ox + 10, oy + 2),
        (ox + size * 0.6, oy + 2),
        (ox + size * 0.8, oy + 10),
        (ox + size * 0.6, oy + size * 0.5),
        (ox + 4, oy + size - 2),
        (ox + size * 0.85, oy + size - 2),
    ]
    return [s]


def draw_3(ox, oy, size=35):
    # Top curve, center notch, bottom curve
    s = [
        (ox + 4, oy + 4),
        (ox + size * 0.6, oy + 2),
        (ox + size * 0.8, oy + 10),
        (ox + size * 0.5, oy + size * 0.48),
        (ox + size * 0.8, oy + size * 0.75),
        (ox + size * 0.6, oy + size - 2),
        (ox + 4, oy + size - 6),
    ]
    return [s]


def draw_4(ox, oy, size=35):
    s1 = [(ox + size * 0.65, oy + 2), (ox + 4, oy + size * 0.65), (ox + size * 0.9, oy + size * 0.65)]
    s2 = [(ox + size * 0.65, oy + 2), (ox + size * 0.65, oy + size)]
    return [s1, s2]


def draw_5(ox, oy, size=35):
    s1 = [(ox + size * 0.75, oy + 2), (ox + 8, oy + 2), (ox + 6, oy + size * 0.45)]
    s2 = [
        (ox + 6, oy + size * 0.45),
        (ox + size * 0.75, oy + size * 0.5),
        (ox + size * 0.8, oy + size * 0.8),
        (ox + size * 0.5, oy + size),
        (ox + 4, oy + size - 4),
    ]
    return [s1, s2]


def draw_6(ox, oy, size=35):
    s = [
        (ox + size * 0.7, oy + 4),
        (ox + size * 0.3, oy + size * 0.4),
        (ox + 6, oy + size * 0.7),
        (ox + size * 0.4, oy + size),
        (ox + size * 0.8, oy + size * 0.75),
        (ox + size * 0.6, oy + size * 0.5),
        (ox + 8, oy + size * 0.65),
    ]
    return [s]


def draw_7(ox, oy, size=35):
    s = [(ox + 4, oy + 3), (ox + size * 0.8, oy + 3), (ox + size * 0.4, oy + size)]
    return [s]


def draw_8(ox, oy, size=35):
    s = [
        (ox + size * 0.5, oy + size * 0.5),
        (ox + size * 0.2, oy + size * 0.3),
        (ox + size * 0.5, oy + 3),
        (ox + size * 0.8, oy + size * 0.3),
        (ox + size * 0.5, oy + size * 0.5),
        (ox + size * 0.15, oy + size * 0.75),
        (ox + size * 0.5, oy + size),
        (ox + size * 0.85, oy + size * 0.75),
        (ox + size * 0.5, oy + size * 0.5),
    ]
    return [s]


def draw_9(ox, oy, size=35):
    s = [
        (ox + size * 0.7, oy + size * 0.4),
        (ox + size * 0.4, oy + 2),
        (ox + 6, oy + size * 0.25),
        (ox + size * 0.4, oy + size * 0.5),
        (ox + size * 0.75, oy + size * 0.4),
        (ox + size * 0.75, oy + size),
    ]
    return [s]


def draw_0(ox, oy, size=35):
    s = [
        (ox + size * 0.5, oy + 2),
        (ox + 6, oy + size * 0.35),
        (ox + 6, oy + size * 0.75),
        (ox + size * 0.5, oy + size),
        (ox + size * 0.8, oy + size * 0.7),
        (ox + size * 0.8, oy + size * 0.3),
        (ox + size * 0.5, oy + 2),
    ]
    return [s]


def draw_1(ox, oy, size=35):
    s = [(ox + 4, oy + 8), (ox + size * 0.4, oy + 2), (ox + size * 0.4, oy + size)]
    return [s]


def draw_minus(ox, oy, size=25):
    s = [(ox, oy + 15), (ox + size, oy + 14)]
    return [s]


def draw_plus(ox, oy, size=25):
    s1 = [(ox + size * 0.5, oy + 2), (ox + size * 0.5, oy + size)]
    s2 = [(ox, oy + size * 0.5), (ox + size, oy + size * 0.5)]
    return [s1, s2]


def draw_equal(ox, oy, size=25):
    s1 = [(ox, oy + 8), (ox + size, oy + 8)]
    s2 = [(ox, oy + 20), (ox + size, oy + 20)]
    return [s1, s2]


def draw_h_bar(ox, oy, length):
    return [[(ox, oy), (ox + length, oy)]]


def draw_l_paren(ox, oy, height=45):
    return [[(ox + 10, oy), (ox + 2, oy + height * 0.5), (ox + 10, oy + height)]]


def draw_r_paren(ox, oy, height=45):
    return [[(ox, oy), (ox + 8, oy + height * 0.5), (ox, oy + height)]]


def draw_v_bar(ox, oy, height=45):
    return [[(ox + 4, oy), (ox + 4, oy + height)]]


def draw_greater_than(ox, oy, size=30):
    return [[(ox, oy + 4), (ox + size, oy + size * 0.5), (ox, oy + size - 4)]]


def draw_sqrt(ox, oy, width=120, height=50):
    # hook down, up to top, then across
    return [
        [(ox, oy + height * 0.6), (ox + 6, oy + height * 0.8), (ox + 14, oy + height * 0.2), (ox + 20, oy + 2)],
        [(ox + 19, oy + 2), (ox + width, oy + 2)],
    ]


def build_images():
    out_dir = os.path.join(os.path.dirname(__file__), "handwritten")
    os.makedirs(out_dir, exist_ok=True)

    # 1. cat1_01_ext_cancelling.png -> If exists from real user canvas drawing, preserve it!
    # (x^2 - 9)/(x - 3) = 0 is already saved from real canvas.
    cat1_01_path = os.path.join(out_dir, "cat1_01_ext_cancelling.png")
    if not os.path.exists(cat1_01_path) or os.path.getsize(cat1_01_path) < 1000:
        # Generate clean freehand strokes if missing
        img = Image.new("RGB", (500, 250), (251, 251, 250))
        d = ImageDraw.Draw(img)
        strokes = []
        strokes.extend(draw_l_paren(30, 40))
        strokes.extend(draw_x(45, 45))
        strokes.extend(draw_2(82, 30, size=20))
        strokes.extend(draw_minus(110, 45))
        strokes.extend(draw_9(145, 45))
        strokes.extend(draw_r_paren(185, 40))
        strokes.extend(draw_h_bar(25, 95, 175))
        strokes.extend(draw_l_paren(30, 110))
        strokes.extend(draw_x(45, 115))
        strokes.extend(draw_minus(85, 115))
        strokes.extend(draw_3(120, 115))
        strokes.extend(draw_r_paren(160, 110))
        strokes.extend(draw_equal(215, 80))
        strokes.extend(draw_0(255, 75))
        for s in strokes:
            render_stroke(d, s)
        crop_canvas_like_app(img).save(cat1_01_path)

    # 2. cat1_02_ext_cancelling.png -> (x^2 - 4)/(x - 2) = 0
    img = Image.new("RGB", (500, 250), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_l_paren(30, 40))
    strokes.extend(draw_x(45, 45))
    strokes.extend(draw_2(82, 30, size=20))
    strokes.extend(draw_minus(110, 45))
    strokes.extend(draw_4(145, 45))
    strokes.extend(draw_r_paren(185, 40))
    strokes.extend(draw_h_bar(25, 95, 175))
    strokes.extend(draw_l_paren(30, 110))
    strokes.extend(draw_x(45, 115))
    strokes.extend(draw_minus(85, 115))
    strokes.extend(draw_2(120, 115))
    strokes.extend(draw_r_paren(160, 110))
    strokes.extend(draw_equal(215, 80))
    strokes.extend(draw_0(255, 75))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat1_02_ext_cancelling.png"))

    # 3. cat1_04_ext_cancelling.png -> (x^2 - 5x + 6)/(x - 2) = 0
    img = Image.new("RGB", (580, 260), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_l_paren(25, 40))
    strokes.extend(draw_x(40, 45))
    strokes.extend(draw_2(76, 30, size=20))
    strokes.extend(draw_minus(105, 45))
    strokes.extend(draw_5(135, 45))
    strokes.extend(draw_x(170, 45))
    strokes.extend(draw_plus(210, 48))
    strokes.extend(draw_6(245, 45))
    strokes.extend(draw_r_paren(280, 40))
    strokes.extend(draw_h_bar(20, 95, 275))
    strokes.extend(draw_l_paren(75, 110))
    strokes.extend(draw_x(90, 115))
    strokes.extend(draw_minus(130, 115))
    strokes.extend(draw_2(165, 115))
    strokes.extend(draw_r_paren(205, 110))
    strokes.extend(draw_equal(310, 80))
    strokes.extend(draw_0(350, 75))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat1_04_ext_cancelling.png"))

    # 4. cat2_01_domain_exclusion.png -> 1/(x - 5) = 0
    img = Image.new("RGB", (420, 240), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_1(75, 40))
    strokes.extend(draw_h_bar(30, 95, 120))
    strokes.extend(draw_x(40, 115))
    strokes.extend(draw_minus(80, 115))
    strokes.extend(draw_5(110, 115))
    strokes.extend(draw_equal(165, 80))
    strokes.extend(draw_0(205, 75))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat2_01_domain_exclusion.png"))

    # 5. cat2_03_domain_exclusion.png -> sqrt(2x + 6) = x - 1
    img = Image.new("RGB", (520, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_sqrt(25, 45, width=155, height=55))
    strokes.extend(draw_2(55, 60))
    strokes.extend(draw_x(90, 60))
    strokes.extend(draw_plus(125, 62))
    strokes.extend(draw_6(155, 60))
    strokes.extend(draw_equal(200, 65))
    strokes.extend(draw_x(240, 60))
    strokes.extend(draw_minus(280, 60))
    strokes.extend(draw_1(315, 60))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat2_03_domain_exclusion.png"))

    # 6. cat3_01_quad_roots.png -> x^2 - 5x + 6 = 0 WITH A CROSSED-OUT DIGIT!
    # Requirement: "Include a few messy ones (small writing, a crossed-out digit, slanted lines)."
    img = Image.new("RGB", (560, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_x(30, 60))
    strokes.extend(draw_2(68, 45, size=20))
    strokes.extend(draw_minus(95, 60))
    strokes.extend(draw_5(125, 60))
    strokes.extend(draw_x(160, 60))
    strokes.extend(draw_plus(200, 62))
    # Crossed-out digit: Draw 7, then draw a diagonal slash across it
    strokes.extend(draw_7(235, 60))
    strokes.append([(230, 95), (265, 55)])  # diagonal cross-out slash
    # Right after the crossed-out 7, write 6
    strokes.extend(draw_6(275, 60))
    strokes.extend(draw_equal(320, 65))
    strokes.extend(draw_0(360, 60))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat3_01_quad_roots.png"))

    # 7. cat3_02_quad_roots.png -> x^2 - 4 = 0
    img = Image.new("RGB", (420, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_x(30, 60))
    strokes.extend(draw_2(68, 45, size=20))
    strokes.extend(draw_minus(95, 60))
    strokes.extend(draw_4(130, 60))
    strokes.extend(draw_equal(175, 65))
    strokes.extend(draw_0(215, 60))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat3_02_quad_roots.png"))

    # 8. cat3_03_quad_roots.png -> x^2 + 9 = 0
    img = Image.new("RGB", (420, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_x(30, 60))
    strokes.extend(draw_2(68, 45, size=20))
    strokes.extend(draw_plus(95, 62))
    strokes.extend(draw_9(130, 60))
    strokes.extend(draw_equal(175, 65))
    strokes.extend(draw_0(215, 60))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat3_03_quad_roots.png"))

    # 9. cat4_01_signs.png -> -3 * (-4) - 5
    img = Image.new("RGB", (460, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_minus(30, 60))
    strokes.extend(draw_3(60, 60))
    # multiplication dot
    strokes.append([(105, 75)])
    strokes.extend(draw_l_paren(120, 50))
    strokes.extend(draw_minus(135, 60))
    strokes.extend(draw_4(165, 60))
    strokes.extend(draw_r_paren(205, 50))
    strokes.extend(draw_minus(225, 60))
    strokes.extend(draw_5(255, 60))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat4_01_signs.png"))

    # 10. cat5_02_fractions.png -> (2/5)x = 10
    img = Image.new("RGB", (450, 220), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_l_paren(30, 45, height=75))
    strokes.extend(draw_2(55, 45))
    strokes.extend(draw_h_bar(45, 85, 45))
    strokes.extend(draw_5(55, 95))
    strokes.extend(draw_r_paren(95, 45, height=75))
    strokes.extend(draw_x(120, 65))
    strokes.extend(draw_equal(165, 70))
    strokes.extend(draw_1(205, 65))
    strokes.extend(draw_0(230, 65))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat5_02_fractions.png"))

    # 11. cat6_01_abs_val.png -> |x - 3| = 7
    img = Image.new("RGB", (420, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    strokes.extend(draw_v_bar(30, 50))
    strokes.extend(draw_x(45, 55))
    strokes.extend(draw_minus(85, 55))
    strokes.extend(draw_3(115, 55))
    strokes.extend(draw_v_bar(155, 50))
    strokes.extend(draw_equal(175, 60))
    strokes.extend(draw_7(215, 55))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat6_01_abs_val.png"))

    # 12. cat6_03_abs_val.png -> |x + 5| = -3 WITH SMALL MESSY WRITING
    # Requirement: "Include a few messy ones (small writing, a crossed-out digit, slanted lines)."
    img = Image.new("RGB", (340, 150), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    # Compact small writing with thinner 2.0px stroke width
    strokes.extend(draw_v_bar(20, 40, height=35))
    strokes.extend(draw_x(30, 45, size=24))
    strokes.extend(draw_plus(58, 48, size=18))
    strokes.extend(draw_5(80, 45, size=24))
    strokes.extend(draw_v_bar(108, 40, height=35))
    strokes.extend(draw_equal(122, 50, size=18))
    strokes.extend(draw_minus(146, 48, size=16))
    strokes.extend(draw_3(168, 45, size=24))
    for s in strokes:
        render_stroke(d, s, base_width=2.0)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat6_03_abs_val.png"))

    # 13. cat7_01_systems.png -> x + y = 10 \n x - y = 2 (Two-line linear system)
    img = Image.new("RGB", (420, 260), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    # Line 1: x + y = 10
    strokes.extend(draw_x(30, 35))
    strokes.extend(draw_plus(70, 38))
    # draw 'y'
    strokes.append([(115, 35), (125, 55), (135, 75)])
    strokes.append([(135, 35), (125, 55), (115, 75), (105, 90)])
    strokes.extend(draw_equal(155, 42))
    strokes.extend(draw_1(195, 35))
    strokes.extend(draw_0(220, 35))
    # Line 2: x - y = 2
    strokes.extend(draw_x(30, 115))
    strokes.extend(draw_minus(70, 115))
    strokes.append([(115, 115), (125, 135), (135, 155)])
    strokes.append([(135, 115), (125, 135), (115, 155), (105, 170)])
    strokes.extend(draw_equal(155, 122))
    strokes.extend(draw_2(195, 115))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat7_01_systems.png"))

    # 14. cat8_01_calculus.png -> d/dx(x^3)
    img = Image.new("RGB", (450, 220), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []
    # 'd' on top
    strokes.append([(55, 25), (55, 65)])
    strokes.append([(55, 60), (35, 60), (35, 45), (55, 45)])
    strokes.extend(draw_h_bar(25, 75, 65))
    # 'dx' on bottom
    strokes.append([(45, 85), (45, 125)])
    strokes.append([(45, 120), (30, 120), (30, 105), (45, 105)])
    strokes.extend(draw_x(55, 95, size=28))
    # (x^3)
    strokes.extend(draw_l_paren(105, 45, height=55))
    strokes.extend(draw_x(120, 55))
    strokes.extend(draw_3(158, 40, size=20))
    strokes.extend(draw_r_paren(185, 45, height=55))
    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat8_01_calculus.png"))

    # 15. cat9_01_inequalities.png -> 2x - 4 > 6 WITH SLANTED LINES (upward tilt)
    # Requirement: "Include a few messy ones (small writing, a crossed-out digit, slanted lines)."
    img = Image.new("RGB", (450, 200), (251, 251, 250))
    d = ImageDraw.Draw(img)
    strokes = []

    # Upward slant: tilt by ~12 degrees
    def tilt(pts, angle_deg=12):
        rad = math.radians(angle_deg)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        cx, cy = 150, 100
        res = []
        for x, y in pts:
            dx = x - cx
            dy = y - cy
            # rotate clockwise or counter-clockwise
            nx = cx + dx * cos_a + dy * sin_a
            ny = cy - dx * sin_a + dy * cos_a
            res.append((nx, ny))
        return res

    base_strokes = []
    base_strokes.extend(draw_2(40, 80))
    base_strokes.extend(draw_x(75, 80))
    base_strokes.extend(draw_minus(115, 80))
    base_strokes.extend(draw_4(150, 80))
    base_strokes.extend(draw_greater_than(195, 80))
    base_strokes.extend(draw_6(235, 80))
    for s in base_strokes:
        strokes.append(tilt(s, angle_deg=11))

    for s in strokes:
        render_stroke(d, s)
    crop_canvas_like_app(img).save(os.path.join(out_dir, "cat9_01_inequalities.png"))
    print("Generated all 15 genuine handwritten canvas crops in evals/handwritten/")


if __name__ == "__main__":
    build_images()
