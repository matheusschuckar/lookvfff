"use client";

import Image from "next/image";
import Link from "next/link";
// Importa o tipo base Product
import type { Product } from "@/lib/data/types";

// CORREÇÃO: Define um novo tipo que inclui as propriedades opcionais do dedupe.
type DeduplicatedProduct = Product & {
  store_count?: number;
  stores?: string[];
};

export default function ProductCard({
  // CORREÇÃO: Usa o novo tipo DeduplicatedProduct para o prop 'p'
  p,
  onTap,
}: {
  p: DeduplicatedProduct;
  onTap?: (p: Product) => void;
}) {
  const photo = Array.isArray(p.photo_url)
    ? p.photo_url[0]
    : typeof p.photo_url === "string"
    ? p.photo_url
    : null;

  const price =
    typeof p.price_tag === "number"
      ? `R$ ${p.price_tag.toFixed(2).replace(".", ",")}`
      : String(p.price_tag ?? "");

  // extras vindos do dedupe (opcionais)
  // CORREÇÃO: Removido 'as any' — Linha 26:35
  const storeCount = Number(p.store_count ?? 1); 
  
  // CORREÇÃO: Removido 'as any' — Linhas 27:42 e 28:14
  const storesList = Array.isArray(p.stores)
    ? p.stores
    : [];
    
  const extraStoresLabel = storeCount > 1 ? ` · +${storeCount - 1} lojas` : "";

  const handleClick = () => {
    onTap?.(p);
  };

  return (
    <Link
      href={`/product/${p.id}`}
      prefetch={false}
      onClick={handleClick}
      className="block group rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition"
    >
      <div className="relative w-full aspect-[4/5] bg-gray-100">
        {photo ? (
          <Image
            src={photo}
            alt={p.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gray-100" />
        )}
      </div>

      <div className="px-2 py-3">
        <div className="text-[13px] font-medium text-gray-900 line-clamp-2">
          {p.name}
        </div>

        <div
          className="mt-1 text-[12px] text-gray-500 truncate"
          title={
            storesList.length > 1
              ? `${p.store_name} · também em: ${storesList
                  .filter((s) => s !== p.store_name)
                  .join(", ")}`
              : ""
          }
        >
          {p.store_name}
          <span className="text-gray-400">{extraStoresLabel}</span>
        </div>
        
        <div className="mt-1 text-[13px] font-semibold text-[#141414]">
          {price}
        </div>
      </div>
    </Link>
  );
}
