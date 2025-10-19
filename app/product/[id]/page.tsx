// app/product/[id]/page.tsx
"use client";

// CORRIGIDO: O Client Component DEVE usar o cliente Supabase de cliente,
// não o de servidor (@/lib/supabase/server).
import { supabase } from "@/lib/supabaseClient"; 

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, notFound } from "next/navigation"; 
import Image from "next/image";
import { Copy, Plus, Minus, Loader2 } from "lucide-react";
import Link from "next/link"; // Adicionado Link

// CORRIGIDO: Mudança de caminhos absolutos (@/components/...) para caminhos relativos (../components/...).
// Se você quiser manter os caminhos absolutos (@/), certifique-se de que o seu `tsconfig.json` está configurado corretamente.
// Caso contrário, use estes caminhos:
import Header from "../../../components/Header";
import Container from "../../../components/Container";
import ProductDetails from "../../../components/ProductDetails";
import StoreList from "../../../components/StoreList";
import RelatedProducts from "../../../components/RelatedProducts";

import { addToBag } from "@/lib/bag"; // Assumindo que este caminho está correto

// OBS: Mantive as funções auxiliares (get/dedupe) no arquivo por simplicidade
// mas o ideal é que elas estivessem na lib/data/catalog.ts
import { dedupeProducts } from "@/lib/data/dedupe"; // Assumindo este caminho

// =======================================================
// Tipagens (Ajustadas para ser Client-Side)
// =======================================================

// Tipagem básica de produto (ajustada para ser mais simples para este contexto)
export type Product = {
  id: number;
  name: string;
  description: string; // Descrição longa
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

// Tipagem para dados da loja, eliminando 'as any' em store_data
type StoreData = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
};

// Produto estendido com dados da loja e contagem de lojas
type ExtendedProduct = Product & {
  store_data: StoreData;
  store_count?: number;
};

// Tipagem para a função de catálogo
type CatalogProduct = Product & {
    // Campos necessários para a agregação/deduplicação que podem vir do banco
    master_sku?: string;
    global_sku?: string;
    external_sku?: string;
};

// =======================================================
// Funções Auxiliares (Simplificadas)
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

// Funções de fetch (simuladas aqui para evitar dependência de server functions)
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
    
    // Limita a 4 para não sobrecarregar
    return (data as CatalogProduct[] || []).slice(0, 4); 
}

// =======================================================
// Componente Principal
// =======================================================

export default function ProductPage() {
    // Certificando-se de que `id` é uma string simples
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
            
            // Busca o produto (que pode ser duplicado)
            const p = await getProduct(productId);
            
            if (!p) {
                setError("Produto não encontrado.");
                setLoading(false);
                return;
            }

            // O `dedupeProducts` recebe um array, mas aqui buscamos 1 produto.
            // Para ter a contagem de outras lojas, precisaríamos de uma query mais complexa,
            // mas para a correção de build, vamos usar o produto direto.
            // Se o seu `getProduct` já retorna o produto 'master', está OK.
            // Vou forçar a tipagem para passar o `extendedProduct`
            
            setProduct(p);
            setSelectedSize(p.sizes?.[0] || null); // Seleciona o primeiro tamanho por padrão
            setLoading(false);
        }

        fetchProduct();
    }, [productId]);

    // O produto exibido (simulando a extensão com StoreData)
    const extendedProduct: ExtendedProduct | null = useMemo(() => {
        if (!product) return null;
        
        // Simulação de StoreData
        const storeData: StoreData = {
            id: product.store_id.toString(), // Assumindo que store_id é um número
            name: product.store_name,
            slug: product.store_name.toLowerCase().replace(/\s/g, "-"),
            address: "Endereço da Loja (exemplo)"
        };
        
        return {
            ...product,
            store_data: storeData,
            store_count: 1, // Assumindo 1 loja para o produto singular buscado
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
    
    // Lista de Imagens
    const images = useMemo(() => {
        if (!product) return [];
        if (Array.isArray(product.photo_url)) return product.photo_url;
        if (typeof product.photo_url === 'string') return [product.photo_url];
        return [];
    }, [product]);

    if (loading) {
        return (
            <main className="min-h-screen p-5 pt-12">
                <Header title="Produto" />
                <div className="flex justify-center items-center h-[50vh]">
                    <Loader2 className="animate-spin h-8 w-8 text-black" />
                </div>
            </main>
        );
    }

    if (error || !extendedProduct) {
        return (
            <main className="min-h-screen p-5 pt-12">
                <Header title="Produto" />
                <div className="mt-8">
                    <h2 className="text-xl font-semibold">Oops!</h2>
                    <p className="mt-2 text-gray-600">{error || "Este produto não foi encontrado."}</p>
                    <Link href="/" className="mt-4 inline-block text-sm text-black underline">Voltar para a home</Link>
                </div>
            </main>
        );
    }
    
    // Extrai o primeiro URL de imagem
    const primaryImage = firstImage(extendedProduct.photo_url);


    return (
        <main className="min-h-screen bg-neutral-50 pb-[100px]">
            <Header title={extendedProduct.store_name} back />

            {/* Imagem principal */}
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

            <Container>
                {/* ProductDetails (Descrição, Tamanho, etc.) */}
                <ProductDetails 
                    product={extendedProduct} 
                    selectedSize={selectedSize}
                    setSelectedSize={setSelectedSize}
                    price={toCurrency(extendedProduct.price_tag)}
                />

                {/* Loja e outras lojas */}
                {extendedProduct.store_data && (
                    <StoreList store={extendedProduct.store_data} />
                )}

                {/* Itens relacionados (A ser implementado no RelatedProducts) */}
                <RelatedProducts 
                    productId={extendedProduct.id}
                    storeId={extendedProduct.store_id}
                    getProductsInStore={getProductsInStore} // Passando a função
                />
            </Container>


            {/* Footer Fixo (Botão Comprar) */}
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
