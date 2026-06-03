const fs = require("fs");

// ===== Fix 1: file-extractor.ts - update extractPdf for pdf-parse 2.x =====
let extractor = fs.readFileSync("/home/ubuntu/metabot/src/bridge/file-extractor.ts", "utf8");

const oldExtractPdf = `  private async extractPdf(filePath: string): Promise<ExtractionResult> {
    const pdfParse = await import('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse.PDFParse(buffer);
    return {
      text: data.text.slice(0, 10000),
      metadata: {
        pages: String(data.numpages || 0),
        format: 'pdf',
        ...(data.info?.Title ? { title: data.info.Title } : {}),
        ...(data.info?.Author ? { author: data.info.Author } : {}),
      },
    };
  }`;

const newExtractPdf = `  private async extractPdf(filePath: string): Promise<ExtractionResult> {
    const pdfParse = await import('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const parser = new pdfParse.PDFParse(new Uint8Array(buf));
    await parser.load();
    const text = await parser.getText();
    const info = await parser.getInfo();
    return {
      text: (text || '').slice(0, 10000),
      metadata: {
        pages: String(parser.doc?.numPages || 0),
        format: 'pdf',
        ...(info?.Title ? { title: info.Title } : {}),
        ...(info?.Author ? { author: info.Author } : {}),
      },
    };
  }`;

if (extractor.includes("pdfParse.PDFParse(buffer)")) {
  extractor = extractor.replace(oldExtractPdf, newExtractPdf);
  fs.writeFileSync("/home/ubuntu/metabot/src/bridge/file-extractor.ts", extractor, "utf8");
  console.log("1. Fixed file-extractor.ts - pdf-parse 2.x API");
} else {
  console.log("1. file-extractor.ts - extractPdf pattern not found, checking...");
  console.log(extractor.substring(extractor.indexOf("extractPdf"), extractor.indexOf("extractPdf") + 500));
}

// ===== Fix 2: memory-client.ts - add file_url to getDocument return =====
let client = fs.readFileSync("/home/ubuntu/metabot/src/memory/memory-client.ts", "utf8");

// Find the getDocument return and add file_url
const oldReturn = `          created_by: doc.created_by || '',
          created_at: doc.created_at || '',
          updated_at: doc.updated_at || '',`;

const newReturn = `          created_by: doc.created_by || '',
          file_url: doc.file_url || '',
          created_at: doc.created_at || '',
          updated_at: doc.updated_at || '',`;

if (client.includes(oldReturn)) {
  client = client.replace(oldReturn, newReturn);
  fs.writeFileSync("/home/ubuntu/metabot/src/memory/memory-client.ts", client, "utf8");
  console.log("2. Fixed memory-client.ts - added file_url to getDocument");
} else {
  console.log("2. memory-client.ts - pattern not found, checking...");
  const idx = client.indexOf("getDocument");
  if (idx >= 0) console.log(client.substring(idx + 100, idx + 600));
}

console.log("DONE");
