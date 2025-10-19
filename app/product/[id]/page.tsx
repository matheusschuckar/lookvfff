// app/product/[id]/page.tsx
"use client";

// Importações necessárias
import { supabase } from "@/lib/supabaseClient"; 
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, notFound } from "next/navigation"; 
import Image from "next/image";
import Link from "next/link";
import { Copy, Plus, Minus, Loader2, ChevronLeft } from "lucide-react"; // ChevronLeft adicionado
import { addToBag } from "@/lib/bag"; 
import { dedupeProducts } from "@/lib/data/dedupe"; 

// =======================================================
// Tipagens (Manter)
// =======================================================

export type Product = {
  id: number;
  name: string;
  description: string; 
  store_name: string;
  store_id: number;
  photo_url: string[] | string | null;
  eta_text: string | null;
  price_tag: number;
  sizes: string[] | null;
  category?: string | null;
  gender?: "male" | "female" | "unisex" | null;
  related_products?: number[] | null;
};

type StoreData = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
};

type ExtendedProduct = Product & {
  store_data: StoreData;
  store_count?: number;
};

type CatalogProduct = Product & {
    master_sku?: string;
    global_sku?: string;
    external_sku?: string;
};

// =======================================================
// Funções Auxiliares (Manter)
// =======================================================

function toCurrency(v?: number) {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(v ?? 0);
    } catch {
        return `R$ ${(v ?? 0).toFixed(2).replace(".", ",")}`;
    }
}

function firstImage(x: string[] | string | null | undefined) {
    if (!x) return "";
    return Array.isArray(x) ? x[0] ?? "" : x;
}

async function getProduct(id: string): Promise<CatalogProduct | null> {
    const { data, error } = await supabase
        .from("products_catalog")
        .select("*")
        .eq("id", id)
        .single();
    
    if (error) {
        console.error("Erro ao buscar produto:", error.message);
        return null;
    }
    
    return data as CatalogProduct;
}

async function getProductsInStore(storeId: number, currentProductId: number): Promise<CatalogProduct[]> {
    const { data, error } = await supabase
        .from("products_catalog")
        .select("*")
        .eq("store_id", storeId)
        .not("id", "eq", currentProductId);

    if (error) {
        console.error("Erro ao buscar outros produtos da loja:", error.message);
        return [];
    }
    
    return (data as CatalogProduct[] || []).slice(0, 4); 
}

// =======================================================
// Funções de UI (Componentes substituídos)
// =======================================================

// Substitui Container e Header
function SimpleHeader({ title, onBack }: { title: string; onBack: () => void }) {
    return (
        <div className="sticky top-0 z-20 bg-white border-b py-4 px-5 flex items-center">
            <button onClick={onBack} className="absolute left-4 p-2">
                <ChevronLeft size={24} />
            </button>
            <h1 className="flex-1 text-center text-lg font-semibold tracking-tight">{title}</h1>
        </div>
    );
}

// =======================================================
// Componente Principal
// =======================================================

export default function ProductPage() {
    const { id } = useParams<{ id: string }>();
    const productId = Array.isArray(id) ? id[0] : id;

    const router = useRouter();

    const [product, setProduct] = useState<CatalogProduct | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Estados do formulário de compra
    const [selectedSize, setSelectedSize] = useState<string | null>(null);
    const [qty, setQty] = useState(1);
    const [toast, setToast] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    // Fetch principal
    useEffect(() => {
        if (!productId) {
            setLoading(false);
            notFound();
            return;
        }

        async function fetchProduct() {
            setLoading(true);
            setError(null);
            
            const p = await getProduct(productId);
            
            if (!p) {
                setError("Produto não encontrado.");
                setLoading(false);
                return;
            }
            
            setProduct(p);
            setSelectedSize(p.sizes?.[0] || null);
            setLoading(false);
        }

        fetchProduct();
    }, [productId]);

    const extendedProduct: ExtendedProduct | null = useMemo(() => {
        if (!product) return null;
        
        const storeData: StoreData = {
            id: product.store_id.toString(),
            name: product.store_name,
            slug: product.store_name.toLowerCase().replace(/\s/g, "-"),
            address: "Endereço da Loja (exemplo)"
        };
        
        return {
            ...product,
            store_data: storeData,
            store_count: 1, 
        };
    }, [product]);


    // Handle Add to Bag
    const handleAddToBag = () => {
        if (!extendedProduct || !selectedSize || isAdding) return;

        setIsAdding(true);
        setToast(null);

        try {
            addToBag({
                id: extendedProduct.id.toString(),
                name: extendedProduct.name,
                price: extendedProduct.price_tag,
                qty,
                size: selectedSize,
                store_name: extendedProduct.store_name,
                photo_url: firstImage(extendedProduct.photo_url),
            });
            
            setToast("Adicionado à sacola!");
            setTimeout(() => setToast(null), 3000);
            
        } catch (e) {
            console.error(e);
            setToast("Erro ao adicionar à sacola.");
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsAdding(false);
        }
    };
    
    // =======================================================
    // RENDERIZAÇÃO
    // =======================================================

    if (loading) {
        return (
            <main className="min-h-screen p-5 pt-12">
                <SimpleHeader title="Produto" onBack={() => router.back()} />
                <div className="flex justify-center items-center h-[50vh]">
                    <Loader2 className="animate-spin h-8 w-8 text-black" />
                </div>
            </main>
        );
    }

    if (error || !extendedProduct) {
        return (
            <main className="min-h-screen p-5 pt-12">
                <SimpleHeader title="Produto" onBack={() => router.back()} />
                <div className="mt-8">
                    <h2 className="text-xl font-semibold">Oops!</h2>
                    <p className="mt-2 text-gray-600">{error || "Este produto não foi encontrado."}</p>
                    <Link href="/" className="mt-4 inline-block text-sm text-black underline">Voltar para a home</Link>
                </div>
            </main>
        );
    }
    
    const primaryImage = firstImage(extendedProduct.photo_url);

    return (
        <main className="min-h-screen bg-neutral-50 pb-[100px]">
            {/* 1. Header (Substituído por SimpleHeader) */}
            <SimpleHeader title={extendedProduct.store_name} onBack={() => router.back()} />

            {/* 2. Imagem principal */}
            <div className="aspect-[4/5] w-full overflow-hidden bg-white relative">
                {primaryImage ? (
                    <Image
                        src={primaryImage}
                        alt={extendedProduct.name}
                        fill
                        priority
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                    />
                ) : (
                    <div className="grid place-items-center h-full text-neutral-400">
                        Imagem indisponível
                    </div>
                )}
            </div>

            {/* 3. Container (Substituído por div com mx-auto) */}
            <div className="max-w-xl mx-auto p-5 space-y-8">
                
                {/* 3.1 ProductDetails (Conteúdo do componente ProductDetails) */}
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{extendedProduct.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">{extendedProduct.store_name}</p>
                    <p className="mt-3 text-2xl font-semibold text-black">{toCurrency(extendedProduct.price_tag)}</p>

                    <div className="mt-4">
                        <h3 className="text-sm font-semibold mb-2">Tamanho</h3>
                        <div className="flex flex-wrap gap-2">
                            {extendedProduct.sizes?.map((size) => (
                                <button
                                    key={size}
                                    onClick={() => setSelectedSize(size)}
                                    className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
                                        selectedSize === size 
                                            ? "bg-black text-white border-black" 
                                            : "bg-white text-gray-800 border-gray-300"
                                    }`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                        {extendedProduct.sizes?.length === 0 && <p className="text-xs text-red-500">Tamanhos indisponíveis</p>}
                    </div>

                    <div className="mt-6">
                        <h3 className="text-sm font-semibold mb-2">Detalhes</h3>
                        <p className="text-sm text-gray-700 whitespace-pre-line">
                            {extendedProduct.description || "Descrição não fornecida."}
                        </p>
                    </div>

                    {extendedProduct.eta_text && (
                        <div className="mt-6 text-sm text-gray-600 border-t pt-4">
                            Entrega estimada: **{extendedProduct.eta_text}**
                        </div>
                    )}
                </div>

                {/* 3.2 StoreList (Conteúdo do componente StoreList) */}
                <div className="border-t pt-6">
                    <h3 className="text-sm font-semibold mb-2">Vendido e Entregue por</h3>
                    <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
                        <Link href={`/store/${extendedProduct.store_data.slug}`} className="text-lg font-bold text-black hover:underline">
                            {extendedProduct.store_data.name}
                        </Link>
                        <span className="text-xs text-gray-500">
                            {extendedProduct.store_count} loja(s)
                        </span>
                    </div>
                </div>

                {/* 3.3 RelatedProducts (Conteúdo do componente RelatedProducts - BÁSICO) */}
                <div className="border-t pt-6">
                    <h3 className="text-xl font-semibold mb-4">Outros itens de {extendedProduct.store_name}</h3>
                    {/* Esta seção precisaria de um componente ou lógica complexa, aqui é um placeholder */}
                    <p className="text-sm text-gray-600">
                        *O componente RelatedProducts foi removido. A funcionalidade de produtos relacionados não está ativa neste código.*
                    </p>
                </div>
            </div>


            {/* 4. Footer Fixo (Botão Comprar - Manter) */}
            <div className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t p-4 shadow-2xl">
                <div className="max-w-md mx-auto">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Total</span>
                        <span className="text-xl font-bold">
                            {toCurrency(extendedProduct.price_tag * qty)}
                        </span>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center justify-center gap-4 mb-4">
                        <button
                            onClick={() => setQty(Math.max(1, qty - 1))}
                            disabled={qty <= 1}
                            className="p-2 border rounded-full disabled:opacity-50"
                        >
                            <Minus size={20} />
                        </button>
                        <span className="text-xl font-bold w-8 text-center">{qty}</span>
                        <button
                            onClick={() => setQty(qty + 1)}
                            className="p-2 border rounded-full"
                        >
                            <Plus size={20} />
                        </button>
                    </div>

                    <button
                        onClick={handleAddToBag}
                        disabled={!selectedSize || isAdding}
                        className={`w-full h-12 rounded-xl text-white text-base font-semibold transition active:scale-[0.99] disabled:opacity-60 ${
                            selectedSize ? "bg-black" : "bg-gray-400"
                        }`}
                    >
                        {isAdding ? (
                            <Loader2 className="animate-spin h-5 w-5 mx-auto" />
                        ) : (
                            "Adicionar à sacola"
                        )}
                    </button>
                </div>
            </div>

            {/* Toast mínimo */}
            {toast && (
                <div
                    role="status"
                    className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[130] bg-black text-white text-sm px-3 py-2 rounded-full shadow"
                >
                    {toast}
                </div>
            )}
        </main>
    );
}
