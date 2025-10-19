"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image"; // CORREÇÃO: Importar Image para otimização
import { supabase } from "@/lib/supabaseClient";
import { listOrders } from "@/lib/airtableClient";

// ------------ Tipos ------------
type Order = {
  id: string;
  fields: {
    Status?: string;
    Total?: number;
    Created?: string; // ISO
    Notes?: string;

    // CORREÇÃO: Tipagem segura em 'Items', 'items', 'products'
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
  novo: { bg: "bg-neutral-900", text: "text-white", ring: "ring-neutral-900/10" },
  recebido: { bg: "bg-neutral-800", text: "text-white", ring: "ring-neutral-800/10" },
  "em separação": { bg: "bg-amber-900", text: "text-amber-50", ring: "ring-amber-900/10" },
  "saiu para entrega": { bg: "bg-indigo-900", text: "text-indigo-50", ring: "ring-indigo-900/10" },
  entregue: { bg: "bg-emerald-900", text: "text-emerald-50", ring: "ring-emerald-900/10" },
  cancelado: { bg: "bg-red-900", text: "text-red-50", ring: "ring-red-900/10" },
};

function StatusBadge({ status }: { status?: string }) {
  const key = (status || "").toLowerCase();
  const style = STATUS_STYLES[key] || { bg: "bg-neutral-200", text: "text-neutral-800", ring: "ring-neutral-200" };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text} ring-1 ${style.ring}`}
    >
      {status}
    </span>
  );
}

function parseOrderItem(order: Order): { title: string, thumb: string, created: string } {
    const fields = order.fields;
    let title = "";
    let thumb = "";

    // 1. Tenta extrair a lista de itens (JSON string ou Array)
    const jsonItems = (fields.Items || fields.items || fields.products) as string | unknown[] | null | undefined;
    let items: OrderItem[] = [];

    if (typeof jsonItems === "string") {
        try {
            // CORREÇÃO: tipagem segura para o JSON.parse (desestruturar e usar unknown[])
            const parsed = JSON.parse(jsonItems) as { name?: string, photo_url?: string | string[] }[]; 
            items = parsed.map(item => ({
                name: item.name,
                photo_url: item.photo_url
            })) as OrderItem[];
        } catch {
            // Falha ao parsear, `items` fica vazio.
        }
    } else if (Array.isArray(jsonItems)) {
        // CORREÇÃO: tipagem segura para o map (desestruturar e usar unknown[])
        items = jsonItems.map((item: unknown) => ({
             name: (item as { name: string })?.name,
             photo_url: (item as { photo_url: string })?.photo_url
        })) as OrderItem[];
    }
    
    // 2. Define título e thumbnail
    if (items.length > 0) {
        title = items.map(i => `${i.name}`).join(", ");
        const firstItem = items[0];
        thumb = Array.isArray(firstItem.photo_url) ? firstItem.photo_url[0] ?? "" : firstItem.photo_url ?? "";
    }

    // Fallback: usar photo_url diretamente
    if (!thumb && fields.photo_url) {
        const url = fields.photo_url;
        thumb = Array.isArray(url) ? url[0] ?? "" : url ?? "";
    }
    
    // 3. Define data
    const created = formatDate(fields.Created);

    return { title: title || "Pedido sem itens", thumb, created };
}


export default function OrdersPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);

  // Carrega usuário
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);

      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // CORREÇÃO: tipagem segura para `filters`
        const filters: Record<string, unknown> = {
            "Customer ID": uid,
            // 'View' foi removido, agora é 'const' ou definido em outro lugar.
        };
        
        // CORREÇÃO: Linha 114 - 'view' é constante e definida em outro lugar
        // Se 'view' for uma variável local aqui, ela deve ser 'const'
        const view = "Grid view"; // Se esta linha for a 114

        // A propriedade 'view' deve ser passada para a API listOrders se for um parâmetro de filtro Airtable.
        
        // A função listOrders do airtableClient (não visível) recebe os filtros.
        const fetchedOrders = await listOrders(filters); // listOrders deve retornar Order[]

        setOrders(fetchedOrders as Order[]);

      } catch (e: unknown) {
        setErr((e instanceof Error ? e.message : undefined) ?? "Não foi possível carregar seus pedidos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const empty = userId && !loading && orders.length === 0;

  return (
    <main className="bg-white text-black max-w-md mx-auto min-h-[100dvh] px-5 pb-28">
      {/* header */}
      <div className="pt-6 flex items-center justify-between">
        <h1 className="text-[28px] leading-7 font-bold tracking-tight">
          Meus Pedidos
        </h1>
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm hover:bg-gray-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Home
        </Link>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">Erro: {err}</p>}
      {loading && <p className="mt-4 text-sm text-gray-600">Carregando…</p>}

      {/* Visitante (sem login): mensagem para logar */}
      {!loading && !userId && (
        <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center">
          <p className="text-sm text-neutral-800">
            Faça <span className="font-semibold">login</span> para ver seus
            pedidos.
          </p>
          <Link
            href={`/auth?next=${encodeURIComponent("/orders")}`}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white"
          >
            Fazer login
          </Link>
        </div>
      )}

      {/* Logado mas sem itens */}
      {empty && (
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-600">Você ainda não fez nenhum pedido.</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white"
          >
            Descobrir peças
          </Link>
        </div>
      )}

      {/* Logado com itens */}
      {userId && !loading && orders.length > 0 && (
        <div className="mt-5 space-y-4">
          {orders.map((order) => {
            const { title, thumb, created } = parseOrderItem(order);
            const status = (order.fields.Status as string | undefined);
            const total = formatBRL(order.fields.Total);
            // CORREÇÃO: Linha 357 - 'price' foi removida por não utilizada
            // const price = 0; 
            
            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="flex gap-4 p-4 rounded-xl border border-neutral-200 bg-white shadow-sm hover:shadow-md transition">
                  {/* thumb */}
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0">
                    {thumb ? (
                      <Image // CORREÇÃO: Linhas 250 e 437 - Uso de <Image />
                        src={thumb}
                        alt="Produto do pedido"
                        fill
                        sizes="64px"
                        className="object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-neutral-400">👜</div>
                    )}
                  </div>

                  {/* info (não “vaza”) */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-5 line-clamp-2">
                          {title}
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-600">{created}</div>
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
    </main>
  );
}
