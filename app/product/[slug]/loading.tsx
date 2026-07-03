export default function ProductLoading() {
  return (
    <div className="container-page py-6">
      <div className="skeleton mb-4 h-4 w-64" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="skeleton aspect-square w-full !rounded-2xl" />
        <div>
          <div className="skeleton h-6 w-24 !rounded-full" />
          <div className="skeleton mt-3 h-9 w-3/4" />
          <div className="skeleton mt-2 h-4 w-32" />
          <div className="skeleton mt-5 h-10 w-40" />
          <div className="mt-4 space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-2/3" />
          </div>
          <div className="mt-6 flex gap-3">
            <div className="skeleton h-12 w-32 !rounded-full" />
            <div className="skeleton h-12 flex-1 !rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
