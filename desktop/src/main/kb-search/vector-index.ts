import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export interface IndexableChunk {
  docId: string;
  docName: string;
  position: number;
  text: string;
  vector: number[];
}

export interface SearchResult {
  docId: string;
  docName: string;
  position: number;
  text: string;
  score: number;
}

const DIM = 1536;

export class VectorIndex {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.loadExtension(sqliteVec.getLoadablePath());
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL,
        doc_name TEXT NOT NULL,
        position INTEGER NOT NULL,
        text TEXT NOT NULL
      );
    `);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
        embedding float[${DIM}] distance_metric=cosine
      );
    `);
  }

  insertChunks(chunks: IndexableChunk[]): void {
    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (doc_id, doc_name, position, text) VALUES (?, ?, ?, ?)',
    );
    const insertVec = this.db.prepare(
      'INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)',
    );
    const tx = this.db.transaction((items: IndexableChunk[]) => {
      for (const c of items) {
        const info = insertChunk.run(c.docId, c.docName, c.position, c.text);
        // sqlite-vec 0.1.9 requires BigInt for rowid on vec0 primary keys
        insertVec.run(BigInt(info.lastInsertRowid as number), JSON.stringify(c.vector));
      }
    });
    tx(chunks);
  }

  search(query: number[], topK: number): SearchResult[] {
    const rows = this.db
      .prepare(
        `
        SELECT c.doc_id, c.doc_name, c.position, c.text, v.distance
        FROM chunks_vec v
        JOIN chunks c ON c.rowid = v.rowid
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance ASC
      `,
      )
      .all(JSON.stringify(query), topK) as Array<{
      doc_id: string;
      doc_name: string;
      position: number;
      text: string;
      distance: number;
    }>;

    return rows.map((r) => ({
      docId: r.doc_id,
      docName: r.doc_name,
      position: r.position,
      text: r.text,
      score: 1 - r.distance, // cosine distance → similarity
    }));
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
