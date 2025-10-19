"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import ProductCard from "../components/ProductCard";
import FiltersModal from "../components/FiltersModal";
import ChipsRow from "../components/ChipsRow";
import { BannersCarousel, type Banner } from "../components/BannersCarousel";
import {
  EditorialTallBanner,
  SelectionHeroBanner,
} from "../components/HomeBanners";
import HeaderBar from "../components/HeaderBar";
import AppDrawer from "../components/AppDrawer";
import type { Product, Profile } from "@/lib/data/types";

import {
  getPrefs,
  getPrefsV2,
  bumpCategory,
  bumpStore,
  bumpGender,
  bumpSize,
  bumpPriceBucket,
  bumpEtaBucket,
  bumpProduct,
  decayAll,
} from "@/lib/prefs";
import { getViewsMap } from "@/lib/metrics";
import {
  hasAddressBasics,
  hasContact,
  inCoverage,
  intersects,
  categoriesOf,
  priceBucket,
  etaBucket,
} from "@/lib/ui/helpers";
import { HOME_CAROUSEL, INLINE_BANNERS } from "@/lib/ui/homeContent";
import { useInfiniteProducts } from "@/hooks/useInfiniteProducts";
import { dedupeProducts } from "@/lib/data/dedupe"; // <<<< ADICIONADO

type KeyStat = { w: number; t: string };
type Prefs = ReturnType<typeof getPrefs>;

// ===== Funções auxiliares (moveu de dentro de Home) =====

function rankProducts(products: Product[], prefs: Prefs, viewsMap: Record<number, number>): Product[] {
  // 1. Desduplicar (manter o mais barato)
  const deduped = dedupeProducts(products);

  // 2. Aplicar ranking/pontuação
  const ranked = deduped
    .map((p) => {
      let score = 0;
      let reason = "";

      // 1. Preferência por Gênero
      if (p.gender === prefs.gender || p.gender === "unisex") {
        score += 10;
        reason += "G";
      }

      // 2. Preferência por Categoria (a mais forte)
      const commonCategories = p.categories
        ? intersects(new Set(p.categories), prefs.categories.keys())
        : [];
      if (commonCategories.length > 0) {
        let maxWeight = 0;
        for (const cat of commonCategories) {
          maxWeight = Math.max(maxWeight, prefs.categories.get(cat) ?? 0);
        }
        score += maxWeight * 10;
        reason += `C${maxWeight}`;
      }

      // 3. Preferência por Loja (a mais forte)
      const storeWeight = prefs.stores.get(p.store_name) ?? 0;
      score += storeWeight * 5;
      reason += `L${storeWeight}`;

      // 4. Preferência por Visualização (Decay)
      const viewCount = viewsMap[p.id] ?? 0;
      score -= Math.min(viewCount, 3) * 5; // Penaliza produtos vistos, no máximo 3 vezes
      reason += `V${viewCount}`;

      // 5. Preferência por Última Interação
      // Decaimento de 5% por dia (1 - 0.05)^dias = 0.95^dias
      // Não implementado aqui para simplificar, mas seria o próximo passo

      // 6. Preferência por Faixa de Preço (não implementado ainda)
      // 7. Preferência por Faixa de ETA (não implementado ainda)

      return { ...p, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  // 3. Retornar os produtos ordenados (sem os campos extras)
  return ranked.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { score, reason, ...rest } = p;
    return rest;
  });
}

function categoryKeyStats(products: Product[]): KeyStat[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    const cats = categoriesOf(p);
    for (const cat of cats) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }

  const total = products.length;
  if (total === 0) return [];

  const stats = Array.from(counts.entries())
    .map(([t, c]) => ({ t, w: c / total }))
    .sort((a, b) => b.w - a.w);

  return stats;
}

// ===== Componente Principal (Suspense é para otimização de Next.js) =====

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 p-5 pt-10">
          <h1 className="text-4xl font-semibold tracking-tight text-black">
            Look
          </h1>
          <div className="mt-8 space-y-6">
            <div className="h-6 w-1/3 animate-pulse rounded bg-neutral-200" />
            <div className="h-[300px] w-full animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-6 w-2/5 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 space-y-6 px-1">
              <div className="h-[220px] w-full animate-pulse rounded-2xl bg-neutral-200" />
              <div className="h-[220px] w-full animate-pulse rounded-2xl bg-neutral-200" />
            </div>
          </div>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();

  // ----- Estado de Filtros (Client) -----
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewsMap, setViewsMap] = useState<Record<number, number>>({});

  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<
    "genero" | "tamanho" | "categorias"
  >("categorias");

  // Filtros (usamos Set para performance e controle)
  const [selectedGenders, setSelectedGenders] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(() => new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set()
  );

  const clearAll = () => {
    setSelectedGenders(() => new Set());
    setSelectedSizes(() => new Set());
    setSelectedCategories(() => new Set());
  };

  const anyFilterActive = useMemo(() => {
    return (
      selectedGenders.size > 0 ||
      selectedSizes.size > 0 ||
      selectedCategories.size > 0
    );
  }, [selectedGenders, selectedSizes, selectedCategories]);

  // ----- Lógica de Produtos (Custom Hook) -----
  const {
    products,
    loading: initialLoading,
    loadingMore,
    hasMore,
    loadMoreError,
    fetchMore,
  } = useInfiniteProducts();

  // Sentinel para Intersection Observer (lazy load)
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ----- Efeitos de Inicialização e Data Fetching -----

  // 1. Fetch Prefs (Preferências)
  useEffect(() => {
    (async () => {
      const p = await getPrefsV2();
      setPrefs(p);
      decayAll(); // Aplica decaimento na pontuação
    })();
  }, []);

  // 2. Fetch Profile and Views Map
  useEffect(() => {
    (async () => {
      // 2a. User/Profile
      const { data: userData } = await supabase.auth.getSession();
      if (userData.session) {
        const userId = userData.session.user.id;
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        setProfile(profileData || null);
      }

      // 2b. Views Map (para ranqueamento)
      const views = await getViewsMap();
      setViewsMap(views);
    })();
  }, []);

  // 3. Observer para carregar mais
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !anyFilterActive) {
          fetchMore();
        }
      },
      { rootMargin: "200px" } // Carregar quando estiver a 200px do final
    );

    const currentRef = sentinelRef.current;
    if (currentRef && hasMore && !anyFilterActive) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadingMore, fetchMore, anyFilterActive]);

  // ----- Lógica de Filtragem e Ranqueamento (Memoização) -----
  const { filteredRanked, allCategories } = useMemo(() => {
    if (!products || !prefs) {
      return { filteredRanked: [], allCategories: [] };
    }

    // 1. Filtrar
    const filtered = products.filter((p) => {
      // Gênero
      if (
        selectedGenders.size > 0 &&
        p.gender &&
        !selectedGenders.has(p.gender)
      ) {
        return false;
      }
      // Tamanho
      if (selectedSizes.size > 0) {
        if (!p.sizes) return false;
        if (!intersects(new Set(p.sizes), selectedSizes).length) return false;
      }
      // Categoria
      if (selectedCategories.size > 0) {
        const productCategories = categoriesOf(p);
        if (!productCategories.length) return false;
        if (!intersects(new Set(productCategories), selectedCategories).length) {
          return false;
        }
      }

      // Requisitos básicos de Loja/Entrega
      const isAvailable = inCoverage(profile) && hasContact(profile);
      if (!isAvailable) {
        // Se o usuário não tem dados básicos, filtramos apenas por lojas de cobertura
        // (Aqui precisaríamos de um campo `coverage_area` na loja, que está ausente,
        // então por enquanto, não fazemos filtro de cobertura no frontend).
      }

      return true;
    });

    // 2. Ranqueamento
    const ranked = rankProducts(filtered, prefs, viewsMap);

    // 3. Extrair todas as categorias (para o modal de filtro)
    const uniqueCategories = new Set<string>();
    products.forEach((p) => {
      categoriesOf(p).forEach((c) => uniqueCategories.add(c));
    });

    return { filteredRanked: ranked, allCategories: Array.from(uniqueCategories) };
  }, [products, prefs, viewsMap, selectedGenders, selectedSizes, selectedCategories, profile]);

  const loading = initialLoading && products.length === 0;

  // ----- Lógica de Banner/Chips (para uso futuro) -----
  // Apenas a lista de chips mais relevantes, sem aplicar o filtro
  const topCategoryStats = useMemo(() => {
    if (!products) return [];
    return categoryKeyStats(products).slice(0, 5);
  }, [products]);

  // ----- Renderização de Produtos (com injeção de banners) -----
  const renderProducts = useMemo(() => {
    if (!prefs) return null;

    // Função que renderiza o bloco de produtos com injeção de banners
    return (
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
        {(() => {
          const items: React.ReactNode[] = [];
          let productsPushed = 0;
          let lastCategory = "";

          const pushProducts = (max: number) => {
            filteredRanked
              .slice(productsPushed, productsPushed + max)
              .forEach((product, _item) => { // CORREÇÃO: Linha ~437 (originalmente 445:16) - `item` (o index) renomeado para `_item`
                const currentCategory = categoriesOf(product)[0] || "";

                if (currentCategory && currentCategory !== lastCategory) {
                  // Injeta um banner ou separador baseado na mudança de categoria
                  // if (lastCategory) {
                  //   items.push(
                  //     <div key={`sep-${currentCategory}`} className="col-span-2 h-0.5 bg-gray-100 my-4" />
                  //   );
                  // }
                  lastCategory = currentCategory;
                }

                items.push(
                  <ProductCard
                    key={product.id}
                    product={product}
                    showEta={hasAddressBasics(profile)}
                    showLike={true}
                    prefs={prefs}
                    onLike={handleLike}
                  />
                );
              });

            productsPushed += max;
          };

          // 1. Primeiros 4 produtos
          pushProducts(4);

          // 2. Banner injetado
          items.push(
            <SelectionHeroBanner
              key="banner-selectionHero"
              banner={INLINE_BANNERS.selectionHero}
            />
          );

          // 3. restante do que já carregou
          pushProducts(Number.MAX_SAFE_INTEGER);

          if (items.length === 0) {
            items.push(
              <p
                key="empty"
                className="col-span-2 mt-4 text-sm text-gray-600"
              >
                Nenhum produto encontrado com os filtros atuais.
              </p>
            );
          }

          return items;
        })()}
      </div>
    );
  }, [filteredRanked, prefs, profile]);

  // Lógica de "Like" (interação com o usuário)
  const handleLike = useCallback(
    (product: Product) => {
      // 1. Atualiza preferências (bump store/category/gender)
      bumpProduct(product.id);
      if (product.store_name) bumpStore(product.store_name);
      if (product.gender) bumpGender(product.gender);

      const cats = categoriesOf(product);
      cats.forEach((c) => bumpCategory(c));

      // 2. Atualiza os dados locais de prefs (para refletir o ranqueamento)
      setPrefs(getPrefsV2());
    },
    [setPrefs]
  );

  // ----- JSX do Componente -----

  return (
    <>
      <main className="min-h-screen bg-neutral-50 pb-20">
        <HeaderBar
          profile={profile}
          showMapButton={hasContact(profile)}
          onFilterClick={() => setFilterModalOpen(true)}
        />

        {loading && (
          <div className="mt-8 space-y-6 px-5">
            <div className="h-6 w-1/3 animate-pulse rounded bg-neutral-200" />
            <div className="h-[300px] w-full animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-6 w-2/5 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 space-y-6 px-1">
              <div className="h-[220px] w-full animate-pulse rounded-2xl bg-neutral-200" />
              <div className="h-[220px] w-full animate-pulse rounded-2xl bg-neutral-200" />
            </div>
          </div>
        )}

        {/* Home Carousel Banner (topo) */}
        {!loading && (
          <div className="px-5 pt-3">
            <BannersCarousel banners={HOME_CAROUSEL} />
          </div>
        )}

        {/* Chips de Categoria mais populares */}
        {!loading && !anyFilterActive && topCategoryStats.length > 0 && (
          <ChipsRow title="O que está em alta" stats={topCategoryStats} />
        )}

        {/* Filtros ativos */}
        {!loading && filteredRanked.length > 0 && (
          <div className="mt-4 space-y-3 px-5">
            {(anyFilterActive) && (
              <div className="flex flex-wrap gap-2">
                {[...selectedCategories].map((c) => (
                  <span key={`c-${c}`} className="px-3 h-9 rounded-full border text-sm capitalize bg-black text-white border-black">{c}</span>
                ))}
                {[...selectedGenders].map((g) => (
                  <span key={`g-${g}`} className="px-3 h-9 rounded-full border text-sm bg-black text-white border-black">{g === "female" ? "Feminino" : "Masculino"}</span>
                ))}
                {[...selectedSizes].map((s) => (
                  <span key={`s-${s}`} className="px-3 h-9 rounded-full border text-sm bg-black text-white border-black">{s}</span>
                ))}
                <button onClick={clearAll} className="px-3 h-9 rounded-full border text-sm bg-white text-gray-800 border-gray-200 hover:bg-gray-50">Limpar tudo</button>
              </div>
            )}
          </div>
        )}


        {/* Produtos */}
        {!loading && (
          <div className="px-5">
            <h2 className="mt-6 text-xl font-semibold tracking-tight text-black">
              {anyFilterActive
                ? `Resultados (${filteredRanked.length})`
                : "Seus favoritos"}
            </h2>

            {renderProducts}

            {loadingMore && (
              <div className="mt-2 space-y-6 px-1">
                <div className="h-[220px] w-full animate-pulse rounded-2xl bg-neutral-200" />
                <div className="h-[220px] w-full animate-pulse rounded-2xl bg-neutral-200" />
              </div>
            )}

            {loadMoreError && (
              <p className="mt-3 text-center text-sm text-red-600">
                Erro ao carregar mais itens
              </p>
            )}

            {hasMore && !anyFilterActive && <div ref={sentinelRef} className="h-8" />}

            {!hasMore && filteredRanked.length > 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">
                Fim do catálogo
              </p>
            )}
          </div>
        )}

        <AppDrawer />
      </main>

      {/* Modal de Filtros */}
      <FiltersModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        activeTab={activeFilterTab}
        setActiveTab={setActiveFilterTab}
        allCategories={allCategories}
        selectedGenders={selectedGenders}
        setSelectedGenders={setSelectedGenders}
        selectedSizes={selectedSizes}
        setSelectedSizes={setSelectedSizes}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        clearAll={clearAll}
        onApply={() => setFilterModalOpen(false)}
      />
    </>
  );
}

// CORREÇÕES ANTERIORES JÁ APLICADAS:
// - `BannersTriplet` removido do import (L. 15)
// - `dedupeProducts` importado e usado (L. 44, L. 110)
