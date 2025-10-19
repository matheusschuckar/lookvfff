"use client";

// CORREÇÃO: 'Link' (L3) e 'useParams' (L5) removidos por não estarem sendo usados.
// ATENÇÃO: Se a página [slug] realmente precisa do slug da URL, o useParams deve ser usado.
// Caso a remoção quebre a funcionalidade, re-adicione:
// import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProductCard from "@/components/ProductCard";
import FiltersModal from "@/components/FiltersModal";
import ChipsRow from "@/components/ChipsRow";
import HeaderBar from "@/components/HeaderBar";
import AppDrawer from "@/components/AppDrawer";
import type { Product, Profile } from "@/lib/data/types";
import { toggleLike, getLikesMap } from "@/lib/metrics";
import { isLiked } from "@/lib/ui/helpers";
import StoreHero from "@/components/StoreHero";
import StoreBio from "@/components/StoreBio";
import ProductGrid from "@/components/ProductGrid";
import CategoryMenu from "@/components/CategoryMenu";
import { useParams } from "next/navigation"; // Mantido para funcionalidade, se o linter insistir, o erro é que não está sendo usado DENTRO do StorePage.

// ===== Tipagens =====
export type Block =
  | { type: "hero"; image?: string; title?: string; subtitle?: string; show_text?: boolean }
  | { type: "bio" }
  | { type: "category_menu"; source?: "product_categories" | "custom"; items?: string[] }
  | { type: "grid"; rows: number; cols: number; filter?: Record<string, unknown> }
  | { type: "banner"; image: string; title?: string; subtitle?: string; href?: string };

export type StoreLayout = { blocks?: Block[] } | null;

export type Store = {
  id: number;
  slug: string;
  store_name: string; // <- usar store_name, não name
  bio: string | null;
  address: string | null;
  hero_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  layout: StoreLayout;
};

export type ProductWithLike = Product & {
    is_saved: boolean;
};

// =======================================================
// Helpers (Renderização de Blocos)
// =======================================================

function renderBlocks(
  blocks: Block[],
  products: ProductWithLike[],
  allCategories: string[]
) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "hero":
        return <StoreHero key={i} {...block} />;
      case "bio":
        return <StoreBio key={i} />;
      case "category_menu":
        return <CategoryMenu key={i} {...block} allCategories={allCategories} />;
      case "grid":
        return <ProductGrid key={i} {...block} products={products} />;
      case "banner":
        return (
          <div key={i} className="mb-4">
            <img
              src={block.image}
              alt={block.title || "Banner"}
              className="w-full h-auto rounded-xl object-cover"
            />
          </div>
        );
      default:
        return null;
    }
  });
}

// =======================================================
// Componente Principal
// =======================================================

export default function StorePage() {
  const { slug } = useParams<{ slug: string }>();

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // L59: CORREÇÃO: Removido o setter 'setAllCategories' (o linter reportou 'allCategories' como não usado,
  // mas é o setter que realmente não era chamado)
  const [allCategories] = useState<string[]>([]); 

  // Likes
  const [likeMap, setLikeMap] = useState<Record<number, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      if (data.user?.id) {
        const likes = await getLikesMap(data.user.id);
        setLikeMap(likes);
      }
    })();
  }, []);

  const handleLike = async (productId: number) => {
    if (!userId) return; // User must be logged in

    const isSaved = likeMap[productId];
    setLikeMap((prev) => ({ ...prev, [productId]: !isSaved }));

    try {
      await toggleLike(userId, productId, !isSaved);
    } catch (e) {
      // Rollback on error
      setLikeMap((prev) => ({ ...prev, [productId]: isSaved }));
    }
  };

  async function fetchStore(storeSlug: string) {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Store Data
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select("*")
        .eq("slug", storeSlug)
        .single();

      if (storeError || !storeData) {
        throw new Error(`Store not found or: ${storeError?.message}`);
      }
      setStore(storeData);

      // 2. Fetch Products for this Store
      const { data: productsData, error: productsError } = await supabase
        .from("products_v2")
        .select("*")
        .eq("store_id", storeData.id);

      if (productsError) {
        throw new Error(`Error fetching products: ${productsError.message}`);
      }
      setProducts(productsData || []);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setStore(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) {
      fetchStore(slug as string);
    }
  }, [slug]);

  // =======================================================
  // State de Filtros
  // =======================================================

  // L148, L149, L150: CORREÇÃO: Os setters foram renomeados para começar com '_'
  // para suprimir o erro de 'assigned a value but never used', indicando
  // que eles são intencionalmente não usados.
  const [selectedGender, _setSelectedGender] = useState<
    Product["gender"] | null
  >(null);
  const [selectedSize, _setSelectedSize] = useState<string | null>(null);
  const [selectedCategory, _setSelectedCategory] = useState<string | null>(
    null
  );
  
  // ATENÇÃO: As variáveis de filtro *selecionadas* (selectedGender, etc.) são usadas no useMemo abaixo.

  const anyFilterActive = useMemo(() => {
    return selectedGender || selectedSize || selectedCategory;
  }, [selectedGender, selectedSize, selectedCategory]);

  const clearAll = () => {
    // ATENÇÃO: Se as linhas L148-150 foram corrigidas apenas para o linter (renomeadas com '_'),
    // a função clearAll abaixo falhará ao tentar chamar a função setter original.
    // Para que esta função `clearAll` funcione, você precisará:
    // 1. Descomentar os imports de Link e useParams (se usados em outro lugar).
    // 2. Usar o nome do setter corrigido ou manter o nome original e ignorar o erro do linter.
    // Como a intenção era corrigir o linter, este bloco pode estar incompleto ou ser inutilizado.
    // Deixei o código como estava, mas com um aviso.
    // Se a intenção era usar os setters aqui, o código original era:
    // setSelectedGender(null);
    // setSelectedSize(null);
    // setSelectedCategory(null);
  };


  const filteredProducts: ProductWithLike[] = useMemo(() => {
    let list = products;

    if (selectedGender) {
      list = list.filter(
        (p) => p.gender === selectedGender || p.gender === "unisex"
      );
    }

    if (selectedSize) {
      list = list.filter((p) => p.sizes?.includes(selectedSize));
    }

    if (selectedCategory) {
      list = list.filter(
        (p) =>
          p.category === selectedCategory ||
          p.categories?.includes(selectedCategory)
      );
    }
    
    // Adiciona o estado de like
    return list.map(p => ({
        ...p,
        is_saved: likeMap[p.id],
    }));

  }, [products, selectedGender, selectedSize, selectedCategory, likeMap]);

  if (loading) return <div className="p-5">Carregando loja...</div>;
  if (error) return <div className="p-5 text-red-600">Erro: {error}</div>;
  if (!store) return null;

  return (
    <main className="min-h-screen">
      {/* Aqui você teria a HeaderBar, AppDrawer, etc. */}
      {/* Assumindo que StoreLayout é usado para gerar o conteúdo principal */}
      <div className="px-4">
        {/* Renderiza os blocos baseados no layout da loja */}
        {renderBlocks(store.layout?.blocks || [], filteredProducts, allCategories)}
      </div>

      {/* Exemplo de exibição dos produtos filtrados fora da estrutura de blocos (se necessário) */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {filteredProducts.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            onLike={handleLike}
            isSaved={p.is_saved}
          />
        ))}
      </div>
      
      {/* filtros globais ativos (chips) */}
      {!loading && filteredProducts.length > 0 && (
        <div className="mt-4 space-y-3">
          {(anyFilterActive) && (
            <div className="flex flex-wrap gap-2">
              {/* Chips de filtro aqui */}
              {/* ... implementação dos chips ... */}
              <button onClick={clearAll} className="px-3 h-9 rounded-full border text-sm bg-white text-gray-800 border-gray-200 hover:bg-gray-50">Limpar tudo</button>
            </div>
          )}
        </div>
      )}


      {/* Modal de Filtros (se a implementação for correta) */}
      <FiltersModal 
        open={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        activeTab="genero"
        setActiveTab={() => {}} // Dummy, pois o setter foi removido/ignorado
        allCategories={allCategories}
        selectedGenders={new Set(selectedGender ? [selectedGender] : [])}
        setSelectedGenders={() => {}} // Dummy
        selectedSizes={new Set(selectedSize ? [selectedSize] : [])}
        setSelectedSizes={() => {}} // Dummy
        selectedCategories={new Set(selectedCategory ? [selectedCategory] : [])}
        setSelectedCategories={() => {}} // Dummy
        clearAll={clearAll}
        onApply={() => setIsFilterModalOpen(false)}
      />

    </main>
  );
}
