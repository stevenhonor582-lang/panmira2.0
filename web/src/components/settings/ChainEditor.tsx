import { useState, useCallback } from 'react';
import styles from '../SettingsView.module.css';

// ─── Types (mirror orchestrator types) ───

interface GateRule {
  type: string;
  threshold?: number;
  endpoint?: string;
  expect?: number;
  cwd?: string;
}

interface OrchestrationStep {
  step: string;
  skill?: string;
  prompt: string;
  gates: GateRule[];
  retry: number;
  wait_for_user?: boolean;
}

interface IntentDefinition {
  name: string;
  triggers: string[];
  chain: OrchestrationStep[];
}

interface OrchConfig {
  intents: IntentDefinition[];
}

interface ChainEditorProps {
  value: OrchConfig;
  onChange: (config: OrchConfig) => void;
  availableSkills: string[];
  disabled?: boolean;
}

// ─── Constants ───

const GATE_TYPES = [
  { type: 'test_pass', label: 'Test Pass', desc: 'Run tests and verify all pass' },
  { type: 'coverage', label: 'Coverage', desc: 'Check code coverage threshold' },
  { type: 'lint_pass', label: 'Lint', desc: 'Run linter with zero errors' },
  { type: 'typecheck_pass', label: 'TypeCheck', desc: 'TypeScript type check passes' },
  { type: 'docker_build_pass', label: 'Docker Build', desc: 'Docker image builds successfully' },
  { type: 'health_check', label: 'Health Check', desc: 'Service health endpoint responds' },
  { type: 'rollback_available', label: 'Rollback Ready', desc: 'Previous version is retained' },
  { type: 'step_timeout', label: 'Timeout', desc: 'Step time limit (seconds)' },
];

const INTENT_COLORS = [
  { bg: 'rgba(0,214,143,0.08)', border: 'rgba(0,214,143,0.25)', accent: 'var(--accent)' },
  { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', accent: '#3b82f6' },
  { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', accent: '#a855f7' },
  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', accent: '#f59e0b' },
  { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', accent: '#ef4444' },
  { bg: 'rgba(20,184,166,0.08)', border: 'rgba(20,184,166,0.25)', accent: '#14b8a6' },
];

// ─── Helpers ───

function emptyStep(): OrchestrationStep {
  return { step: '', prompt: '', gates: [], retry: 0 };
}

function emptyIntent(): IntentDefinition {
  return { name: '', triggers: [], chain: [emptyStep()] };
}

// ─── Component ───

export function ChainEditor({ value, onChange, availableSkills, disabled }: ChainEditorProps) {
  const intents = value?.intents || [];
  const [expandedIntent, setExpandedIntent] = useState<number | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null); // "{intentIdx}-{stepIdx}"
  const [newTrigger, setNewTrigger] = useState('');

  const updateIntents = useCallback((newIntents: IntentDefinition[]) => {
    onChange({ intents: newIntents });
  }, [onChange]);

  const updateIntent = useCallback((idx: number, updater: (intent: IntentDefinition) => IntentDefinition) => {
    const next = [...intents];
    next[idx] = updater({ ...next[idx] });
    updateIntents(next);
  }, [intents, updateIntents]);

  const addIntent = () => {
    const next = [...intents, emptyIntent()];
    updateIntents(next);
    setExpandedIntent(next.length - 1);
  };

  const removeIntent = (idx: number) => {
    const next = intents.filter((_, i) => i !== idx);
    updateIntents(next);
    if (expandedIntent === idx) setExpandedIntent(null);
    if (expandedIntent != null && expandedIntent > idx) setExpandedIntent(expandedIntent - 1);
  };

  const addTrigger = (idx: number) => {
    const val = newTrigger.trim();
    if (!val) return;
    updateIntent(idx, (intent) => {
      if (intent.triggers.includes(val)) return intent;
      return { ...intent, triggers: [...intent.triggers, val] };
    });
    setNewTrigger('');
  };

  const removeTrigger = (idx: number, triggerIdx: number) => {
    updateIntent(idx, (intent) => ({
      ...intent,
      triggers: intent.triggers.filter((_, i) => i !== triggerIdx),
    }));
  };

  const updateStep = (intentIdx: number, stepIdx: number, updater: (step: OrchestrationStep) => OrchestrationStep) => {
    updateIntent(intentIdx, (intent) => {
      const next = [...intent.chain];
      next[stepIdx] = updater({ ...next[stepIdx] });
      return { ...intent, chain: next };
    });
  };

  const addStep = (intentIdx: number) => {
    updateIntent(intentIdx, (intent) => ({
      ...intent,
      chain: [...intent.chain, emptyStep()],
    }));
  };

  const removeStep = (intentIdx: number, stepIdx: number) => {
    updateIntent(intentIdx, (intent) => ({
      ...intent,
      chain: intent.chain.filter((_, i) => i !== stepIdx),
    }));
  };

  const moveStep = (intentIdx: number, stepIdx: number, dir: -1 | 1) => {
    updateIntent(intentIdx, (intent) => {
      const chain = [...intent.chain];
      const newIdx = stepIdx + dir;
      if (newIdx < 0 || newIdx >= chain.length) return intent;
      [chain[stepIdx], chain[newIdx]] = [chain[newIdx], chain[stepIdx]];
      return { ...intent, chain };
    });
  };

  const toggleGate = (intentIdx: number, stepIdx: number, gateType: string) => {
    updateStep(intentIdx, stepIdx, (step) => {
      const has = step.gates.some((g) => g.type === gateType);
      return {
        ...step,
        gates: has
          ? step.gates.filter((g) => g.type !== gateType)
          : [...step.gates, { type: gateType }],
      };
    });
  };

  const stepKey = (intentIdx: number, stepIdx: number) => `${intentIdx}-${stepIdx}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {intents.map((intent, ii) => {
        const color = INTENT_COLORS[ii % INTENT_COLORS.length];
        const isExpanded = expandedIntent === ii;
        const isChainEmpty = intent.chain.length === 0 || (intent.chain.length === 1 && !intent.chain[0].step);

        return (
          <div
            key={ii}
            style={{
              background: color.bg,
              border: `1px solid ${color.border}`,
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
            }}
          >
            {/* Intent Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setExpandedIntent(isExpanded ? null : ii)}
            >
              <span style={{ fontSize: 14, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                ▸
              </span>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: color.accent, flexShrink: 0,
              }} />
              {intent.name ? (
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-0)' }}>{intent.name}</span>
              ) : (
                <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>Unnamed Intent</span>
              )}
              <span style={{
                fontSize: 10,
                color: 'var(--text-3)',
                background: 'var(--surface-2)',
                padding: '1px 8px',
                borderRadius: 99,
              }}>
                {intent.chain.length} step{intent.chain.length !== 1 ? 's' : ''}
                {isChainEmpty ? ' (PATH B)' : ''}
              </span>
              {intent.triggers.length > 0 && (
                <span style={{
                  fontSize: 10,
                  color: 'var(--text-3)',
                  background: 'var(--surface-2)',
                  padding: '1px 8px',
                  borderRadius: 99,
                }}>
                  {intent.triggers.length} trigger{intent.triggers.length !== 1 ? 's' : ''}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
                onClick={(e) => { e.stopPropagation(); removeIntent(ii); }}
                disabled={disabled}
                title="Remove intent"
              >
                ✕
              </button>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Intent Name */}
                <label className={styles.field} style={{ marginBottom: 0 }}>
                  <span className={styles.label}>Intent Name</span>
                  <input
                    className={styles.input}
                    value={intent.name}
                    onChange={(e) => updateIntent(ii, (it) => ({ ...it, name: e.target.value }))}
                    placeholder="e.g. Bug修复"
                    disabled={disabled}
                  />
                </label>

                {/* Triggers */}
                <div className={styles.field} style={{ marginBottom: 0 }}>
                  <span className={styles.label}>
                    Trigger Words
                    <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
                      (match user message to route into this chain)
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {intent.triggers.map((t, ti) => (
                      <span
                        key={ti}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 10px',
                          borderRadius: 99,
                          fontSize: 12,
                          background: color.accent,
                          color: '#fff',
                          fontWeight: 500,
                        }}
                      >
                        {t}
                        <span
                          style={{ cursor: 'pointer', opacity: 0.7, marginLeft: 2 }}
                          onClick={() => removeTrigger(ii, ti)}
                        >
                          ✕
                        </span>
                      </span>
                    ))}
                    <input
                      className={styles.input}
                      style={{ width: 120, padding: '4px 10px', fontSize: 12 }}
                      value={newTrigger}
                      onChange={(e) => setNewTrigger(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTrigger(ii); } }}
                      placeholder="Add trigger..."
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                      onClick={() => addTrigger(ii)}
                      disabled={disabled || !newTrigger.trim()}
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Chain Steps */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className={styles.label} style={{ margin: 0 }}>
                      Chain Steps
                      <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
                        (empty chain = PATH B: standard LLM with intent context)
                      </span>
                    </span>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`}
                      onClick={() => addStep(ii)}
                      disabled={disabled}
                    >
                      + Add Step
                    </button>
                  </div>

                  {intent.chain.length === 0 ? (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--r-md)',
                      background: 'var(--surface-2)',
                      fontSize: 12,
                      color: 'var(--text-3)',
                      textAlign: 'center',
                    }}>
                      No steps defined — this intent will use PATH B (standard LLM)
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {intent.chain.map((step, si) => {
                        const sk = stepKey(ii, si);
                        const isStepExpanded = expandedStep === sk;
                        const isFirst = si === 0;
                        const isLast = si === intent.chain.length - 1;

                        return (
                          <div key={si} style={{ display: 'flex', gap: 0 }}>
                            {/* Step connector column */}
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: 36,
                              flexShrink: 0,
                              paddingTop: 10,
                            }}>
                              {/* Top connector line */}
                              {!isFirst && (
                                <div style={{ width: 2, height: 8, background: color.border }} />
                              )}
                              {/* Step number circle */}
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  background: isStepExpanded ? color.accent : 'var(--surface-2)',
                                  border: `2px solid ${isStepExpanded ? color.accent : color.border}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: isStepExpanded ? '#fff' : 'var(--text-2)',
                                  flexShrink: 0,
                                }}
                              >
                                {si + 1}
                              </div>
                              {/* Bottom connector line */}
                              {!isLast && (
                                <div style={{ width: 2, flex: 1, minHeight: 8, background: color.border }} />
                              )}
                            </div>

                            {/* Step card */}
                            <div style={{
                              flex: 1,
                              marginBottom: isLast ? 0 : 8,
                              background: 'var(--surface-1)',
                              border: `1px solid ${isStepExpanded ? color.accent : 'var(--glass-border)'}`,
                              borderRadius: 'var(--r-md)',
                              overflow: 'hidden',
                            }}>
                              {/* Step header (always visible) */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                }}
                                onClick={() => setExpandedStep(isStepExpanded ? null : sk)}
                              >
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>
                                  {step.step || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Unnamed step</span>}
                                </span>
                                {step.skill && (
                                  <span style={{
                                    fontSize: 10, color: 'var(--accent-text)', background: 'rgba(0,214,143,0.08)',
                                    padding: '1px 6px', borderRadius: 99,
                                  }}>
                                    {step.skill}
                                  </span>
                                )}
                                {step.gates.length > 0 && (
                                  <span style={{
                                    fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)',
                                    padding: '1px 6px', borderRadius: 99,
                                  }}>
                                    {step.gates.length} gate{step.gates.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {step.retry > 0 && (
                                  <span style={{
                                    fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)',
                                    padding: '1px 6px', borderRadius: 99,
                                  }}>
                                    retry {step.retry}
                                  </span>
                                )}
                                <div style={{ flex: 1 }} />
                                {/* Move buttons */}
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                                  style={{ padding: '2px 6px', fontSize: 10 }}
                                  onClick={(e) => { e.stopPropagation(); moveStep(ii, si, -1); }}
                                  disabled={disabled || isFirst}
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                                  style={{ padding: '2px 6px', fontSize: 10 }}
                                  onClick={(e) => { e.stopPropagation(); moveStep(ii, si, 1); }}
                                  disabled={disabled || isLast}
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
                                  style={{ padding: '2px 6px', fontSize: 10 }}
                                  onClick={(e) => { e.stopPropagation(); removeStep(ii, si); }}
                                  disabled={disabled}
                                  title="Remove step"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Step detail (expandable) */}
                              {isStepExpanded && (
                                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <label className={styles.field} style={{ marginBottom: 0 }}>
                                    <span className={styles.label}>Step Name</span>
                                    <input
                                      className={styles.input}
                                      value={step.step}
                                      onChange={(e) => updateStep(ii, si, (s) => ({ ...s, step: e.target.value }))}
                                      placeholder="e.g. 测试验证"
                                      disabled={disabled}
                                    />
                                  </label>

                                  <label className={styles.field} style={{ marginBottom: 0 }}>
                                    <span className={styles.label}>
                                      Prompt Template
                                      <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
                                        Use {'{user_message}'} and {'{previous_output}'} as variables
                                      </span>
                                    </span>
                                    <textarea
                                      className={styles.textarea}
                                      value={step.prompt}
                                      onChange={(e) => updateStep(ii, si, (s) => ({ ...s, prompt: e.target.value }))}
                                      placeholder="Tell the LLM what to do in this step..."
                                      rows={4}
                                      spellCheck={false}
                                      disabled={disabled}
                                    />
                                  </label>

                                  <div style={{ display: 'flex', gap: 12 }}>
                                    {/* Skill selector */}
                                    <label className={styles.field} style={{ flex: 1, marginBottom: 0 }}>
                                      <span className={styles.label}>Skill (optional)</span>
                                      <select
                                        className={styles.input}
                                        value={step.skill || ''}
                                        onChange={(e) => updateStep(ii, si, (s) => ({ ...s, skill: e.target.value || undefined }))}
                                        disabled={disabled}
                                      >
                                        <option value="">— None —</option>
                                        {availableSkills.map((sk) => (
                                          <option key={sk} value={sk}>{sk}</option>
                                        ))}
                                      </select>
                                    </label>

                                    {/* Retry selector */}
                                    <label className={styles.field} style={{ width: 80, marginBottom: 0 }}>
                                      <span className={styles.label}>Retry</span>
                                      <select
                                        className={styles.input}
                                        value={step.retry}
                                        onChange={(e) => updateStep(ii, si, (s) => ({ ...s, retry: parseInt(e.target.value) }))}
                                        disabled={disabled}
                                      >
                                        {[0, 1, 2, 3].map((n) => (
                                          <option key={n} value={n}>{n}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>

                                  {/* Gates */}
                                  <div className={styles.field} style={{ marginBottom: 0 }}>
                                    <span className={styles.label}>Gates (quality checks)</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {GATE_TYPES.map((gt) => {
                                        const isActive = step.gates.some((g) => g.type === gt.type);
                                        return (
                                          <button
                                            key={gt.type}
                                            type="button"
                                            className={`${styles.btn} ${styles.btnSmall} ${isActive ? styles.btnAccent : styles.btnOutline}`}
                                            onClick={() => toggleGate(ii, si, gt.type)}
                                            disabled={disabled}
                                            title={gt.desc}
                                          >
                                            {isActive ? '✓ ' : ''}{gt.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Intent button */}
      <button
        type="button"
        className={`${styles.btn} ${styles.btnOutline}`}
        onClick={addIntent}
        disabled={disabled}
        style={{
          alignSelf: 'center',
          borderStyle: 'dashed',
          padding: '10px 24px',
          fontSize: 13,
        }}
      >
        + Add Intent
      </button>

      {/* Empty state */}
      {intents.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '20px 14px',
          color: 'var(--text-3)',
          fontSize: 12,
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-md)',
          border: '1px dashed var(--glass-border)',
        }}>
          No intents defined. Add at least one intent to enable orchestration routing.
          <br />
          Without intents, all messages go directly to the standard LLM (PATH C).
        </div>
      )}
    </div>
  );
}
