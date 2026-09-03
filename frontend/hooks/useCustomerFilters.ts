'use client';

import { useMemo, useState } from 'react';
import { CustomerReport, TierFilter } from '@/types';

/**
 * Filtros que recortam no cliente o resultado já calculado — busca, categoria e
 * "apenas anômalos". São de outra natureza que o filtro de período: nenhum deles
 * muda os números por cliente, apenas escolhem quais clientes aparecem.
 */
export function useCustomerFilters(data: CustomerReport[]) {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((customer) => {
      const matchesSearch =
        term === '' ||
        customer.nome.toLowerCase().includes(term) ||
        String(customer.customer_id) === term;
      const matchesTier = tier === 'ALL' || customer.categoria === tier;
      const matchesAnomalies = !onlyAnomalies || customer.pedidos_suspeitos.length > 0;
      return matchesSearch && matchesTier && matchesAnomalies;
    });
  }, [data, search, tier, onlyAnomalies]);

  return {
    search,
    setSearch,
    tier,
    setTier,
    onlyAnomalies,
    setOnlyAnomalies,
    filtered,
    isFiltered: filtered.length !== data.length,
  };
}
