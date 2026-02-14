import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
    X,
    Plus,
    Trash2,
    DollarSign,
    Percent,
    Package,
    Tag,
    Calculator,
    Edit2,
    Save
} from 'lucide-react';
import { ProcessedProduct, CatalogCategory, ProcessingLog } from '../../types';
import { calculateFinalPrice } from '../../utils/catalogUtils';

interface ProductManagerProps {
    log: ProcessingLog;
    categories: CatalogCategory[];
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
    initialProducts?: ProcessedProduct[];
}

const ProductManager: React.FC<ProductManagerProps> = ({
    log,
    categories,
    isOpen,
    onClose,
    onUpdate,
    initialProducts = []
}) => {
    const [products, setProducts] = useState<ProcessedProduct[]>(initialProducts);
    const [loading, setLoading] = useState(false);

    // Form State
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        price: '',
        percentage: '', // Now represents Discount Percentage
        multiplier: ''
    });

    // Category State
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>(log.category || '');

    useEffect(() => {
        if (isOpen) {
            fetchProducts();
            setSelectedCategoryName(log.category || '');
        }
    }, [isOpen, log]);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('processed_products')
                .select('*')
                .eq('log_id', log.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setProducts(data || []);
        } catch (error: any) {
            toast.error('Erro ao carregar produtos: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', sku: '', price: '', percentage: '', multiplier: '' });
        setEditingProductId(null);
    };

    const handleEditProduct = (product: ProcessedProduct) => {
        setEditingProductId(product.id);
        setFormData({
            name: product.name,
            sku: product.sku || '',
            price: product.price.toString(),
            percentage: product.percentage ? product.percentage.toString() : '',
            multiplier: product.multiplier ? product.multiplier.toString() : ''
        });
    };

    // Auto-fill form fields when Category changes (only if not editing a product)
    useEffect(() => {
        if (!editingProductId && selectedCategoryName) {
            const category = categories.find(c => c.name === selectedCategoryName);
            if (category) {
                setFormData(prev => ({
                    ...prev,
                    multiplier: category.multiplier.toString(),
                    percentage: category.discount_percentage.toString()
                }));
            }
        }
    }, [selectedCategoryName, categories, editingProductId]);

    const handleAssignCategory = async (categoryName: string) => {
        setLoading(true);
        try {
            const category = categories.find(c => c.name === categoryName);

            // Apply category rules to ALL products in this log
            const updates = products.map(p => {
                let multiplier = p.multiplier;
                let percentage = p.percentage;

                if (category) {
                    multiplier = category.multiplier;
                    percentage = category.discount_percentage;
                } else if (categoryName === "") {
                    // Reset to defaults if clearing category
                    multiplier = 1;
                    percentage = 0;
                }

                const finalPrice = calculateFinalPrice(
                    p.price,
                    multiplier || 1,
                    percentage || 0
                );

                return {
                    id: p.id,
                    final_price: finalPrice,
                    multiplier: multiplier,
                    percentage: percentage
                };
            });

            // Update products in DB
            for (const update of updates) {
                await supabase
                    .from('processed_products')
                    .update({
                        final_price: update.final_price,
                        multiplier: update.multiplier,
                        percentage: update.percentage
                    })
                    .eq('id', update.id);
            }

            // Update local state
            setProducts(prev => prev.map(p => {
                const update = updates.find(u => u.id === p.id);
                return update ? { ...p, ...update } : p;
            }));

            // Calc new total
            const newTotal = updates.reduce((sum, u) => sum + (u.final_price || 0), 0);

            // Update Log in DB
            const { error } = await supabase
                .from('processing_logs')
                .update({
                    category: categoryName || null,
                    final_price: newTotal
                })
                .eq('id', log.id);

            if (error) throw error;

            toast.success('Categoria aplicada e produtos atualizados!');
            setSelectedCategoryName(categoryName);
            setIsEditingCategory(false);
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao atualizar categoria: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProduct = async () => {
        if (!formData.name || !formData.price) {
            toast.error('Nome e preço são obrigatórios');
            return;
        }

        const price = parseFloat(formData.price.replace(',', '.'));

        // Use parsed values from form, or default to 1/0 if empty/invalid
        // Using explicit form values ensures we save what the user sees
        let multiplier = formData.multiplier ? parseFloat(formData.multiplier.replace(',', '.')) : 1;
        let percentage = formData.percentage ? parseFloat(formData.percentage.replace(',', '.')) : 0;

        if (isNaN(price)) {
            toast.error('Preço inválido');
            return;
        }

        const finalPrice = calculateFinalPrice(price, multiplier, percentage);

        setLoading(true);
        try {
            const productData = {
                log_id: log.id,
                name: formData.name,
                sku: formData.sku,
                price: price,
                percentage: percentage,
                multiplier: multiplier,
                final_price: finalPrice
            };

            if (editingProductId) {
                // Update
                const { error } = await supabase
                    .from('processed_products')
                    .update(productData)
                    .eq('id', editingProductId);
                if (error) throw error;
                toast.success('Produto atualizado!');
            } else {
                // Insert
                const { error } = await supabase
                    .from('processed_products')
                    .insert(productData);
                if (error) throw error;
                toast.success('Produto adicionado!');
            }

            resetForm();
            // Re-apply defaults if keeping category selected
            if (selectedCategoryName) {
                const category = categories.find(c => c.name === selectedCategoryName);
                if (category) {
                    setFormData(prev => ({
                        ...prev,
                        multiplier: category.multiplier.toString(),
                        percentage: category.discount_percentage.toString()
                    }));
                }
            }

            fetchProducts();
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao salvar produto: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover este produto?')) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('processed_products')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Produto removido!');
            fetchProducts();
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao remover produto: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const currentCategory = categories.find(c => c.name === selectedCategoryName);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Package className="w-6 h-6 text-primary" />
                            Gerenciar Produtos
                        </h3>
                        {log.catalog_name && (
                            <p className="text-xs text-slate-500">{log.catalog_name}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Category Selection Bar */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
                    <div className="flex items-center gap-2 text-slate-500">
                        <Tag className="w-4 h-4" />
                        <span className="text-sm font-medium">Categoria do Catálogo:</span>
                    </div>

                    {isEditingCategory ? (
                        <div className="flex items-center gap-2 flex-1 max-w-md">
                            <select
                                value={selectedCategoryName}
                                onChange={(e) => handleAssignCategory(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-primary/20"
                                autoFocus
                                disabled={loading}
                            >
                                <option value="">Sem categoria (Usar manual)</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.name}>
                                        {cat.name} (x{cat.multiplier} | -{cat.discount_percentage}%)
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => setIsEditingCategory(false)}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div
                            onClick={() => setIsEditingCategory(true)}
                            className={`
                                cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border
                                ${currentCategory
                                    ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                                    : 'bg-white text-slate-500 border-dashed border-slate-300 hover:border-primary hover:text-primary dark:bg-slate-900 dark:border-slate-700'}
                            `}
                        >
                            {currentCategory ? (
                                <>
                                    <span>{currentCategory.name}</span>
                                    <span className="flex items-center gap-1 ml-2">
                                        <span className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded text-xs">
                                            x{currentCategory.multiplier}
                                        </span>
                                        <span className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded text-xs text-red-500">
                                            -{currentCategory.discount_percentage}%
                                        </span>
                                    </span>
                                </>
                            ) : (
                                <span>+ Atribuir Categoria</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Add/Edit Form */}
                    <div className={`p-5 rounded-xl border space-y-4 transition-colors ${editingProductId ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50' : 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                            <h4 className={`font-semibold text-sm flex items-center gap-2 ${editingProductId ? 'text-amber-700 dark:text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                {editingProductId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                {editingProductId ? 'Editar Produto' : 'Adicionar Novo Produto'}
                            </h4>
                            {editingProductId && (
                                <button onClick={resetForm} className="text-xs text-slate-500 hover:underline">
                                    Cancelar Edição
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            {/* Row 1: Identification */}
                            <div className="md:col-span-8">
                                <input
                                    type="text"
                                    placeholder="Nome do Produto"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-primary bg-white dark:bg-slate-900"
                                />
                            </div>
                            <div className="md:col-span-4">
                                <input
                                    type="text"
                                    placeholder="SKU"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-primary bg-white dark:bg-slate-900"
                                />
                            </div>

                            {/* Row 2: Pricing Logic - 3 Cols Equal */}
                            <div className="md:col-span-4 relative">
                                <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 mb-0.5 block">Preço Original</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        className="w-full pl-7 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-primary bg-white dark:bg-slate-900"
                                    />
                                    <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                </div>
                            </div>

                            <div className="md:col-span-4 relative">
                                <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 mb-0.5 block">Multiplicador</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        placeholder="1.0"
                                        value={formData.multiplier}
                                        onChange={(e) => setFormData({ ...formData, multiplier: e.target.value })}
                                        className="w-full pl-7 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-primary bg-white dark:bg-slate-900 font-medium text-blue-600 dark:text-blue-400"
                                    />
                                    <Calculator className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                </div>
                            </div>

                            <div className="md:col-span-4 relative">
                                <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 mb-0.5 block">Desconto (%)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={formData.percentage}
                                        onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                                        className="w-full pl-7 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-primary bg-white dark:bg-slate-900 font-medium text-red-600 dark:text-red-400"
                                    />
                                    <Percent className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                </div>
                            </div>

                            <div className="md:col-span-12">
                                <button
                                    onClick={handleSaveProduct}
                                    disabled={loading}
                                    className={`w-full py-3 flex items-center justify-center rounded-lg text-white font-bold transition-colors ${editingProductId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:opacity-90'} disabled:opacity-50`}
                                >
                                    {editingProductId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                    {editingProductId ? 'Salvar Alterações' : 'Adicionar Produto'}
                                </button>
                            </div>
                        </div>
                        <div className="text-xs text-slate-400 flex justify-center px-1 gap-4">
                            <span>Preço Final = (Original × Multiplicador) - Desconto%</span>
                        </div>
                    </div>

                    {/* Products List */}
                    <div className="space-y-1">
                        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <div className="col-span-4">Produto</div>
                            <div className="col-span-2">SKU</div>
                            <div className="col-span-2 text-right">Original</div>
                            <div className="col-span-1 text-center">Mult</div>
                            <div className="col-span-1 text-center">Desc</div>
                            <div className="col-span-2 text-right">Final</div>
                        </div>

                        {products.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Nenhum produto neste log.</p>
                            </div>
                        ) : (
                            products.map((product) => (
                                <div
                                    key={product.id}
                                    className={`group flex items-center bg-white dark:bg-slate-950 border rounded-lg transition-all hover:shadow-sm ${editingProductId === product.id ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-100 dark:border-slate-800 hover:border-primary/30'}`}
                                >
                                    <div className="flex-1 grid grid-cols-12 gap-4 px-4 py-3 items-center">
                                        <div className="col-span-4 font-medium text-slate-900 dark:text-white truncate" title={product.name}>
                                            {product.name}
                                        </div>
                                        <div className="col-span-2 text-xs text-slate-500 font-mono truncate">
                                            {product.sku || '-'}
                                        </div>
                                        <div className="col-span-2 text-right text-sm text-slate-500">
                                            {product.price.toFixed(2)}
                                        </div>
                                        <div className="col-span-1 text-center">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${product.multiplier ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-300'}`}>
                                                {product.multiplier ? `x${product.multiplier}` : '-'}
                                            </span>
                                        </div>
                                        <div className="col-span-1 text-center">
                                            {product.percentage ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                                                    -{product.percentage}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 text-xs">-</span>
                                            )}
                                        </div>
                                        <div className="col-span-2 text-right text-sm font-bold text-emerald-600">
                                            R$ {(product.final_price || product.price).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 border-l border-slate-100 dark:border-slate-800 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleEditProduct(product)}
                                            className="p-2 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                                            title="Editar"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteProduct(product.id)}
                                            className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                            title="Remover"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
                    <div className="text-sm text-slate-500">
                        Total de itens: <span className="font-bold text-slate-900 dark:text-white">{products.length}</span>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500">
                            Total Original: <span className="font-medium text-slate-700 dark:text-slate-300">
                                R$ {products.reduce((sum, p) => sum + p.price, 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="text-lg font-bold text-emerald-600">
                            Total Final: R$ {products.reduce((sum, p) => sum + (p.final_price || p.price), 0).toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductManager;
