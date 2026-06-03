import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { MemoryDocument } from '../types';
import type { JSX } from 'react';
import styles from './MemoryView.module.css';

/* ---- Icons ---- */

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconOrg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function IconGroup() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

/* ---- API helpers ---- */

const MEMORY_BASE = '/memory';

interface FolderTreeNode {
  id: string;
  name: string;
  children?: FolderTreeNode[];
  document_count?: number;
}

async function fetchFolderTree(): Promise<FolderTreeNode | null> {
  const res = await fetch(`${MEMORY_BASE}/api/folders`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchDocuments(folderId?: string): Promise<MemoryDocument[]> {
  const url = folderId
    ? `${MEMORY_BASE}/api/documents?folder_id=${folderId}`
    : `${MEMORY_BASE}/api/documents`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || data || [];
}

async function fetchDocument(docId: string): Promise<MemoryDocument | null> {
  const res = await fetch(`${MEMORY_BASE}/api/documents/${docId}`);
  if (!res.ok) return null;
  return res.json();
}

async function searchDocuments(query: string): Promise<MemoryDocument[]> {
  const res = await fetch(`${MEMORY_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || data.documents || data || [];
}

async function createDocument(data: {
  title: string;
  content: string;
  folder_id: string;
  tags?: string[];
  path?: string;
}): Promise<boolean> {
  const res = await fetch(`${MEMORY_BASE}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function updateDocument(docId: string, data: { title?: string; content?: string; tags?: string[] }): Promise<boolean> {
  const res = await fetch(`${MEMORY_BASE}/api/documents/${docId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function deleteDocument(docId: string): Promise<boolean> {
  const res = await fetch(`${MEMORY_BASE}/api/documents/${docId}`, { method: 'DELETE' });
  return res.ok;
}

async function deleteFolder(folderId: string): Promise<boolean> {
  const res = await fetch(`${MEMORY_BASE}/api/folders/${folderId}`, { method: 'DELETE' });
  return res.ok;
}

/* ---- Tree helpers ---- */

type SectionKey = 'org' | 'bots' | 'groups';

interface TagInfo { name: string; count: number; }

async function fetchTags(): Promise<TagInfo[]> {
  const res = await fetch(`${MEMORY_BASE}/api/workspace/tags`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.tags || [];
}

async function fetchDocsByTag(tag: string): Promise<MemoryDocument[]> {
  const res = await fetch(`${MEMORY_BASE}/api/workspace/tags/${encodeURIComponent(tag)}/documents`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

const SECTION_ROOTS: Record<SectionKey, string[]> = {
  org: ['组织公共区'],
  bots: ['数字员工'],
  groups: ['群协作区'],
};

function findRootNode(tree: FolderTreeNode, name: string): FolderTreeNode | null {
  for (const child of tree.children || []) {
    if (child.name === name) return child;
    const found = findRootNode(child, name);
    if (found) return found;
  }
  return null;
}

function collectFolderIds(node: FolderTreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children || []) {
    ids.push(...collectFolderIds(child));
  }
  return ids;
}

function findNodeById(tree: FolderTreeNode, id: string): FolderTreeNode | null {
  if (tree.id === id) return tree;
  for (const child of tree.children || []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function countDocsInTree(node: FolderTreeNode): number {
  let count = node.document_count || 0;
  for (const child of node.children || []) {
    count += countDocsInTree(child);
  }
  return count;
}

/* ---- Component ---- */

export function MemoryView() {
  const { t } = useTranslation();
  const [tree, setTree] = useState<FolderTreeNode | null>(null);
  const [documents, setDocuments] = useState<MemoryDocument[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<MemoryDocument | null>(null);
  const [backlinks, setBacklinks] = useState<MemoryDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);

  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const toggleSection = useCallback((key: SectionKey) => {
    setExpandedSection((prev) => (prev === key ? null : key));
    setExpandedFolders(new Set());
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => { loadData(); fetchTags().then(setAllTags).catch(() => {}); }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, d] = await Promise.all([fetchFolderTree(), fetchDocuments()]);
      if (t) setTree(t);
      setDocuments(d);
    } catch {
      setError(t('memory.connectFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFolderClick = useCallback(async (folderId: string) => {
    setSelectedFolder(folderId);
    setSelectedDoc(null);
    setLoading(true);
    try {
      const node = tree ? findNodeById(tree, folderId) : null;
      const hasChildren = node && (node.children || []).length > 0;
      if (hasChildren) {
        const allIds = collectFolderIds(node!);
        const allDocs = await Promise.all(allIds.map((id) => fetchDocuments(id)));
        setDocuments(allDocs.flat());
      } else {
        const docs = await fetchDocuments(folderId);
        setDocuments(docs);
      }
    } catch {
      setError(t('memory.loadDocsFailed'));
    } finally {
      setLoading(false);
    }
  }, [tree]);

  const handleShowAll = useCallback(async () => {
    setSelectedFolder(null);
    setSelectedDoc(null);
    setSelectedTag(null);
    setLoading(true);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch {
      setError(t('memory.loadDocsFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDocClick = useCallback(async (doc: MemoryDocument) => {
    setLoading(true);
    try {
      const full = await fetchDocument(doc.id);
      setSelectedDoc(full);
      // Fetch backlinks
      try {
        const res = await fetch(`${MEMORY_BASE}/api/workspace/documents/${doc.id}/backlinks`);
        if (res.ok) {
          const data = await res.json();
          setBacklinks(data.backlinks || []);
        } else {
          setBacklinks([]);
        }
      } catch {
        setBacklinks([]);
      }
    } catch {
      setError(t('memory.loadDocsFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { handleShowAll(); return; }
    setLoading(true);
    setSelectedDoc(null);
    try {
      const results = await searchDocuments(searchQuery);
      setDocuments(results);
    } catch {
      setError(t('memory.searchFailed'));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, handleShowAll]);

  const handleTagClick = useCallback(async (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      loadData();
      return;
    }
    setSelectedTag(tag);
    setSelectedDoc(null);
    setSelectedFolder(null);
    setLoading(true);
    try {
      const docs = await fetchDocsByTag(tag);
      setDocuments(docs);
    } catch {
      setError(t('memory.tagFilterFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectedTag, loadData]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setCreating(true);
    try {
      const ok = await createDocument({
        title: newTitle.trim(),
        content: newContent.trim(),
        folder_id: selectedFolder || 'root',
        tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        path: newTitle.trim(),
      });
      if (ok) {
        setShowCreate(false);
        setNewTitle(''); setNewContent(''); setNewTags('');
        selectedFolder ? handleFolderClick(selectedFolder) : loadData();
      } else {
        setError(t('memory.createDocFailed'));
      }
    } catch {
      setError(t('memory.createDocFailed'));
    } finally {
      setCreating(false);
    }
  }, [newTitle, newContent, newTags, selectedFolder, handleFolderClick, loadData]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const folderId = selectedFolder || 'root';
    const binaryExts = ['.docx', '.xlsx', '.xls', '.pdf', '.pptx'];
    let successCount = 0;
    for (const file of Array.from(files)) {
      try {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (binaryExts.includes(ext)) {
          // Binary file: send to import-file endpoint
          const b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          const res = await fetch('/api/workspace/import-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, content: b64, folderId, tags: ['uploaded'] }),
          });
          if (res.ok) successCount++;
        } else {
          // Text file: use existing createDocument
          const content = await file.text();
          if (content.length < 2) continue;
          const title = file.name.replace(/\.[^.]+$/, '');
          const ok = await createDocument({ title, content, folder_id: folderId, tags: ['uploaded'], path: file.name });
          if (ok) successCount++;
        }
      } catch { /* skip */ }
    }
    setUploading(false);
    e.target.value = '';
    if (successCount > 0) {
      selectedFolder ? handleFolderClick(selectedFolder) : loadData();
    } else {
      setError(t('memory.fileUploadFailed'));
    }
  }, [selectedFolder, handleFolderClick, loadData]);

  const startEdit = useCallback(() => {
    if (!selectedDoc) return;
    setEditTitle(selectedDoc.title);
    setEditContent(selectedDoc.content || '');
    setEditTags((selectedDoc.tags || []).join(', '));
    setEditing(true);
    setConfirmDelete(false);
  }, [selectedDoc]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setConfirmDelete(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedDoc || !editTitle.trim()) return;
    setSaving(true);
    try {
      const tags = editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const ok = await updateDocument(selectedDoc.id, { title: editTitle.trim(), content: editContent, tags });
      if (ok) {
        setSelectedDoc({ ...selectedDoc, title: editTitle.trim(), content: editContent, tags });
        setEditing(false);
        selectedFolder ? handleFolderClick(selectedFolder) : loadData();
      } else {
        setError(t('memory.saveFailed'));
      }
    } catch {
      setError(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [selectedDoc, editTitle, editContent, editTags, selectedFolder, handleFolderClick, loadData]);

  const handleDelete = useCallback(async () => {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const ok = await deleteDocument(selectedDoc.id);
      if (ok) {
        setSelectedDoc(null);
        setConfirmDelete(false);
        selectedFolder ? handleFolderClick(selectedFolder) : loadData();
      } else {
        setError(t('memory.deleteFailed'));
      }
    } catch {
      setError(t('memory.deleteFailed'));
    } finally {
      setSaving(false);
    }
  }, [selectedDoc, selectedFolder, handleFolderClick, loadData]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    setSaving(true);
    try {
      const ok = await deleteFolder(folderId);
      if (ok) {
        if (selectedFolder === folderId) setSelectedFolder(null);
        setConfirmDeleteFolder(null);
        loadData();
      } else {
        setError(t('memory.deleteFolderFailed'));
      }
    } catch {
      setError(t('memory.deleteFolderFailed'));
    } finally {
      setSaving(false);
    }
  }, [selectedFolder, loadData]);

  /* ---- Render helpers ---- */

  function renderRecursiveFolder(node: FolderTreeNode, depth: number): JSX.Element {
    const hasChildren = (node.children || []).length > 0;
    const isOpen = expandedFolders.has(node.id);
    const isConfirming = confirmDeleteFolder === node.id;

    return (
      <div key={node.id}>
        <div
          className={`${styles.treeItem} ${selectedFolder === node.id ? styles.treeItemActive : ''}`}
          style={{ paddingLeft: `${10 + depth * 16}px` }}
          onClick={() => { if (hasChildren) toggleFolder(node.id); handleFolderClick(node.id); }}
        >
          <span className={styles.treeItemIcon}>
            {hasChildren ? <IconChevron open={isOpen} /> : <IconFolder />}
          </span>
          <span className={styles.treeItemLabel}>{node.name}</span>
          {countDocsInTree(node) > 0 && (
            <span className={styles.countBadge}>{countDocsInTree(node)}</span>
          )}
          {!isConfirming ? (
            <button className={styles.treeInlineBtn} title={t('memory.deleteFolder')} onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(node.id); }}><IconTrash /></button>
          ) : (
            <>
              <button className={styles.deleteConfirmBtn} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(node.id); }} disabled={saving}>{t('memory.confirmDelete')}</button>
              <button className={styles.treeInlineBtn} onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(null); }}>{t('coordinator.cancel')}</button>
            </>
          )}
        </div>
        {hasChildren && isOpen && (node.children || []).map((c) => renderRecursiveFolder(c, depth + 1))}
      </div>
    );
  }

  function renderFolderItem(node: FolderTreeNode, depth: number) {
    const isConfirming = confirmDeleteFolder === node.id;
    return (
      <div key={node.id}>
        <div
          className={`${styles.treeItem} ${selectedFolder === node.id ? styles.treeItemActive : ''}`}
          style={{ paddingLeft: `${10 + depth * 16}px` }}
          onClick={() => handleFolderClick(node.id)}
        >
          <span className={styles.treeItemIcon}><IconFolder /></span>
          <span className={styles.treeItemLabel}>{node.name}</span>
          {countDocsInTree(node) > 0 && (
            <span className={styles.countBadge}>{countDocsInTree(node)}</span>
          )}
          {!isConfirming ? (
            <button className={styles.treeInlineBtn} title={t('memory.deleteFolder')} onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(node.id); }}><IconTrash /></button>
          ) : (
            <>
              <button className={styles.deleteConfirmBtn} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(node.id); }} disabled={saving}>{t('memory.confirmDelete')}</button>
              <button className={styles.treeInlineBtn} onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(null); }}>{t('coordinator.cancel')}</button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderCategoryWithSubfolders(node: FolderTreeNode, depth: number) {
    const hasSubFolders = (node.children || []).length > 0;
    if (hasSubFolders) {
      const isSubOpen = expandedFolders.has(node.id);
      return (
        <div key={node.id}>
          <div
            className={`${styles.treeItem} ${selectedFolder === node.id ? styles.treeItemActive : ''}`}
            style={{ paddingLeft: `${10 + depth * 16}px` }}
            onClick={() => { toggleFolder(node.id); handleFolderClick(node.id); }}
          >
            <span className={styles.treeItemIcon}><IconChevron open={isSubOpen} /></span>
            <span className={styles.treeItemLabel}>{node.name}</span>
            {countDocsInTree(node) > 0 && (
              <span className={styles.countBadge}>{countDocsInTree(node)}</span>
            )}
          </div>
          {isSubOpen && (node.children || []).map((c) => renderRecursiveFolder(c, depth + 1))}
        </div>
      );
    }
    return renderFolderItem(node, depth);
  }

  function renderEntityList(root: FolderTreeNode) {
    return (root.children || []).map((entity) => {
      const isOpen = expandedFolders.has(entity.id);
      const isConfirming = confirmDeleteFolder === entity.id;
      return (
        <div key={entity.id}>
          <div
            className={`${styles.treeItem} ${styles.subHeader} ${selectedFolder === entity.id ? styles.treeItemActive : ''}`}
            style={{ paddingLeft: '26px' }}
            onClick={() => { toggleFolder(entity.id); handleFolderClick(entity.id); }}
          >
            <span className={styles.treeItemIcon}><IconChevron open={isOpen} /></span>
            <span className={styles.treeItemLabel}>{entity.name}</span>
            <span className={styles.countBadge}>{countDocsInTree(entity)}</span>
            {!isConfirming ? (
              <button className={styles.treeInlineBtn} title={t('memory.deleteFolder')} onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(entity.id); }}><IconTrash /></button>
            ) : (
              <>
                <button className={styles.deleteConfirmBtn} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(entity.id); }} disabled={saving}>{t('memory.confirmDelete')}</button>
                <button className={styles.treeInlineBtn} onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(null); }}>{t('coordinator.cancel')}</button>
              </>
            )}
          </div>
          {isOpen && (entity.children || []).map((cat) => renderCategoryWithSubfolders(cat, 2))}
        </div>
      );
    });
  }

  function renderSidebar() {
    if (!tree) return null;

    const orgRoot = SECTION_ROOTS.org.map((n) => findRootNode(tree, n)).find(Boolean) ?? null;
    const botsRoot = SECTION_ROOTS.bots.map((n) => findRootNode(tree, n)).find(Boolean) ?? null;
    const groupsRoot = SECTION_ROOTS.groups.map((n) => findRootNode(tree, n)).find(Boolean) ?? null;

    const sections: { key: SectionKey; label: string; icon: JSX.Element; root: FolderTreeNode | null }[] = [
      { key: 'org', label: t('memory.publicMemory'), icon: <IconOrg />, root: orgRoot },
      { key: 'bots', label: t('memory.digitalWorkers'), icon: <IconBot />, root: botsRoot },
      { key: 'groups', label: t('memory.projectCollab'), icon: <IconGroup />, root: groupsRoot },
    ];

    return sections.map(({ key, label, icon, root }) => {
      const isOpen = expandedSection === key;
      const docCount = root ? countDocsInTree(root) : 0;
      return (
        <div key={key} className={styles.section}>
          <div
            className={`${styles.sectionHeader} ${isOpen ? styles.sectionHeaderOpen : ''}`}
            onClick={() => toggleSection(key)}
          >
            <span className={styles.sectionChevron}><IconChevron open={isOpen} /></span>
            <span className={styles.sectionIcon}>{icon}</span>
            <span className={styles.sectionLabel}>{label}</span>
            <span className={styles.countBadge}>{docCount}</span>
          </div>
          {isOpen && root && (
            <div className={styles.sectionBody}>
              {key === 'org' && (root.children || []).map((c) => renderRecursiveFolder(c, 1))}
              {key === 'bots' && renderEntityList(root)}
              {key === 'groups' && renderEntityList(root)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.treeSidebar}>
        <div className={styles.treeHeader}>
          <span className={styles.treeTitle}>{t('memory.workspace')}</span>
          <div className={styles.treeActions}>
            <button className={styles.treeActionBtn} onClick={() => setShowCreate(true)} title={t('memory.newDoc')}>
              <IconPlus />
            </button>
            <label className={styles.treeActionBtn} title={t('memory.uploadFile')}>
              <input type="file" accept=".md,.txt,.json,.csv,.yaml,.yml" multiple style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
              <IconUpload />
            </label>
            <button className={styles.treeActionBtn} onClick={loadData} title={t('memory.backToList')}>
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className={styles.treeList}>
          <div className={`${styles.treeItem} ${!selectedFolder && !selectedTag ? styles.treeItemActive : ''}`} onClick={handleShowAll}>
            <span className={styles.treeItemIcon}><IconBook /></span>
            {t('memory.allDocs')}
          </div>
          <div className={styles.sectionDivider} />
          {renderSidebar()}
        </div>
      </div>

      {/* Main content */}
      <div className={styles.mainArea}>
        <div className={styles.mobileFolderBar}>
          <button className={`${styles.folderPill} ${!selectedFolder ? styles.folderPillActive : ''}`} onClick={handleShowAll}>{t('memory.all')}</button>
          <button className={`${styles.folderPill} ${expandedSection === 'org' ? styles.folderPillActive : ''}`} onClick={() => toggleSection('org')}>{t('memory.publicMemory')}</button>
          <button className={`${styles.folderPill} ${expandedSection === 'bots' ? styles.folderPillActive : ''}`} onClick={() => toggleSection('bots')}>{t('memory.digitalWorkers')}</button>
          <button className={`${styles.folderPill} ${expandedSection === 'groups' ? styles.folderPillActive : ''}`} onClick={() => toggleSection('groups')}>{t('memory.projectCollab')}</button>
        </div>

        <div className={styles.searchBar}>
          <input className={styles.searchInput} placeholder={t('memory.searchDocs')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        </div>

        {showCreate && (
          <div className={styles.createPanel}>
            <div className={styles.createHeader}>
              <span className={styles.createTitle}>{t('memory.newDoc')}</span>
              <button className={styles.treeActionBtn} onClick={() => setShowCreate(false)}><IconX /></button>
            </div>
            <input className={styles.createInput} placeholder={t('memory.titlePlaceholder')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <textarea className={styles.createTextarea} placeholder={t('memory.contentPlaceholder')} rows={6} value={newContent} onChange={(e) => setNewContent(e.target.value)} />
            <input className={styles.createInput} placeholder={t('memory.tagsPlaceholder')} value={newTags} onChange={(e) => setNewTags(e.target.value)} />
            <div className={styles.createActions}>
              <label className={styles.uploadBtn}>
                <input type="file" accept=".md,.txt,.json,.csv,.yaml,.yml" multiple style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
                {uploading ? t('memory.uploading') : t('memory.uploadFile')}
              </label>
              <button className={styles.createBtn} onClick={handleCreate} disabled={creating || !newTitle.trim() || !newContent.trim()}>
                {creating ? t('memory.saving') : t('memory.save')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ padding: '12px 16px', background: 'var(--error-bg)', border: '1px solid rgba(239,91,91,0.15)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '13px' }}>
              {error}
            </div>
          </div>
        )}

        {loading && (
          <div className={styles.loading}><span className={styles.loadingSpinner} />{t('memory.loading')}</div>
        )}

        {selectedDoc ? (
          <div className={styles.docViewer}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <button className={styles.backBtn} onClick={() => { setSelectedDoc(null); setEditing(false); setConfirmDelete(false); }} style={{ marginBottom: 0 }}>
                <IconArrowLeft />{t('memory.backToList')}
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                {!editing && (
                  <>
                    <button className={styles.treeActionBtn} title={t('memory.edit')} onClick={startEdit}><IconEdit /></button>
                    {!confirmDelete ? (
                      <button className={styles.treeActionBtn} title={t('memory.delete')} onClick={() => setConfirmDelete(true)}><IconTrash /></button>
                    ) : (
                      <>
                        <button className={styles.deleteConfirmBtn} onClick={handleDelete} disabled={saving}>{t('memory.confirmDeleteDoc')}</button>
                        <button className={styles.treeActionBtn} onClick={() => setConfirmDelete(false)}>{t('coordinator.cancel')}</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {editing ? (
              <div className={styles.createPanel} style={{ borderBottom: 'none', padding: '0 0 16px' }}>
                <input className={styles.createInput} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t('memory.docTitlePlaceholder')} />
                <textarea className={styles.createTextarea} value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder={t('memory.mdContentPlaceholder')} style={{ minHeight: '300px' }} />
                <input className={styles.createInput} value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder={t('memory.tagsPlaceholder')} />
                <div className={styles.createActions}>
                  <button className={styles.inlineCancel} onClick={cancelEdit} disabled={saving}>{t('coordinator.cancel')}</button>
                  <button className={styles.inlineConfirm} onClick={handleSave} disabled={saving || !editTitle.trim()}>
                    {saving ? t('memory.saving') : t('memory.save')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.docViewerHeader}>
                  <h1 className={styles.docViewerTitle}>{selectedDoc.title}</h1>
                  <div className={styles.docViewerMeta}>
                    <span>{selectedDoc.path}</span>
                    {selectedDoc.updated_at && <span>{t('memory.updatedAt')} {new Date(selectedDoc.updated_at).toLocaleDateString()}</span>}
                    {selectedDoc.created_by && <span>{t('memory.createdBy', { name: selectedDoc.created_by })}</span>}
                  </div>
                  {selectedDoc.tags && selectedDoc.tags.length > 0 && (
                    <div className={styles.docItemTags} style={{ marginTop: '8px' }}>
                      {selectedDoc.tags.map((tag) => <span key={tag} className={styles.tag} onClick={(e) => { e.stopPropagation(); handleTagClick(tag); }}>{tag}</span>)}
                    </div>
                  )}
                </div>
                <div className={styles.docViewerContent}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      // Custom text rendering to handle [[wikilinks]]
                      p: ({ children }) => {
                        const renderWithWikilinks = (nodes: React.ReactNode | undefined): React.ReactNode[] => {
                          if (!nodes) return [];
                          const arr = Array.isArray(nodes) ? nodes : [nodes];
                          const result: React.ReactNode[] = [];
                          for (const node of arr) {
                            if (typeof node === 'string') {
                              const parts = node.split(/(\[\[[^\]]+\]\])/g);
                              for (let i = 0; i < parts.length; i++) {
                                const match = parts[i].match(/^\[\[([^\]]+)\]\]$/);
                                if (match) {
                                  const linkText = match[1];
                                  result.push(
                                    <span
                                      key={`wl-${i}`}
                                      className={styles.wikiLink}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSearchQuery(linkText);
                                        setSelectedDoc(null);
                                        searchDocuments(linkText).then((docs) => {
                                          setDocuments(docs);
                                          setLoading(false);
                                        });
                                      }}
                                    >
                                      {linkText}
                                    </span>,
                                  );
                                } else if (parts[i]) {
                                  result.push(parts[i]);
                                }
                              }
                            } else if (node) {
                              result.push(node);
                            }
                          }
                          return result;
                        };
                        return <p>{renderWithWikilinks(children)}</p>;
                      },
                    }}
                  >
                    {selectedDoc.content || t('memory.noContent')}
                  </ReactMarkdown>
                </div>
                {backlinks.length > 0 && (
                  <div className={styles.backlinks}>
                    <div className={styles.backlinksTitle}>{t('memory.backlinks')} ({backlinks.length})</div>
                    {backlinks.map((bl) => (
                      <div key={bl.id} className={styles.backlinkItem} onClick={() => handleDocClick(bl)}>
                        <span className={styles.backlinkTitle}>{bl.title}</span>
                        <span className={styles.backlinkPath}>{bl.path}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : !loading && documents.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><IconBook /></div>
            <div className={styles.emptyTitle}>{t('memory.noDocs')}</div>
            <div className={styles.emptySubtitle}>{searchQuery ? t('memory.tryDifferentSearch') : t('memory.browseByCategory')}</div>
          </div>
        ) : (
          <div className={styles.docList}>
            {documents.map((doc) => (
              <div key={doc.id} className={styles.docItem} onClick={() => handleDocClick(doc)}>
                <div className={styles.docItemIcon}><IconFile /></div>
                <div className={styles.docItemContent}>
                  <div className={styles.docItemTitle}>
                    {doc.title}
                    {(doc as any).score != null && (
                      <span className={styles.kbBadge} style={{ marginLeft: 8 }}>
                        {Math.round((1 - (doc as any).score) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className={styles.docItemPath}>{doc.path}</div>
                  {doc.snippet && <div className={styles.docItemMeta}><span>{doc.snippet}</span></div>}
                  {doc.tags && doc.tags.length > 0 && (
                    <div className={styles.docItemTags}>
                      {doc.tags.map((tag) => <span key={tag} className={styles.tag} onClick={(e) => { e.stopPropagation(); handleTagClick(tag); }}>{tag}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
