import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F3EC] flex items-center justify-center px-4">
      <div className="max-w-xl text-center">
        <h2 className="text-xl font-bold text-[#242217]">Page not found</h2>
        <p className="text-sm text-[#635E4F] mt-2">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/inspections"
          className="inline-block mt-4 px-4 py-2 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
        >
          Back to records
        </Link>
      </div>
    </div>
  );
}
