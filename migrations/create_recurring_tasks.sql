-- Migration: Create recurring_tasks table
-- Created: 2026-02-14
-- Description: Creates the recurring_tasks table for managing scheduled workflow automations

-- Create recurring_tasks table
CREATE TABLE IF NOT EXISTS public.recurring_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  description text,
  type text CHECK (type IN ('daily', 'weekly', 'monthly', 'DIÁRIO', 'SEMANAL', 'MENSAL')) DEFAULT 'DIÁRIO',
  schedule_time time NOT NULL,
  responsible_id text,
  deadline_relative integer DEFAULT 0,
  checklist jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  next_run timestamp with time zone,
  last_run timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  team text,
  days_of_week integer[]
);

-- Enable RLS
ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own recurring tasks" 
  ON public.recurring_tasks
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create recurring tasks" 
  ON public.recurring_tasks
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their recurring tasks" 
  ON public.recurring_tasks
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their recurring tasks" 
  ON public.recurring_tasks
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_recurring_tasks_user_id ON public.recurring_tasks(user_id);
CREATE INDEX idx_recurring_tasks_created_at ON public.recurring_tasks(created_at DESC);
