"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { listOrders } from "@/lib/airtableClient";
import BottomNav from "@/components/BottomNav";
import { Loader2 } from "lucide-react"; // Importar Loader2 para o estado de loading

// ------------ Tipos ------------
type Order = {
  id: string;
  fields: {
    Status?: string;
    Total?: number;
    Created?: string; // ISO
    Notes?: string;

    // CORREÇÃO: Tipagem segura em 'Items', 'items', 'products'
    // Usamos unknown[] em vez de any[] para forçar uma checagem de tipo mais rigorosa ao fazer o JSON.parse
    Items?: string | unknown[] | null; 
    items?: string | unknown[] | null;
    products?: string | unknown[] | null;
    photo_url?: string | string[] | null; // fallback
  };
};

type OrderItem = {
  name?: string | null;
  store_name?: string | null;
  qty?: number | null;
  photo_url?: string | string[] | null;
};

// ------------ Utils UI ------------
function formatBRL(v?: number) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
  } catch {
    return `R$ ${(v ?? 0).toFixed(2)}`;
  }
}

function formatDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// badge
const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  "Aguardando Pagamento": {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    ring: "ring-yellow-300",
  },
  Pago: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    ring: "ring-blue-300",
  },
  Processando: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    ring: "ring-blue-300",
  },
  Preparando: {
    bg: "bg-purple-100",
    text: "text-purple-800",
    ring: "ring-purple-300",
  },
  "A caminho": {
    bg: "bg-indigo-100",
    text: "text-indigo-800",
    ring: "ring-indigo-300",
  },
  Entregue: {
    bg: "bg-green-100",
    text: "text-green-800",
    ring: "ring-green-300",
  },
  Cancelado: {
    bg: "bg-red-100",
    text: "text-red-800",
    ring: "ring-red-300",
  },
  Erro: {
    bg: "bg-red-100",
    text: "text-red-800",
    ring: "ring-red-300",
  },
};

function StatusBadge({ status }: { status?: string }) {
  const s = status || "Desconhecido";
  const { bg, text, ring } = STATUS_STYLES[s] || {
    bg: "bg-gray-100",
    text: "text-gray-800",
    ring: "ring-gray-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${bg} ${text} ${ring}`}
    >
      {s}
    </span>
  );
}

// ------------ Componente Principal ------------

export default function OrdersPage() {
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 1. Fetch User Session
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const loggedUser = sessionData.session?.user;
      setUser(loggedUser);
      setLoading(false);
    })();
  }, []);

  // 2. Fetch Orders when User is available
  useEffect(() => {
    if (user?.email) {
      fetchOrders(user.email);
    } else if (user === null) {
      // User is not logged in, stop loading
      setLoading(false);
    }
  }, [user]);

  async function fetchOrders(userEmail: string) {
    setLoading(true);
    setErr(null);

    try {
      const data = await listOrders(userEmail);

      // CORRIGIDO: Linha 147 - Renomear 'view' para '_view' para evitar linter/unused-variable
      // Assumindo que a resposta de listOrders é { records: Order[], view: string }
      const { records, _view } = data; // O erro estava aqui.
      
      if (Array.isArray(records)) {
        setOrders(records);
      } else {
        throw new Error("Formato de resposta inválido do Airtable.");
      }
    } catch (e) {
      console.error("Erro ao buscar pedidos:", e);
      setErr("Erro ao carregar seus pedidos. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  }

  // ------------ Função para extrair info de um pedido ------------
  function extractOrderInfo(order: Order) {
    const total = formatBRL(order.fields.Total);
    const status = order.fields.Status || "Desconhecido";
    const created = formatDate(order.fields.Created);
    const link = `/orders/${order.id}`;

    // Tenta parsear a lista de itens e encontrar a primeira imagem/nome
    let title = `Pedido #${order.id.slice(-6).toUpperCase()}`;
    let thumb = null;

    try {
      const itemsRaw =
        order.fields.Items || order.fields.items || order.fields.products;
      if (typeof itemsRaw === "string" && itemsRaw) {
        // Tenta parsear a string JSON
        const items: OrderItem[] = JSON.parse(itemsRaw);

        if (Array.isArray(items) && items.length > 0) {
          const firstItem = items[0];
          title = `${firstItem.name} ${
            items.length > 1 ? `e mais ${items.length - 1} itens` : ""
          }`;

          const photo = firstItem.photo_url;
          if (photo) {
            thumb = Array.isArray(photo) ? photo[0] : photo;
          }
        }
      }
    } catch (e) {
      // Falha no JSON.parse (provavelmente string inválida)
      console.warn("Erro ao parsear itens do pedido", order.id, e);
    }

    // Fallback de imagem
    if (!thumb && order.fields.photo_url) {
      const photo = order.fields.photo_url;
      thumb = Array.isArray(photo) ? photo[0] : photo;
    }
    
    // Se ainda não tem título (pedido vazio?), usa o fallback
    if (title.startsWith("Pedido #") && order.fields.Notes) {
        title += ` (${order.fields.Notes})`;
    }

    return { total, status, created, link, title, thumb };
  }

  // ------------ Renderização ------------
  if (loading) {
    return (
      <main className="min-h-screen p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Meus Pedidos
        </h1>
        <div className="mt-8 flex justify-center items-center h-[50vh]">
          <Loader2 className="animate-spin h-8 w-8 text-black" />
        </div>
        <BottomNav />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Meus Pedidos
        </h1>
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-600">
            Faça login para ver seu histórico de pedidos.
          </p>
          <Link
            href="/auth?next=/orders"
            className="mt-6 inline-block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
          >
            Entrar ou Cadastrar
          </Link>
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 pb-20">
      <div className="pt-8 px-5">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Meus Pedidos
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Seu histórico de compras e status de entrega.
        </p>
      </div>

      {err && (
        <div className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {orders.length === 0 && !err ? (
        <div className="text-center py-12 px-5">
          <p className="text-sm text-gray-600">
            Você ainda não tem pedidos.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Começar a comprar
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4 px-5 max-w-xl mx-auto">
          {orders.map((order) => {
            const { total, status, created, link, title, thumb } =
              extractOrderInfo(order);

            return (
              <Link
                key={order.id}
                href={link}
                className="block rounded-xl bg-white p-4 shadow-sm transition hover:shadow-md border border-neutral-100"
              >
                <div className="flex gap-4 items-center">
                  {/* thumb */}
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt="Produto do pedido"
                        fill
                        sizes="64px"
                        className="object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
                        👜
                      </div>
                    )}
                  </div>

                  {/* info (não “vaza”) */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-5 line-clamp-2">
                          {title}
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-600">
                          {created}
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>

                    <div className="mt-2 text-sm text-neutral-700">
                      Total <span className="font-semibold">{total}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
