import TokenDashboard from "@/components/TokenDashboard";

export default function TokenPage({ params }: { params: { mint: string } }) {
  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <TokenDashboard mint={params.mint} />
    </main>
  );
}
