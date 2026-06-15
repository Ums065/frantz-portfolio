from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Sequence, Tuple


PAGE_W = 612.0
PAGE_H = 792.0
MARGIN = 40.0
CONTENT_W = PAGE_W - (MARGIN * 2)

FONT_REG = "F1"
FONT_BOLD = "F2"
FONT_SERIF = "F3"
FONT_SERIF_BOLD = "F4"

OUT_PATH = Path("frontend/public/docs/new_school_functionality.pdf")


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def rgb(r: int, g: int, b: int) -> str:
    return f"{r / 255:.3f} {g / 255:.3f} {b / 255:.3f}"


def line_count(text: str, width: float, size: float) -> int:
    lines = wrap_text(text, width, size)
    return max(1, len(lines))


def wrap_text(text: str, width: float, size: float) -> List[str]:
    if not text:
        return [""]

    words = text.replace("\n", " ").split()
    if not words:
        return [""]

    lines: List[str] = []
    current = ""

    for word in words:
        test = word if not current else f"{current} {word}"
        if measure_text(test, size) <= width or not current:
            current = test
        else:
            lines.append(current)
            current = word

    if current:
        lines.append(current)
    return lines


def measure_text(text: str, size: float) -> float:
    # Approximate Helvetica/Times widths closely enough for fixed-layout PDF text wrapping.
    widths = {
        " ": 0.28, "i": 0.26, "l": 0.26, "I": 0.30, "t": 0.31, "f": 0.33, "r": 0.30, "j": 0.30,
        ".": 0.22, ",": 0.22, ":": 0.22, ";": 0.22, "!": 0.24, "?": 0.55, "-": 0.28, "/": 0.32,
        "m": 0.90, "w": 0.90, "M": 0.96, "W": 0.96, "0": 0.55, "1": 0.55, "2": 0.55, "3": 0.55,
        "4": 0.55, "5": 0.55, "6": 0.55, "7": 0.55, "8": 0.55, "9": 0.55,
    }
    total = 0.0
    for ch in text:
        total += widths.get(ch, 0.54)
    return total * size


@dataclass
class Page:
    dark: bool = False
    ops: List[str] = field(default_factory=list)

    def add(self, op: str) -> None:
        self.ops.append(op)

    def rect(self, x: float, y: float, w: float, h: float, stroke=(0, 0, 0), fill=None, line=1.0) -> None:
        self.add("q")
        self.add(f"{line:.2f} w")
        if fill is not None:
            self.add(f"{rgb(*fill)} rg")
            if stroke is not None:
                self.add(f"{rgb(*stroke)} RG")
            self.add(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re B")
        else:
            self.add(f"{rgb(*stroke)} RG")
            self.add(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")
        self.add("Q")

    def line(self, x1: float, y1: float, x2: float, y2: float, stroke=(0, 0, 0), width=1.0) -> None:
        self.add("q")
        self.add(f"{width:.2f} w")
        self.add(f"{rgb(*stroke)} RG")
        self.add(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")
        self.add("Q")

    def circle(self, x: float, y: float, r: float, fill=(0, 0, 0)) -> None:
        # Approximate a small circle with a filled square for simplicity.
        self.rect(x - r, y - r, r * 2, r * 2, stroke=fill, fill=fill, line=0.5)

    def text(self, x: float, y: float, txt: str, size: float = 12, font: str = FONT_REG, color=(0, 0, 0)) -> None:
        self.add("BT")
        self.add(f"/{font} {size:.2f} Tf")
        self.add(f"{rgb(*color)} rg")
        self.add(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        self.add(f"({esc(txt)}) Tj")
        self.add("ET")

    def center_text(self, x_center: float, y: float, txt: str, size: float = 12, font: str = FONT_REG, color=(0, 0, 0)) -> None:
        width = measure_text(txt, size)
        self.text(x_center - width / 2, y, txt, size=size, font=font, color=color)

    def paragraph(
        self,
        x: float,
        y_top: float,
        text: str,
        width: float = CONTENT_W,
        size: float = 11.0,
        leading: float = 15.0,
        font: str = FONT_REG,
        color=(0, 0, 0),
    ) -> float:
        lines = wrap_text(text, width, size)
        y = y_top
        for line in lines:
            self.text(x, y, line, size=size, font=font, color=color)
            y -= leading
        return y

    def bullets(
        self,
        x: float,
        y_top: float,
        items: Sequence[str],
        width: float = CONTENT_W,
        size: float = 10.8,
        leading: float = 14.0,
        gap: float = 4.0,
        bullet_size: float = 4.2,
        font: str = FONT_REG,
        color=(0, 0, 0),
    ) -> float:
        y = y_top
        text_x = x + 12
        text_width = width - 12
        for item in items:
            lines = wrap_text(item, text_width, size)
            baseline = y
            self.circle(x + 4, baseline - 3, bullet_size / 2, fill=color)
            for i, line in enumerate(lines):
                self.text(text_x, baseline, line, size=size, font=font, color=color)
                baseline -= leading
            y = baseline - gap + leading
        return y

    def rule(self, x: float, y: float, width: float, stroke=(201, 168, 76), line=1.0) -> float:
        self.line(x, y, x + width, y, stroke=stroke, width=line)
        return y - 10

    def box(self, x: float, y_top: float, w: float, h: float, fill=(255, 255, 255), stroke=(201, 168, 76), line=1.0) -> None:
        y = y_top - h
        self.rect(x, y, w, h, stroke=stroke, fill=fill, line=line)


class PDFWriter:
    def __init__(self, title: str = "new_school functionality") -> None:
        self.pages: List[Page] = []
        self.title = title

    def add_page(self, dark: bool = False) -> Page:
        page = Page(dark=dark)
        self.pages.append(page)
        return page

    def build(self) -> bytes:
        objects: List[bytes] = []

        # Font objects
        font_objs = []
        for font_name, base_font in [
            (FONT_REG, "Helvetica"),
            (FONT_BOLD, "Helvetica-Bold"),
            (FONT_SERIF, "Times-Roman"),
            (FONT_SERIF_BOLD, "Times-Bold"),
        ]:
            obj = f"<< /Type /Font /Subtype /Type1 /BaseFont /{base_font} >>".encode("ascii")
            font_objs.append(len(objects) + 1)
            objects.append(obj)

        page_obj_nums: List[int] = []
        content_obj_nums: List[int] = []

        for page in self.pages:
            content = "\n".join(page.ops).encode("latin-1", "replace")
            content_obj_nums.append(len(objects) + 1)
            objects.append(f"<< /Length {len(content)} >>\nstream\n".encode("ascii") + content + b"\nendstream")
            page_obj_nums.append(len(objects) + 1)
            objects.append(b"")  # placeholder for page object

        pages_tree_obj = len(objects) + 1
        objects.append(b"")  # placeholder for pages tree
        catalog_obj = len(objects) + 1
        objects.append(b"")  # placeholder for catalog
        info_obj = len(objects) + 1
        objects.append(
            (
                f"<< /Title ({esc(self.title)}) /Author (OpenAI Codex) "
                f"/Subject (new_school functionality specification) /Creator (Codex PDF generator) >>"
            ).encode("ascii")
        )

        # Fill page objects now that page tree object number is known.
        font_resource = f"<< /F1 {font_objs[0]} 0 R /F2 {font_objs[1]} 0 R /F3 {font_objs[2]} 0 R /F4 {font_objs[3]} 0 R >>"
        resources = f"<< /Font {font_resource} >>"
        for idx, page in enumerate(self.pages):
            rotate = ""
            if page.dark:
                # no special handling, but dark cover page still uses same size
                pass
            page_obj_index = page_obj_nums[idx] - 1
            objects[page_obj_index] = (
                f"<< /Type /Page /Parent {pages_tree_obj} 0 R /MediaBox [0 0 {PAGE_W:.0f} {PAGE_H:.0f}] "
                f"/Resources {resources} /Contents {content_obj_nums[idx]} 0 R >>"
            ).encode("ascii")

        kids = " ".join(f"{num} 0 R" for num in page_obj_nums)
        objects[pages_tree_obj - 1] = f"<< /Type /Pages /Kids [ {kids} ] /Count {len(page_obj_nums)} >>".encode("ascii")
        objects[catalog_obj - 1] = f"<< /Type /Catalog /Pages {pages_tree_obj} 0 R >>".encode("ascii")

        # Write PDF body
        offsets: List[int] = []
        out = bytearray()
        out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        for i, obj in enumerate(objects, start=1):
            offsets.append(len(out))
            out.extend(f"{i} 0 obj\n".encode("ascii"))
            out.extend(obj)
            out.extend(b"\nendobj\n")

        xref_pos = len(out)
        out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        out.extend(b"0000000000 65535 f \n")
        for off in offsets:
            out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        out.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_obj} 0 R /Info {info_obj} 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
                "ascii"
            )
        )
        return bytes(out)


def add_cover(pdf: PDFWriter) -> None:
    page = pdf.add_page(dark=True)
    # Background
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(11, 11, 11), fill=(11, 11, 11), line=0)
    page.rect(18, 18, PAGE_W - 36, PAGE_H - 36, stroke=(201, 168, 76), fill=(18, 17, 13), line=1.2)

    # Top bar
    page.text(MARGIN, 736, "FRANTZCOUTARD.COM", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.text(PAGE_W - MARGIN - 128, 736, "Developer-ready spec", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.line(MARGIN, 726, PAGE_W - MARGIN, 726, stroke=(201, 168, 76), width=0.8)

    # Brand circle
    page.box(48, 680, 64, 64, fill=(201, 168, 76), stroke=(245, 212, 138), line=1.2)
    page.center_text(80, 711, "FC", size=22, font=FONT_SERIF_BOLD, color=(20, 15, 6))

    page.text(MARGIN, 640, "new_school functionality", size=28, font=FONT_SERIF_BOLD, color=(255, 255, 255))
    page.text(MARGIN, 612, "Leave It Better Than You Found It", size=16, font=FONT_SERIF, color=(245, 212, 138))

    lead = (
        "This document translates the three client messages into one build-ready module spec for the "
        "current FrantzCoutard.com site. It defines the school challenge flow, required data capture, "
        "consent and approval gates, business interview logging, final submission rules, dashboards, "
        "admin controls, and the technical approach for the existing React + PHP + MySQL stack."
    )
    y = page.paragraph(MARGIN, 585, lead, width=520, size=11.2, leading=15.2, color=(230, 224, 210))

    # Metric boxes
    metric_y = 500
    box_w = 160
    gap = 12
    metrics = [
        ("Ages 11-19", "Students only, with parent or guardian consent required."),
        ("10 interviews", "Each student must log ten local business visits before submission unlocks."),
        ("$5,000 total", "First, second, and third place scholarship awards."),
    ]
    for idx, (title, body) in enumerate(metrics):
        x = MARGIN + idx * (box_w + gap)
        page.box(x, metric_y, box_w, 90, fill=(26, 24, 18), stroke=(201, 168, 76), line=1.0)
        page.text(x + 12, metric_y - 24, title, size=12.5, font=FONT_SERIF_BOLD, color=(245, 212, 138))
        page.paragraph(x + 12, metric_y - 44, body, width=box_w - 24, size=10.2, leading=13.2, color=(231, 226, 214))

    # Bottom cards
    cards_y = 360
    card_w = 156
    card_gap = 12
    cards = [
        ("Parent QR consent", "The parent approves through a unique QR flow tied to the student profile."),
        ("School approval", "School staff confirm enrollment and validate the consent record."),
        ("Teacher approval", "Teachers monitor progress and confirm participation inside the school context."),
        ("Admin review", "Admins export data, review submissions, and publish the winners."),
    ]
    for idx, (title, body) in enumerate(cards):
        x = MARGIN + idx * (card_w + card_gap)
        page.box(x, cards_y, card_w, 92, fill=(18, 17, 13), stroke=(201, 168, 76), line=0.8)
        page.text(x + 10, cards_y - 22, title, size=11.5, font=FONT_BOLD, color=(255, 255, 255))
        page.paragraph(x + 10, cards_y - 40, body, width=card_w - 20, size=9.6, leading=12.5, color=(215, 208, 193))

    page.text(MARGIN, 88, "Winner announcement: August 25, 2026", size=10.5, font=FONT_BOLD, color=(245, 212, 138))
    page.text(PAGE_W - MARGIN - 174, 88, "Built for the existing site, not a separate product", size=10.2, font=FONT_BOLD, color=(245, 212, 138))
    page.line(MARGIN, 78, PAGE_W - MARGIN, 78, stroke=(201, 168, 76), width=0.8)
    page.text(MARGIN, 52, "FrantzCoutard.com  |  2026 Community Business Impact Challenge", size=9.6, font=FONT_REG, color=(220, 214, 200))


def add_page_2(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "1. Challenge analysis", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Program overview and stakeholders", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "The three client messages describe one system: a school-based challenge portal that turns community "
        "discovery into a structured project workflow. The site must capture people, approvals, evidence, "
        "submissions, and winners in one controlled flow."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 10

    page.text(MARGIN, y, "What the challenge asks students to do", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Interview ten local businesses in their neighborhood.",
            "Meet the owners, listen to their stories, and understand their challenges.",
            "Identify opportunities for improvement and propose a practical solution.",
            "Explain how the solution could improve visibility, attract customers, increase sales, strengthen engagement, improve operations, or better serve the community.",
            "Submit a 1 minute 30 second video and a one-page written summary.",
        ],
        width=520,
        size=10.7,
        leading=14.0,
        color=(49, 43, 30),
    )

    y -= 10
    page.text(MARGIN, y, "Who participates", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Students ages 11-19 are the primary participants.",
            "Parent or guardian consent is required before participation becomes active.",
            "Schools register to verify students and keep the challenge tied to a real school context.",
            "Teachers register under the school to monitor progress and track impact.",
            "Admins review submissions, export data, choose winners, and publish the results.",
        ],
        width=520,
        size=10.7,
        leading=14.0,
        color=(49, 43, 30),
    )

    y -= 10
    page.text(MARGIN, y, "Why it matters", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "It builds leadership, communication, business awareness, problem-solving skills, and community engagement.",
            "It gives students a real reason to study local businesses and think critically about neighborhood needs.",
            "It turns a student competition into a practical community impact program with measurable output.",
        ],
        width=520,
        size=10.7,
        leading=14.0,
        color=(49, 43, 30),
    )

    page.text(MARGIN, 86, "Key result: one system, one workflow, one set of rules for the full challenge.", size=10.2, font=FONT_BOLD, color=(138, 106, 47))
    page.text(PAGE_W - MARGIN - 68, 86, "Page 2 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def draw_flow_diagram(page: Page, top_y: float) -> float:
    # Dark diagram panel
    x = MARGIN
    w = CONTENT_W
    h = 462
    y = top_y
    page.box(x, y, w, h, fill=(17, 16, 12), stroke=(201, 168, 76), line=1.0)
    page.text(x + 16, y - 22, "Workflow diagram", size=11, font=FONT_BOLD, color=(245, 212, 138))
    page.text(x + 132, y - 22, "registration to winner publishing", size=10, font=FONT_REG, color=(220, 214, 200))

    inner_x = x + 20
    box_w = w - 40
    box_h = 44
    gap = 12
    step_top = y - 52
    steps = [
        ("1", "Student registers", "Collects student profile, school, grade, parent contact, username, and password."),
        ("2", "QR code created", "Creates a participant ID and a unique QR code tied to the student profile."),
        ("3", "Parent consent via QR", "Parent scans the QR code, creates an account, and signs the consent form."),
        ("4", "School approval", "School verifies the student belongs to the school and the consent is valid."),
        ("5", "Teacher approval", "Teacher confirms participation and monitors progress."),
        ("6", "Ten business interviews", "Student records ten completed business entries and notes what was learned."),
        ("7", "Final submission unlocks", "Video, written summary, solution, and impact statements can now be uploaded."),
        ("8", "Admin review and winners", "Admin scores entries, selects winners, and publishes results."),
    ]
    current_top = step_top
    for idx, (num, title, desc) in enumerate(steps):
        box_y = current_top
        page.box(inner_x, box_y, box_w, box_h, fill=(16, 16, 12), stroke=(201, 168, 76), line=0.9)
        # number badge
        badge_x = inner_x + 14
        badge_y = box_y - 22
        page.box(badge_x, badge_y + 10, 24, 24, fill=(201, 168, 76), stroke=(245, 212, 138), line=0.6)
        page.center_text(badge_x + 12, badge_y + 18, num, size=13, font=FONT_BOLD, color=(18, 16, 10))
        page.text(inner_x + 52, box_y - 18, title, size=12.2, font=FONT_BOLD, color=(255, 255, 255))
        page.paragraph(inner_x + 52, box_y - 33, desc, width=box_w - 68, size=9.4, leading=11.6, color=(220, 214, 200))
        if idx < len(steps) - 1:
            page.line(inner_x + box_w / 2, box_y - box_h, inner_x + box_w / 2, box_y - box_h - gap + 2, stroke=(201, 168, 76), width=1.4)
        current_top -= box_h + gap
    return y - h


def add_page_3(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "2. Workflow", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Workflow and gating logic", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "The system is a gated pipeline. Each stage unlocks the next one only when the previous stage is complete "
        "and stored with the correct approval or evidence record."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    y = draw_flow_diagram(page, y)
    y -= 10

    page.text(MARGIN, y, "Critical status chain", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Student Registered",
            "Parent Consent Pending",
            "Parent Consent Approved",
            "School Approval Pending",
            "School Approval Approved",
            "Teacher Approval Pending",
            "Teacher Approval Approved",
            "Eligible To Submit",
            "Submission Complete",
        ],
        width=520,
        size=10.7,
        leading=13.8,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Gate rules", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Students cannot submit until parent consent is approved.",
            "Students cannot submit until school approval is approved.",
            "Students cannot submit until teacher approval is approved.",
            "Students cannot submit until ten completed business interviews are entered.",
            "Every consent and approval record must store name, date, time, and signature.",
            "Every student must have one unique QR code connected to their profile.",
            "Parent information must be captured only through the student QR flow.",
        ],
        width=520,
        size=10.6,
        leading=13.8,
        color=(49, 43, 30),
    )
    page.text(PAGE_W - MARGIN - 68, 86, "Page 3 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_page_4(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "3. Registration", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Student registration and parent consent", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "The student creates the first record. Parent data is not typed into the student form; it is captured only "
        "after the QR code is scanned and the parent completes the consent flow."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "Student registration fields", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Student full name",
            "Age, which must be between 14 and 19",
            "Date of birth",
            "Email",
            "Phone number",
            "Home address",
            "School name",
            "Grade level",
            "Parent or guardian name",
            "Parent phone number",
            "Parent email",
            "Student username and password",
        ],
        width=520,
        size=10.6,
        leading=13.6,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Outputs after registration", size=12.5, font=FONT_BOLD, color=(23, 19, 11))
    y -= 14
    y = page.bullets(
        MARGIN,
        y,
        [
            "Student dashboard access",
            "Participant ID",
            "Unique QR code for parent consent",
            "Status tracker starting at Student Registered",
        ],
        width=520,
        size=10.6,
        leading=13.6,
        color=(49, 43, 30),
    )
    y -= 10
    page.text(MARGIN, y, "Parent consent via QR code", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Parent full name",
            "Relationship to student",
            "Phone number",
            "Email",
            "Home address",
            "Government ID upload optional",
            "Consent checkbox",
            "Digital signature",
            "Date and time of approval",
            "Parent must confirm they are the parent or legal guardian and understand that school verification is required.",
        ],
        width=520,
        size=10.5,
        leading=13.4,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 90, "Page 4 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_page_5(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "4. School setup", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "School registration, school approval, and teacher onboarding", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "Schools and teachers are separate roles, but they are connected by the school record. School staff validate "
        "the student, and teachers monitor the student progress inside that school context."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "School registration fields", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "School name",
            "School address",
            "School district",
            "Main phone number",
            "Principal name",
            "Administrator name",
            "Administrator email",
            "Administrator phone number",
            "School account login",
        ],
        width=520,
        size=10.6,
        leading=13.6,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "School approval fields", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "School staff name",
            "Role",
            "School email",
            "Approval status",
            "Notes",
            "Digital signature",
            "Date and time of approval",
        ],
        width=520,
        size=10.6,
        leading=13.6,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Teacher onboarding", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Teacher full name",
            "School name",
            "School email",
            "Phone number",
            "Role or department",
            "Grade level supported",
            "Teacher login",
            "Teacher approval fields: teacher name, teacher email, student name, approval status, notes, and date/time.",
        ],
        width=520,
        size=10.5,
        leading=13.4,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Teacher dashboard outputs", size=12.5, font=FONT_BOLD, color=(23, 19, 11))
    y -= 14
    y = page.bullets(
        MARGIN,
        y,
        [
            "Students assigned to teacher",
            "Parent consent status",
            "School approval status",
            "Student progress",
            "Business interviews submitted",
            "Final project submission status",
        ],
        width=520,
        size=10.5,
        leading=13.4,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 90, "Page 5 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_page_6(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "5. Evidence capture", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Student business interview module", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "This is the core evidence layer of the challenge. Each student must record ten local businesses, with enough "
        "context to explain what was discovered and what opportunity exists for improvement."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "Interview prompts from the client", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Does the business have a website?",
            "Does the business have a Google Business Profile?",
            "Does the business actively use social media?",
            "Does the business use digital signage?",
            "Does the business offer coupons or rewards programs?",
            "Can customers order online?",
            "Does the business have its own ordering platform?",
            "Does the business rely solely on third-party delivery apps?",
            "What is the biggest challenge facing the business?",
            "What opportunities are being missed?",
        ],
        width=520,
        size=10.6,
        leading=13.6,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Required business entry fields", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Business name",
            "Owner or manager name",
            "Business phone number",
            "Business address",
            "Business category",
            "Date of visit",
            "Website yes or no",
            "Google Business Profile yes or no",
            "Social media yes or no",
            "Digital signage yes or no",
            "Coupons or rewards yes or no",
            "Online ordering yes or no",
            "Delivery options yes or no",
            "Main challenge identified",
            "Student notes",
        ],
        width=520,
        size=10.5,
        leading=13.4,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Unlock rule", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.paragraph(
        MARGIN,
        y,
        "The final submission step remains locked until all ten business interviews are completed and the records are stored as valid entries. This keeps the challenge evidence-based instead of opinion-based.",
        width=520,
        size=10.6,
        leading=14.0,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 90, "Page 6 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_page_7(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "6. Final review", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Final submission and admin review", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "Once all approvals and business interviews are complete, the student can submit the final project package. "
        "Admin review closes the loop, scores entries, and publishes the winners."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "Final submission requirements", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Video upload with a maximum runtime of 1 minute and 30 seconds.",
            "Written file upload with a maximum length of one page.",
            "Problem identified.",
            "Why it matters.",
            "Proposed solution.",
            "How it helps the business.",
            "Expected impact.",
            "Submission date.",
            "The one-page written summary must also include business name, owner name, address, phone number, and date of visit.",
        ],
        width=520,
        size=10.5,
        leading=13.4,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Admin dashboard requirements", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "View total students registered, total parents registered, total schools registered, total teachers registered, total businesses interviewed, total submissions, and winners.",
            "See pending parent consent, school approval, teacher approval, and eligible students.",
            "Approve or reject submissions.",
            "View student profiles, parent consent, school approval, teacher approval, and every business entry submitted.",
            "Export data to CSV.",
            "Select winners and publish them to FrantzCoutard.com.",
        ],
        width=520,
        size=10.4,
        leading=13.4,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Prize structure and announcement", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "First place: $2,500 scholarship award.",
            "Second place: $1,500 scholarship award.",
            "Third place: $1,000 scholarship award.",
            "Total scholarship awards: $5,000.",
            "Winners announced on August 25, 2026 at FrantzCoutard.com.",
        ],
        width=520,
        size=10.5,
        leading=13.4,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 90, "Page 7 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_page_8(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "7. Dashboard map", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Public pages and dashboard overview", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "The website needs both public-facing challenge pages and logged-in dashboards so every role can see the exact "
        "information it needs."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "Public pages needed", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Homepage section: Leave It Better Than You Found It, The Future Belongs To Problem Solvers, $5,000 in scholarship awards, and Register Free at FrantzCoutard.com.",
            "Challenge page: overview, who can participate, how it works, prize details, rules, consent requirements, FAQ, and register button.",
            "Registration pages: student registration, parent consent via QR code, school registration, and teacher registration.",
            "Dashboard pages: student dashboard, parent dashboard, school dashboard, teacher dashboard, and admin dashboard.",
        ],
        width=520,
        size=10.35,
        leading=13.2,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Dashboard roles at a glance", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Student dashboard: participant ID, QR code, status tracker, interview progress, and submission status.",
            "Parent dashboard: consent record, approval status, date/time, and student linkage.",
            "School dashboard: registered students, pending approvals, approved students, submitted projects, and winners from that school.",
            "Teacher dashboard: assigned students, approval states, interviews entered, project status, leaderboard data, reports, notifications, and award progress.",
            "Admin dashboard: totals, pending approvals, submissions, exports, winner selection, and publication.",
        ],
        width=520,
        size=10.35,
        leading=13.2,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 90, "Page 8 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_page_9(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "8. Teacher focus", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "Teacher dashboard requirements", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "The teacher dashboard is the monitoring and motivation layer for the challenge. It should help teachers see "
        "progress, identify gaps, and compete for the educator award."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "Teacher dashboard must include", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Teacher profile: teacher name, school name, email, phone number, role or department, and grade level supported.",
            "Student tracking: total students registered, students pending parent consent, students approved by parent, students approved by school, students with teacher approval, and students eligible to submit.",
            "Business interview tracking: total business interviews entered, interviews completed per student, students with all 10 interviews completed, and business categories collected.",
            "Project submission tracking: video submitted, written summary submitted, final submission status, submission date, and student ranking status.",
            "Community impact score: score based on registration, consent, school consent, business interviews, project submissions, finalists, and winners.",
            "Leaderboards: teacher leaderboard, school leaderboard, and student scholarship leaderboard.",
            "Reports: export student list, parent consent status, business interview data, project submission data, and teacher score report.",
            "Notifications: parent consent pending, school approval pending, student missing interviews, student submission deadline reminder, and award ranking updates.",
        ],
        width=520,
        size=10.2,
        leading=13.1,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Teacher award section", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.paragraph(
        MARGIN,
        y,
        "The teacher dashboard should show progress toward the Community Leadership Educator Award. Prize package: Teacher Excellence Vacation Experience, including roundtrip airfare, hotel accommodations, ground transportation, recognition experience, and the Community Leadership Educator Award.",
        width=520,
        size=10.4,
        leading=13.6,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 86, "Main goal: help teachers monitor students, increase participation, track impact, and compete for the award.", size=10.0, font=FONT_BOLD, color=(138, 106, 47))
    page.text(PAGE_W - MARGIN - 68, 86, "Page 9 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def add_technical_page(pdf: PDFWriter) -> None:
    # Optional extra page if the caller wants a 10-page build.
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, stroke=(248, 242, 230), fill=(248, 242, 230), line=0)
    y = PAGE_H - 48
    page.text(MARGIN, y, "9. Technical plan", size=10, font=FONT_BOLD, color=(138, 106, 47))
    y -= 16
    page.text(MARGIN, y, "How this fits the current site", size=21, font=FONT_SERIF_BOLD, color=(23, 19, 11))
    y -= 18
    intro = (
        "The new_school module should be added to the current FrantzCoutard.com architecture instead of being built "
        "as a separate product. That keeps the brand, session model, and admin patterns consistent."
    )
    y = page.paragraph(MARGIN, y, intro, width=520, size=11.0, leading=15.0, color=(56, 49, 36))
    y -= 10
    page.rule(MARGIN, y, CONTENT_W, stroke=(201, 168, 76))
    y -= 12

    page.text(MARGIN, y, "Recommended implementation approach", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Add a new school module in the React frontend with pages for student registration, parent consent, school registration, teacher registration, dashboards, and admin review.",
            "Extend the PHP API with routes for registration, QR token validation, approvals, dashboard summaries, interview entries, submissions, exports, and winner publishing.",
            "Add MySQL tables for students, parents, schools, teachers, approvals, business interviews, submissions, notifications, QR tokens, and winners.",
            "Reuse the current site auth and session approach so the new module feels native to the existing portal.",
            "Use the current upload pattern for files such as consent signatures, student videos, and written submissions.",
        ],
        width=520,
        size=10.25,
        leading=13.2,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Suggested API routes", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "POST new-school/student/register - create student profile and participant QR token.",
            "POST new-school/parent/consent - store parent approval from the QR flow.",
            "POST new-school/school/register - create school account.",
            "POST new-school/teacher/register - create teacher account.",
            "POST new-school/business - save one business interview record.",
            "POST new-school/submission - save final video and written submission.",
            "GET new-school/dashboard/* - return role-based dashboard data.",
            "GET and PUT admin/new-school/* - admin review, exports, and winners.",
        ],
        width=520,
        size=10.15,
        leading=13.1,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Suggested database entities", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "new_school_students - student profile, school, grade, status, QR token, participant ID.",
            "new_school_parents - parent record, relationship, contact details, signature, approval time.",
            "new_school_schools - school account and identity fields.",
            "new_school_teachers - teacher account and school assignment.",
            "new_school_approvals - school and teacher approvals with notes and timestamps.",
            "new_school_business_interviews - ten business visits per student and interview answers.",
            "new_school_submissions - final video, written file, solution text, and score status.",
            "new_school_notifications - pending, reminder, and award messages.",
            "new_school_winners - final ranking and prize publication records.",
        ],
        width=520,
        size=10.1,
        leading=13.0,
        color=(49, 43, 30),
    )
    y -= 8
    page.text(MARGIN, y, "Acceptance criteria", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Student cannot submit without parent, school, and teacher approval.",
            "Student cannot submit without ten completed business interviews.",
            "Every approval stores name, date, time, and signature.",
            "Parent information is captured only through the QR flow.",
            "Admin can export data, choose winners, and publish the result page.",
            "Teacher dashboard shows progress, rankings, and award status.",
        ],
        width=520,
        size=10.15,
        leading=13.1,
        color=(49, 43, 30),
    )
    page.text(MARGIN, 86, "Page 10 / 10", size=9.6, font=FONT_REG, color=(122, 114, 102))


def build_pdf() -> bytes:
    pdf = PDFWriter(title="new_school functionality")
    add_cover(pdf)
    add_page_2(pdf)
    add_page_3(pdf)
    add_page_4(pdf)
    add_page_5(pdf)
    add_page_6(pdf)
    add_page_7(pdf)
    add_page_8(pdf)
    add_page_9(pdf)
    add_technical_page(pdf)
    return pdf.build()


def main() -> None:
    out = build_pdf()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_bytes(out)
    print(f"Wrote {OUT_PATH} ({len(out)} bytes)")


if __name__ == "__main__":
    main()
