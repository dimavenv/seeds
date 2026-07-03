// Скелетоны загрузки (используются в loading.tsx маршрутов).
// Класс .skeleton (globals.css) даёт серый блок с бегущим бликом.

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-square w-full !rounded-none" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
        <div className="flex items-center justify-between pt-2">
          <div className="skeleton h-6 w-16" />
          <div className="skeleton h-9 w-20 !rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="container-page py-6">
      {/* Чипы категорий */}
      <div className="mb-5 flex gap-2 overflow-hidden pb-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-9 w-28 shrink-0 !rounded-full" />
        ))}
      </div>
      <div className="skeleton mb-2 h-7 w-48" />
      <div className="skeleton mb-5 h-4 w-32" />
      <ProductGridSkeleton count={12} />
    </div>
  );
}
