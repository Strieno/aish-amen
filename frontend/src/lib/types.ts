export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  energy: 'low' | 'medium' | 'high';
  est_minutes?: number | null;
  due_date?: string | null;
  project_id?: string | null;
  course_id?: string | null;
  tags: string[];
  status: 'inbox' | 'planned' | 'in-progress' | 'waiting' | 'done' | 'cancelled';
  recurring_rule?: string | null;
  dependencies: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  project_name?: string;
  course_name?: string;
}

export interface Project {
  id: string;
  name: string;
  goal_id?: string | null;
  workspace?: string | null;
  notes?: string;
  open_tasks?: number;
}

export interface Goal {
  id: string;
  title: string;
  life_area?: string | null;
  target_date?: string | null;
  status: string;
  progress: number;
  notes?: string;
  milestones_done?: number;
  milestones_total?: number;
  projects?: number;
  milestones: Milestone[];
}

export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  done: boolean;
  due_date?: string | null;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  entry_date: string;
  tags: string[];
  mood?: string | null;
  ai_access: boolean;
  ai_summary?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  category?: string;
  location?: string | null;
  notes?: string;
  reminders: number[];
}

export interface Checkin {
  id: string;
  entry_date: string;
  energy?: number | null;
  stress?: number | null;
  sleep_hours?: number | null;
  concern?: string;
  success?: string;
}

export interface Course {
  id: string;
  name: string;
  code?: string | null;
  credit_hours: number;
  instructor?: string | null;
  semester?: string | null;
  target_grade?: string | null;
  notes?: string;
  color?: string | null;
  topics?: CourseTopic[];
  exams?: Exam[];
  tasks?: Task[];
  topics_count?: number;
  topics_done?: number;
  open_tasks?: number;
  upcoming_exams?: number;
}

export interface CourseTopic {
  id: string;
  course_id: string;
  title: string;
  notes?: string;
  done: boolean;
}

export interface Exam {
  id: string;
  course_id: string;
  title: string;
  exam_type?: string;
  exam_date?: string | null;
  weight?: number | null;
  grade?: number | null;
  notes?: string;
  course_name?: string;
  color?: string | null;
}

export interface WorkShift {
  id: string;
  shift_start: string;
  shift_end?: string | null;
  role?: string | null;
  notes?: string;
}

export interface WorkNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SafePlan {
  id: string;
  name: string;
  trigger: string;
  signs: string;
  immediate_actions: string[];
  not_to_do: string[];
  resources: string[];
  reminders: string[];
  audio_scene?: string | null;
  ai_instructions?: string;
}

export interface Memory {
  id: string;
  content: string;
  type: string;
  importance: number;
  source?: string;
  source_type?: string | null;
  source_id?: string | null;
  confidence: number;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  ai_access: boolean;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  name: string;
  color?: string | null;
  count?: number;
}

export interface ConversationExport {
  app: string;
  type: 'conversation';
  version: number;
  conversation: Conversation;
  messages: { role: string; content: string; model?: string; created_at: string }[];
}

export interface EntityLink {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship_type: string;
  confidence: number;
  created_by?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  source_title?: string;
  target_title?: string;
}

export interface LinkSuggestion {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship_type: string;
  confidence: number;
  reason?: string;
  status: string;
  source_title?: string;
  target_title?: string;
}

export interface RelatedEntity {
  link_id: string;
  type: string;
  id: string;
  title: string;
  relationship_type: string;
  confidence: number;
  created_by?: string;
  direction: 'in' | 'out';
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  ts: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  type: string;
  entityId: string;
  title: string;
  sub?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  confidence: number;
  created_by?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center?: string | null;
}

export interface SearchGroup {
  type: string;
  label: string;
  items: { id: string; title: string; sub?: string }[];
}

export interface SearchResults {
  groups: SearchGroup[];
  total: number;
}

export interface AiProposal {
  type: 'task' | 'focus' | 'goal' | 'milestone' | 'journal' | 'exam' | 'work_note' | 'memory' | 'safe_action';
  title: string;
  reason?: string;
  data: Record<string, unknown>;
}

export interface SmartContextData {
  page: string;
  focus: { type: string; id: string; title: string } | null;
  related: RelatedEntity[];
  memories: { id: string; title: string; sub?: string }[];
  tasks: { id: string; title: string; sub?: string }[];
  goals: { id: string; title: string; sub?: string }[];
  deadlines: { type: string; id: string; title: string; sub?: string }[];
  conversations: { id: string; title: string; sub?: string }[];
  activity: { id: string; title: string; sub?: string }[];
  linkSuggestions: { id: string; title: string; sub?: string }[];
}

export interface ContextItem {
  type: string;
  id: string;
  title: string;
  why?: string;
  pinned?: boolean;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documents: DocumentItem[];
}

export interface DocumentItem {
  id: string;
  kb_id: string;
  filename: string;
  path: string;
  hash: string;
  status: string;
  page_count?: number;
  chunks?: number;
  created_at: string;
}

export interface RagResult {
  chunk_id: string;
  content: string;
  document_id: string;
  filename: string;
  kb_id: string;
  page: number;
}

export interface AudioFile {
  id: string;
  title: string;
  category: string;
  duration?: number | null;
  tags: string[];
  favorite: boolean;
  volume: number;
  loop_enabled: boolean;
  fade_in?: number;
  fade_out?: number;
  notes?: string;
  url: string;
}

export interface SoundScene {
  id: string;
  name: string;
  tracks: AudioTrack[];
  tts_voice?: string | null;
  volume: number;
  timer_minutes?: number | null;
  theme?: string | null;
}

export interface AudioTrack {
  fileId?: string;
  title?: string;
  url?: string;
  volume: number;
  loop?: boolean;
}

export interface AudioPreset {
  id: string;
  name: string;
  tracks: AudioTrack[];
}

export interface Conversation {
  id: string;
  title: string;
  assistant_id?: string | null;
  provider_id?: string | null;
  model?: string | null;
  folder?: string | null;
  pinned: boolean;
  tags: string[];
  mode?: string;
  context?: ContextItem[];
  assistant_name?: string;
  message_count?: number;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  parent_message_id?: string | null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: string | null;
  provider?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  generation_ms?: number | null;
  metadata?: { contextUsed?: ContextUsed; fallback?: boolean; stats?: unknown };
  created_at: string;
}

export interface ContextUsed {
  profile?: boolean;
  memories?: number;
  tasks?: number;
  schedule?: number;
  knowledge?: number;
  safePlan?: boolean;
  historyMessages?: number;
}

export interface Assistant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  system_prompt?: string | null;
  model?: string | null;
  provider_id?: string | null;
  temperature: number;
  context_limit?: number;
  memory_permissions: Record<string, boolean>;
  tool_permissions: string[];
  voice?: string | null;
  response_style?: string;
  knowledge_base_ids: string[];
  is_default: boolean;
}

export interface Provider {
  id: string;
  type: 'ollama' | 'openai-compatible' | 'mock';
  name: string;
  base_url?: string | null;
  embedding_model?: string | null;
  timeout_ms?: number;
  is_primary: boolean;
  has_api_key?: boolean;
}

export interface AiModel {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  context_limit?: number | null;
  capabilities: string[];
  last_seen?: string | null;
}

export interface FocusSession {
  id: string;
  started_at: string;
  ended_at?: string | null;
  minutes: number;
  task_id?: string | null;
  completed: boolean;
  task_title?: string | null;
}

export interface TodayData {
  today: string;
  now: string;
  tasks: Task[];
  schedule: CalendarEvent[];
  checkin: Checkin | null;
  stats: { doneToday: number; focusMinutesToday: number; openTotal: number };
  safe: { level: 'stable' | 'slightly-overloaded' | 'overloaded'; load: number };
  nextEvent: { title: string; start: string } | null;
  intelligence?: {
    study: { exams: { id: string; title: string; exam_date: string; course: string }[]; courses: { id: string; name: string }[] };
    goals: { id: string; title: string; progress: number }[];
    connections: { id: string; source_type: string; source_id: string; target_type: string; target_id: string; relationship_type: string; created_by: string }[];
    resume: { conversation: { id: string; title: string } | null; task: { id: string; title: string } | null; journal: { id: string; title: string; entry_date: string } | null };
    pendingLinks?: { id: string; source_title?: string; target_title?: string; source_type: string; target_type: string; reason?: string; confidence: number }[];
  };
}

export interface Insights {
  avgFocusMinutes: number;
  tasksCompleted: number;
  studyMinutesToday: number;
  postponedTasks: { title: string; due_date: string }[];
  productiveHour: string | null;
  sleepStudy: { sleep: number | null; sessions: number }[];
}

export interface Settings {
  [key: string]: unknown;
}
