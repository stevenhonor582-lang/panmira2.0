// tag-similarity.ts — tag-based similarity + query tag extraction
// Uses Jaccard (intersection over union) for set similarity

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let inter = 0;
  for (const x of Array.from(setA)) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function weightedTagScore(
  queryTopicTags: string[],
  queryReaderTags: string[],
  profileTopicTags: string[],
  profileReaderTags: string[],
  weights = { topic: 0.6, reader: 0.4 },
): number {
  return (
    weights.topic * jaccard(queryTopicTags, profileTopicTags) +
    weights.reader * jaccard(queryReaderTags, profileReaderTags)
  );
}

/** Extract query tags from free-form topic + reader text */
export function extractQueryTags(topic: string, reader: string): { topicTags: string[]; readerTags: string[] } {
  const t = topic.toLowerCase();
  const topicTags: string[] = [];

  // Process
  if (t.includes('mjf')) topicTags.push('mjf');
  if (t.includes('fdm')) topicTags.push('fdm');
  if (t.includes('3d print') || t.includes('增材') || t.includes('additive')) topicTags.push('3d_printing', 'additive_manufacturing');
  if (t.includes('cnc') || t.includes('加工中心')) topicTags.push('cnc_machining');
  if (t.includes('5 轴') || t.includes('5-axis') || t.includes('5 axis')) topicTags.push('5_axis_machining');
  if (t.includes('silicone') || t.includes('硅胶') || t.includes('elastomer')) topicTags.push('silicone', 'elastomer');
  if (t.includes('对比') || t.includes(' vs ') || t.includes('compare')) topicTags.push('process_comparison');
  if (t.includes('案例') || t.includes('case study') || t.includes('story')) topicTags.push('case_study');
  if (t.includes('指南') || t.includes('guide') || t.includes('百科')) topicTags.push('complete_guide');
  if (t.includes('injection') || t.includes('注塑')) topicTags.push('injection_molding');
  if (t.includes('machining')) topicTags.push('cnc_machining');

  // Reader
  const r = reader.toLowerCase();
  const readerTags: string[] = [];
  if (r.includes('采购') || r.includes('procurement') || r.includes('buyer')) readerTags.push('procurement_manager');
  if (r.includes('工程师') || r.includes('engineer') || r.includes('r&d') || r.includes('研发')) readerTags.push('rnd_engineer', 'product_developer');
  if (r.includes('经理') || r.includes('manager') || r.includes('director')) readerTags.push('manufacturing_manager');
  if (r.includes('销售') || r.includes('sales') || r.includes('跨境') || r.includes('cross-border')) readerTags.push('cross_border_b2b', 'sales_manager');
  if (r.includes('oem') || r.includes('大客户')) readerTags.push('oem_large');

  return { topicTags: Array.from(new Set(topicTags)), readerTags: Array.from(new Set(readerTags)) };
}