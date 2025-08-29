export interface ProblemInfo {
  platform: 'leetcode' | 'gfg';
  problemId: string;
  problemTitle: string;
  difficulty: string;
  url: string;
}

export interface SessionEvent {
  type: 'ProblemDetected' | 'ProblemSessionStarted' | 'ProblemProgress' | 'ProblemSubmitted' | 'ProblemSessionEnded';
  timestamp: number;
  sessionId: string;
  problemInfo: ProblemInfo;
  metadata?: Record<string, any>;
}

export interface SessionData {
  sessionId: string;
  problemInfo: ProblemInfo;
  startTime: number;
  endTime?: number;
  activeDuration: number;
  totalDuration: number;
  lastActivity: number;
  isActive: boolean;
  isFocused: boolean;
  events: SessionEvent[];
  codeChanges: number;
  runAttempts: number;
  submitAttempts: number;
  lastSubmissionResult?: string;
}

export interface ActivityData {
  type: 'codeEdit' | 'runCode' | 'submit' | 'focus' | 'blur' | 'idle' | 'active';
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface IdleTracker {
  lastActivity: number;
  idleThreshold: number;
  isIdle: boolean;
  idleCheckInterval?: NodeJS.Timeout;
}