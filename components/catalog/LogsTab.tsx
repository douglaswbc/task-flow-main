import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
    Settings,
    Search,
    CheckCircle,
    XCircle,
    ChevronDown,
    ChevronRight,
    Package
} from 'lucide-react';
import { ProcessingLog, CatalogCategory } from '../../types';
import ProductManager from './ProductManager';

interface LogsTabProps {
    logs: ProcessingLog[];
    categories: CatalogCategory[];
    onUpdate: () => void;
    onManageCategories: () => void;
}

const LogsTab: React.FC<LogsTabProps> = ({
    logs,
    categories,
    onUpdate,
    onManageCategories
}) => {
    const [filters, setFilters] = useState({
        sourceType: 'all',
        category: 'all',
        status: 'all'
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

    // Product Manager State
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const [showProductManager, setShowProductManager] = useState(false);

    const itemsPerPage = 20;

    // Filter Logic
    const filteredLogs = logs.filter(log => {
        // Search Filter
        const matchesSearch =
            log.catalog_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (log.contact_name && log.contact_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.category && log.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.contact_jid && log.contact_jid.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        // Dropdown Filters
        if (filters.sourceType !== 'all' && log.source_type !== filters.sourceType) return false;
        if (filters.category !== 'all' && log.category !== filters.category) return false;
        if (filters.status !== 'all' && log.status !== filters.status) return false;

        return true;
    });

    // Pagination
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const toggleExpandPayload = (logId: string) => {
        setExpandedLogIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(logId)) {
                newSet.delete(logId);
            } else {
                newSet.add(logId);
            }
            return newSet;
        });
    };

    const handleOpenProductManager = (logId: string) => {
        setSelectedLogId(logId);
        setShowProductManager(true);
    }

    const handleProductManagerUpdate = async () => {
        onUpdate();
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Catálogos Recebidos</h3>

                <button
                    onClick={onManageCategories}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:opacity-90 transition-all font-bold text-sm"
                >
                    <Settings className="w-4 h-4" />
                    Gerenciar Categorias
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        placeholder="Buscar por catálogo, contato, categoria ou JID..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="w-full px-4 py-2.5 pl-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                    />
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                <div className="flex gap-2 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                    <select
                        value={filters.sourceType}
                        onChange={(e) => setFilters({ ...filters, sourceType: e.target.value })}
                        className="px-3 py-1.5 rounded-lg bg-transparent text-sm font-medium outline-none border-r border-slate-200 dark:border-slate-800 last:border-0"
                    >
                        <option value="all">Todas Origens</option>
                        <option value="individual">Individual</option>
                        <option value="group">Grupo</option>
                    </select>

                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="px-3 py-1.5 rounded-lg bg-transparent text-sm font-medium outline-none"
                    >
                        <option value="all">Todos Status</option>
                        <option value="pending">Pendente</option>
                        <option value="success">Sucesso</option>
                        <option value="error">Erro</option>
                    </select>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-950">
                            <tr>
                                <th className="px-6 py-4 text-left w-10"></th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Preview</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Catálogo</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Origem</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Contato/Grupo</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Data</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {paginatedLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                                        {logs.length === 0
                                            ? 'Nenhum catálogo recebido ainda.'
                                            : 'Nenhum resultado encontrado.'}
                                    </td>
                                </tr>
                            ) : (
                                paginatedLogs.map((log) => {
                                    const hasProducts = log.processed_products && log.processed_products.length > 0;
                                    const isExpanded = expandedLogIds.has(log.id);

                                    return (
                                        <React.Fragment key={log.id}>
                                            <tr className={`hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors ${isExpanded ? 'bg-slate-50 dark:bg-slate-950/30' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => toggleExpandPayload(log.id)}
                                                            className={`text-slate-400 hover:text-primary transition-colors ${hasProducts ? '' : 'opacity-50'}`}
                                                            disabled={!hasProducts && !isExpanded}
                                                        >
                                                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                                        </button>
                                                    </div>
                                                </td>
                                                {/* Preview do PDF */}
                                                <td className="px-6 py-4">
                                                    {log.file_url ? (
                                                        <div
                                                            onClick={() => window.open(log.file_url, '_blank')}
                                                            className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer hover:border-primary transition-colors group"
                                                        >
                                                            <iframe
                                                                src={log.file_url}
                                                                className="w-full h-full pointer-events-none scale-150 origin-top-left opacity-80 group-hover:opacity-100 transition-opacity"
                                                                title="PDF Preview"
                                                            />
                                                            <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                            <span className="text-xs text-slate-400">N/A</span>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Nome do Catálogo */}
                                                <td className="px-6 py-4">
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[200px]" title={log.catalog_name}>
                                                            {log.catalog_name}
                                                        </p>
                                                        {log.text_message && (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={log.text_message}>
                                                                {log.text_message}
                                                            </p>
                                                        )}
                                                        <button
                                                            onClick={() => handleOpenProductManager(log.id)}
                                                            className="text-xs flex items-center gap-1 text-primary hover:underline mt-1"
                                                        >
                                                            <Package className="w-3 h-3" />
                                                            {hasProducts ? 'Gerenciar Produtos' : 'Adicionar Produtos'}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Badge de Origem */}
                                                <td className="px-6 py-4">
                                                    <span className={`
                                                        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold
                                                        ${log.source_type === 'individual'
                                                            ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400'
                                                            : 'bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400'}
                                                    `}>
                                                        {log.source_type === 'individual' ? '👤' : '👥'}
                                                        {log.source_type === 'individual' ? 'Individual' : 'Grupo'}
                                                    </span>
                                                </td>

                                                {/* Contato/Grupo */}
                                                <td className="px-6 py-4 text-sm text-slate-900 dark:text-white truncate max-w-[150px]">
                                                    {log.source_type === 'group' && log.whatsapp_groups
                                                        ? log.whatsapp_groups.name
                                                        : log.contact_name || '-'}
                                                </td>

                                                {/* Status */}
                                                <td className="px-6 py-4">
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${log.status === 'success'
                                                            ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                                            : log.status === 'error'
                                                                ? 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                                                                : 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400'
                                                            }`}
                                                    >
                                                        {log.status === 'success' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                        {log.status === 'success' ? 'Sucesso' : log.status === 'error' ? 'Erro' : 'Pendente'}
                                                    </span>
                                                </td>

                                                {/* Data */}
                                                <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">
                                                    {new Date(log.processed_at).toLocaleString('pt-BR', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </td>
                                            </tr>

                                            {/* Nested Product Table */}
                                            {isExpanded && hasProducts && log.processed_products && (
                                                <tr className="bg-slate-50/50 dark:bg-slate-950/20">
                                                    <td colSpan={7} className="px-6 pb-6 pt-0">
                                                        <div className="ml-10 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                                                                    <Package className="w-4 h-4 text-primary" />
                                                                    Produtos Extraídos ({log.processed_products.length})
                                                                </div>
                                                                <button
                                                                    onClick={() => handleOpenProductManager(log.id)}
                                                                    className="text-xs text-primary hover:underline font-bold"
                                                                >
                                                                    Editar Produtos
                                                                </button>
                                                            </div>
                                                            <table className="w-full text-sm">
                                                                <thead className="bg-slate-50 dark:bg-slate-950">
                                                                    <tr>
                                                                        <th className="px-4 py-2 text-left text-xs font-bold text-slate-500">Produto</th>
                                                                        <th className="px-4 py-2 text-left text-xs font-bold text-slate-500">SKU</th>
                                                                        <th className="px-4 py-2 text-right text-xs font-bold text-slate-500">Preço Original</th>
                                                                        <th className="px-4 py-2 text-center text-xs font-bold text-slate-500">Mult.</th>
                                                                        <th className="px-4 py-2 text-right text-xs font-bold text-slate-500">Preço Final</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                                    {log.processed_products.map((product) => (
                                                                        <tr key={product.id}>
                                                                            <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">
                                                                                {product.name}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-slate-500 font-mono text-xs">
                                                                                {product.sku || '-'}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-right text-slate-600">
                                                                                R$ {product.price.toFixed(2)}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-center text-xs text-slate-600 font-bold">
                                                                                {product.multiplier ? `${product.multiplier}x` : '-'}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-right font-bold text-emerald-600">
                                                                                R$ {(product.final_price || product.price).toFixed(2)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                            Página {currentPage} de {totalPages} • {filteredLogs.length} registro(s)
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Primeira
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Próxima
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Última
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Product Manager Dialog */}
            {selectedLogId && (
                <ProductManager
                    log={logs.find(l => l.id === selectedLogId)!}
                    categories={categories}
                    isOpen={showProductManager}
                    onClose={() => {
                        setShowProductManager(false);
                        setSelectedLogId(null);
                    }}
                    onUpdate={handleProductManagerUpdate}
                    initialProducts={logs.find(l => l.id === selectedLogId)?.processed_products}
                />
            )}
        </div>
    );
};

export default LogsTab;
