// app/product/[id]/page.tsx
"use client";

// Importações limpas
import { supabase } from "@/lib/supabaseClient"; 
import { useEffect, useState } from "react"; // useMemo removido
import { useParams, useRouter, notFound } from "next/navigation"; 
import Image from "next/image";
// Link removido (pode ser re-adicionado se necessário)
import { Plus, Minus, Loader2, ChevronLeft } from "lucide-react"; // Copy removido
import { addToBag } from "@/lib/bag"; 
// dedupeProducts removido

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
// Funções Auxiliares (Manter/Atualizar)
// =======================================================

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}
function formatDisplayName(name?: string | null) {
  if (!name) return "Cliente";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts.at(-1)![0].toUpperCase()}.`;
}

function firstImage(x: string[] | string | null | undefined) {
    if (!x) return "";
    return Array.isArray(x) ? x[0] ?? "" : x ?? "";
}

// =======================================================
// Componente Principal
// =======================================================

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<ExtendedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // [size, setSize] removido, mantendo apenas selectedSize
  const [selectedSize, setSelectedSize] = useState<string | null>(null); 
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const productId = parseInt(id) || null;

  // Imagens do produto
  const images = useMemo(() => { // useMemo re-adicionado pois é útil aqui.
    if (!product) return [];
    const url = firstImage(product.photo_url);
    return url ? [url] : [];
  }, [product]);

  // Handle Toast
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };
  
  // Função de Fetch
  useEffect(() => {
    // ... Lógica de fetch e setProduct ...
    async function fetchProduct() {
        if (!productId) {
            notFound();
            return;
        }

        try {
            const { data: productData, error: productError } = await supabase
                .from('products')
                .select(`
                    *,
                    store_data:stores(id, name, slug, address)
                `)
                .eq('id', productId)
                .single();
            
            if (productError || !productData) {
                console.error("Erro ao buscar produto:", productError);
                notFound();
                return;
            }

            setProduct(productData as ExtendedProduct);
            
            // Pré-selecionar o primeiro tamanho se houver
            if (Array.isArray(productData.sizes) && productData.sizes.length > 0) {
                setSelectedSize(productData.sizes[0]);
            }

        } catch (err) {
            console.error(err);
            setError("Erro ao carregar o produto. Tente novamente.");
        } finally {
            setLoading(false);
        }
    }

    if (productId) fetchProduct();
  }, [productId]);

  // Adicionar à sacola
  const handleAddToBag = async () => {
    if (!product || !selectedSize || isAdding) return;
    
    setIsAdding(true);
    try {
        await addToBag({
            id: product.id,
            name: product.name,
            store_name: product.store_name,
            photo_url: firstImage(product.photo_url),
            price_tag: product.price_tag,
            size: selectedSize,
            qty: qty,
        });
        showToast(`Adicionado ${qty}x ${product.name} (T: ${selectedSize}) à sacola!`);
        // Opcional: Reiniciar o estado
        setQty(1);
    } catch (e) {
        showToast("Erro ao adicionar à sacola.");
    } finally {
        setIsAdding(false);
    }
  };

  if (loading) {
    return (
        <main className="min-h-screen p-5 pt-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-2 border-black mx-auto" />
            <p className="text-center mt-3 text-sm text-gray-600">Carregando detalhes...</p>
        </main>
    );
  }

  if (error || !product) {
    return (
        <main className="min-h-screen p-5 pt-10">
            <p className="text-center text-red-600">{error || "Produto não encontrado."}</p>
        </main>
    );
  }

  return (
    <main className="min-h-screen text-black max-w-md mx-auto with-bottom-nav">
        {/* Header/Voltar */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-50 pt-6 px-5 flex items-center justify-between">
            <button
                onClick={() => router.back()}
                className="h-10 w-10 rounded-full flex items-center justify-center bg-gray-100 border"
                aria-label="Voltar"
            >
                <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-semibold tracking-tight line-clamp-1 flex-1 text-center mx-4">
                {product.name}
            </h1>
            <div className="h-10 w-10" /> {/* Espaçador */}
        </div>

        {/* Imagem do Produto */}
        <div className="mt-4 px-5">
            <div className="aspect-square w-full rounded-2xl overflow-hidden bg-gray-100 relative">
                {images[0] ? (
                    <Image
                        src={images[0]}
                        alt={product.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                        priority
                    />
                ) : (
                    <div className="absolute inset-0 grid place-items-center text-neutral-400">
                        imagem indisponível
                    </div>
                )}
            </div>
        </div>

        {/* Detalhes do Produto */}
        <div className="p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                {product.store_name}
            </p>
            <h2 className="text-2xl font-bold leading-tight">{product.name}</h2>
            
            <p className="mt-2 text-3xl font-bold text-black">
                {formatBRL(product.price_tag)}
            </p>

            <p className="mt-4 text-sm text-gray-700 leading-relaxed">
                {product.description}
            </p>

            {/* Seleção de Tamanho */}
            {product.sizes && product.sizes.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-2">Tamanho</h3>
                    <div className="flex flex-wrap gap-2">
                        {product.sizes.map((s) => (
                            <button
                                key={s}
                                onClick={() => setSelectedSize(s)}
                                className={`h-10 px-4 rounded-full border text-sm font-medium transition ${
                                    selectedSize === s
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-gray-800 border-gray-200 hover:border-gray-400"
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Infos de Loja e Entrega */}
            <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 14c4.5-1.5 9-.5 12 1.5M4 14c0-3 2-5 4-7M12 21.5V14M16 17c-2 0-3-1-3-3s1-3 3-3 3 1 3 3-1 3-3 3z" />
                    </svg>
                    <div>
                        <div className="font-medium">{product.store_name}</div>
                        <div className="text-xs text-gray-500">{product.store_data?.address ?? 'Endereço não informado'}</div>
                    </div>
                </div>

                {product.eta_text && (
                    <div className="flex items-center gap-3">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <div className="text-sm text-gray-600">{product.eta_text}</div>
                    </div>
                )}
            </div>

            {/* Preço e Botão de Adicionar (Fixo no rodapé) */}
            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t px-5 py-3 shadow-top z-50">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setQty(Math.max(1, qty - 1))}
                            className="p-2 border rounded-full"
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
                        className={`flex-1 ml-4 h-12 rounded-xl text-white text-base font-semibold transition active:scale-[0.99] disabled:opacity-60 ${
                            selectedSize ? "bg-black" : "bg-gray-400 cursor-not-allowed"
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
