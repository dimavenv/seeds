import { ProductGridSkeleton } from "@/components/skeletons";

export default function HomeLoading() {
  return (
    <div className="container-page py-6">
      <div className="skeleton aspect-[16/9] w-full !rounded-3xl" />
      <div className="mt-12">
        <div className="skeleton mb-4 h-7 w-40" />
        <ProductGridSkeleton count={8} />
      </div>
    </div>
  );
}
