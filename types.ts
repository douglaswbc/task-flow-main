
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

export interface Notification {
  id: string;
  type: 'task_due' | 'task_failed' | 'system' | 'reminder';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  task_id?: string;
  automation_id?: string;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
  whatsapp_id: string;
  is_active: boolean;
  instance_name?: string | null;
  created_at: string;
}

export interface CatalogConfig {
  id: string;
  category_name: string;
  drive_folder_id: string | null;
  markup_multiplier: number;
  discount_percentage: number;
  created_at: string;
}

export interface ProcessingLog {
  id: string;
  catalog_name: string;
  category: string | null;
  status: 'success' | 'error' | 'pending';
  original_price: number | null;
  final_price: number | null;
  processed_at: string;
  whatsapp_group_id: string | null;
  file_url: string | null;
  text_message: string | null;
  source_type: 'individual' | 'group';
  contact_name: string | null;
  contact_jid: string | null;
  source_instance: string | null;
  whatsapp_groups?: {
    name: string;
    whatsapp_id: string;
  };
  processed_products?: ProcessedProduct[];
}

export interface ProcessedProduct {
  id: string;
  log_id: string;
  name: string;
  price: number;
  sku: string | null;
  percentage: number | null;
  multiplier: number | null;
  final_price: number | null;
  created_at: string;
}

export interface WhatsAppInstance {
  id: string;
  profile_id: string;
  instance_name: string;
  token?: string;
  connection_status: 'open' | 'close' | 'connecting';
  phone_number?: string;
  profile_pic_url?: string;
  qr_code?: string;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogCategory {
  id: string;
  user_id: string;
  name: string;
  multiplier: number;
  discount_percentage: number;
  log_id?: string | null; // Added FK to processing_logs
  created_at: string;
}
