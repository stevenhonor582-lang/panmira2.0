import * as fs from 'node:fs';
import type { Logger } from '../utils/logger.js';

export interface ExtractionResult {
  text: string;
  metadata: Record<string, string>;
}

const SUPPORTED_BINARY = new Set(['.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.ppt']);

export class FileExtractor {
  constructor(private logger: Logger) {}

  isSupported(ext: string): boolean {
    return SUPPORTED_BINARY.has(ext.toLowerCase());
  }

  async extract(filePath: string): Promise<ExtractionResult> {
    const ext = this.getExt(filePath);
    try {
      switch (ext) {
        case '.pdf': return await this.extractPdf(filePath);
        case '.docx': return await this.extractDocx(filePath);
        case '.xlsx':
        case '.xls': return await this.extractXlsx(filePath);
        case '.pptx':
        case '.ppt': return await this.extractPptx(filePath);
        default: return { text: '', metadata: {} };
      }
    } catch (err: any) {
      this.logger.warn({ err: err.message, filePath, ext }, 'File extraction failed');
      return { text: `[无法提取文本: ${ext} 文件]`, metadata: { error: err.message, format: ext } };
    }
  }

  private async extractPdf(filePath: string): Promise<ExtractionResult> {
    const pdfParse = await import('pdf-parse');
    const buf = fs.readFileSync(filePath);
    // pdf-parse 2.x ESM: PDFParse is a class, TS types mark members private
    const parser: any = new pdfParse.PDFParse(new Uint8Array(buf));
    await parser.load();
    const text: string = await parser.getText();
    const info: Record<string, string> = await parser.getInfo();
    return {
      text: (text || '').slice(0, 10000),
      metadata: {
        pages: String(parser.doc?.numPages || 0),
        format: 'pdf',
        ...(info?.Title ? { title: info.Title } : {}),
        ...(info?.Author ? { author: info.Author } : {}),
      },
    };
  }

  private async extractDocx(filePath: string): Promise<ExtractionResult> {
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ path: filePath });
    return {
      text: result.value.slice(0, 10000),
      metadata: { format: 'docx', ...(result.messages?.length ? { warnings: result.messages.join('; ') } : {}) },
    };
  }

  private async extractXlsx(filePath: string): Promise<ExtractionResult> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fs.readFileSync(filePath));
    const texts: string[] = [];
    let cellCount = 0;
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      texts.push(`--- ${name} ---\n${csv}`);
      cellCount += Object.keys(sheet).filter((k) => !k.startsWith('!')).length;
    }
    return {
      text: texts.join('\n\n').slice(0, 10000),
      metadata: { format: 'xlsx', sheets: String(workbook.SheetNames.length), cells: String(cellCount) },
    };
  }

  private async extractPptx(filePath: string): Promise<ExtractionResult> {
    // pptx files are zip archives containing slide XML
    const AdmZip = await this.tryAdmZip();
    if (AdmZip) {
      try {
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        const slides = entries
          .filter((e: any) => e.entryName.match(/ppt\/slides\/slide\d+\.xml/))
          .sort((a: any, b: any) => {
            const na = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || '0');
            const nb = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || '0');
            return na - nb;
          });
        const texts: string[] = [];
        for (const slide of slides) {
          const xml = slide.getData().toString('utf-8');
          const tagStripped = xml.replace(/<[^>]+>/g, ' ');
          const cleaned = tagStripped.replace(/\s+/g, ' ').trim();
          if (cleaned) texts.push(cleaned);
        }
        return {
          text: texts.join('\n\n').slice(0, 5000),
          metadata: { format: 'pptx', slides: String(slides.length) },
        };
      } catch {
        // fall through to empty
      }
    }
    return { text: '[PPTX文本提取需要安装 adm-zip 或 libreoffice]', metadata: { format: 'pptx' } };
  }

  private async tryAdmZip(): Promise<any> {
    try {
      const mod = await Function('return import("adm-zip")')();
      return mod.default;
    } catch {
      return null;
    }
  }

  private getExt(filePath: string): string {
    const idx = filePath.lastIndexOf('.');
    return idx >= 0 ? filePath.slice(idx).toLowerCase() : '';
  }
}
