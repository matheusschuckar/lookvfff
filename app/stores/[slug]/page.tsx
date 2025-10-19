// app/stores/[slug]/page.tsx
"use client";

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
// CORRIGIDO: O erro é que 'StoreHero' não era resolvido. Adicionado ao 'components'.
import StoreHero from "@/components/StoreHero"; 
import StoreBio from "@/components/StoreBio"; // Assumido que existe
import ProductGrid from "@/components/ProductGrid"; // Assumido que existe
import CategoryMenu from "@/components/CategoryMenu"; // Assumido que existe
import { useParams, useRouter } from "next/navigation"; // Router adicionado para clearAll/redirecionamento

// =======================================================
// TIPAGENS (Baseado nos seus snippets)
// =======================================================

// Tipagem de Produto estendida para incluir o estado de "salvo" (is_saved)
export type StoreProduct = Product & {
  is_saved?: boolean;
};

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

// =======================================================
// DADOS DUMMY e UTILS (Para que o componente compile)
// =======================================================

// Dados de loja e produtos simulados para fins de compilação
const DUMMY_STORE: Store = {
    id: 1,
    slug: 'loja-exemplo',
    store_name: 'Loja Exemplo',
    bio: 'Bem-vindo à nossa loja!',
    address: 'Rua das Flores, 123',
    hero_image_url: null,
    hero_title: 'Loja Exemplo',
    hero_subtitle: 'A melhor moda da cidade.',
    layout: {
        blocks: [
            { type: "hero" },
            { type: "bio" },
            { type: "category_menu", source: "custom", items: ["Camisetas", "Calças", "Casacos"] },
            { type: "grid", rows: 2, cols: 2 }
        ]
    }
};

const DUMMY_PRODUCTS: StoreProduct[] = [
    { id: 101, name: 'Camiseta Básica', price_tag: 79.90, store_name: 'Loja Exemplo', photo_url: 'url-1', eta_text: '1h', category: 'Camisetas', is_saved: false, store_id: 1, store_slug: 'loja-exemplo' },
    { id: 102, name: 'Calça Jeans Skinny', price_tag: 189.90, store_name: 'Loja Exemplo', photo_url: 'url-2', eta_text: '1h', category: 'Calças', is_saved: true, store_id: 1, store_slug: 'loja-exemplo' },
];

const DUMMY_CATEGORIES = ["Camisetas", "Calças", "Casacos", "Saias", "Vestidos"];

// Funções utilitárias simuladas
const fetchStore = async (slug: string): Promise<Store | null> => DUMMY_STORE;
const fetchProducts = async (storeId: number): Promise<Product[]> => DUMMY_PRODUCTS;

// =======================================================
// RENDER BLOCKS (Lógica para renderizar o layout da loja)
// =======================================================

function renderBlocks(
  blocks: Block[],
  products: StoreProduct[],
  allCategories: string[],
): React.ReactNode[] {
  let productIndex = 0;
  
  return blocks.map((block, index) => {
    switch (block.type) {
      case "hero":
        return <StoreHero key={index} store={DUMMY_STORE} />;
      case "bio":
        return <StoreBio key={index} bio={DUMMY_STORE.bio || "Sobre esta loja"} />;
      case "category_menu":
        return (
          <CategoryMenu 
            key={index} 
            categories={block.source === "product_categories" ? allCategories : block.items || []} 
            // Os handlers de filtro (setSelectedCategory, etc.) deveriam ser passados aqui
            // Simplificado para compilação:
            onSelect={() => console.log('Categoria selecionada')} 
            selectedCategory={null}
          />
        );
      case "grid":
        // Pega os próximos 'rows * cols' produtos
        const end = productIndex + (block.rows * block.cols);
        const gridProducts = products.slice(productIndex, end);
        productIndex = end; // Avança o índice para o próximo bloco
        
        return (
          <ProductGrid 
            key={index} 
            products={gridProducts} 
            cols={block.cols} 
            // onLike/handleLike precisaria ser passado
            // onTap/bumpProduct precisaria ser passado
          />
        );
      case "banner":
        return (
            <div key={index} className="w-full my-4">
                <Link href={block.href || "#"}>
                    <img src={block.image} alt={block.title || "Banner"} className="rounded-xl w-full object-cover" />
                </Link>
            </div>
        );
      default:
        return null;
    }
  });
}

// =======================================================
// COMPONENTE PRINCIPAL
// =======================================================

export default function StorePage() {
  const router = useRouter();
  const { slug } = useParams() as { slug: string };

  const [userId, setUserId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likeMap, setLikeMap] = useState<Record<number, boolean>>({}); // Mapa de is_saved

  // Estados de filtro (simplificado para compilação)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const anyFilterActive = !!selectedGender || !!selectedSize || !!selectedCategory;

  // Efeito para carregar dados iniciais e likes
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        // 1. Carregar usuário e likes
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;
        setUserId(uid);

        let currentLikeMap: Record<number, boolean> = {};
        if (uid) {
            currentLikeMap = await getLikesMap(uid);
            setLikeMap(currentLikeMap);
        }

        // 2. Carregar a loja
        const fetchedStore = await fetchStore(slug);
        if (!fetchedStore) {
            // Em uma app real, você usaria 'notFound()' do Next.js.
            // Aqui vamos apenas setar um erro.
            setError(`Loja com slug "${slug}" não encontrada.`);
            setLoading(false);
            return;
        }
        setStore(fetchedStore);

        // 3. Carregar produtos
        const fetchedProducts = await fetchProducts(fetchedStore.id);
        setProducts(fetchedProducts);

      } catch (e) {
        console.error("Erro ao carregar dados da loja:", e);
        setError("Erro ao carregar dados da loja. Tente novamente.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [slug]);

  // Função para lidar com o like/unlike
  const handleLike = async (productId: number, isSaved: boolean) => {
    if (!userId) {
        router.push(`/auth?next=/stores/${slug}`);
        return;
    }
    
    setLikeMap((prev) => ({ ...prev, [productId]: !isSaved }));
    try {
        await toggleLike(userId, productId, !isSaved);
    } catch (e) {
        console.error("Erro ao dar like:", e);
        setLikeMap((prev) => ({ ...prev, [productId]: isSaved })); // Reverte
    }
  };


  // --- Filtros e Lógica de Produto (Simplificada) ---

  const allCategories = useMemo(() => {
    // Extrai e dedupica todas as categorias de todos os produtos
    const categoriesSet = new Set<string>();
    products.forEach(p => {
        if (p.category) categoriesSet.add(p.category);
        if (Array.isArray(p.categories)) p.categories.forEach(c => categoriesSet.add(c));
    });
    return Array.from(categoriesSet).sort();
  }, [products]);
  
  // Lógica de filtragem dos produtos
  const filteredProducts = useMemo(() => {
    let list: StoreProduct[] = products.map(p => ({
        ...p,
        is_saved: likeMap[p.id] ?? false,
    }));

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

    return list;
  }, [products, selectedGender, selectedSize, selectedCategory, likeMap]);

  const clearAll = () => {
    setSelectedGender(null);
    setSelectedSize(null);
    setSelectedCategory(null);
  };


  if (loading) return <div className="p-5">Carregando loja...</div>;
  if (error) return <div className="p-5 text-red-600">Erro: {error}</div>;
  if (!store) return null; // Não deveria acontecer se o erro for tratado acima

  return (
    <main className="min-h-screen">
      {/* Exemplo de uso de HeaderBar e AppDrawer, se existirem */}
      {/* <HeaderBar onFilterClick={() => setIsFilterModalOpen(true)} /> */}
      {/* <AppDrawer /> */}
      
      <div className="px-0">
        {/* Renderiza os blocos baseados no layout da loja */}
        {renderBlocks(store.layout?.blocks || [], filteredProducts, allCategories)}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* Chips de filtro ativos (movido para fora dos blocos para ser consistente) */}
        {anyFilterActive && (
          <ChipsRow
            selectedCategories={new Set(selectedCategory ? [selectedCategory] : [])}
            selectedGenders={new Set(selectedGender ? [selectedGender] : [])}
            selectedSizes={new Set(selectedSize ? [selectedSize] : [])}
            onClearAll={clearAll}
            // Adicione handlers de remoção individual se ChipsRow suportar
          />
        )}
      </div>
      
      <section className="px-4 mt-4">
        {/* Exemplo de listagem do restante dos produtos que não foram incluídos nos blocos de 'grid' */}
        {/* Este é um placeholder, a lógica de renderBlocks é que deve controlar a listagem */}
        <h2 className="text-xl font-bold mb-3">Mais Produtos</h2>
        <div className="grid grid-cols-2 gap-4">
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              // onTap={() => bumpProduct(p, { is_tap: true })} // Exemplo de uso de métricas
            />
          ))}
          
          {filteredProducts.length === 0 && (
            <p className="col-span-2 text-sm text-gray-600">
                Nenhum produto encontrado com os filtros atuais.
            </p>
          )}
        </div>
      </section>


      {/* Modal de Filtros (completo) */}
      <FiltersModal 
        open={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        activeTab="categorias" // Define a aba padrão
        setActiveTab={() => {}} 
        allCategories={allCategories}
        selectedGenders={new Set(selectedGender ? [selectedGender] : [])}
        setSelectedGenders={(fn) => { /* fn para update, implementar se necessário */ }}
        selectedSizes={new Set(selectedSize ? [selectedSize] : [])}
        setSelectedSizes={(fn) => { /* fn para update, implementar se necessário */ }}
        selectedCategories={new Set(selectedCategory ? [selectedCategory] : [])}
        setSelectedCategories={(fn) => { /* fn para update, implementar se necessário */ }}
        clearAll={clearAll}
        onApply={() => setIsFilterModalOpen(false)}
      />

    </main>
  );
}

// Para compilar, você também precisa dos componentes stub para o renderBlocks:
// StoreBio, ProductGrid, CategoryMenu, ChipsRow
// (Esses devem ser implementados na sua pasta 'components')
