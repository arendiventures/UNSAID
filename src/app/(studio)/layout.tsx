import { Nav } from "@/components/Nav";
import { authRequired } from "@/lib/auth";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav authRequired={authRequired()} />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
