import { getAuth } from "@/lib/auth/server";
import { getDb, withSchemaGuard } from "@/lib/db";
import {
  createBundle,
  deleteBundle,
  isValidBundleId,
  listBundles,
  normalizeBundleName,
} from "@/lib/bundles";

export async function GET() {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return withSchemaGuard(async () => {
    const bundles = await listBundles(getDb(), user.id);
    return Response.json({ bundles });
  });
}

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await request.json();
  const clean = normalizeBundleName(name);
  if (!clean) return Response.json({ error: "Invalid name" }, { status: 400 });

  return withSchemaGuard(async () => {
    // Creating an existing name returns that bundle rather than 409: the picker
    // asks for "a bundle called X", and getting it is the answer either way.
    const bundle = await createBundle(getDb(), user.id, clean);
    return Response.json({ bundle });
  });
}

export async function DELETE(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  if (!idParam) return Response.json({ error: "Missing id" }, { status: 400 });

  const id = Number.parseInt(idParam, 10);
  if (!isValidBundleId(id) || String(id) !== idParam) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  return withSchemaGuard(async () => {
    // Only the grouping goes; the words keep their translations and their SRS
    // schedule, and stay in any other bundle they belong to.
    const deleted = await deleteBundle(getDb(), user.id, id);
    if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  });
}
