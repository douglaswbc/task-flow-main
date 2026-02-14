import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
    Plus,
    X,
    Save,
    Edit,
    Trash2,
    Link as LinkIcon,
    Search
} from 'lucide-react';
import { CatalogCategory, ProcessingLog } from '../../types';
import { calculateFinalPrice } from '../../utils/catalogUtils';

interface CategoryManagerProps {
    categories: CatalogCategory[];
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
    initialOpenDialog?: boolean;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({
    categories,
    isOpen,
    onClose,
    onUpdate,
    initialOpenDialog = false
}) => {
    const [showCategoryDialog, setShowCategoryDialog] = useState(initialOpenDialog);
    const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null);
    const [categoryForm, setCategoryForm] = useState({
        name: '',
        multiplier: 1,
        discount_percentage: 0,
        log_id: '' // New field for DB linking
    });

    // States for Catalog Linking
    const [availableLogs, setAvailableLogs] = useState<ProcessingLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        if (showCategoryDialog) {
            fetchLogs();
        }
    }, [showCategoryDialog]);

    // Safe effect to update form when editing
    useEffect(() => {
        if (editingCategory) {
            setCategoryForm({
                name: editingCategory.name,
                multiplier: editingCategory.multiplier,
                discount_percentage: editingCategory.discount_percentage,
                log_id: editingCategory.log_id || ''
            });
        }
    }, [editingCategory]);

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const { data, error } = await supabase
                .from('processing_logs')
                .select('id, catalog_name, category')
                .order('processed_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setAvailableLogs(data || []);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoadingLogs(false);
        }
    };

    if (!isOpen && !showCategoryDialog) return null;

    const handleSaveCategory = async () => {
        try {
            if (!categoryForm.name.trim()) {
                toast.error('Nome da categoria é obrigatório');
                return;
            }

            if (categoryForm.multiplier <= 0) {
                toast.error('Multiplicador deve ser maior que zero');
                return;
            }

            if (categoryForm.discount_percentage < 0 || categoryForm.discount_percentage > 100) {
                toast.error('Desconto deve estar entre 0 e 100%');
                return;
            }

            // Prepare payload with explicit null validation for UUID
            const payload = {
                name: categoryForm.name,
                multiplier: categoryForm.multiplier,
                discount_percentage: categoryForm.discount_percentage,
                log_id: categoryForm.log_id || null // Ensure proper null handling for UUID
            };

            let categoryId = editingCategory?.id;

            if (editingCategory) {
                const { error } = await supabase
                    .from('catalog_categories')
                    .update(payload)
                    .eq('id', editingCategory.id);
                if (error) throw error;
                toast.success('Categoria atualizada com sucesso!');
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    toast.error('Usuário não autenticado');
                    return;
                }

                const { data, error } = await supabase
                    .from('catalog_categories')
                    .insert([{ ...payload, user_id: user.id }])
                    .select()
                    .single();

                if (error) throw error;
                categoryId = data.id;
                toast.success('Categoria criada e vinculada!');
            }

            // Also update the Processing Log to reflect this category name if linked
            // Note: This logic existed previously to apply the category to the log.
            // Even if we store the FK in category, updating the Log itself ensures bi-directional visibility in UI.
            if (categoryForm.log_id) {
                await updateLogWithCategory(categoryForm.log_id, categoryForm.name, categoryForm.multiplier, categoryForm.discount_percentage);
            }

            setShowCategoryDialog(false);
            setEditingCategory(null);
            setCategoryForm({ name: '', multiplier: 1, discount_percentage: 0, log_id: '' });
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao salvar categoria: ' + error.message);
        }
    };

    const updateLogWithCategory = async (logId: string, categoryName: string, multiplier: number, discount: number) => {
        // Fetch products for that log to update their prices
        const { data: products } = await supabase
            .from('processed_products')
            .select('*')
            .eq('log_id', logId);

        if (products && products.length > 0) {
            const updates = products.map(p => {
                const finalPrice = calculateFinalPrice(
                    p.price,
                    multiplier,
                    discount
                );

                return {
                    id: p.id,
                    multiplier: multiplier,
                    percentage: discount,
                    final_price: finalPrice
                };
            });

            for (const update of updates) {
                await supabase
                    .from('processed_products')
                    .update({
                        multiplier: update.multiplier,
                        percentage: update.percentage,
                        final_price: update.final_price
                    })
                    .eq('id', update.id);
            }

            // Update Log Total
            const newTotal = updates.reduce((sum, u) => sum + (u.final_price || 0), 0);

            await supabase
                .from('processing_logs')
                .update({
                    category: categoryName,
                    final_price: newTotal
                })
                .eq('id', logId);
        } else {
            // Just update log if no products yet
            await supabase
                .from('processing_logs')
                .update({ category: categoryName })
                .eq('id', logId);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
        try {
            const { error } = await supabase.from('catalog_categories').delete().eq('id', id);
            if (error) throw error;
            toast.success('Categoria excluída com sucesso!');
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao excluir categoria: ' + error.message);
        }
    };

    return (
        <>
            {/* Main Manager Dialog */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-2xl w-full space-y-6 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                Gerenciar Categorias
                            </h3>
                            <button
                                onClick={onClose}
                                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                setEditingCategory(null);
                                setCategoryForm({ name: '', multiplier: 1, discount_percentage: 0, log_id: '' });
                                setShowCategoryDialog(true);
                            }}
                            className="w-full shrink-0 px-4 py-3 bg-primary text-white rounded-xl hover:opacity-90 transition-all font-bold text-sm inline-flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Nova Categoria
                        </button>

                        {/* Scrollable List Container */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {categories.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500">
                                        Nenhuma categoria criada ainda.
                                    </div>
                                ) : (
                                    categories.map((category) => (
                                        <div
                                            key={category.id}
                                            className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-bold text-slate-900 dark:text-white">
                                                            {category.name}
                                                        </h4>
                                                        {category.log_id && (
                                                            <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                                <LinkIcon className="w-2.5 h-2.5" />
                                                                Vinculada
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-lg font-bold text-xs">
                                                            x{category.multiplier}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-bold text-xs">
                                                            -{category.discount_percentage}%
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-2">
                                                        Exemplo: R$ 100 → R$ {calculateFinalPrice(100, category.multiplier, category.discount_percentage).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingCategory(category);
                                                            // Form state is updated via useEffect
                                                            setShowCategoryDialog(true);
                                                        }}
                                                        className="p-2 bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-lg hover:opacity-80 transition-all"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCategory(category.id)}
                                                        className="p-2 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-lg hover:opacity-80 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Dialog (Quick Create/Edit) */}
            {showCategoryDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowCategoryDialog(false);
                                    setEditingCategory(null);
                                    setCategoryForm({ name: '', multiplier: 1, discount_percentage: 0, log_id: '' });
                                }}
                                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Catalog Link Selection */}
                            <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                                    <LinkIcon className="w-3 h-3" />
                                    Vincular a Catálogo (DB)
                                </label>
                                <select
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm truncate"
                                    value={categoryForm.log_id || ''}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, log_id: e.target.value })}
                                    disabled={loadingLogs}
                                >
                                    <option value="">-- Sem vínculo --</option>
                                    {availableLogs.map(log => (
                                        <option key={log.id} value={log.id}>
                                            {log.catalog_name} {editingCategory?.log_id === log.id ? '(Atual)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 ml-1 leading-tight">
                                    Salva o ID deste catálogo na categoria para referência futura.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Categoria</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                                    value={categoryForm.name}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                    placeholder="Ex: Fornecedor A"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Multiplicador</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                                    value={categoryForm.multiplier}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, multiplier: parseFloat(e.target.value) || 1 })}
                                    placeholder="Ex: 3"
                                />
                                <p className="text-xs text-slate-500 ml-1">Preço será multiplicado por este valor</p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Desconto (%)</label>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    max="100"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                                    value={categoryForm.discount_percentage}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                                    placeholder="Ex: 35"
                                />
                                <p className="text-xs text-slate-500 ml-1">Desconto aplicado após multiplicação</p>
                            </div>

                            {/* Preview da Fórmula */}
                            <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl">
                                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Fórmula:</p>
                                <p className="text-sm font-mono text-slate-900 dark:text-white">
                                    (Preço × {categoryForm.multiplier}) - {categoryForm.discount_percentage}%
                                </p>
                                <p className="text-xs text-slate-500 mt-2">
                                    Exemplo: R$ 100 → R$ {calculateFinalPrice(100, categoryForm.multiplier, categoryForm.discount_percentage).toFixed(2)}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowCategoryDialog(false);
                                    setEditingCategory(null);
                                    setCategoryForm({ name: '', multiplier: 1, discount_percentage: 0, log_id: '' });
                                }}
                                className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-bold text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveCategory}
                                className="flex-1 px-6 py-3 bg-primary text-white rounded-xl hover:opacity-90 transition-all font-bold text-sm inline-flex items-center justify-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CategoryManager;
