// components/StoreHero.tsx

import React from "react";
import type { Store } from "@/lib/data/types"; // Assumindo que você usa Store de types.ts

// Tipo simplificado para o Store, caso o tipo em "@/lib/data/types" seja diferente
type StoreDisplay = {
  store_name: string;
  hero_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  address: string | null;
};

/**
 * Componente Hero Banner para a página da Loja.
 * Exibe a imagem de capa e informações principais.
 */
export default function StoreHero({ store }: { store: StoreDisplay }) {
  // Fallback para a imagem
  const imageUrl = store.hero_image_url || "https://images.unsplash.com/photo-1541094017006-25816913c2f0?q=80&w=2070&auto=format&fit=crop";
  
  return (
    <div className="relative w-full h-64 overflow-hidden mb-6">
      <img
        src={imageUrl}
        alt={`Hero banner de ${store.store_name}`}
        className="absolute inset-0 w-full h-full object-cover object-center"
      />
      {/* Overlay escuro para melhorar a leitura do texto */}
      <div className="absolute inset-0 bg-black/30" />
      
      <div className="absolute bottom-0 left-0 p-5 text-white">
        <h1 className="text-3xl font-bold tracking-tight">
          {store.hero_title || store.store_name}
        </h1>
        {store.hero_subtitle && (
          <p className="mt-1 text-sm">{store.hero_subtitle}</p>
        )}
        {store.address && (
          <p className="mt-2 text-xs opacity-80">📍 {store.address}</p>
        )}
      </div>
    </div>
  );
}
