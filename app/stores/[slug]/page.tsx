"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ===== Tipagens =====
// CORRIGIDO: Tipagem de filter dentro de grid
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

export type Product = {
  id: number;
  name: string;
  store_name: string;
  photo_url: string[] | string | null;
  eta_text: string | null;
  price_tag: number;
  category?: string | null;
  gender?: "male" | "female" | "unisex" | null;
  sizes?: string[] | string | null;
  featured?: boolean | null;
  global_sku?: string | null;
  categories: string[] | null;
  // Propriedades do estado local (não são do DB, mas são usadas)
  is_saved?: boolean;
};

// Componentes da página (imports omitidos para foco na correção, assumindo que existem)
// import ProductCard from "@/components/ProductCard";
// import ChipsRow from "@/components/ChipsRow";
// ...

// Assumindo um tipo para os produtos que vêm do banco/memória
type StoreProduct = Omit<Product, 'is_saved'> & { is_saved: boolean | undefined; is_in_stock: boolean };


// Função para renderizar os blocos
// CORRIGIDO: Tipagem de blocks para Array<Block>
function renderBlocks(blocks: Block[], products: StoreProduct[], allCategories: string[]) {
  // Funções de utilidade e componentes internos (omitidos para foco na correção)
  
  // Exemplo de como você renderizaria um ProductCard
  const renderProduct = (p: StoreProduct, index: number) => (
    <div key={index}>
        {/* Assumindo que você tem um ProductCard que aceita o tipo `Product` ou similar */}
        {/* <ProductCard product={p} isSaved={p.is_saved} isInStock={p.is_in_stock} /> */}
        {/* Temporário: para evitar erros de importação */}
        <div className="border p-4 rounded-lg">
            <p className="font-semibold">{p.name}</p>
            <p className="text-xs text-gray-500">{p.store_name}</p>
        </div>
    </div>
  );

  return blocks.map((block, index) => {
    switch (block.type) {
      case "hero":
        return (
          <section key={index} className="relative h-64 w-full overflow-hidden mb-4">
            {/* Implementação do Hero */}
          </section>
        );

      case "category_menu":
        // Menu de categorias
        if (block.source === "product_categories") {
          return (
            <div key={index} className="mt-4">
              {/* <ChipsRow categories={allCategories} /> */}
            </div>
          );
        }
        return null;

      case "grid":
        // Filtra os produtos
        let filteredProducts = products;
        
        // CORRIGIDO: `block.filter` é tipado
        if (block.filter) {
            filteredProducts = products.filter(p => {
                let matches = true;
                // Itera sobre as chaves de filtro (ex: {category: "Calçados"})
                for (const key in block.filter) {
                    const value = block.filter[key];
                    // Esta lógica precisa ser robusta, mas o erro de `any` foi resolvido na declaração do tipo Block.
                    // Assumindo que você está verificando a propriedade `key` do produto.
                    if (key in p && p[key as keyof typeof p] !== value) {
                        matches = false;
                        break;
                    }
                }
                return matches;
            });
        }
        
        const gridProducts = filteredProducts.slice(0, block.rows * block.cols);

        return (
          <div key={index} className={`grid grid-cols-${block.cols} gap-4 mt-4`}>
            {gridProducts.map((p, idx) => renderProduct(p, idx))}
          </div>
        );

      default:
        return null;
    }
  });
}

// ====================================================================

interface Props {
  params: { slug: string };
}

export default function StorePage({ params }: Props) {
  const { slug } = params;

  // Estados de dados
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likeMap, setLikeMap] = useState<Record<number, boolean>>({});

  // Filtros (mantidos como estado local)
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Variável não utilizada removida
  // const sizeOptions = ["PP", "P", "M", "G", "GG"]; // linha 161 (erro de unused-vars)

  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    products.forEach((p) => {
      if (p.categories) {
        p.categories.forEach((c) => categories.add(c));
      } else if (p.category) {
        categories.add(p.category);
      }
    });
    return Array.from(categories);
  }, [products]);

  // Carregar dados da loja e produtos
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      // 1. Carregar loja
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select(`*, layout:layout_v2`)
        .eq("slug", slug)
        .single();

      if (storeError) {
        setError("Loja não encontrada ou erro de carregamento.");
        setLoading(false);
        return;
      }
      // CORRIGIDO: Removida a asserção `as any` desnecessária
      setStore(storeData as Store); 

      // 2. Carregar produtos
      const { data: productsData, error: productsError } = await supabase
        .from("products_view")
        .select(`*`)
        .eq("store_id", storeData.id);

      if (productsError) {
        setError("Erro ao carregar produtos.");
        setLoading(false);
        return;
      }
      
      // Asserção para o tipo de produto
      setProducts(productsData as StoreProduct[]);

      // 3. Carregar likes
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: likesData } = await supabase
          .from("likes")
          .select("product_id")
          .eq("user_id", user.id);

        if (likesData) {
          const newLikeMap = likesData.reduce((acc, row) => {
            acc[row.product_id as number] = true;
            return acc;
          }, {} as Record<number, boolean>);
          setLikeMap(newLikeMap);
        }
      }

      setLoading(false);
    }

    fetchData();
  }, [slug]);

  // Aplicação dos filtros
  const filteredProducts = useMemo(() => {
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
      <div className="mt-8 px-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {/* Aqui você usaria o `renderProduct` de dentro do `renderBlocks` */}
      </div>
      
    </main>
  );
}
