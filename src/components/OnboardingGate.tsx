import { useState } from "react";
import { Eye, EyeOff, CheckCircle2, Circle, ExternalLink, Loader2, ChevronRight } from "lucide-react";
import { useJiraConfig } from "@/hooks/use-jira-config";
import { useSelectedProjects } from "@/hooks/useSelectedProjects";
import { ProjectSelector } from "@/components/ProjectSelector";

interface OnboardingGateProps {
  children: React.ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { config, saveConfig, testConnection } = useJiraConfig();
  const { selectedProjects } = useSelectedProjects();

  const isConfigured = !!config;
  const hasProjects = selectedProjects.length > 0;

  // If both done — show dashboard
  if (isConfigured && hasProjects) {
    return <>{children}</>;
  }

  // Otherwise show setup screen
  return <OnboardingScreen currentStep={!isConfigured ? "connect" : "projects"} />;
}

// ─────────────────────────────────────────────
// Onboarding Screen
// ─────────────────────────────────────────────

function OnboardingScreen({ currentStep }: { currentStep: "connect" | "projects" }) {
  const [step, setStep] = useState<"connect" | "projects">(currentStep);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Welcome to JiraTriage</h1>
          <p className="text-sm text-muted-foreground">
            Connect your Jira account to get started
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-3 justify-center">
          <div className={`flex items-center gap-2 text-sm font-medium ${step === "connect" ? "text-primary" : "text-muted-foreground"}`}>
            {step === "projects" ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
            Step 1: Connect Jira
          </div>
          <div className="h-px w-8 bg-border" />
          <div className={`flex items-center gap-2 text-sm font-medium ${step === "projects" ? "text-primary" : "text-muted-foreground"}`}>
            <Circle className="h-5 w-5" />
            Step 2: Select Projects
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {step === "connect" ? (
            <ConnectStep onSuccess={() => setStep("projects")} />
          ) : (
            <ProjectsStep />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 1 — Connect Jira
// ─────────────────────────────────────────────

function ConnectStep({ onSuccess }: { onSuccess: () => void }) {
  const { saveConfig, testConnection } = useJiraConfig();
  const [showToken, setShowToken] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [form, setForm] = useState({ instanceUrl: "", email: "", apiToken: "" });

  const allFilled = form.instanceUrl && form.email && form.apiToken;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setTestPassed(false);
    setTestError(null);
  };

  const handleTest = async () => {
    setTestLoading(true);
    setTestError(null);
    setTestPassed(false);
    try {
      const ok = await testConnection({
        instanceUrl: form.instanceUrl.replace(/\/$/, ""),
        email: form.email,
        apiToken: form.apiToken,
      });
      if (ok) {
        setTestPassed(true);
      } else {
        setTestError("Connection failed. Check your credentials and try again.");
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTestLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      await saveConfig({
        instanceUrl: form.instanceUrl.replace(/\/$/, ""),
        email: form.email,
        apiToken: form.apiToken,
      });
      onSuccess();
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Fields */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Jira Instance URL</label>
          <input
            name="instanceUrl"
            value={form.instanceUrl}
            onChange={handleChange}
            placeholder="https://your-company.atlassian.net"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@company.com"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">API Token</label>
          <div className="relative">
            <input
              name="apiToken"
              type={showToken ? "text" : "password"}
              value={form.apiToken}
              onChange={handleChange}
              placeholder="Paste your Jira API token"
              className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* How to get API Token guide */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          🔑 How to get your API Token
        </p>
        <ol className="space-y-1.5 text-xs text-muted-foreground list-none">
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
            Go to{" "}
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Atlassian Account Settings <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
            Click <strong className="text-foreground">"Create API token"</strong>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
            Give it a name (e.g. "Attention Tracker") and copy the generated token
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">4</span>
            Paste it in the <strong className="text-foreground">API Token</strong> field above
          </li>
        </ol>
      </div>

      {/* Status */}
      {testPassed && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Connection successful! Click <strong>Save & Continue</strong> to proceed.
        </div>
      )}
      {testError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ✗ {testError}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleTest}
          disabled={!allFilled || testLoading || saveLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {testLoading ? "Testing..." : "Test Connection"}
        </button>
        <button
          onClick={handleSave}
          disabled={!testPassed || saveLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {saveLoading ? "Saving..." : "Save & Continue"}
          {!saveLoading && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 2 — Select Projects
// ─────────────────────────────────────────────

function ProjectsStep() {
  // Once projects are saved, OnboardingGate will re-evaluate and show dashboard
  return (
    <div className="p-2">
      <ProjectSelector onDone={() => {
        window.location.reload();
      }} isFirstTime={true} />
    </div>
  );
}
