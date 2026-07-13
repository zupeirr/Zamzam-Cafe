import React, { useState } from 'react';
import Filter from '../components/Filter';
import Products from '../components/Products';

export default function HomePage() {
  const [activeFilter, setActiveFilter] = useState("Hot Drinks");

  const handleFilterChange = (filterTitle) => {
    setActiveFilter(filterTitle);
  };

  return (
    <main className="pb-24">
      <Filter onFilterChange={handleFilterChange} />
      <Products activeFilter={activeFilter} />
    </main>
  );
}
