import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { pdfSafe, wrapText } from "@/lib/documents/text";

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_TOP = PAGE_HEIGHT - 84;
const CONTENT_BOTTOM = 64;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const BRAND = rgb(0.06, 0.2, 0.34);
const RULE = rgb(0.7, 0.7, 0.7);

type Style = {
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
  gapAfter?: number;
  indent?: number;
};

// A small top-down layout engine over pdf-lib. It starts a new page when the
// next block does not fit, and stamps the letterhead and footer on every
// page at the end, once the page count is known.
export class PdfLayout {
  private readonly pages: PDFPage[] = [];
  private page: PDFPage;
  private y: number;

  private constructor(
    private readonly doc: PDFDocument,
    readonly fonts: {
      body: PDFFont;
      bodyBold: PDFFont;
      bodyItalic: PDFFont;
      sans: PDFFont;
      sansBold: PDFFont;
    },
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = CONTENT_TOP;
  }

  static async create(): Promise<PdfLayout> {
    const doc = await PDFDocument.create();
    const fonts = {
      body: await doc.embedFont(StandardFonts.TimesRoman),
      bodyBold: await doc.embedFont(StandardFonts.TimesRomanBold),
      bodyItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
      sans: await doc.embedFont(StandardFonts.Helvetica),
      sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    return new PdfLayout(doc, fonts);
  }

  get document(): PDFDocument {
    return this.doc;
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = CONTENT_TOP;
  }

  // Makes room for a block of the given height, or starts a new page.
  private ensure(height: number): void {
    if (this.y - height < CONTENT_BOTTOM) this.newPage();
  }

  text(content: string, style: Style): void {
    const indent = style.indent ?? 0;
    const width = CONTENT_WIDTH - indent;
    const lineHeight = style.size * 1.35;
    const lines = wrapText(content, width, (s) => style.font.widthOfTextAtSize(s, style.size));
    for (const line of lines) {
      this.ensure(lineHeight);
      if (line.length > 0) {
        this.page.drawText(line, {
          x: MARGIN + indent,
          y: this.y - style.size,
          size: style.size,
          font: style.font,
          color: style.color ?? INK,
        });
      }
      this.y -= lineHeight;
    }
    this.y -= style.gapAfter ?? 0;
  }

  heading(content: string, size = 12): void {
    this.space(6);
    this.text(content.toUpperCase(), {
      font: this.fonts.sansBold,
      size,
      color: BRAND,
      gapAfter: 4,
    });
    this.rule(0.6);
    this.space(4);
  }

  label(content: string): void {
    this.text(content, { font: this.fonts.sansBold, size: 8.5, color: MUTED, gapAfter: 1 });
  }

  space(height: number): void {
    this.y -= height;
  }

  rule(thickness = 0.5): void {
    this.ensure(6);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 2 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y - 2 },
      thickness,
      color: RULE,
    });
    this.y -= 6;
  }

  // Keeps an image and the line above it together on one page.
  image(img: PDFImage, maxWidth: number, maxHeight: number): { width: number; height: number } {
    const scaled = img.scaleToFit(maxWidth, maxHeight);
    this.ensure(scaled.height + 4);
    this.page.drawImage(img, {
      x: MARGIN,
      y: this.y - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
    this.y -= scaled.height + 4;
    return scaled;
  }

  // Draws the letterhead and footer on every page. Call once, before save.
  stampPages(footerLeft: string): void {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      page.drawText("BUILDPRO RECRUITERS, LLC", {
        x: MARGIN,
        y: PAGE_HEIGHT - 42,
        size: 13,
        font: this.fonts.sansBold,
        color: BRAND,
      });
      const contact = "214-238-5145   |   buildprorecruiters.com";
      page.drawText(contact, {
        x: PAGE_WIDTH - MARGIN - this.fonts.sans.widthOfTextAtSize(contact, 9),
        y: PAGE_HEIGHT - 42,
        size: 9,
        font: this.fonts.sans,
        color: MUTED,
      });
      page.drawLine({
        start: { x: MARGIN, y: PAGE_HEIGHT - 52 },
        end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 52 },
        thickness: 0.8,
        color: BRAND,
      });

      const footerRight = `Page ${index + 1} of ${total}`;
      page.drawLine({
        start: { x: MARGIN, y: 44 },
        end: { x: PAGE_WIDTH - MARGIN, y: 44 },
        thickness: 0.4,
        color: RULE,
      });
      page.drawText(pdfSafe(footerLeft), {
        x: MARGIN,
        y: 32,
        size: 8,
        font: this.fonts.sans,
        color: MUTED,
      });
      page.drawText(footerRight, {
        x: PAGE_WIDTH - MARGIN - this.fonts.sans.widthOfTextAtSize(footerRight, 8),
        y: 32,
        size: 8,
        font: this.fonts.sans,
        color: MUTED,
      });
    });
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save({ useObjectStreams: false });
  }
}
