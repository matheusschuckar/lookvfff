// app/product/[id]/page.tsx
"use client";

// CORRIGIDO: `useState` re-adicionado ao import, pois é usado no componente.
import { useEffect, useMemo, useRef, useState } from "react"; 
import { useParams, useRouter, notFound } from "next/navigation"; // notFound adicionado
import Image from "next/image";
import { Copy, Plus, Minus, Loader2 } from "lucide-react";

// OBS: Se você usa `useState`, esta página DEVE ser um Client Component
// (com 'use client' no topo) e o `createClient` deve vir de "@/lib/supabase/client"
// No entanto, para corrigir APENAS os erros listados, mantive o import server.
// AVISO: A mistura de `async` component + `useState` é uma falha de arquitetura
// Next.js (Server/Client Component) que deve ser resolvida em uma refatoração.
import { createClient } from "@/lib/supabase/server"; 
import { getProduct, getProductsInStore } from "@/lib/data/catalog";
import { Product } from "@/lib/data/types";
import { toCurrency } from "@/lib/ui/helpers";
import Header from "@/components/Header";
import Container from "@/components/Container";
import ProductDetails from "@/components/ProductDetails";
import StoreList from "@/components/StoreList";
import RelatedProducts from "@/components/RelatedProducts";

// Tipagem para dados da loja, eliminando 'as any' em store_data
type StoreData = {
  id: string;
  name: string;
  slug: string;
};

// Tipagem para o objeto que estende Product e contém store_data
interface ExtendedProduct extends Product {
  store_data: StoreData;
}

// Tipagem para o objeto que vai para a tabela 'cart_items'
type CartItem = {
    product_id: string;
    quantity: number;
    user_id: string;
    store_id: string;
    name: string;
    price: number;
    image_url: string;
};

interface Props {
  params: { id: string };
}

export default async function ProductPage({ params }: Props) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const product = await getProduct(params.id);

  if (!product) {
    notFound();
  }
  
  // Asserção única para o produto estendido, eliminando vários 'as any'
  const extendedProduct = product as ExtendedProduct;

  // Related products logic
  const relatedProducts = await getProductsInStore(
    extendedProduct.store_id,
    extendedProduct.id
  );

  // Cart logic
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  
  // CORREÇÃO 1: 'view' não é reatribuída. De `let` para `const`.
  const view = "details"; 

  const addToCart = async () => {
    if (!session) {
      // Redirecionar para login ou mostrar erro
      return;
    }

    setLoading(true);
    setError(null);

    // Tipagem explícita aqui elimina o `as any` no upsert
    const cartItem: CartItem = {
      product_id: extendedProduct.id,
      quantity: qty,
      user_id: session.user.id,
      store_id: extendedProduct.store_id,
      name: extendedProduct.name,
      price: extendedProduct.price,
      image_url: extendedProduct.image_url,
    };

    // CORREÇÃO 2: Removido `as any`
    const { data, error: err } = await supabase
      .from("cart_items")
      .upsert(cartItem) 
      .select()
      .single();

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const currentPrice = toCurrency(extendedProduct.price);
  
  const handleCopy = () => {
    // CORREÇÃO 3: Removido `as any` desnecessário
    navigator.clipboard.writeText(window.location.href); 
  };
  
  return (
    <>
      <Header />
      <Container>
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column: Product Image */}
          <div className="lg:w-1/2">
            <Image
              src={extendedProduct.image_url}
              alt={extendedProduct.name}
              width={600}
              height={600}
              className="object-contain w-full h-auto"
            />
            {/* Share link and Copy button */}
            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== 'undefined' ? window.location.href : ''}
                className="input input-bordered w-full text-sm"
              />
              <button onClick={handleCopy} className="btn btn-square">
                <Copy size={20} />
              </button>
            </div>
          </div>

          {/* Right Column: Details and Cart */}
          <div className="lg:w-1/2">
            <h1 className="text-3xl font-bold mb-2">{extendedProduct.name}</h1>
            <p className="text-xl text-primary font-semibold mb-4">{currentPrice}</p>
            
            {/* Tabs for Details/Stores */}
            <div role="tablist" className="tabs tabs-boxed mb-4">
              <a
                role="tab"
                className={`tab ${view === "details" ? "tab-active" : ""}`}
                // view é const, o estado de abas deve ser gerenciado com `useState` se for clicável.
              >
                Detalhes
              </a>
              <a
                role="tab"
                className={`tab ${view === "stores" ? "tab-active" : ""}`}
                // view é const
              >
                Lojas ({extendedProduct.store_count || 1})
              </a>
            </div>
            
            {/* Conditional Content based on view */}
            {view === "details" && (
              // CORREÇÃO 4 (Linha 202): Usa extendedProduct
              <ProductDetails product={extendedProduct} /> 
            )}

            {view === "stores" && (
              // CORREÇÃO 5 (Linha 333): Usa store_data tipado
              <StoreList store={extendedProduct.store_data} />
            )}

            {/* Quantity Selector and Add to Cart */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Quantidade</h3>
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="btn btn-square"
                >
                  <Minus size={20} />
                </button>
                <span className="text-xl font-bold w-8 text-center">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="btn btn-square">
                  <Plus size={20} />
                </button>
              </div>

              <button
                onClick={addToCart}
                className="btn btn-primary w-full"
                disabled={loading || added}
              >
                {loading && <Loader2 className="animate-spin" size={24} />}
                {!loading && added && "Adicionado!"}
                {!loading && !added && "Adicionar à Sacola"}
              </button>

              {error && <p className="text-error mt-2">{error}</p>}
            </div>
          </div>
        </div>

        {/* Related Products Section */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Produtos Relacionados</h2>
          <RelatedProducts products={relatedProducts} />
        </div>
      </Container>
    </>
  );
}
