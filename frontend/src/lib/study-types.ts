// Study OS — shared frontend types (mirror the server API shapes).

export interface Topic {
  id: string;
  course_id: string;
  title: string;
  notes?: string;
  done?: number;
  mastery?: number;
  difficulty?: string;
  last_reviewed?: string | null;
  review_count?: number;
}

export interface StudySession {
  id: string;
  course_id?: string | null;
  topic_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  minutes: number;
  type?: string;
  difficulty_felt?: string | null;
  understanding?: number | null;
  notes?: string;
  course_name?: string | null;
  topic_title?: string | null;
}

export interface StudyNote {
  id: string;
  course_id?: string | null;
  topic_id?: string | null;
  title: string;
  content?: string;
  tags?: string[];
  updated_at?: string;
}

export interface Flashcard {
  id: string;
  course_id?: string | null;
  topic_id?: string | null;
  front: string;
  back: string;
  difficulty?: string;
  ease?: number;
  interval_days?: number;
  reps?: number;
  lapses?: number;
  due_date?: string | null;
  last_reviewed?: string | null;
}

export interface Mistake {
  id: string;
  course_id?: string | null;
  topic_id?: string | null;
  category?: string;
  question: string;
  user_answer?: string;
  correct_answer?: string;
  times?: number;
  last_seen?: string;
  resolved?: number;
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
  readiness?: { ready: number; daysLeft: number | null; strong: string[]; weak: string[]; recommendedMinutes: number | null };
}

export interface CourseSummary {
  id: string;
  name: string;
  code?: string | null;
  credit_hours?: number;
  instructor?: string | null;
  semester?: string | null;
  target_grade?: string | null;
  topics_count?: number;
  topics_done?: number;
  mastered_count?: number;
  weak_count?: number;
  mastery_avg?: number;
  mastery_state?: string;
  study_hours?: number;
  last_session?: string | null;
  open_tasks?: number;
  upcoming_exams?: number;
  next_exam?: string | null;
  next_exam_date?: string | null;
}

export interface CourseDetail extends CourseSummary {
  mastery_avg: number;
  topics: Topic[];
  exams: Exam[];
  notes: StudyNote[];
  flashcards: Flashcard[];
  sessions: StudySession[];
  mistakes: Mistake[];
}

export interface PlanItem {
  courseId?: string | null;
  courseName?: string;
  topicId?: string | null;
  title: string;
  minutes: number;
  priority?: string;
  reason?: string;
}

export interface Recommendation {
  topicId: string;
  title: string;
  courseId: string;
  courseName: string;
  mastery: number;
  state: string;
  score: number;
  reasons: string[];
}

export interface Momentum {
  level: string;
  trend: string;
  weekMinutes: number;
  previousWeekMinutes: number;
  streak: number;
  openAcademic: number;
  doneAcademic7: number;
  explanation: string;
}

export interface StudyDashboard {
  coursesCount: number;
  nextExam: Exam | null;
  weekMinutes: number;
  previousWeekMinutes: number;
  weeklyProgress: number;
  streak: number;
  momentum: Momentum;
  plan: { items: PlanItem[]; totalMinutes: number };
  recommendations: Recommendation[];
  weakAreas: { id: string; title: string; mastery: number; course_name: string }[];
  examReadiness: { ready: number; daysLeft: number | null; strong: string[]; weak: string[]; recommendedMinutes: number | null } | null;
  dueFlashcards: number;
  recommendedToday: number;
}

export interface AnalyticsData {
  weekly: { date: string; minutes: number }[];
  subjectDistribution: { courseId: string; courseName: string; minutes: number }[];
  accuracyTrend: { date: string; accuracy: number | null; attempts: number }[];
  masteryTrend: { date: string; avg: number | null; topics: number }[];
  heatmap: { date: string; total: number; courses: { course: string; minutes: number }[] }[];
  weak: { id: string; title: string; mastery: number; course_name: string }[];
  strong: { id: string; title: string; mastery: number; course_name: string }[];
  consistency: number;
  totalTopics: number;
  masteredTopics: number;
  focusAvg: number;
  mistakesAnalysis: string | null;
}

/** Keep study screens resilient to partial cloud rows and older cached data. */
export function normalizeCourseDetail(value: CourseDetail): CourseDetail {
  const topics = Array.isArray(value?.topics) ? value.topics : [];
  return {
    ...value,
    mastery_avg: Number(value?.mastery_avg || 0),
    topics,
    exams: Array.isArray(value?.exams) ? value.exams : [],
    notes: Array.isArray(value?.notes) ? value.notes : [],
    flashcards: Array.isArray(value?.flashcards) ? value.flashcards : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
    mistakes: Array.isArray(value?.mistakes) ? value.mistakes : [],
    topics_count: Number(value?.topics_count ?? topics.length),
    topics_done: Number(value?.topics_done ?? topics.filter((topic) => Boolean(topic.done)).length),
  };
}

export function normalizeAnalyticsData(value: AnalyticsData): AnalyticsData {
  return {
    ...value,
    weekly: Array.isArray(value?.weekly) ? value.weekly : [],
    subjectDistribution: Array.isArray(value?.subjectDistribution) ? value.subjectDistribution : [],
    accuracyTrend: Array.isArray(value?.accuracyTrend) ? value.accuracyTrend : [],
    masteryTrend: Array.isArray(value?.masteryTrend) ? value.masteryTrend : [],
    heatmap: Array.isArray(value?.heatmap) ? value.heatmap : [],
    weak: Array.isArray(value?.weak) ? value.weak : [],
    strong: Array.isArray(value?.strong) ? value.strong : [],
    consistency: Number(value?.consistency || 0),
    totalTopics: Number(value?.totalTopics || 0),
    masteredTopics: Number(value?.masteredTopics || 0),
    focusAvg: Number(value?.focusAvg || 0),
    mistakesAnalysis: value?.mistakesAnalysis || null,
  };
}
