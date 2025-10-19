// ./app/stores/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type StoreCard = {
  id: number; // ← agora obrigatório
  name: string;
  slug: string; // slug + id, garantidamente único
};

// Tipagem para a linha de loja retornada pelo Supabase
type StoreRow = {
  id: number;
  name: string | null;
  store_name: string | null;
  brand_name: string | null;
  city: string | null;
  slug: string | null;
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Tipagem para os argumentos de displayStoreName
type DisplayNameProps = Pick<StoreRow, "store_name" | "brand_name" | "city">;

/** Monta nome exibido combinando brand + store quando fizer sentido. */
function displayStoreName(row: DisplayNameProps): string { // Tipado o retorno como string
  const store = (row.store_name ?? "").trim();
  const brand = (row.brand_name ?? "").trim();

  if (brand && store) {
    const starts = store.toLowerCase().startsWith(brand.toLowerCase());
    return starts ? store : `${brand} ${store}`; // p.ex. "Austral Iguatemi"
  }
  // fallback: tenta city para diferenciar
  if (!store && brand && row.city) return `${brand} ${row.city}`;
  return store || brand || "Loja";
}

/** Busca TODAS as lojas do usuário via RPC. */
async function fetchAllStoresForUser(): Promise<StoreCard[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. Busca todos os store_ids que o user tem acesso
  const { data: storeAccess, error: accessError } = await supabase
    .from("store_access")
    .select("store_id")
    .eq("user_id", user.id);

  if (accessError || !storeAccess || storeAccess.length === 0) {
    console.error("Erro ao buscar store_access:", accessError);
    return [];
  }

  const storeIds = storeAccess.map((a) => a.store_id);

  // 2. Busca os dados da loja (brand/store/slug)
  const { data: storeRows, error: storeError } = await supabase
    .from("stores")
    .select("id, name, store_name, brand_name, city, slug")
    .in("id", storeIds);

  if (storeError) {
    console.error("Erro ao buscar stores:", storeError);
    return [];
  }

  // 3. Mapeia para o formato StoreCard (aplicando displayStoreName e slugify)
  // O tipo StoreRow é usado para garantir a tipagem correta
  return (storeRows as StoreRow[]).map((row) => {
    // CORREÇÃO LINHA 64: 'as any' removido e tipo 'StoreRow' inferido/assertado
    const name = displayStoreName(row); 
    const slug = `${slugify(row.store_name || row.name || name)}-${row.id}`;

    return {
      id: row.id,
      name,
      slug,
    };
  });
}

// Componente para renderizar o card de loja
function StoreCardRenderer({ store }: { store: StoreCard }) {
  const s = store;

  return (
    <Link
      // O slug garante que a URL será única por conta do "slug-id"
      href={`/stores/${s.slug}?n=${encodeURIComponent(s.name)}&sid=${s.id}`}
      title={s.name}
      className="group rounded-2xl border h-28 transition
                 bg-[#141414] border-[#141414]
                 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center px-3"
    >
      <div className="text-center text-white">
        <div className="text-[15px] font-semibold line-clamp-2">
          {s.name}
        </div>
        <div
          className="mt-2 inline-flex items-center gap-1 px-3 h-7 rounded-full border text-[11px] font-medium transition"
          style={{
            backgroundColor: "transparent",
            borderColor: "white",
            color: "white",
          }}
        >
          Ver peças
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            style={{ stroke: "white" }}
          >
            <path
              d="M9 18l6-6-6-6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllStoresForUser()
      .then((s) => setStores(s))
      // CORREÇÃO LINHA 140: 'any' trocado por 'unknown' (melhor prática em catch)
      .catch((e: unknown) => { 
        console.error(e);
        setError("Erro ao carregar lojas");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="canvas max-w-md mx-auto min-h-screen p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-black">
          Lojas
        </h1>
        <p className="mt-1 text-sm text-gray-600">Carregando...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="canvas max-w-md mx-auto min-h-screen p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-black">
          Lojas
        </h1>
        <p className="mt-1 text-sm text-red-600">
          Não foi possível carregar as lojas.
        </p>
      </main>
    );
  }

  if (!stores || stores.length === 0) {
    return (
      <main className="canvas max-w-md mx-auto min-h-screen p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-black">
          Lojas
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Nenhuma loja encontrada para seu usuário.
        </p>
      </main>
    );
  }

  return (
    <main className="canvas max-w-md mx-auto min-h-screen p-5">
      <h1 className="text-2xl font-semibold tracking-tight text-black">
        Lojas
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Selecione uma loja para começar a ver as peças.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {stores.map((s) => (
          <StoreCardRenderer key={s.id} store={s} />
        ))}
      </div>
    </main>
  );
}
