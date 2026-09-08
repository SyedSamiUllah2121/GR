import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F6F6F8] flex items-center justify-center px-4">
      <div className="max-w-xl text-center">
        <h2 className="text-xl font-bold text-[#17181D]">Page not found</h2>
        <p className="text-sm text-[#6B6F76] mt-2">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/inspections"
          className="inline-block mt-4 px-4 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
        >
          Back to records
        </Link>
      </div>
    </div>
  );
}
