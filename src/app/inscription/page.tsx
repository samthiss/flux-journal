import SignUpForm from "./SignUpForm";

export const dynamic = "force-dynamic";

/**
 * Where an invitation is spent.
 *
 * Reached by the link the owner hands out, with the code in the address: it is
 * the only way an account can be made here, so there is nothing to find by
 * opening this page without one.
 */
export default async function InscriptionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <SignUpForm code={code ?? ""} />;
}
