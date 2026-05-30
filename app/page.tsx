import Link from "next/link";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await currentUser();

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-inner">
          <p className="kicker">OPEN SOURCE · BREACH MONITORING</p>
          <h1>
            Find out you&apos;re affected by a CVE
            <br />
            <span className="hero-accent">before someone else does.</span>
          </h1>
          <p className="lede">
            Underhack watches the public sources that matter — NVD, CISA KEV, vendor RSS — and pings
            you the moment something hits a system your team actually runs. Self-host it in two minutes.
          </p>
          <div className="hero-cta">
            {user ? (
              <Link href="/dashboard" className="btn-primary lg">
                Open dashboard →
              </Link>
            ) : (
              <Link href="/login" className="btn-primary lg">
                Sign in
              </Link>
            )}
            <a
              href="https://github.com/underflash-io/underhack"
              className="btn-ghost lg"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
            </a>
            <Link href="/docs/api" className="btn-link lg">
              Read the API docs →
            </Link>
          </div>
          <p className="hero-meta">
            MIT licensed · Self-hosted · SQLite default · ~50&nbsp;MB image · Slack, email, webhooks
          </p>
        </div>
      </section>

      <section className="features">
        <div className="features-grid">
          <Feature kicker="01" title="Targeted, not noisy">
            Tell it what you run. Underhack matches CVEs against your stack (vendor + keywords) and only
            wakes you for things that affect you.
          </Feature>
          <Feature kicker="02" title="Autonomous triage">
            An LLM agent enriches each finding with a plain-English summary, affected APIs, and a concrete
            next action. Falls back to deterministic rules when no API key is set.
          </Feature>
          <Feature kicker="03" title="Pipe it anywhere">
            REST + webhooks. Drop high-severity alerts into Slack, PagerDuty, email, or your own dashboard
            with a Bearer token.
          </Feature>
          <Feature kicker="04" title="Audit-ready">
            Every triage, every status change, every assessment is recorded in an append-only hash-chained
            ledger. SOC2 evidence without the spreadsheet.
          </Feature>
          <Feature kicker="05" title="Authorized assessment">
            Optional outbound checks against assets you own — verified via DNS or HTTP token before a single
            request fires. Nothing wild, nothing surprising.
          </Feature>
          <Feature kicker="06" title="Yours to keep">
            MIT licensed. Runs on a $5 VPS. SQLite by default — Postgres when you outgrow it. No telemetry,
            no phone-home, no vendor lock.
          </Feature>
        </div>
      </section>

      <section className="why">
        <div className="why-inner">
          <p className="kicker">WHY UNDERHACK</p>
          <h2>Built for the team without a SOC.</h2>
          <div className="why-grid">
            <div>
              <h3>Two-minute install</h3>
              <p>
                <code>docker compose up</code>. That&apos;s the install. Visit{" "}
                <code>localhost:4317</code>, sign in, paste your stack. Done.
              </p>
            </div>
            <div>
              <h3>One thing well</h3>
              <p>
                Not a SIEM. Not an EDR. Underhack tells you when public vulnerability intelligence is
                about <em>you</em>, then gets out of the way.
              </p>
            </div>
            <div>
              <h3>Honest about cost</h3>
              <p>
                Self-host: free forever. Hosted Cloud (coming soon) covers the bill so we can keep
                shipping. Same code, same license, same data export.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing">
        <div className="pricing-inner">
          <p className="kicker">PRICING</p>
          <h2>Pay only when you want someone else to run it.</h2>
          <div className="plans">
            <Plan
              name="Self-hosted"
              price="Free"
              priceNote="MIT licensed"
              features={[
                "Unlimited alerts",
                "Unlimited sources",
                "Unlimited API keys",
                "Slack + Email + Webhooks",
                "SQLite or Postgres",
                "Community support (GitHub)",
              ]}
              cta="Get the code"
              ctaHref="https://github.com/underflash-io/underhack"
              ctaExternal
            />
            <Plan
              name="Cloud"
              price="$19"
              priceNote="per month · early access"
              highlight
              features={[
                "Everything in self-hosted",
                "Managed updates",
                "Daily encrypted backups",
                "Email + chat support",
                "Hosted webhooks endpoint",
                "Multi-user (up to 5)",
              ]}
              cta="Join the waitlist"
              ctaHref="mailto:hello@underhack.dev?subject=Underhack%20Cloud%20waitlist"
              ctaExternal
            />
            <Plan
              name="Team"
              price="Contact"
              priceNote="for orgs > 25 people"
              features={[
                "SSO (SAML / OIDC)",
                "Role-based access",
                "Postgres / dedicated DB",
                "Custom integrations",
                "SLA + private Slack",
                "Compliance assistance",
              ]}
              cta="Get in touch"
              ctaHref="mailto:hello@underhack.dev?subject=Underhack%20Team"
              ctaExternal
            />
          </div>
        </div>
      </section>

      <section className="quickstart">
        <div className="quickstart-inner">
          <p className="kicker">QUICKSTART</p>
          <h2>Up and running in under two minutes.</h2>
          <pre className="code-block">{`# 1. Run it
docker run -p 4317:4317 -v underhack:/app/data \\
  ghcr.io/underflash-io/underhack:latest

# 2. Open the dashboard
open http://localhost:4317

# 3. Tell it what you run, hook up Slack, you're done.`}</pre>
          <p className="muted">
            Prefer npm? <code>git clone && npm install && npm run dev</code>. Full docs in the README.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <strong>UNDER<span className="accent">HACK</span></strong>
            <p className="muted small">Breach monitoring you can read the source code of.</p>
          </div>
          <nav>
            <a href="https://github.com/underflash-io/underhack" target="_blank" rel="noreferrer">GitHub</a>
            <Link href="/docs/api">API docs</Link>
            <Link href="/login">Sign in</Link>
            <a href="mailto:hello@underhack.dev">Contact</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function Feature({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="feature">
      <p className="kicker">{kicker}</p>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function Plan({
  name,
  price,
  priceNote,
  features,
  cta,
  ctaHref,
  highlight,
  ctaExternal,
}: {
  name: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  ctaExternal?: boolean;
}) {
  return (
    <article className={`plan ${highlight ? "plan-hi" : ""}`}>
      <p className="kicker">{name}</p>
      <p className="plan-price">{price}</p>
      <p className="plan-note muted">{priceNote}</p>
      <ul>
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {ctaExternal ? (
        <a className="btn-primary" href={ctaHref} target="_blank" rel="noreferrer">
          {cta}
        </a>
      ) : (
        <Link className="btn-primary" href={ctaHref}>
          {cta}
        </Link>
      )}
    </article>
  );
}
