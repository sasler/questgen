import Link from "next/link";

type SearchParams =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

function getSingleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function getMessage(error: string | null) {
  switch (error) {
    case "Configuration":
      return {
        title: "GitHub sign-in is configured incorrectly.",
        body:
          "GitHub rejected the OAuth client credentials for this QuestGen deployment.",
      };
    case "AccessDenied":
      return {
        title: "GitHub sign-in was denied.",
        body: "Authorization was cancelled or refused before QuestGen could sign you in.",
      };
    case "MissingCSRF":
      return {
        title: "The sign-in request expired.",
        body: "Please try the GitHub sign-in flow again from QuestGen.",
      };
    default:
      return {
        title: "GitHub sign-in failed.",
        body: "QuestGen could not complete the GitHub authentication flow.",
      };
  }
}

function getConfigWarnings() {
  const warnings: string[] = [];
  const githubId = process.env.GITHUB_ID?.trim();
  const githubSecret = process.env.GITHUB_SECRET?.trim();

  if (githubId) {
    const looksLikeOauthClientId =
      /^Ov23[a-zA-Z0-9]+$/.test(githubId) || /^[a-f0-9]{20}$/i.test(githubId);

    if (!looksLikeOauthClientId) {
      warnings.push(
        "GITHUB_ID does not look like a GitHub OAuth App Client ID. Use the Client ID, not the numeric App ID.",
      );
    }
  }

  if (githubSecret && githubSecret.length < 36) {
    warnings.push(
      `GITHUB_SECRET looks unusually short (${githubSecret.length} characters). Re-copy or regenerate the OAuth App client secret.`,
    );
  }

  return warnings;
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams
    ? "then" in searchParams
      ? await searchParams
      : searchParams
    : {};

  const error = getSingleParam(resolvedSearchParams.error);
  const message = getMessage(error);
  const warnings = getConfigWarnings();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#00ff41] font-mono p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="text-center space-y-3">
          <h1 className="text-2xl md:text-3xl font-bold text-[#ff4444]">
            GITHUB AUTHENTICATION ERROR
          </h1>
          <p className="text-[#ffb000]">{message.title}</p>
          <p className="text-sm text-[#4a6741] leading-relaxed">{message.body}</p>
        </header>

        {warnings.length > 0 && (
          <section className="border border-[#ff4444] bg-[#1a0d0d] p-4 space-y-3">
            <h2 className="text-[#ffb000] font-bold text-sm">Local config warnings</h2>
            <ul className="list-disc list-inside space-y-2 text-sm text-[#00ff41]">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="border border-[#1a3a1a] bg-[#0d1a0d] p-4 space-y-3">
          <h2 className="text-[#ffb000] font-bold text-sm">What to check</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-[#00ff41]">
            <li>Use a **GitHub OAuth App**, not a GitHub App.</li>
            <li>
              Set <code>GITHUB_ID</code> to the OAuth App <strong>Client ID</strong>, not the
              numeric App ID.
            </li>
            <li>
              Set <code>GITHUB_SECRET</code> to the OAuth App <strong>Client Secret</strong>.
            </li>
            <li>
              Make sure the callback URL is exactly{" "}
              <code>http://localhost:3000/api/auth/callback/github</code> for local
              development.
            </li>
            <li>Restart the dev server after changing <code>.env.local</code>.</li>
          </ol>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/setup"
            className="px-4 py-2 border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
          >
            Owner Setup
          </Link>
          <Link
            href="/api/auth/signin"
            className="px-4 py-2 border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
          >
            Try GitHub Sign-In Again
          </Link>
          <Link
            href="/"
            className="px-4 py-2 border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors"
          >
            Back Home
          </Link>
        </div>
      </div>
    </div>
  );
}
