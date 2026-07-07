export interface WizardForm {
  // step 1
  name: string;
  templateId: string;
  glyph: string;
  hue: string;
  // step 2
  model: string;
  contextWindow: number;
  temperature: number;
  // step 3
  personaPreset: string;
  systemPrompt: string;
  // step 4
  skills: string[];
  mcpServers: string[];
  tools: string[];
  // step 5
  kbFolders: string[];
  // step 6
  visibility: "private" | "team" | "workspace" | "public";
  callableBy: string[];
  dispatcher: string[];
  // step 7
  testedRun: boolean;
  agreed: boolean;
}

export const EMPTY_FORM: WizardForm = {
  name: "",
  templateId: "",
  glyph: "新",
  hue: "amber",
  model: "claude-sonnet-4.6",
  contextWindow: 200000,
  temperature: 0.3,
  personaPreset: "",
  systemPrompt: "",
  skills: [],
  mcpServers: [],
  tools: [],
  kbFolders: [],
  visibility: "team",
  callableBy: [],
  dispatcher: [],
  testedRun: false,
  agreed: false,
};
