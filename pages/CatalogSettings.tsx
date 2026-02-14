import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Toaster } from 'react-hot-toast';
import {
    Settings,
    MessageSquare,
    Activity
} from 'lucide-react';
import { WhatsAppGroup, ProcessingLog, CatalogCategory } from '../types';
import GroupsTab from '../components/catalog/GroupsTab';
import LogsTab from '../components/catalog/LogsTab';
import CategoryManager from '../components/catalog/CategoryManager';

const CatalogSettings: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'groups' | 'logs'>('groups');

    // Data State
    const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
    const [logs, setLogs] = useState<ProcessingLog[]>([]);
    const [categories, setCategories] = useState<CatalogCategory[]>([]);

    // UI State
    const [showCategoryManager, setShowCategoryManager] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // Não ativa o loading global para atualizações em background, apenas se for a primeira carga ou se desejado
            // setLoading(true); 

            const [groupsRes, logsRes, categoriesRes] = await Promise.all([
                supabase.from('whatsapp_groups').select('*').order('created_at', { ascending: false }),
                supabase
                    .from('processing_logs')
                    .select(`
                        *,
                        whatsapp_groups (
                            name,
                            whatsapp_id
                        ),
                        processed_products (*)
                    `)
                    .order('processed_at', { ascending: false }),
                supabase.from('catalog_categories').select('*').order('name', { ascending: true })
            ]);

            if (groupsRes.data) setGroups(groupsRes.data);
            if (logsRes.data) setLogs(logsRes.data);
            if (categoriesRes.data) setCategories(categoriesRes.data);
        } catch (error: any) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto pb-20 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Toaster position="top-right" />

            {/* Header */}
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="bg-primary/10 p-2 rounded-lg text-primary">
                            <Settings className="w-8 h-8" />
                        </span>
                        Automação de Catálogos
                    </h2>
                    <p className="text-slate-500 text-sm">Configure grupos, categorias e acompanhe o processamento.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('groups')}
                    className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all ${activeTab === 'groups'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                >
                    <MessageSquare className="w-4 h-4" />
                    Grupos WhatsApp
                </button>

                <button
                    onClick={() => setActiveTab('logs')}
                    className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all ${activeTab === 'logs'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                >
                    <Activity className="w-4 h-4" />
                    Logs de Processamento
                </button>
            </div>

            {/* Content */}
            {activeTab === 'groups' ? (
                <GroupsTab
                    groups={groups}
                    onUpdate={fetchData}
                />
            ) : (
                <LogsTab
                    logs={logs}
                    categories={categories}
                    onUpdate={fetchData}
                    onManageCategories={() => setShowCategoryManager(true)}
                />
            )}

            {/* Category Manager Dialog */}
            <CategoryManager
                categories={categories}
                isOpen={showCategoryManager}
                onClose={() => setShowCategoryManager(false)}
                onUpdate={fetchData}
            />

        </div >
    );
};

export default CatalogSettings;
