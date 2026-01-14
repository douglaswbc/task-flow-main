
export enum TaskStatus {
  PENDING = 'PENDENTE',
  IN_PROGRESS = 'EM ANDAMENTO',
  COMPLETED = 'CONCLUÍDO',
  BACKLOG = 'BACKLOG',
}

export enum RecurrenceType {
  DAILY = 'DIÁRIO',
  WEEKLY = 'SEMANAL',
  MONTHLY = 'MENSAL',
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  creationDate: string;
  origin: 'Manual' | 'Recorrente';
  isHighPriority?: boolean;
}

export interface Automation {
  id: string;
  name: string;
  schedule: string;
  nextRun: string;
  status: 'Ativo' | 'Pausado';
  type: string;
}

export interface LogEntry {
  id: string;
  name: string;
  dateTime: string;
  status: 'Sucesso' | 'Erro';
}
