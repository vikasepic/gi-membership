import { requireInternalApp } from "@/lib/builtin-apps/access";
import { listGenerations } from "@/lib/builtin-apps/hook-generator/generate";
import { Generator } from "@/components/apps/hook-generator/Generator";

export default async function HookGeneratorPage() {
  const { user } = await requireInternalApp("hook-generator");
  const history = await listGenerations(user.id);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <Generator initialHistory={history} />
    </main>
  );
}
