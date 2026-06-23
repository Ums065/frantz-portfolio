from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Sequence


PAGE_W = 612.0
PAGE_H = 792.0
MARGIN = 38.0
CONTENT_W = PAGE_W - MARGIN * 2

FONT_REG = "F1"
FONT_BOLD = "F2"
FONT_SERIF = "F3"
FONT_SERIF_BOLD = "F4"

OUT_PATH = Path("frontend/public/docs/founding_sponsor_kit.pdf")


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def rgb(r: int, g: int, b: int) -> str:
    return f"{r / 255:.3f} {g / 255:.3f} {b / 255:.3f}"


def measure(text: str, size: float) -> float:
    widths = {
        " ": 0.28, "i": 0.26, "l": 0.26, "I": 0.30, "t": 0.31, "f": 0.33, "r": 0.30, "j": 0.30,
        ".": 0.22, ",": 0.22, ":": 0.22, ";": 0.22, "!": 0.24, "?": 0.55, "-": 0.28, "/": 0.32,
        "m": 0.90, "w": 0.90, "M": 0.96, "W": 0.96,
    }
    return sum(widths.get(ch, 0.54) for ch in text) * size


def wrap(text: str, width: float, size: float) -> List[str]:
    words = text.replace("\n", " ").split()
    if not words:
        return [""]
    lines: List[str] = []
    current = ""
    for word in words:
        test = word if not current else f"{current} {word}"
        if not current or measure(test, size) <= width:
            current = test
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


@dataclass
class Page:
    ops: List[str] = field(default_factory=list)

    def op(self, value: str) -> None:
        self.ops.append(value)

    def rect(self, x: float, y: float, w: float, h: float, stroke=(0, 0, 0), fill=None, line=1.0) -> None:
        self.op("q")
        self.op(f"{line:.2f} w")
        if fill is not None:
            self.op(f"{rgb(*fill)} rg")
            if stroke is not None:
                self.op(f"{rgb(*stroke)} RG")
            self.op(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re B")
        else:
            self.op(f"{rgb(*stroke)} RG")
            self.op(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")
        self.op("Q")

    def line(self, x1: float, y1: float, x2: float, y2: float, stroke=(0, 0, 0), width=1.0) -> None:
        self.op("q")
        self.op(f"{width:.2f} w")
        self.op(f"{rgb(*stroke)} RG")
        self.op(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")
        self.op("Q")

    def text(self, x: float, y: float, text: str, size: float = 12, font: str = FONT_REG, color=(0, 0, 0)) -> None:
        self.op("BT")
        self.op(f"/{font} {size:.2f} Tf")
        self.op(f"{rgb(*color)} rg")
        self.op(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        self.op(f"({esc(text)}) Tj")
        self.op("ET")

    def center_text(self, cx: float, y: float, text: str, size: float = 12, font: str = FONT_REG, color=(0, 0, 0)) -> None:
        self.text(cx - measure(text, size) / 2, y, text, size=size, font=font, color=color)

    def paragraph(self, x: float, y_top: float, text: str, width: float = CONTENT_W, size: float = 11, leading: float = 14.5, font: str = FONT_REG, color=(0, 0, 0)) -> float:
        y = y_top
        for line in wrap(text, width, size):
            self.text(x, y, line, size=size, font=font, color=color)
            y -= leading
        return y

    def bullets(self, x: float, y_top: float, items: Sequence[str], width: float = CONTENT_W, size: float = 10.8, leading: float = 13.8, color=(0, 0, 0)) -> float:
        y = y_top
        for item in items:
            lines = wrap(item, width - 12, size)
            self.rect(x + 2, y - 5, 4, 4, stroke=color, fill=color, line=0.5)
            for i, line in enumerate(lines):
                self.text(x + 12, y - (i * leading), line, size=size, font=FONT_REG, color=color)
            y -= max(leading * len(lines), leading) + 4
        return y

    def box(self, x: float, y_top: float, w: float, h: float, fill=(255, 255, 255), stroke=(0, 0, 0), line=1.0) -> None:
        self.rect(x, y_top - h, w, h, stroke=stroke, fill=fill, line=line)


class PDFWriter:
    def __init__(self, title: str) -> None:
        self.title = title
        self.pages: List[Page] = []

    def add_page(self) -> Page:
        page = Page()
        self.pages.append(page)
        return page

    def build(self) -> bytes:
        objects: List[bytes] = []
        font_objs = []
        for base_font in ["Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold"]:
            font_objs.append(len(objects) + 1)
            objects.append(f"<< /Type /Font /Subtype /Type1 /BaseFont /{base_font} >>".encode("ascii"))

        content_objs = []
        page_objs = []
        for page in self.pages:
            content = "\n".join(page.ops).encode("latin-1", "replace")
            content_objs.append(len(objects) + 1)
            objects.append(f"<< /Length {len(content)} >>\nstream\n".encode("ascii") + content + b"\nendstream")
            page_objs.append(len(objects) + 1)
            objects.append(b"")

        pages_tree_obj = len(objects) + 1
        objects.append(b"")
        catalog_obj = len(objects) + 1
        objects.append(b"")
        info_obj = len(objects) + 1
        objects.append((f"<< /Title ({esc(self.title)}) /Author (OpenAI Codex) /Creator (Codex) >>").encode("ascii"))

        resources = f"<< /Font << /F1 {font_objs[0]} 0 R /F2 {font_objs[1]} 0 R /F3 {font_objs[2]} 0 R /F4 {font_objs[3]} 0 R >> >>"
        for idx, page in enumerate(self.pages):
            objects[page_objs[idx] - 1] = (
                f"<< /Type /Page /Parent {pages_tree_obj} 0 R /MediaBox [0 0 {PAGE_W:.0f} {PAGE_H:.0f}] "
                f"/Resources {resources} /Contents {content_objs[idx]} 0 R >>"
            ).encode("ascii")

        kids = " ".join(f"{num} 0 R" for num in page_objs)
        objects[pages_tree_obj - 1] = f"<< /Type /Pages /Kids [ {kids} ] /Count {len(page_objs)} >>".encode("ascii")
        objects[catalog_obj - 1] = f"<< /Type /Catalog /Pages {pages_tree_obj} 0 R >>".encode("ascii")

        out = bytearray()
        out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets: List[int] = []
        for i, obj in enumerate(objects, start=1):
            offsets.append(len(out))
            out.extend(f"{i} 0 obj\n".encode("ascii"))
            out.extend(obj)
            out.extend(b"\nendobj\n")
        xref = len(out)
        out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        out.extend(b"0000000000 65535 f \n")
        for off in offsets:
            out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        out.extend((f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_obj} 0 R /Info {info_obj} 0 R >>\nstartxref\n{xref}\n%%EOF\n").encode("ascii"))
        return bytes(out)


def page_header(page: Page, kicker: str, title: str, subtitle: str, dark: bool = False) -> float:
    if dark:
        page.rect(0, 0, PAGE_W, PAGE_H, fill=(12, 12, 11), stroke=(12, 12, 11), line=0)
        page.rect(18, 18, PAGE_W - 36, PAGE_H - 36, fill=(18, 17, 13), stroke=(201, 168, 76), line=1.1)
        page.text(MARGIN, 744, "FRANTZCOUTARD.COM", size=10, font=FONT_BOLD, color=(245, 212, 138))
        page.text(PAGE_W - MARGIN - 114, 744, "Founding Sponsor Kit", size=10, font=FONT_BOLD, color=(245, 212, 138))
        page.line(MARGIN, 734, PAGE_W - MARGIN, 734, stroke=(201, 168, 76), width=0.8)
    else:
        page.rect(0, 0, PAGE_W, PAGE_H, fill=(246, 241, 232), stroke=(246, 241, 232), line=0)
    page.text(MARGIN, 712 if dark else 742, kicker, size=10, font=FONT_BOLD, color=(245, 212, 138) if dark else (138, 106, 47))
    page.text(MARGIN, 684 if dark else 720, title, size=23 if dark else 21, font=FONT_SERIF_BOLD, color=(255, 255, 255) if dark else (23, 19, 11))
    y = 660 if dark else 698
    y = page.paragraph(MARGIN, y, subtitle, width=526, size=11.2, leading=15.2, color=(230, 224, 210) if dark else (56, 49, 36))
    return y - 8


def add_cover(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    page.rect(0, 0, PAGE_W, PAGE_H, fill=(10, 10, 9), stroke=(10, 10, 9), line=0)
    page.rect(18, 18, PAGE_W - 36, PAGE_H - 36, fill=(18, 17, 13), stroke=(201, 168, 76), line=1.1)
    page.text(MARGIN, 738, "FRANTZCOUTARD.COM", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.text(PAGE_W - MARGIN - 136, 738, "Founding Sponsor Kit", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.line(MARGIN, 728, PAGE_W - MARGIN, 728, stroke=(201, 168, 76), width=0.8)

    page.box(MARGIN, 670, 62, 62, fill=(201, 168, 76), stroke=(245, 212, 138), line=1.0)
    page.center_text(MARGIN + 31, 700, "FC", size=22, font=FONT_SERIF_BOLD, color=(20, 15, 6))

    page.text(MARGIN, 636, "BE BOLD. BE USEFUL.", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.text(MARGIN, 604, "Become A", size=30, font=FONT_SERIF_BOLD, color=(255, 255, 255))
    page.text(MARGIN, 564, "Founding Sponsor", size=34, font=FONT_SERIF_BOLD, color=(245, 212, 138))
    page.text(MARGIN, 530, "Support New York's next generation of problem solvers.", size=16, font=FONT_SERIF, color=(230, 224, 210))

    cover_text = (
        "This kit is for organizations that want a clear, school-friendly way to support the 1st Annual Student Impact Challenge. "
        "It covers the mission, impact goals, sponsorship levels, timeline, payment instructions, and the next steps to get started."
    )
    page.paragraph(MARGIN, 498, cover_text, width=300, size=11.3, leading=15.3, color=(220, 214, 200))

    panel_x = 350
    page.box(panel_x, 640, 204, 282, fill=(26, 24, 18), stroke=(201, 168, 76), line=1.0)
    items = [
        ("Mission", "Help students build leadership, communication, and problem-solving skills."),
        ("Impact", "$25,000 school grant, up to $10,000 scholarships, educator recognition."),
        ("Timeline", "Registration opens June 25, 2026. Winners announced December 22, 2026."),
        ("Levels", "Community Partner, Silver, Gold, Presenting, or custom support."),
    ]
    yy = 612
    for label, body in items:
        page.text(panel_x + 16, yy, label, size=12, font=FONT_BOLD, color=(245, 212, 138))
        page.paragraph(panel_x + 16, yy - 16, body, width=172, size=10.3, leading=13.6, color=(228, 222, 210))
        yy -= 58

    page.text(MARGIN, 92, "Leave It Better Than You Found It  |  1st Annual Student Impact Challenge", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.text(MARGIN, 62, "Founding Sponsor Kit", size=9.6, font=FONT_REG, color=(220, 214, 200))


def add_overview(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    y = page_header(
        page,
        "1. Mission and Impact",
        "Why this sponsorship exists",
        "Sponsors help create a challenge that schools can trust, students can understand, and families can support."
    )

    page.text(MARGIN, y, "Mission", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.paragraph(
        MARGIN,
        y,
        "The Student Impact Challenge gives students ages 11-19 a real community-based project. They interview local businesses, identify a problem, develop a solution, and compete for scholarships, school grants, and statewide recognition.",
        width=CONTENT_W,
        size=11.0,
        leading=15.0,
        color=(56, 49, 36),
    )
    y -= 8
    page.line(MARGIN, y, PAGE_W - MARGIN, y, stroke=(201, 168, 76), width=0.9)
    y -= 14

    page.text(MARGIN, y, "Impact goals", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "$25,000 School Impact Grant",
            "Up to $10,000 Student Scholarships",
            "All-Inclusive Educator Recognition Award",
            "Community Impact Projects",
            "Student Leadership Development",
            "Entrepreneurship Education",
        ],
        width=CONTENT_W,
        size=10.8,
        leading=13.9,
        color=(49, 43, 30),
    )
    y -= 4
    page.box(MARGIN, y, CONTENT_W, 112, fill=(255, 252, 246), stroke=(201, 168, 76), line=0.8)
    page.text(MARGIN + 14, y - 22, "Who can participate", size=12.5, font=FONT_BOLD, color=(138, 106, 47))
    page.paragraph(
        MARGIN + 14,
        y - 40,
        "Principals, teachers, parents, students, sponsors, colleges, nonprofits, businesses, and community partners can all participate in the program in different ways.",
        width=CONTENT_W - 28,
        size=10.4,
        leading=13.6,
        color=(56, 49, 36),
    )


def add_timeline_levels(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    y = page_header(
        page,
        "2. Timeline and Levels",
        "How the year is organized",
        "A sponsor should be able to understand the schedule and the support tiers in one glance."
    )

    page.text(MARGIN, y, "Timeline", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    timeline = [
        ("Registration Opens", "June 25, 2026"),
        ("Sponsor Review and Outreach", "Summer and fall 2026"),
        ("Awards Ceremony", "Approved sponsors invited to attend"),
        ("Winners Announced", "December 22, 2026"),
    ]
    box_w = (CONTENT_W - 18) / 2
    box_h = 84
    start_y = y
    for i, (title, detail) in enumerate(timeline):
        row = i // 2
        col = i % 2
        bx = MARGIN + col * (box_w + 18)
        by = start_y - row * (box_h + 14)
        page.box(bx, by, box_w, box_h, fill=(255, 252, 246), stroke=(201, 168, 76), line=0.8)
        page.text(bx + 14, by - 22, title, size=12.2, font=FONT_BOLD, color=(23, 19, 11))
        page.paragraph(bx + 14, by - 40, detail, width=box_w - 28, size=10.3, leading=13.4, color=(56, 49, 36))
    y = start_y - 2 * (box_h + 14) - 14

    page.text(MARGIN, y, "Sponsorship levels", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    levels = [
        ("Community Partner", "$1,000+", "A meaningful entry point for local businesses and community organizations."),
        ("Silver Sponsor", "$5,000+", "Stronger visibility and public recognition tied to the student challenge."),
        ("Gold Sponsor", "$10,000+", "A higher-level partnership with more influence and recognition."),
        ("Presenting Sponsor", "$25,000+", "Top-tier support for the full school impact effort."),
        ("Custom Sponsorship", "Custom", "Enter an amount that fits your organization and goals."),
    ]
    for label, amount, desc in levels:
        page.box(MARGIN, y, CONTENT_W, 54, fill=(18, 17, 13), stroke=(201, 168, 76), line=0.7)
        page.text(MARGIN + 14, y - 20, label, size=12, font=FONT_BOLD, color=(245, 212, 138))
        page.text(PAGE_W - MARGIN - 86, y - 20, amount, size=12, font=FONT_BOLD, color=(255, 255, 255))
        page.paragraph(MARGIN + 14, y - 36, desc, width=CONTENT_W - 28, size=9.8, leading=12.4, color=(220, 214, 200))
        y -= 62


def add_process_payment(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    y = page_header(
        page,
        "3. How To Get Started",
        "Simple sponsor intake flow",
        "The page is designed to answer the first questions quickly and move the organization toward check submission."
    )

    page.text(MARGIN, y, "Step-by-step", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    steps = [
        "Choose a sponsorship level or enter a custom amount.",
        "Complete the sponsor interest form with organization and contact details.",
        "Upload a logo if you want the organization to be recognized publicly.",
        "Mail the check using the instructions below.",
    ]
    for idx, step in enumerate(steps, start=1):
        page.box(MARGIN, y, CONTENT_W, 54, fill=(255, 252, 246), stroke=(201, 168, 76), line=0.8)
        page.box(MARGIN + 12, y - 18, 24, 24, fill=(201, 168, 76), stroke=(245, 212, 138), line=0.7)
        page.center_text(MARGIN + 24, y - 8, str(idx), size=12, font=FONT_BOLD, color=(20, 15, 6))
        page.text(MARGIN + 50, y - 20, f"Step {idx}", size=11.5, font=FONT_BOLD, color=(138, 106, 47))
        page.paragraph(MARGIN + 50, y - 34, step, width=CONTENT_W - 62, size=10.4, leading=13.2, color=(56, 49, 36))
        y -= 64

    page.text(MARGIN, y, "Payment instructions", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    page.box(MARGIN, y, CONTENT_W, 172, fill=(18, 17, 13), stroke=(201, 168, 76), line=1.0)
    pay_lines = [
        "MAKE CHECK PAYABLE TO:",
        "Trend Catch Network Inc.",
        "",
        "MAIL CHECK TO:",
        "Attention: FrantzCoutard.com",
        "Leave It Better Than You Found It",
        "Suite 1400",
        "118-35 Queens Blvd",
        "Forest Hills, NY 11375",
        "",
        "IMPORTANT: Include your organization name, contact person, email address, and sponsorship level with your check.",
    ]
    py = y - 22
    for line in pay_lines:
        if line == "":
            py -= 6
            continue
        page.text(MARGIN + 16, py, line, size=10.8, font=FONT_BOLD if line.endswith(":") or line.isupper() else FONT_REG, color=(245, 212, 138) if line.endswith(":") or line.isupper() else (230, 224, 210))
        py -= 14


def add_public_recognition(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    y = page_header(
        page,
        "4. Public Recognition",
        "Awards ceremony and sponsor visibility",
        "Approved sponsors are publicly recognized only after payment is confirmed and the application is approved."
    )

    page.text(MARGIN, y, "Awards ceremony benefits", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "Meet students, parents, educators, and school administrators.",
            "Connect with community leaders and scholarship recipients.",
            "Celebrate school grant winners and educator recognition.",
            "Receive public recognition on the Founding Sponsors page.",
        ],
        width=CONTENT_W,
        size=10.8,
        leading=13.9,
        color=(49, 43, 30),
    )
    y -= 4
    page.box(MARGIN, y, CONTENT_W, 120, fill=(255, 252, 246), stroke=(201, 168, 76), line=0.8)
    page.text(MARGIN + 14, y - 22, "Public listing rules", size=12.4, font=FONT_BOLD, color=(138, 106, 47))
    page.paragraph(
        MARGIN + 14,
        y - 40,
        "Only approved sponsors with payment confirmed can be published. The public sponsors page groups organizations by tier and shows logo, company name, sponsorship level, short description, website link, and founding sponsor badge.",
        width=CONTENT_W - 28,
        size=10.2,
        leading=13.4,
        color=(56, 49, 36),
    )

    y -= 154
    page.text(MARGIN, y, "Next steps after submission", size=14, font=FONT_BOLD, color=(23, 19, 11))
    y -= 16
    y = page.bullets(
        MARGIN,
        y,
        [
            "The organization receives an email confirmation immediately after submission.",
            "The team tracks the check, reviews the application, and updates payment status.",
            "Once payment is confirmed, the sponsor can be published publicly.",
        ],
        width=CONTENT_W,
        size=10.8,
        leading=13.9,
        color=(49, 43, 30),
    )


def add_footer_page(pdf: PDFWriter) -> None:
    page = pdf.add_page()
    y = page_header(
        page,
        "5. Final Notes",
        "Designed to scale",
        "The structure is ready for renewals, multiple years, impact reports, and future partnership programs."
    )
    page.box(MARGIN, y, CONTENT_W, 202, fill=(18, 17, 13), stroke=(201, 168, 76), line=1.0)
    page.text(MARGIN + 16, y - 24, "Long-term platform goals", size=12.5, font=FONT_BOLD, color=(245, 212, 138))
    page.bullets(
        MARGIN + 16,
        y - 44,
        [
            "Sponsor renewals for future annual challenges.",
            "Multiple challenge editions with shared sponsor history.",
            "Sponsor impact reports with public-facing recognition.",
            "Additional scholarships, grants, and community programs.",
        ],
        width=CONTENT_W - 32,
        size=10.6,
        leading=13.4,
        color=(230, 224, 210),
    )
    page.text(MARGIN, 86, "FrantzCoutard.com | Leave It Better Than You Found It", size=10, font=FONT_BOLD, color=(245, 212, 138))
    page.text(PAGE_W - MARGIN - 70, 86, "Page 5 / 5", size=9.6, font=FONT_REG, color=(122, 114, 102))


def main() -> None:
    pdf = PDFWriter("Founding Sponsor Kit")
    add_cover(pdf)
    add_overview(pdf)
    add_timeline_levels(pdf)
    add_process_payment(pdf)
    add_public_recognition(pdf)
    add_footer_page(pdf)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_bytes(pdf.build())


if __name__ == "__main__":
    main()
